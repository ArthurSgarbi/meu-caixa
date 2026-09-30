import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb, type Database } from '@/db';
import { seedCategories } from '@/lib/finance-categories';
import { getMonthRange, todayInBrazil } from '@/lib/finance-month';
import {
  addMonths,
  isValidDate,
  occurrenceForMonth,
  type RecurringRule,
} from '@/lib/recurring';

export const dynamic = 'force-dynamic';

function parseRule(body: Record<string, unknown>) {
  const description =
    typeof body.description === 'string' ? body.description.trim() : '';
  const type = body.type;
  const amountCents = body.amountCents;
  const categoryId = body.categoryId;
  const startsOn = body.startsOn;
  const endsOn = body.endsOn === '' || body.endsOn == null ? null : body.endsOn;
  if (description.length < 2 || description.length > 120)
    return { error: 'Descrição deve ter entre 2 e 120 caracteres.' } as const;
  if (type !== 'income' && type !== 'expense')
    return { error: 'Tipo inválido.' } as const;
  if (
    typeof amountCents !== 'number' ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    amountCents > 2_147_483_647
  )
    return { error: 'Valor inválido.' } as const;
  if (
    typeof categoryId !== 'number' ||
    !Number.isSafeInteger(categoryId) ||
    categoryId <= 0
  )
    return { error: 'Categoria inválida.' } as const;
  if (typeof startsOn !== 'string' || !isValidDate(startsOn))
    return { error: 'Data inicial inválida.' } as const;
  if (
    endsOn !== null &&
    (typeof endsOn !== 'string' || !isValidDate(endsOn) || endsOn < startsOn)
  )
    return { error: 'Data final inválida.' } as const;
  return {
    description,
    type,
    amountCents,
    categoryId,
    startsOn,
    endsOn,
  } as const;
}

async function categoryIsValid(db: Database, id: number, type: string) {
  return db
    .prepare(
      "SELECT id FROM categories WHERE id = ? AND type = ? AND slug <> 'investimentos'",
    )
    .bind(id, type)
    .first();
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const month = new URL(request.url).searchParams.get('month') ?? '';
  const selectedRange = getMonthRange(month);
  if (!selectedRange)
    return Response.json({ error: 'Mês inválido.' }, { status: 400 });
  try {
    const db = getDb();
    const today = todayInBrazil();
    const firstMonth = today.slice(0, 7);
    const horizonEnd = `${addMonths(firstMonth, 6)}-01`;
    const [rulesResult, confirmedResult, balanceResult, futureResult] =
      await Promise.all([
        db
          .prepare(`SELECT r.id, r.description, r.type, r.amount_cents AS "amountCents",
          r.category_id AS "categoryId", c.name AS "categoryName",
          r.starts_on AS "startsOn", r.ends_on AS "endsOn", r.active
          FROM recurring_rules r JOIN categories c ON c.id = r.category_id
          WHERE r.owner_id = ? ORDER BY r.active DESC, r.id DESC`)
          .bind(user.userId)
          .all(),
        db
          .prepare(`SELECT recurring_rule_id AS "ruleId", recurring_occurrence_date AS "date"
          FROM transactions WHERE owner_id = ? AND recurring_rule_id IS NOT NULL
          AND recurring_occurrence_date >= ? AND recurring_occurrence_date < ?`)
          .bind(
            user.userId,
            selectedRange.start < today ? selectedRange.start : today,
            horizonEnd > selectedRange.next ? horizonEnd : selectedRange.next,
          )
          .all(),
        db
          .prepare(`SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE -amount_cents END), 0) AS "balanceCents"
          FROM transactions WHERE owner_id = ? AND transaction_date <= ?`)
          .bind(user.userId, today)
          .first(),
        db
          .prepare(`SELECT type, amount_cents AS "amountCents", transaction_date AS "date"
          FROM transactions WHERE owner_id = ? AND transaction_date > ? AND transaction_date < ?`)
          .bind(user.userId, today, horizonEnd)
          .all(),
      ]);
    const rules = rulesResult.results.map((row) => ({
      ...row,
      id: Number(row.id),
      amountCents: Number(row.amountCents),
      categoryId: Number(row.categoryId),
      active: Number(row.active) === 1,
    })) as RecurringRule[];
    const confirmed = new Set(
      confirmedResult.results.map(
        (row) => `${Number(row.ruleId)}:${String(row.date)}`,
      ),
    );
    const occurrences = rules
      .filter((rule) => rule.active)
      .flatMap((rule) => {
        const date = occurrenceForMonth(rule, month);
        return date
          ? [{ ...rule, date, confirmed: confirmed.has(`${rule.id}:${date}`) }]
          : [];
      })
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.description.localeCompare(b.description),
      );
    let balanceCents = Number(balanceResult?.balanceCents ?? 0);
    const forecast = Array.from({ length: 6 }, (_, index) => {
      const forecastMonth = addMonths(firstMonth, index);
      let incomeCents = 0;
      let expenseCents = 0;
      let transferCents = 0;
      for (const transaction of futureResult.results) {
        if (String(transaction.date).slice(0, 7) !== forecastMonth) continue;
        const amount = Number(transaction.amountCents);
        if (transaction.type === 'income') incomeCents += amount;
        else if (transaction.type === 'transfer') transferCents += amount;
        else expenseCents += amount;
      }
      for (const rule of rules) {
        if (!rule.active) continue;
        const date = occurrenceForMonth(rule, forecastMonth);
        if (!date || date < today || confirmed.has(`${rule.id}:${date}`))
          continue;
        if (rule.type === 'income') incomeCents += rule.amountCents;
        else expenseCents += rule.amountCents;
      }
      balanceCents += incomeCents - expenseCents - transferCents;
      return {
        month: forecastMonth,
        incomeCents,
        expenseCents,
        transferCents,
        endingBalanceCents: balanceCents,
      };
    });
    return Response.json(
      {
        month,
        today,
        startingBalanceCents: Number(balanceResult?.balanceCents ?? 0),
        rules,
        occurrences,
        forecast,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Failed to load recurrences', error);
    return Response.json(
      { error: 'Não foi possível carregar as recorrências.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Entre na sua conta.' }, { status: 401 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return Response.json({ error: 'Dados inválidos.' }, { status: 400 });
    const parsed = parseRule(body as Record<string, unknown>);
    if ('error' in parsed)
      return Response.json({ error: parsed.error }, { status: 400 });
    const db = getDb();
    await seedCategories(db);
    if (!(await categoryIsValid(db, parsed.categoryId, parsed.type)))
      return Response.json(
        { error: 'Categoria inválida para o tipo.' },
        { status: 400 },
      );
    const now = new Date().toISOString();
    const result = await db
      .prepare(`INSERT INTO recurring_rules
        (owner_id, description, type, amount_cents, category_id, starts_on, ends_on, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
      .bind(
        user.userId,
        parsed.description,
        parsed.type,
        parsed.amountCents,
        parsed.categoryId,
        parsed.startsOn,
        parsed.endsOn,
        now,
        now,
      )
      .run();
    return Response.json({ id: result.meta.last_row_id }, { status: 201 });
  } catch (error) {
    console.error('Failed to create recurrence', error);
    return Response.json(
      { error: 'Não foi possível salvar a recorrência.' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Entre na sua conta.' }, { status: 401 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return Response.json({ error: 'Dados inválidos.' }, { status: 400 });
    const input = body as Record<string, unknown>;
    if (
      typeof input.id !== 'number' ||
      !Number.isSafeInteger(input.id) ||
      input.id <= 0 ||
      typeof input.active !== 'boolean'
    )
      return Response.json({ error: 'Recorrência inválida.' }, { status: 400 });
    const result = await getDb()
      .prepare(
        'UPDATE recurring_rules SET active = ?, updated_at = ? WHERE id = ? AND owner_id = ?',
      )
      .bind(
        input.active ? 1 : 0,
        new Date().toISOString(),
        input.id,
        user.userId,
      )
      .run();
    return result.meta.changes
      ? Response.json({ updated: true })
      : Response.json(
          { error: 'Recorrência não encontrada.' },
          { status: 404 },
        );
  } catch (error) {
    console.error('Failed to update recurrence', error);
    return Response.json(
      { error: 'Não foi possível atualizar a recorrência.' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Entre na sua conta.' }, { status: 401 });
  try {
    const body: unknown = await request.json();
    const id =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>).id
        : null;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)
      return Response.json({ error: 'Recorrência inválida.' }, { status: 400 });
    const result = await getDb()
      .prepare(`DELETE FROM recurring_rules r WHERE r.id = ? AND r.owner_id = ?
        AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.owner_id = r.owner_id AND t.recurring_rule_id = r.id)`)
      .bind(id, user.userId)
      .run();
    if (result.meta.changes) return Response.json({ deleted: true });
    const existing = await getDb()
      .prepare('SELECT id FROM recurring_rules WHERE id = ? AND owner_id = ?')
      .bind(id, user.userId)
      .first();
    return existing
      ? Response.json(
          {
            error:
              'Esta regra já possui lançamentos confirmados. Pause-a para preservar o histórico.',
          },
          { status: 409 },
        )
      : Response.json(
          { error: 'Recorrência não encontrada.' },
          { status: 404 },
        );
  } catch (error) {
    console.error('Failed to delete recurrence', error);
    return Response.json(
      { error: 'Não foi possível remover a recorrência.' },
      { status: 500 },
    );
  }
}
