import { getDb } from '@/db';

const categorySeeds = [
  ['alimentacao', 'Alimentação', 'expense'],
  ['moradia', 'Moradia', 'expense'],
  ['transporte', 'Transporte', 'expense'],
  ['lazer', 'Lazer', 'expense'],
  ['saude', 'Saúde', 'expense'],
  ['educacao', 'Educação', 'expense'],
  ['outros-gastos', 'Outros gastos', 'expense'],
  ['salario', 'Salário', 'income'],
  ['freelance', 'Freelance', 'income'],
  ['rendimentos', 'Rendimentos', 'income'],
  ['outras-receitas', 'Outras receitas', 'income'],
] as const;

type TransactionType = 'income' | 'expense';

function getMonthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, monthNumber] = month.split('-').map(Number);
  const start = `${month}-01`;
  const next = new Date(Date.UTC(year, monthNumber, 1))
    .toISOString()
    .slice(0, 10);
  return { start, next };
}

async function seedCategories(db: D1Database) {
  const now = new Date().toISOString();
  await db.batch(
    categorySeeds.map(([slug, name, type]) =>
      db
        .prepare(
          'INSERT OR IGNORE INTO categories (slug, name, type, created_at) VALUES (?, ?, ?, ?)',
        )
        .bind(slug, name, type, now),
    ),
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const month = url.searchParams.get('month') ?? '';
  const range = getMonthRange(month);

  if (!range) {
    return Response.json(
      { error: 'Mês inválido. Use o formato AAAA-MM.' },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    await seedCategories(db);

    const [transactionsResult, summaryResult, categoriesResult] =
      await Promise.all([
        db
          .prepare(
            `SELECT t.id, t.description, t.type, t.amount_cents AS amountCents,
                  t.transaction_date AS transactionDate, c.id AS categoryId,
                  c.name AS categoryName
             FROM transactions t
             JOIN categories c ON c.id = t.category_id
            WHERE t.transaction_date >= ? AND t.transaction_date < ?
            ORDER BY t.transaction_date DESC, t.id DESC`,
          )
          .bind(range.start, range.next)
          .all(),
        db
          .prepare(
            `SELECT
             COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS incomeCents,
             COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expenseCents
           FROM transactions
           WHERE transaction_date >= ? AND transaction_date < ?`,
          )
          .bind(range.start, range.next)
          .first(),
        db
          .prepare('SELECT id, name, type FROM categories ORDER BY type, name')
          .all(),
      ]);

    const incomeCents = Number(summaryResult?.incomeCents ?? 0);
    const expenseCents = Number(summaryResult?.expenseCents ?? 0);

    return Response.json({
      transactions: transactionsResult.results,
      categories: categoriesResult.results,
      summary: {
        incomeCents,
        expenseCents,
        balanceCents: incomeCents - expenseCents,
      },
    });
  } catch (error) {
    console.error('Failed to load transactions', error);
    return Response.json(
      { error: 'Não foi possível carregar seus dados.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const description =
      typeof body.description === 'string' ? body.description.trim() : '';
    const type = body.type as TransactionType;
    const amountCents = Number(body.amountCents);
    const transactionDate =
      typeof body.transactionDate === 'string' ? body.transactionDate : '';
    const categoryId = Number(body.categoryId);

    if (description.length < 2 || description.length > 120) {
      return Response.json(
        { error: 'Informe uma descrição entre 2 e 120 caracteres.' },
        { status: 400 },
      );
    }
    if (!['income', 'expense'].includes(type)) {
      return Response.json(
        { error: 'Selecione um tipo de transação válido.' },
        { status: 400 },
      );
    }
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      return Response.json(
        { error: 'Informe um valor maior que zero.' },
        { status: 400 },
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
      return Response.json(
        { error: 'Informe uma data válida.' },
        { status: 400 },
      );
    }
    if (!Number.isSafeInteger(categoryId) || categoryId <= 0) {
      return Response.json(
        { error: 'Selecione uma categoria válida.' },
        { status: 400 },
      );
    }

    const db = getDb();
    await seedCategories(db);
    const category = await db
      .prepare('SELECT id FROM categories WHERE id = ? AND type = ?')
      .bind(categoryId, type)
      .first();

    if (!category) {
      return Response.json(
        { error: 'A categoria não corresponde ao tipo da transação.' },
        { status: 400 },
      );
    }

    const result = await db
      .prepare(
        `INSERT INTO transactions
          (description, type, amount_cents, transaction_date, category_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        description,
        type,
        amountCents,
        transactionDate,
        categoryId,
        new Date().toISOString(),
      )
      .run();

    return Response.json({ id: result.meta.last_row_id }, { status: 201 });
  } catch (error) {
    console.error('Failed to create transaction', error);
    return Response.json(
      { error: 'Não foi possível registrar a transação.' },
      { status: 500 },
    );
  }
}
