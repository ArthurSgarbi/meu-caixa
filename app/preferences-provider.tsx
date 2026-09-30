'use client';

import { useUser } from '@clerk/nextjs';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch, readApiJson } from '@/lib/client-api';
import {
  defaultPreferences,
  formatPreferenceMoney,
  parsePreferences,
  type UserPreferences,
} from '@/lib/user-preferences';

type PreferencesContextValue = {
  preferences: UserPreferences;
  resolvedTheme: 'dark' | 'light';
  motionReduced: boolean;
  loading: boolean;
  saving: boolean;
  error: string;
  reload: () => void;
  update: (patch: Partial<UserPreferences>) => Promise<boolean>;
};
const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();
  // Montagem separada por identidade: uma resposta antiga não altera outra conta.
  return (
    <AccountPreferences
      key={user?.id ?? 'anonymous'}
      authenticated={Boolean(user)}
      identityLoaded={isLoaded}
    >
      {children}
    </AccountPreferences>
  );
}

function AccountPreferences({
  children,
  authenticated,
  identityLoaded,
}: {
  children: ReactNode;
  authenticated: boolean;
  identityLoaded: boolean;
}) {
  const [preferences, setPreferences] = useState<UserPreferences>({
    ...defaultPreferences,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);
  const [systemLight, setSystemLight] = useState(false);
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);
  const motionReduced = preferences.reduceMotion || systemReduceMotion;
  const savingRef = useRef(false);
  const mutationController = useRef<AbortController | null>(null);
  const ready = useRef(false);
  const resolvedTheme =
    preferences.theme === 'system'
      ? systemLight
        ? 'light'
        : 'dark'
      : preferences.theme;

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setSystemLight(media.matches);
      setSystemReduceMotion(motion.matches);
    };
    sync();
    media.addEventListener('change', sync);
    motion.addEventListener('change', sync);
    return () => {
      media.removeEventListener('change', sync);
      motion.removeEventListener('change', sync);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.largeText = String(preferences.largeText);
    root.dataset.reduceMotion = String(motionReduced);
    root.dataset.hideBalances = String(
      loading || Boolean(error) || preferences.hideBalances,
    );
    root.classList.toggle('dark', resolvedTheme === 'dark');
    return () => {
      delete root.dataset.theme;
      delete root.dataset.largeText;
      delete root.dataset.reduceMotion;
      delete root.dataset.hideBalances;
      root.classList.remove('dark');
    };
  }, [
    resolvedTheme,
    preferences.largeText,
    motionReduced,
    preferences.hideBalances,
    loading,
    error,
  ]);

  useEffect(() => {
    if (!identityLoaded) return;
    const controller = new AbortController();
    ready.current = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        if (!authenticated) return;
        const response = await apiFetch('/api/preferences', {
          signal: controller.signal,
          cache: 'no-store',
        });
        const result = (await readApiJson(response)) as {
          preferences?: unknown;
          error?: string;
        };
        if (controller.signal.aborted) return;
        const parsed = parsePreferences(result.preferences);
        if (!response.ok || !parsed)
          throw new Error(result.error ?? 'Configurações inválidas.');
        setPreferences(parsed);
        ready.current = true;
      } catch (loadError) {
        if (!controller.signal.aborted)
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Não foi possível carregar as configurações.',
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [authenticated, identityLoaded, reloadVersion]);

  useEffect(() => () => mutationController.current?.abort(), []);

  const update = useCallback(
    async (patch: Partial<UserPreferences>) => {
      if (!authenticated || !ready.current || savingRef.current) return false;
      const next = parsePreferences({ ...preferences, ...patch });
      if (!next) return false;
      const previous = preferences;
      const controller = new AbortController();
      mutationController.current = controller;
      savingRef.current = true;
      setSaving(true);
      setError('');
      setPreferences(next);
      try {
        const response = await apiFetch('/api/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
          signal: controller.signal,
        });
        const result = (await readApiJson(response)) as {
          preferences?: unknown;
          error?: string;
        };
        if (controller.signal.aborted) return false;
        const parsed = parsePreferences(result.preferences);
        if (!response.ok || !parsed)
          throw new Error(
            result.error ?? 'Não foi possível salvar as configurações.',
          );
        setPreferences(parsed);
        return true;
      } catch (saveError) {
        if (!controller.signal.aborted) {
          setPreferences(previous);
          setError(
            saveError instanceof Error
              ? saveError.message
              : 'Não foi possível salvar as configurações.',
          );
        }
        return false;
      } finally {
        savingRef.current = false;
        if (!controller.signal.aborted) setSaving(false);
      }
    },
    [authenticated, preferences],
  );

  return (
    <PreferencesContext.Provider
      value={{
        preferences: {
          ...preferences,
          hideBalances: loading || Boolean(error) || preferences.hideBalances,
        },
        resolvedTheme,
        motionReduced,
        loading,
        saving,
        error,
        reload: () => setReloadVersion((v) => v + 1),
        update,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('PreferencesProvider ausente.');
  return context;
}

export function useMoneyFormatter() {
  const { preferences } = usePreferences();
  return useCallback(
    (cents: number) => formatPreferenceMoney(cents, preferences.hideBalances),
    [preferences.hideBalances],
  );
}
