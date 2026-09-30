'use client';

import { useCallback, useEffect, useRef } from 'react';

/** Só a consulta mais recente pode atualizar a tela; cancela ao desmontar. */
export function useLatestRequest() {
  const current = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.current?.abort();
    };
  }, []);
  return useCallback((externalSignal?: AbortSignal) => {
    current.current?.abort();
    const controller = new AbortController();
    if (!mounted.current) controller.abort();
    current.current = controller;
    const signal = externalSignal
      ? AbortSignal.any([externalSignal, controller.signal])
      : controller.signal;
    return {
      signal,
      isCurrent: () => !signal.aborted && current.current === controller,
    };
  }, []);
}
