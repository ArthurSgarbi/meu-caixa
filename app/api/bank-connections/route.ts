import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { personalPluggyConfig } from '@/lib/pluggy-client';
import { loadBankSnapshot } from '@/lib/bank-snapshot-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

// Não aceita itemId ou ownerId do cliente. Só lê itens definidos no servidor.
export async function GET() {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Entre na sua conta.' },
      { status: 401, headers },
    );
  const config = personalPluggyConfig(user.userId);
  if (!config) return Response.json({ enabled: false }, { headers });
  try {
    return Response.json(
      { enabled: true, snapshot: await loadBankSnapshot(getDb(), config) },
      { headers },
    );
  } catch {
    // Não logar credenciais, CPF, descrição de movimentações ou resposta bruta do banco.
    return Response.json(
      {
        error:
          'Não foi possível consultar os bancos. Confira sua autorização no MeuPluggy e tente novamente mais tarde.',
      },
      { status: 502, headers },
    );
  }
}
