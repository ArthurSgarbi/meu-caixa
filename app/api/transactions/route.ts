import { getDb, type Database } from '@/db';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { seedCategories } from '@/lib/finance-categories';
import { calculateMonthlyAccountChangeCents } from '@/lib/finance-calculations';
import { getMonthRange } from '@/lib/finance-month';

export const dynamic = 'force-dynamic';

type TransactionType = 'income' | 'expense';

type TransactionInput = {
  description: string;
  type: TransactionType;
  amountCents: number;
  transactionDate: string;
  categoryId: number;
};

function parseTransactionInput(
  body: Record<string, unknown>,
): { input: TransactionInput } | { error: string } {
  const description =
    typeof body.description === 'string' ? body.description.trim() : '';
  const type = body.type as TransactionType;
  const amountCents = Number(body.amountCents);
  const transactionDate =
    typeof body.transactionDate === 'string' ? body.transactionDate : '';
  const categoryId = Number(body.categoryId);

  if (description.length < 2 || description.length > 120) {
    return { error: 'Informe uma descrição entre 2 e 120 caracteres.' };
  }
  if (!['income', 'expense'].includes(type)) {
    return { error: 'Selecione um tipo de transação válido.' };
  }
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return { error: 'Informe um valor maior que zero.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
    return { error: 'Informe uma data válida.' };
  }
  if (!Number.isSafeInteger(categoryId) || categoryId <= 0) {
    return { error: 'Selecione uma categoria válida.' };
  }

  return {
    input: { description, type, amountCents, transactionDate, categoryId },
  };
}

async function categoryMatchesType(
  db: Database,
  categoryId: number,
  type: TransactionType,
) {
  return db
    .prepare(
      "SELECT id FROM categories WHERE id = ? AND type = ? AND slug <> 'investimentos'",
    )
    .bind(categoryId, type)
    .first();
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json(
      { error: 'Entre na sua conta para acessar seus dados.' },
      { status: 401 },
    );
  }

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
            WHERE t.owner_id = ?
              AND t.transaction_date >= ? AND t.transaction_date < ?
            ORDER BY t.transaction_date DESC, t.id DESC`,
          )
          .bind(user.userId, range.start, range.next)
          .all(),
        db
          .prepare(
            `SELECT
             COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS incomeCents,
             COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expenseCents,
             COALESCE(SUM(CASE WHEN type = 'transfer' THEN amount_cents ELSE 0 END), 0) AS transferCents
           FROM transactions
           WHERE owner_id = ?
             AND transaction_date >= ? AND transaction_date < ?`,
          )
          .bind(user.userId, range.start, range.next)
          .first(),
        db
          .prepare(
            "SELECT id, name, type FROM categories WHERE slug <> 'investimentos' ORDER BY type, name",
          )
          .all(),
      ]);

    const incomeCents = Number(summaryResult?.incomeCents ?? 0);
    const expenseCents = Number(summaryResult?.expenseCents ?? 0);
    const transferCents = Number(summaryResult?.transferCents ?? 0);

    return Response.json({
      transactions: transactionsResult.results,
      categories: categoriesResult.results,
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
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        { error: 'Entre na sua conta para registrar uma transação.' },
        { status: 401 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const parsed = parseTransactionInput(body);
    if ('error' in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    const { description, type, amountCents, transactionDate, categoryId } =
      parsed.input;

    const db = getDb();
    await seedCategories(db);
    const category = await categoryMatchesType(db, categoryId, type);

    if (!category) {
      return Response.json(
        { error: 'A categoria não corresponde ao tipo da transação.' },
        { status: 400 },
      );
    }

    const result = await db
      .prepare(
        `INSERT INTO transactions
          (description, type, amount_cents, transaction_date, category_id,
           owner_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        description,
        type,
        amountCents,
        transactionDate,
        categoryId,
        user.userId,
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

export async function PATCH(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        { error: 'Entre na sua conta para editar uma transação.' },
        { status: 401 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return Response.json(
        { error: 'Transação inválida para edição.' },
        { status: 400 },
      );
    }

    const parsed = parseTransactionInput(body);
    if ('error' in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    const { description, type, amountCents, transactionDate, categoryId } =
      parsed.input;

    const db = getDb();
    await seedCategories(db);
    const category = await categoryMatchesType(db, categoryId, type);
    if (!category) {
      return Response.json(
        { error: 'A categoria não corresponde ao tipo da transação.' },
        { status: 400 },
      );
    }

    const result = await db
      .prepare(
        `UPDATE transactions
            SET description = ?, type = ?, amount_cents = ?,
                transaction_date = ?, category_id = ?
          WHERE id = ? AND owner_id = ? AND type IN ('income', 'expense')`,
      )
      .bind(
        description,
        type,
        amountCents,
        transactionDate,
        categoryId,
        id,
        user.userId,
      )
      .run();

    if (result.meta.changes === 0) {
      return Response.json(
        { error: 'Transação não encontrada.' },
        { status: 404 },
      );
    }

    return Response.json({ id, updated: true });
  } catch (error) {
    console.error('Failed to update transaction', error);
    return Response.json(
      { error: 'Não foi possível salvar as alterações da transação.' },
      { status: 500 },
    );
  }
}
