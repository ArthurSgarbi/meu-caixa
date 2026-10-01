import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import {
  loadAccountsGoals,
  accountStateSql,
  ownerLock,
} from '@/lib/accounts-server';
import {
  FinanceInputError,
  maxCents,
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
            : 'Não foi possível atualizar suas contas.',
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
      today = todayInBrazil(),
      now = new Date().toISOString(),
      key = requestKey(body.requestId);
    if (body.action === 'transfer') {
      const from = parseAccountId(body.fromAccountId),
        to = parseAccountId(body.toAccountId),
        amount = positiveCents(body.amountCents);
      const description = shortName(body.description, 'uma descrição');
      if (from === to)
        throw new FinanceInputError(
          'Selecione contas de origem e destino diferentes.',
        );
      const results = await db.batch([
        ownerLock(db, user.userId),
        db
          .prepare(`${accountStateSql}, moved AS (
          INSERT INTO account_transfers (owner_id, from_account_id, to_account_id, amount_cents, transfer_date, description, request_id, created_at)
          SELECT ?, src.id, dst.id, ?, ?, ?, ?, ? FROM account_state src CROSS JOIN account_state dst
          WHERE src.id IS NOT DISTINCT FROM ?::integer AND dst.id IS NOT DISTINCT FROM ?::integer
            AND src.available_cents >= ? AND src.opened_on <= ? AND dst.opened_on <= ?
          ON CONFLICT(owner_id,request_id) DO NOTHING RETURNING id)
          SELECT id FROM moved`)
          .bind(
            user.userId,
            today,
            user.userId,
            amount,
            today,
            description,
            key,
            now,
            from,
            to,
            amount,
            today,
            today,
          ),
      ]);
      const row = await db
        .prepare(
          'SELECT * FROM account_transfers WHERE owner_id = ? AND request_id = ?',
        )
        .bind(user.userId, key)
        .first();
      if (!row)
        throw new FinanceInputError(
          'Saldo livre insuficiente ou conta inválida. Valores reservados em metas não podem ser transferidos.',
        );
      if (
        row.from_account_id !== from ||
        row.to_account_id !== to ||
        Number(row.amount_cents) !== amount ||
        row.description !== description
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
      institution = shortName(body.institution, 'uma instituição');
    const openedOn = validDate(body.openedOn),
      opening = body.openingBalanceCents;
    if (openedOn > today)
      throw new FinanceInputError(
        'O saldo inicial deve ser de hoje ou de uma data anterior.',
      );
    if (
      typeof opening !== 'number' ||
      !Number.isSafeInteger(opening) ||
      opening < 0 ||
      opening > maxCents
    )
      throw new FinanceInputError(
        'Informe um saldo inicial válido e não negativo.',
      );
    const result = await db
      .prepare(`INSERT INTO financial_accounts
      (owner_id,name,institution,opening_balance_cents,opened_on,request_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,request_id) DO NOTHING`)
      .bind(user.userId, name, institution, opening, openedOn, key, now, now)
      .run();
    const row = await db
      .prepare(
        'SELECT * FROM financial_accounts WHERE owner_id = ? AND request_id = ?',
      )
      .bind(user.userId, key)
      .first();
    if (
      !row ||
      row.name !== name ||
      row.institution !== institution ||
      Number(row.opening_balance_cents) !== opening ||
      row.opened_on !== openedOn
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
    if (id === null)
      throw new FinanceInputError(
        'A conta principal mantém o histórico anterior.',
      );
    const result = await getDb()
      .prepare(
        'UPDATE financial_accounts SET name = ?, institution = ?, updated_at = ? WHERE id = ? AND owner_id = ?',
      )
      .bind(
        shortName(body.name),
        shortName(body.institution, 'uma instituição'),
        new Date().toISOString(),
        id,
        user.userId,
      )
      .run();
    return result.meta.changes
      ? Response.json({ updated: true }, { headers })
      : Response.json(
          { error: 'Conta não encontrada.' },
          { status: 404, headers },
        );
  } catch (error) {
    return failure(error);
  }
}
