import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  // As APIs financeiras precisam somente do identificador verificado. Dados
  // de perfil são carregados apenas na rota de sessão, evitando chamadas
  // desnecessárias ao provedor de autenticação em cada operação financeira.
  return {
    userId,
    displayName: 'Minha conta',
    email: '',
    fullName: null,
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;
  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  return `/sign-in?redirect_url=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export function chatGPTSignUpPath(returnTo: string): string {
  return `/sign-up?redirect_url=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/';

  try {
    const url = new URL(value, 'https://app.local');
    return url.origin === 'https://app.local'
      ? `${url.pathname}${url.search}${url.hash}`
      : '/';
  } catch {
    return '/';
  }
}
