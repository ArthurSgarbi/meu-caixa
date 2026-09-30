'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, readApiJson } from '@/lib/client-api';
import { useLatestRequest } from './use-latest-request';
import type { OverviewData } from '@/lib/overview';

export function useOverview(enabled: boolean, area: string) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const begin = useLatestRequest();
  const reload = useCallback(async () => {
    if (!enabled) return;
    const request = begin();
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/overview', {
        cache: 'no-store',
        signal: request.signal,
      });
      const result = (await readApiJson(response)) as OverviewData & {
        error?: string;
      };
      if (!request.isCurrent()) return;
      if (!response.ok)
        throw new Error(
          result.error ?? 'Não foi possível carregar a visão geral.',
        );
      setData(result);
    } catch (failure) {
      if (request.isCurrent()) {
        setData(null);
        setError(
          failure instanceof Error
            ? failure.message
            : 'Não foi possível carregar a visão geral.',
        );
      }
    } finally {
      if (request.isCurrent()) setLoading(false);
    }
  }, [enabled, begin]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed) void reload();
    });
    // Cinco minutos, apenas com a página visível; não consulta cotações externas.
    const timer = window.setInterval(() => {
      if (!document.hidden) void reload();
    }, 300_000);
    const visible = () => {
      if (!document.hidden) void reload();
    };
    const changed = () => void reload();
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('meu-caixa:finance-changed', changed);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('meu-caixa:finance-changed', changed);
    };
  }, [enabled, area, reload]);
  return { data, loading, error, reload };
}
