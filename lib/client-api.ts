/** Erros de rede e respostas HTML viram mensagens compreensíveis na interface. */
export async function apiFetch(url: string, options: RequestInit = {}) {
  const timeout = AbortSignal.timeout(30_000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout,
    });
    // Uma gravação confirmada invalida os resumos, inclusive em outra área aberta.
    if (
      typeof window !== 'undefined' &&
      response.ok &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
        (options.method ?? 'GET').toUpperCase(),
      ) &&
      /^\/api\/(transactions|budgets|credit-cards|investments|investment-wallet|recurring|data-restore)(\/|$)/.test(
        url,
      )
    ) {
      window.dispatchEvent(new Event('meu-caixa:finance-changed'));
    }
    return response;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (timeout.aborted) {
      throw new Error('O servidor demorou para responder. Tente novamente.');
    }
    throw new Error(
      'Não foi possível conectar. Verifique sua conexão e tente novamente.',
    );
  }
}

export async function readApiJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(
      response.status === 401 || response.status === 403
        ? 'Sua sessão expirou. Entre na conta novamente.'
        : 'O servidor retornou uma resposta inválida. Tente novamente.',
    );
  }
}
