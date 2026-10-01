'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { BankResponse } from '@/lib/bank-connections';
import { BANK_REFRESH_MS } from '@/lib/bank-summary';
import { apiFetch, readApiJson } from '@/lib/client-api';
import { useLatestRequest } from './use-latest-request';

/** Uma consulta compartilhada por todas as áreas, sem gravar dados bancários no navegador. */
export function useBankConnections(identity: string | null) {
  const enabled = Boolean(identity);
  const [result, setResult] = useState<{
    identity: string | null;
    data: BankResponse;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const start = useLatestRequest();
  const reload = useCallback(async () => {
    if (!enabled) return;
    const request = start();
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/bank-connections', {
        cache: 'no-store',
        signal: request.signal,
      });
      const data = (await readApiJson(response)) as BankResponse & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error ?? 'Não foi possível consultar os bancos.');
      if (request.isCurrent()) setResult({ identity, data });
    } catch (failure) {
      if (request.isCurrent()) {
        setResult(null);
        setError(
          failure instanceof Error
            ? failure.message
            : 'Não foi possível consultar os bancos.',
        );
      }
    } finally {
      if (request.isCurrent()) setLoading(false);
    }
  }, [enabled, identity, start]);
  useEffect(() => {
    if (!enabled) return;
    const initial = window.setTimeout(() => void reload(), 0);
    const visible = () => {
      if (!document.hidden) void reload();
    };
    const timer = window.setInterval(visible, BANK_REFRESH_MS);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', visible);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', visible);
    };
  }, [enabled, reload]);
  // Não expor um resultado anterior depois de sair da sessão.
  return {
    data: enabled && result?.identity === identity ? result.data : null,
    loading: enabled && loading,
    error: enabled ? error : '',
    reload,
  };
}

export const BankConnectionsContext = createContext<ReturnType<
  typeof useBankConnections
> | null>(null);
export function useBankConnectionsState() {
  const value = useContext(BankConnectionsContext);
  if (!value)
    throw new Error('Consulta bancária fora do contexto autenticado.');
  return value;
}
