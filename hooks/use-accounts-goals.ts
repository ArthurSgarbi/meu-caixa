'use client';
import { createContext, useCallback, useEffect, useState } from 'react';
import { apiFetch, readApiJson } from '@/lib/client-api';
import type { AccountsGoalsData } from '@/lib/accounts-goals';
import { useLatestRequest } from './use-latest-request';

export function useAccountsGoals(enabled: boolean, area: string) {
  const [data, setData] = useState<AccountsGoalsData | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const begin = useLatestRequest();
  const reload = useCallback(async () => {
    if (!enabled) return;
    const request = begin();
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/accounts', {
        signal: request.signal,
        cache: 'no-store',
      });
      const result = (await readApiJson(response)) as AccountsGoalsData & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          result.error ?? 'Não foi possível carregar contas e metas.',
        );
      if (request.isCurrent()) setData(result);
    } catch (failure) {
      if (request.isCurrent())
        setError(
          failure instanceof Error
            ? failure.message
            : 'Erro ao carregar contas.',
        );
    } finally {
      if (request.isCurrent()) setLoading(false);
    }
  }, [enabled, begin]);
  useEffect(() => {
    if (!enabled) {
      queueMicrotask(() => setData(null));
      return;
    }
    queueMicrotask(() => void reload());
    const refresh = () => void reload();
    window.addEventListener('meu-caixa:finance-changed', refresh);
    const visible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      begin();
      window.removeEventListener('meu-caixa:finance-changed', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [enabled, area, reload, begin]);
  return { data, loading, error, reload };
}
export type AccountsState = ReturnType<typeof useAccountsGoals>;
export const AccountsContext = createContext<AccountsState | null>(null);
