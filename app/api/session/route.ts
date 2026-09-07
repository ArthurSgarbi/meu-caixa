import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from '@/app/chatgpt-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getChatGPTUser();

  return Response.json({
    authenticated: Boolean(user),
    user: user
      ? {
          displayName: user.displayName,
          email: user.email,
        }
      : null,
    signInPath: chatGPTSignInPath('/'),
    signOutPath: chatGPTSignOutPath('/'),
  });
}
