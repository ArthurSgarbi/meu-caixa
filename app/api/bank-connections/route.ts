import { getChatGPTUser } from '@/app/chatgpt-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

// Compatibilidade com abas antigas: integração desativada inclusive no servidor.
// Não lê credenciais, cópias bancárias ou APIs externas.
export async function GET() {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Entre na sua conta.' },
      { status: 401, headers },
    );
  return Response.json({ enabled: false }, { headers });
}
