import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { isValidDate, occurrenceForMonth } from '@/lib/recurring';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Entre na sua conta.' }, { status: 401 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return Response.json({ error: 'Dados inválidos.' }, { status: 400 });
    const { ruleId, date } = body as Record<string, unknown>;
    if (
      typeof ruleId !== 'number' ||
      !Number.isSafeInteger(ruleId) ||
      ruleId <= 0 ||
      typeof date !== 'string' ||
      !isValidDate(date)
    )
      return Response.json({ error: 'Ocorrência inválida.' }, { status: 400 });
    const db = getDb();
    const rule = await db
      .prepare(
        `SELECT id, starts_on AS "startsOn", ends_on AS "endsOn", active FROM recurring_rules WHERE id = ? AND owner_id = ?`,
      )
      .bind(ruleId, user.userId)
      .first();
    if (
      !rule ||
      Number(rule.active) !== 1 ||
      typeof rule.startsOn !== 'string' ||
      (rule.endsOn !== null && typeof rule.endsOn !== 'string') ||
      occurrenceForMonth(
        {
          startsOn: rule.startsOn,
          endsOn: rule.endsOn as string | null,
        },
        date.slice(0, 7),
      ) !== date
    )
      return Response.json(
        { error: 'Esta previsão não está ativa.' },
        { status: 400 },
      );
    const result = await db
      .prepare(`INSERT INTO transactions
        (description, type, amount_cents, transaction_date, category_id, owner_id, recurring_rule_id, recurring_occurrence_date, created_at)
        SELECT description, type, amount_cents, ?, category_id, owner_id, id, ?, ?
        FROM recurring_rules WHERE id = ? AND owner_id = ? AND active = 1
        ON CONFLICT (owner_id, recurring_rule_id, recurring_occurrence_date) DO NOTHING`)
      .bind(date, date, new Date().toISOString(), ruleId, user.userId)
      .run();
    if (!result.meta.changes)
      return Response.json(
        { error: 'Esta ocorrência já foi confirmada.' },
        { status: 409 },
      );
    return Response.json({ confirmed: true }, { status: 201 });
  } catch (error) {
    console.error('Failed to confirm recurrence', error);
    return Response.json(
      { error: 'Não foi possível confirmar a ocorrência.' },
      { status: 500 },
    );
  }
}
