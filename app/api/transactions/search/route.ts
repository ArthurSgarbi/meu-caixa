import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import {
  literalSearchPattern,
  parseTransactionSearch,
  searchPageSize,
} from '@/lib/transaction-search';
import { calculateMonthlyAccountChangeCents } from '@/lib/finance-calculations';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const sortSql = {
  'date-desc': 't.transaction_date DESC, t.id DESC',
  'date-asc': 't.transaction_date ASC, t.id ASC',
  'amount-desc': 't.amount_cents DESC, t.id DESC',
  'amount-asc': 't.amount_cents ASC, t.id ASC',
};

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Entre na sua conta.' },
      { status: 401, headers },
    );
  const input = parseTransactionSearch(new URL(request.url).searchParams);
  if (!input)
    return Response.json(
      { error: 'Filtros inválidos. Confira datas e valores.' },
      { status: 400, headers },
    );
  try {
    const where = ['t.owner_id = ?'];
    const values: (string | number)[] = [user.userId];
    if (input.query) {
      // Sem extensão PostgreSQL adicional: busca pt-BR sem diferenças de acento.
      where.push(
        "translate(lower(t.description), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') LIKE ? ESCAPE E'\\\\'",
      );
      values.push(literalSearchPattern(input.query));
    }
    for (const [value, condition] of [
      [input.from, 't.transaction_date >= ?'],
      [input.to, 't.transaction_date <= ?'],
      [input.type, 't.type = ?'],
    ] as const) {
      if (value) {
        where.push(condition);
        values.push(value);
      }
    }
    for (const [value, condition] of [
      [input.categoryId, 't.category_id = ?'],
      [input.minCents, 't.amount_cents >= ?'],
      [input.maxCents, 't.amount_cents <= ?'],
    ] as const) {
      if (value !== null) {
        where.push(condition);
        values.push(value);
      }
    }
    const clause = where.join(' AND ');
    const db = getDb();
    const [rows, summary] = await Promise.all([
      db
        .prepare(`SELECT t.id, t.description, t.type, t.amount_cents AS "amountCents", t.transaction_date AS "transactionDate",
        c.id AS "categoryId", c.name AS "categoryName" FROM transactions t JOIN categories c ON c.id = t.category_id
        WHERE ${clause} ORDER BY ${sortSql[input.sort]} LIMIT ? OFFSET ?`)
        .bind(...values, searchPageSize, (input.page - 1) * searchPageSize)
        .all(),
      db
        .prepare(`SELECT COUNT(*) AS count,
        COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount_cents ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS expense,
        COALESCE(SUM(CASE WHEN t.type = 'transfer' THEN t.amount_cents ELSE 0 END), 0) AS transfer
        FROM transactions t WHERE ${clause}`)
        .bind(...values)
        .first(),
    ]);
    const incomeCents = Number(summary?.income ?? 0),
      expenseCents = Number(summary?.expense ?? 0),
      transferCents = Number(summary?.transfer ?? 0);
    return Response.json(
      {
        transactions: rows.results,
        total: Number(summary?.count ?? 0),
        page: input.page,
        pageSize: searchPageSize,
        summary: {
          incomeCents,
          expenseCents,
          transferCents,
          balanceCents: calculateMonthlyAccountChangeCents(
            incomeCents,
            expenseCents,
            transferCents,
          ),
        },
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: 'Não foi possível pesquisar suas movimentações.' },
      { status: 500, headers },
    );
  }
}
