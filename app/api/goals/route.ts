import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import {
  loadAccountsGoals,
  accountStateSql,
  ownerLock,
} from '@/lib/accounts-server';
import {
  FinanceInputError,
  parseAccountId,
  positiveCents,
  requestKey,
  shortName,
  validDate,
} from '@/lib/accounts-goals';
import { todayInBrazil } from '@/lib/finance-month';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
function failure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof FinanceInputError
          ? error.message
          : error instanceof SyntaxError
            ? 'JSON inválido.'
            : 'Não foi possível atualizar suas metas.',
    },
    {
      status:
        error instanceof FinanceInputError || error instanceof SyntaxError
          ? 400
          : 500,
      headers,
    },
  );
}
export async function GET() {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Entre na sua conta.' },
      { status: 401, headers },
    );
  try {
    return Response.json(await loadAccountsGoals(user.userId), { headers });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Entre na sua conta.' },
      { status: 401, headers },
    );
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new FinanceInputError('Dados inválidos.');
    const db = getDb(),
      key = requestKey(body.requestId),
      now = new Date().toISOString(),
      today = todayInBrazil();
    if (body.action === 'reserve' || body.action === 'release') {
      const id = parseAccountId(body.goalId),
        account = parseAccountId(body.accountId),
        amount = positiveCents(body.amountCents);
      if (id === null) throw new FinanceInputError('Meta inválida.');
      const signed = body.action === 'release' ? -amount : amount;
      const results = await db.batch([
        ownerLock(db, user.userId),
        db
          .prepare(`${accountStateSql}, changed AS (
        INSERT INTO goal_allocations (owner_id,goal_id,account_id,amount_cents,request_id,created_at)
        SELECT ?,g.id,a.id,?,?,? FROM financial_goals g CROSS JOIN account_state a
        WHERE g.owner_id = ? AND g.id = ? AND a.id IS NOT DISTINCT FROM ?::integer
          AND ((? > 0 AND a.available_cents >= ? AND g.target_cents >= ? +
            COALESCE((SELECT SUM(amount_cents) FROM goal_allocations WHERE owner_id = g.owner_id AND goal_id = g.id),0))
          OR (? < 0 AND COALESCE((SELECT SUM(amount_cents) FROM goal_allocations WHERE owner_id = g.owner_id AND goal_id = g.id
            AND account_id IS NOT DISTINCT FROM a.id),0) >= ?))
        ON CONFLICT(owner_id,request_id) DO NOTHING RETURNING id) SELECT id FROM changed`)
          .bind(
            user.userId,
            today,
            user.userId,
            signed,
            key,
            now,
            user.userId,
            id,
            account,
            signed,
            amount,
            amount,
            signed,
            amount,
          ),
      ]);
      const row = await db
        .prepare(
          'SELECT * FROM goal_allocations WHERE owner_id = ? AND request_id = ?',
        )
        .bind(user.userId, key)
        .first();
      if (!row)
        throw new FinanceInputError(
          'Operação não realizada. Confira o saldo livre da conta, o valor restante da meta e a reserva disponível para liberar.',
        );
      if (
        Number(row.goal_id) !== id ||
        row.account_id !== account ||
        Number(row.amount_cents) !== signed
      )
        return Response.json(
          { error: 'Este identificador já foi usado por outra operação.' },
          { status: 409, headers },
        );
      return Response.json(
        { id: Number(row.id), recorded: true },
        { status: results[1].meta.changes ? 201 : 200, headers },
      );
    }
    if (body.action !== 'create') throw new FinanceInputError('Ação inválida.');
    const name = shortName(body.name),
      target = positiveCents(body.targetCents),
      date = validDate(body.targetDate);
    if (date < today)
      throw new FinanceInputError(
        'Escolha um prazo de hoje ou uma data futura.',
      );
    const result = await db
      .prepare(`INSERT INTO financial_goals (owner_id,name,target_cents,target_date,request_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(owner_id,request_id) DO NOTHING`)
      .bind(user.userId, name, target, date, key, now, now)
      .run();
    const row = await db
      .prepare(
        'SELECT * FROM financial_goals WHERE owner_id = ? AND request_id = ?',
      )
      .bind(user.userId, key)
      .first();
    if (
      !row ||
      row.name !== name ||
      Number(row.target_cents) !== target ||
      row.target_date !== date
    )
      return Response.json(
        { error: 'Este identificador já foi usado por outra operação.' },
        { status: 409, headers },
      );
    return Response.json(
      { id: Number(row.id), recorded: true },
      { status: result.meta.changes ? 201 : 200, headers },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Entre na sua conta.' },
      { status: 401, headers },
    );
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object')
      throw new FinanceInputError('Dados inválidos.');
    const id = parseAccountId(body.id);
    if (id === null) throw new FinanceInputError('Meta inválida.');
    const name = shortName(body.name),
      target = positiveCents(body.targetCents),
      date = validDate(body.targetDate),
      db = getDb();
    if (date < todayInBrazil())
      throw new FinanceInputError(
        'Escolha um prazo de hoje ou uma data futura.',
      );
    const result = await db.batch([
      ownerLock(db, user.userId),
      db
        .prepare(`UPDATE financial_goals g SET name=?,target_cents=?,target_date=?,updated_at=?
      WHERE id=? AND owner_id=? AND ? >= COALESCE((SELECT SUM(amount_cents) FROM goal_allocations WHERE goal_id=g.id AND owner_id=g.owner_id),0)`)
        .bind(
          name,
          target,
          date,
          new Date().toISOString(),
          id,
          user.userId,
          target,
        ),
    ]);
    return result[1].meta.changes
      ? Response.json({ updated: true }, { headers })
      : Response.json(
          { error: 'Meta não encontrada ou valor menor que a reserva atual.' },
          { status: 400, headers },
        );
  } catch (error) {
    return failure(error);
  }
}
