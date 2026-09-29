import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { seedCategories } from '@/lib/finance-categories';
import { getMonthRange } from '@/lib/finance-month';

export const dynamic = 'force-dynamic';

function parseBudgetInput(body: Record<string, unknown>) {
  const month = typeof body.month === 'string' ? body.month : '';
  const categoryId = body.categoryId;
  const limitCents = body.limitCents;
  if (!getMonthRange(month)) return { error: 'Mês inválido.' } as const;
  if (
    typeof categoryId !== 'number' ||
    !Number.isSafeInteger(categoryId) ||
    categoryId <= 0
  ) {
    return { error: 'Categoria inválida.' } as const;
  }
  if (
    typeof limitCents !== 'number' ||
    !Number.isSafeInteger(limitCents) ||
    limitCents <= 0 ||
    limitCents > 2_147_483_647
  ) {
    return { error: 'Informe um limite maior que zero.' } as const;
  }
  return { month, categoryId, limitCents } as const;
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json(
      { error: 'Entre na sua conta para ver os orçamentos.' },
      { status: 401 },
    );
  }

  const month = new URL(request.url).searchParams.get('month') ?? '';
  const range = getMonthRange(month);
  if (!range) return Response.json({ error: 'Mês inválido.' }, { status: 400 });

  try {
    const db = getDb();
    await seedCategories(db);
    const rows = await db
      .prepare(
        `SELECT c.id AS "categoryId", c.name AS "categoryName",
              b.limit_cents AS "limitCents",
              COALESCE(SUM(t.amount_cents), 0) AS "spentCents"
         FROM categories c
         LEFT JOIN budgets b ON b.category_id = c.id
           AND b.owner_id = ? AND b.month = ?
         LEFT JOIN transactions t ON t.category_id = c.id
           AND t.owner_id = ? AND t.type = 'expense'
           AND t.transaction_date >= ? AND t.transaction_date < ?
        WHERE c.type = 'expense' AND c.slug <> 'investimentos'
        GROUP BY c.id, c.name, b.limit_cents
        ORDER BY c.name`,
      )
      .bind(user.userId, month, user.userId, range.start, range.next)
      .all();

    return Response.json({ month, categories: rows.results });
  } catch (error) {
    console.error('Failed to load budgets', error);
    return Response.json(
      { error: 'Não foi possível carregar os orçamentos.' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json(
      { error: 'Entre na sua conta para salvar orçamentos.' },
      { status: 401 },
    );
  }

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'Orçamento inválido.' }, { status: 400 });
    }
    const parsed = parseBudgetInput(body as Record<string, unknown>);
    if ('error' in parsed)
      return Response.json({ error: parsed.error }, { status: 400 });
    const db = getDb();
    await seedCategories(db);
    const category = await db
      .prepare(
        `SELECT id FROM categories
        WHERE id = ? AND type = 'expense' AND slug <> 'investimentos'`,
      )
      .bind(parsed.categoryId)
      .first();
    if (!category)
      return Response.json(
        { error: 'Categoria de despesa inválida.' },
        { status: 400 },
      );

    await db
      .prepare(
        `INSERT INTO budgets (owner_id, category_id, month, limit_cents, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (owner_id, category_id, month)
       DO UPDATE SET limit_cents = EXCLUDED.limit_cents`,
      )
      .bind(
        user.userId,
        parsed.categoryId,
        parsed.month,
        parsed.limitCents,
        new Date().toISOString(),
      )
      .run();
    return Response.json({ saved: true });
  } catch (error) {
    console.error('Failed to save budget', error);
    return Response.json(
      { error: 'Não foi possível salvar o orçamento.' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json(
      { error: 'Entre na sua conta para remover orçamentos.' },
      { status: 401 },
    );
  }

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'Orçamento inválido.' }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const month = typeof input.month === 'string' ? input.month : '';
    const categoryId = input.categoryId;
    if (
      !getMonthRange(month) ||
      typeof categoryId !== 'number' ||
      !Number.isSafeInteger(categoryId) ||
      categoryId <= 0
    ) {
      return Response.json({ error: 'Orçamento inválido.' }, { status: 400 });
    }
    const result = await getDb()
      .prepare(
        'DELETE FROM budgets WHERE owner_id = ? AND category_id = ? AND month = ?',
      )
      .bind(user.userId, categoryId, month)
      .run();
    if (result.meta.changes === 0) {
      return Response.json(
        { error: 'Orçamento não encontrado.' },
        { status: 404 },
      );
    }
    return Response.json({ deleted: true });
  } catch (error) {
    console.error('Failed to delete budget', error);
    return Response.json(
      { error: 'Não foi possível remover o orçamento.' },
      { status: 500 },
    );
  }
}
