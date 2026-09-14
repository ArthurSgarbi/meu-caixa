import {
  chatGPTSignInPath,
  chatGPTSignUpPath,
  getChatGPTUser,
} from '@/app/chatgpt-auth';
import { currentUser } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getChatGPTUser();
  const profile = user ? await currentUser() : null;
  const primaryEmail = profile?.emailAddresses.find(
    (email) => email.id === profile.primaryEmailAddressId,
  )?.emailAddress;
  const displayName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
    profile?.username ||
    primaryEmail ||
    'Minha conta';

  return Response.json({
    authenticated: Boolean(user),
    user: user
      ? {
          displayName,
          email: primaryEmail ?? '',
        }
      : null,
    signInPath: chatGPTSignInPath('/'),
    signUpPath: chatGPTSignUpPath('/'),
  });
}
