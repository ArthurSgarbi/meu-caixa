import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';

export const dynamic = 'force-dynamic';

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type CardInput = {
  name: string;
  brand: string;
  lastFour: string;
  creditLimitCents: number;
  closingDay: number;
  dueDay: number;
};

function parseCardInput(
  body: Record<string, unknown>,
): { input: CardInput } | { error: string } {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const brand = typeof body.brand === 'string' ? body.brand.trim() : '';
  const lastFour =
    typeof body.lastFour === 'string' ? body.lastFour.trim() : '';
  const creditLimitCents = Number(body.creditLimitCents);
  const closingDay = Number(body.closingDay);
  const dueDay = Number(body.dueDay);

  if (name.length < 2 || name.length > 50) {
    return { error: 'Informe um nome entre 2 e 50 caracteres.' };
  }
  if (brand.length < 2 || brand.length > 30) {
    return { error: 'Informe uma bandeira válida.' };
  }
  if (!/^\d{4}$/.test(lastFour)) {
    return { error: 'Informe os quatro últimos números do cartão.' };
  }
  if (!Number.isSafeInteger(creditLimitCents) || creditLimitCents <= 0) {
    return { error: 'Informe um limite maior que zero.' };
  }
  if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 28) {
    return { error: 'O fechamento deve estar entre os dias 1 e 28.' };
  }
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
    return { error: 'O vencimento deve estar entre os dias 1 e 28.' };
  }

  return {
    input: {
      name,
      brand,
      lastFour,
      creditLimitCents,
      closingDay,
      dueDay,
    },
  };
}

function addMonths(month: string, offset: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}

function dateForMonth(month: string, day: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function invoiceDueDate(month: string, closingDay: number, dueDay: number) {
  const dueMonth = dueDay <= closingDay ? addMonths(month, 1) : month;
  return dateForMonth(dueMonth, dueDay);
}

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthOptions(databaseMonths: string[]) {
  const current = getCurrentMonth();
  const months = new Set(databaseMonths);
  for (let offset = -6; offset <= 12; offset += 1) {
    months.add(addMonths(current, offset));
  }
  return [...months].sort();
}

export async function GET(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        { error: 'Entre na sua conta para acessar seus cartões.' },
        { status: 401 },
      );
    }

    const url = new URL(request.url);
    const month = url.searchParams.get('month') ?? getCurrentMonth();
    const requestedCardId = Number(url.searchParams.get('cardId'));

    if (!monthPattern.test(month)) {
      return Response.json(
        { error: 'Mês inválido. Use o formato AAAA-MM.' },
        { status: 400 },
      );
    }

    const db = getDb();
    const cardsResult = await db
      .prepare(
        `SELECT id, name, brand, last_four AS lastFour,
                credit_limit_cents AS creditLimitCents,
                closing_day AS closingDay, due_day AS dueDay
           FROM credit_cards
          WHERE owner_id = ?
          ORDER BY created_at, id`,
      )
      .bind(user.userId)
      .all();

    const cards = cardsResult.results as Array<Record<string, unknown>>;
    const selectedCard =
      cards.find((card) => Number(card.id) === requestedCardId) ?? cards[0];

    if (!selectedCard) {
      return Response.json({
        cards: [],
        selectedCard: null,
        months: monthOptions([]),
        invoice: null,
        transactions: [],
        summary: {
          limitTotalCents: 0,
          availableCents: 0,
          invoiceCents: 0,
          spentThisMonthCents: 0,
          futureInstallmentsCents: 0,
          outstandingCents: 0,
        },
      });
    }

    const cardId = Number(selectedCard.id);
    const [invoiceResult, transactionsResult, outstandingResult, monthsResult] =
      await Promise.all([
        db
          .prepare(
            `SELECT i.id, i.reference_month AS referenceMonth,
                    i.closing_date AS closingDate, i.due_date AS dueDate,
                    i.status, COALESCE(SUM(t.amount_cents), 0) AS totalCents
               FROM credit_card_invoices i
               LEFT JOIN credit_card_transactions t ON t.invoice_id = i.id
              WHERE i.owner_id = ? AND i.card_id = ?
                AND i.reference_month = ?
              GROUP BY i.id`,
          )
          .bind(user.userId, cardId, month)
          .first(),
        db
          .prepare(
            `SELECT t.id, t.purchase_group_id AS purchaseGroupId,
                    t.description, t.amount_cents AS amountCents,
                    t.purchase_date AS purchaseDate,
                    t.installment_number AS installmentNumber,
                    t.installment_count AS installmentCount
               FROM credit_card_transactions t
               JOIN credit_card_invoices i ON i.id = t.invoice_id
              WHERE t.owner_id = ? AND t.card_id = ?
                AND i.reference_month = ?
              ORDER BY t.purchase_date DESC, t.id DESC`,
          )
          .bind(user.userId, cardId, month)
          .all(),
        db
          .prepare(
            `SELECT
                COALESCE(SUM(CASE WHEN i.status != 'paid'
                  THEN t.amount_cents ELSE 0 END), 0) AS outstandingCents,
                COALESCE(SUM(CASE WHEN i.status != 'paid'
                  AND i.reference_month > ? THEN t.amount_cents ELSE 0 END), 0)
                  AS futureInstallmentsCents
               FROM credit_card_transactions t
               JOIN credit_card_invoices i ON i.id = t.invoice_id
              WHERE t.owner_id = ? AND t.card_id = ?`,
          )
          .bind(month, user.userId, cardId)
          .first(),
        db
          .prepare(
            `SELECT reference_month AS referenceMonth
               FROM credit_card_invoices
              WHERE owner_id = ? AND card_id = ?
              ORDER BY reference_month`,
          )
          .bind(user.userId, cardId)
          .all(),
      ]);

    const invoiceCents = Number(invoiceResult?.totalCents ?? 0);
    const outstandingCents = Number(outstandingResult?.outstandingCents ?? 0);
    const limitTotalCents = Number(selectedCard.creditLimitCents);
    const databaseMonths = monthsResult.results.map((item) =>
      String(item.referenceMonth),
    );

    // Crédito disponível = limite aprovado - faturas ainda não pagas.
    // O saldo pendente já inclui a fatura atual e todas as parcelas futuras.
    const availableCents = limitTotalCents - outstandingCents;

    return Response.json({
      cards,
      selectedCard,
      months: monthOptions(databaseMonths),
      invoice: invoiceResult ?? {
        id: null,
        referenceMonth: month,
        closingDate: dateForMonth(month, Number(selectedCard.closingDay)),
        dueDate: invoiceDueDate(
          month,
          Number(selectedCard.closingDay),
          Number(selectedCard.dueDay),
        ),
        status: 'open',
        totalCents: 0,
      },
      transactions: transactionsResult.results,
      summary: {
        limitTotalCents,
        availableCents,
        invoiceCents,
        spentThisMonthCents: invoiceCents,
        futureInstallmentsCents: Number(
          outstandingResult?.futureInstallmentsCents ?? 0,
        ),
        outstandingCents,
      },
    });
  } catch (error) {
    console.error('Failed to load credit cards', error);
    return Response.json(
      { error: 'Não foi possível carregar seus cartões.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        { error: 'Entre na sua conta para salvar dados do cartão.' },
        { status: 401 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action;
    const db = getDb();

    if (action === 'create_card') {
      const parsed = parseCardInput(body);
      if ('error' in parsed) {
        return Response.json({ error: parsed.error }, { status: 400 });
      }
      const input = parsed.input;
      const now = new Date().toISOString();
      const result = await db
        .prepare(
          `INSERT INTO credit_cards
            (owner_id, name, brand, last_four, credit_limit_cents,
             closing_day, due_day, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          user.userId,
          input.name,
          input.brand,
          input.lastFour,
          input.creditLimitCents,
          input.closingDay,
          input.dueDay,
          now,
          now,
        )
        .run();
      return Response.json({ id: result.meta.last_row_id }, { status: 201 });
    }

    if (action !== 'create_purchase') {
      return Response.json({ error: 'Ação inválida.' }, { status: 400 });
    }

    const cardId = Number(body.cardId);
    const description =
      typeof body.description === 'string' ? body.description.trim() : '';
    const totalAmountCents = Number(body.totalAmountCents);
    const purchaseDate =
      typeof body.purchaseDate === 'string' ? body.purchaseDate : '';
    const installmentCount = Number(body.installmentCount);

    if (!Number.isSafeInteger(cardId) || cardId <= 0) {
      return Response.json({ error: 'Selecione um cartão.' }, { status: 400 });
    }
    if (description.length < 2 || description.length > 100) {
      return Response.json(
        { error: 'Informe uma descrição entre 2 e 100 caracteres.' },
        { status: 400 },
      );
    }
    if (!Number.isSafeInteger(totalAmountCents) || totalAmountCents <= 0) {
      return Response.json(
        { error: 'Informe um valor maior que zero.' },
        { status: 400 },
      );
    }
    if (!datePattern.test(purchaseDate)) {
      return Response.json(
        { error: 'Informe uma data de compra válida.' },
        { status: 400 },
      );
    }
    if (
      !Number.isInteger(installmentCount) ||
      installmentCount < 1 ||
      installmentCount > 36
    ) {
      return Response.json(
        { error: 'O parcelamento deve ter entre 1 e 36 vezes.' },
        { status: 400 },
      );
    }

    const card = await db
      .prepare(
        `SELECT id, closing_day AS closingDay, due_day AS dueDay
           FROM credit_cards WHERE id = ? AND owner_id = ?`,
      )
      .bind(cardId, user.userId)
      .first();
    if (!card) {
      return Response.json(
        { error: 'Cartão não encontrado.' },
        { status: 404 },
      );
    }

    const purchaseMonth = purchaseDate.slice(0, 7);
    const purchaseDay = Number(purchaseDate.slice(8, 10));
    const firstInvoiceMonth =
      purchaseDay > Number(card.closingDay)
        ? addMonths(purchaseMonth, 1)
        : purchaseMonth;
    const invoiceMonths = Array.from({ length: installmentCount }, (_, index) =>
      addMonths(firstInvoiceMonth, index),
    );
    const now = new Date().toISOString();

    await db.batch(
      invoiceMonths.map((invoiceMonth) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO credit_card_invoices
              (card_id, owner_id, reference_month, closing_date, due_date,
               status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
          )
          .bind(
            cardId,
            user.userId,
            invoiceMonth,
            dateForMonth(invoiceMonth, Number(card.closingDay)),
            invoiceDueDate(
              invoiceMonth,
              Number(card.closingDay),
              Number(card.dueDay),
            ),
            now,
            now,
          ),
      ),
    );

    const placeholders = invoiceMonths.map(() => '?').join(', ');
    const invoicesResult = await db
      .prepare(
        `SELECT id, reference_month AS referenceMonth
           FROM credit_card_invoices
          WHERE owner_id = ? AND card_id = ?
            AND reference_month IN (${placeholders})`,
      )
      .bind(user.userId, cardId, ...invoiceMonths)
      .all();
    const invoiceIds = new Map(
      invoicesResult.results.map((invoice) => [
        String(invoice.referenceMonth),
        Number(invoice.id),
      ]),
    );

    const baseAmount = Math.floor(totalAmountCents / installmentCount);
    const remainder = totalAmountCents % installmentCount;
    const purchaseGroupId = crypto.randomUUID();

    await db.batch(
      invoiceMonths.map((invoiceMonth, index) =>
        db
          .prepare(
            `INSERT INTO credit_card_transactions
              (card_id, invoice_id, owner_id, purchase_group_id, description,
               amount_cents, purchase_date, installment_number,
               installment_count, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            cardId,
            invoiceIds.get(invoiceMonth),
            user.userId,
            purchaseGroupId,
            description,
            baseAmount + (index < remainder ? 1 : 0),
            purchaseDate,
            index + 1,
            installmentCount,
            now,
          ),
      ),
    );

    return Response.json({ purchaseGroupId }, { status: 201 });
  } catch (error) {
    console.error('Failed to save credit card data', error);
    const message =
      error instanceof Error && error.message.includes('UNIQUE')
        ? 'Já existe um cartão com esse nome.'
        : 'Não foi possível salvar os dados do cartão.';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        { error: 'Entre na sua conta para atualizar a fatura.' },
        { status: 401 },
      );
    }
    const body = (await request.json()) as Record<string, unknown>;
    const invoiceId = Number(body.invoiceId);
    const status = body.status;
    if (
      !Number.isSafeInteger(invoiceId) ||
      invoiceId <= 0 ||
      !['open', 'paid'].includes(String(status))
    ) {
      return Response.json(
        { error: 'Fatura inválida para atualização.' },
        { status: 400 },
      );
    }

    const result = await getDb()
      .prepare(
        `UPDATE credit_card_invoices
            SET status = ?, paid_at = ?, updated_at = ?
          WHERE id = ? AND owner_id = ?`,
      )
      .bind(
        status,
        status === 'paid' ? new Date().toISOString() : null,
        new Date().toISOString(),
        invoiceId,
        user.userId,
      )
      .run();
    if (result.meta.changes === 0) {
      return Response.json(
        { error: 'Fatura não encontrada.' },
        { status: 404 },
      );
    }
    return Response.json({ id: invoiceId, status });
  } catch (error) {
    console.error('Failed to update invoice', error);
    return Response.json(
      { error: 'Não foi possível atualizar a fatura.' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        { error: 'Entre na sua conta para excluir uma compra.' },
        { status: 401 },
      );
    }
    const body = (await request.json()) as Record<string, unknown>;
    const purchaseGroupId =
      typeof body.purchaseGroupId === 'string' ? body.purchaseGroupId : '';
    if (!purchaseGroupId) {
      return Response.json({ error: 'Compra inválida.' }, { status: 400 });
    }

    const db = getDb();
    const result = await db
      .prepare(
        `DELETE FROM credit_card_transactions
          WHERE purchase_group_id = ? AND owner_id = ?`,
      )
      .bind(purchaseGroupId, user.userId)
      .run();
    if (result.meta.changes === 0) {
      return Response.json(
        { error: 'Compra não encontrada.' },
        { status: 404 },
      );
    }
    await db
      .prepare(
        `DELETE FROM credit_card_invoices
          WHERE owner_id = ? AND status = 'open'
            AND NOT EXISTS (
              SELECT 1 FROM credit_card_transactions
               WHERE invoice_id = credit_card_invoices.id
            )`,
      )
      .bind(user.userId)
      .run();
    return Response.json({ deleted: true });
  } catch (error) {
    console.error('Failed to delete card purchase', error);
    return Response.json(
      { error: 'Não foi possível excluir a compra.' },
      { status: 500 },
    );
  }
}
