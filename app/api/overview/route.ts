import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { getMonthRange, todayInBrazil } from '@/lib/finance-month';
import { addMonths, type RecurringRule } from '@/lib/recurring';
import {
  buildFinanceAlerts,
  pendingOccurrences,
  type OverviewBudget,
  type OverviewInvoice,
} from '@/lib/overview';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET() {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Entre na sua conta.' },
      { status: 401, headers },
    );
  try {
    const db = getDb();
    const today = todayInBrazil();
    const month = today.slice(0, 7);
    const range = getMonthRange(month)!;
    // Todas as consultas financeiras usam a identidade da sessão, nunca parâmetros do cliente.
    const [
      account,
      monthly,
      wallet,
      portfolio,
      invoiceRows,
      budgetRows,
      ruleRows,
      confirmations,
    ] = await Promise.all([
      db
        .prepare(`SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE -amount_cents END), 0) AS balance
        FROM transactions WHERE owner_id = ? AND transaction_date <= ?`)
        .bind(user.userId, today)
        .first(),
      db
        .prepare(`SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense,
        COALESCE(SUM(CASE WHEN type = 'transfer' THEN amount_cents ELSE 0 END), 0) AS transfer
        FROM transactions WHERE owner_id = ? AND transaction_date >= ? AND transaction_date <= ?`)
        .bind(user.userId, range.start, today)
        .first(),
      db
        .prepare(
          'SELECT balance_cents AS balance FROM investment_wallets WHERE owner_id = ?',
        )
        .bind(user.userId)
        .first(),
      db
        .prepare(
          'SELECT COALESCE(SUM(current_value_cents), 0) AS balance FROM investments WHERE owner_id = ?',
        )
        .bind(user.userId)
        .first(),
      db
        .prepare(`SELECT i.id, c.name AS "cardName", i.reference_month AS "referenceMonth", i.due_date AS "dueDate",
        SUM(t.amount_cents) AS "amountCents" FROM credit_card_invoices i
        JOIN credit_cards c ON c.id = i.card_id AND c.owner_id = i.owner_id
        JOIN credit_card_transactions t ON t.invoice_id = i.id AND t.owner_id = i.owner_id AND t.card_id = i.card_id
        WHERE i.owner_id = ? AND i.status <> 'paid'
        GROUP BY i.id, c.name, i.reference_month, i.due_date ORDER BY i.due_date, i.id`)
        .bind(user.userId)
        .all(),
      db
        .prepare(`SELECT b.category_id AS "categoryId", c.name AS "categoryName", b.limit_cents AS "limitCents",
        COALESCE(SUM(t.amount_cents), 0) AS "spentCents" FROM budgets b JOIN categories c ON c.id = b.category_id
        LEFT JOIN transactions t ON t.category_id = b.category_id AND t.owner_id = b.owner_id AND t.type = 'expense'
        AND t.transaction_date >= ? AND t.transaction_date <= ?
        WHERE b.owner_id = ? AND b.month = ? GROUP BY b.id, c.name ORDER BY c.name`)
        .bind(range.start, today, user.userId, month)
        .all(),
      db
        .prepare(`SELECT r.id, r.description, r.type, r.amount_cents AS "amountCents", r.category_id AS "categoryId",
        c.name AS "categoryName", r.starts_on AS "startsOn", r.ends_on AS "endsOn", r.active
        FROM recurring_rules r JOIN categories c ON c.id = r.category_id WHERE r.owner_id = ? AND r.active = 1`)
        .bind(user.userId)
        .all(),
      db
        .prepare(`SELECT recurring_rule_id AS "ruleId", recurring_occurrence_date AS date FROM transactions
        WHERE owner_id = ? AND recurring_rule_id IS NOT NULL AND recurring_occurrence_date >= ? AND recurring_occurrence_date < ?`)
        .bind(user.userId, range.start, `${addMonths(month, 2)}-01`)
        .all(),
    ]);
    const invoices: OverviewInvoice[] = invoiceRows.results.map((row) => ({
      id: Number(row.id),
      cardName: String(row.cardName),
      dueDate: String(row.dueDate),
      referenceMonth: String(row.referenceMonth),
      amountCents: Number(row.amountCents),
    }));
    const budgets: OverviewBudget[] = budgetRows.results.map((row) => ({
      categoryId: Number(row.categoryId),
      categoryName: String(row.categoryName),
      limitCents: Number(row.limitCents),
      spentCents: Number(row.spentCents),
    }));
    const rules = ruleRows.results.map((row) => ({
      ...row,
      id: Number(row.id),
      amountCents: Number(row.amountCents),
      categoryId: Number(row.categoryId),
      active: Number(row.active) === 1,
    })) as RecurringRule[];
    const occurrences = pendingOccurrences(
      rules,
      confirmations.results.map((row) => ({
        ruleId: Number(row.ruleId),
        date: String(row.date),
      })),
      today,
    );
    return Response.json(
      {
        today,
        month,
        updatedAt: new Date().toISOString(),
        accountBalanceCents: Number(account?.balance ?? 0),
        walletBalanceCents: Number(wallet?.balance ?? 0),
        portfolioValueCents: Number(portfolio?.balance ?? 0),
        monthly: {
          incomeCents: Number(monthly?.income ?? 0),
          expenseCents: Number(monthly?.expense ?? 0),
          transferCents: Number(monthly?.transfer ?? 0),
        },
        invoices,
        budgets,
        occurrences,
        alerts: buildFinanceAlerts(today, budgets, invoices, occurrences),
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: 'Não foi possível carregar a visão geral. Tente novamente.' },
      { status: 500, headers },
    );
  }
}
