import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { defaultPreferences, parsePreferences } from '@/lib/user-preferences';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET() {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Entre na sua conta para acessar as configurações.' },
      { status: 401, headers },
    );
  try {
    const row = await getDb()
      .prepare(
        'SELECT preferences_json FROM user_preferences WHERE owner_id = ?',
      )
      .bind(user.userId)
      .first<{ preferences_json: string }>();
    const preferences = row
      ? parsePreferences(JSON.parse(row.preferences_json))
      : defaultPreferences;
    if (!preferences) throw new Error('Invalid stored preferences');
    return Response.json({ preferences }, { headers });
  } catch {
    return Response.json(
      {
        error: 'Não foi possível carregar suas configurações. Tente novamente.',
      },
      { status: 500, headers },
    );
  }
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Entre na sua conta para salvar as configurações.' },
      { status: 401, headers },
    );
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return Response.json(
      { error: 'Origem não permitida.' },
      { status: 403, headers },
    );
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json(
      { error: 'Configurações inválidas.' },
      { status: 400, headers },
    );
  }
  const preferences = parsePreferences(input);
  if (!preferences)
    return Response.json(
      { error: 'Configurações inválidas.' },
      { status: 400, headers },
    );
  try {
    // O proprietário sempre vem da sessão, nunca do corpo da requisição.
    await getDb()
      .prepare(`INSERT INTO user_preferences (owner_id, preferences_json, updated_at)
      VALUES (?, ?, ?) ON CONFLICT (owner_id) DO UPDATE
      SET preferences_json = EXCLUDED.preferences_json, updated_at = EXCLUDED.updated_at`)
      .bind(user.userId, JSON.stringify(preferences), new Date().toISOString())
      .run();
    return Response.json({ preferences }, { headers });
  } catch {
    return Response.json(
      { error: 'Não foi possível salvar suas configurações. Tente novamente.' },
      { status: 500, headers },
    );
  }
}
