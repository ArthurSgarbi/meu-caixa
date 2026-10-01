import { getDb, type Database } from '@/db';
import { todayInBrazil } from '@/lib/finance-month';
import {
  goalProgress,
  type AccountsGoalsData,
  type FinancialAccount,
} from '@/lib/accounts-goals';

// Cada subconsulta usa a sessão e a data de hoje. Transferências internas têm
// duas pontas no mesmo lançamento, por isso não mudam receitas/despesas.
export const accountStateSql = `WITH p AS (SELECT ?::text AS owner_id, ?::text AS today),
  account_list AS (
    SELECT NULL::integer AS id, 'Conta principal'::text AS name, 'Registros anteriores'::text AS institution,
      0 AS opening_balance_cents, '0001-01-01'::text AS opened_on
    UNION ALL SELECT id, name, institution, opening_balance_cents, opened_on FROM financial_accounts
      WHERE owner_id = (SELECT owner_id FROM p)
  ), balances AS (
    SELECT a.*, CASE WHEN a.opened_on <= p.today THEN a.opening_balance_cents ELSE 0 END
      + COALESCE((SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount_cents ELSE -t.amount_cents END)
        FROM transactions t WHERE t.owner_id = p.owner_id AND t.account_id IS NOT DISTINCT FROM a.id AND t.transaction_date <= p.today),0)
      + COALESCE((SELECT SUM(x.amount_cents) FROM account_transfers x WHERE x.owner_id = p.owner_id
        AND x.to_account_id IS NOT DISTINCT FROM a.id AND x.transfer_date <= p.today),0)
      - COALESCE((SELECT SUM(x.amount_cents) FROM account_transfers x WHERE x.owner_id = p.owner_id
        AND x.from_account_id IS NOT DISTINCT FROM a.id AND x.transfer_date <= p.today),0) AS balance_cents,
      COALESCE((SELECT SUM(g.amount_cents) FROM goal_allocations g WHERE g.owner_id = p.owner_id
        AND g.account_id IS NOT DISTINCT FROM a.id),0) AS reserved_cents
    FROM account_list a CROSS JOIN p
  ), account_state AS (SELECT *, balance_cents - reserved_cents AS available_cents FROM balances)`;

/** Bloqueio em um comando ANTERIOR à leitura: evita usar um snapshot obsoleto. */
export function ownerLock(db: Database, ownerId: string) {
  return db.prepare('SELECT pg_advisory_xact_lock(hashtext(?))').bind(ownerId);
}
export async function accountIsValid(
  db: Database,
  ownerId: string,
  accountId: number | null,
  date?: string,
) {
  if (accountId === null) return true;
  const row = await db
    .prepare(
      'SELECT opened_on FROM financial_accounts WHERE owner_id = ? AND id = ?',
    )
    .bind(ownerId, accountId)
    .first();
  return Boolean(row && (!date || String(row.opened_on) <= date));
}
export async function loadAccountsGoals(
  ownerId: string,
): Promise<AccountsGoalsData> {
  const db = getDb();
  const today = todayInBrazil();
  const [accountRows, goals, allocations, transfers] = await Promise.all([
    db
      .prepare(
        `${accountStateSql} SELECT * FROM account_state ORDER BY id NULLS FIRST`,
      )
      .bind(ownerId, today)
      .all(),
    db
      .prepare(
        'SELECT id, name, target_cents, target_date FROM financial_goals WHERE owner_id = ? ORDER BY target_date, id',
      )
      .bind(ownerId)
      .all(),
    db
      .prepare(
        'SELECT goal_id, account_id, SUM(amount_cents) AS amount FROM goal_allocations WHERE owner_id = ? GROUP BY goal_id, account_id',
      )
      .bind(ownerId)
      .all(),
    db
      .prepare(`SELECT x.id, x.description, x.amount_cents, x.transfer_date,
      COALESCE(f.name, 'Conta principal') AS from_name, COALESCE(t.name, 'Conta principal') AS to_name
      FROM account_transfers x LEFT JOIN financial_accounts f ON f.id = x.from_account_id AND f.owner_id = x.owner_id
      LEFT JOIN financial_accounts t ON t.id = x.to_account_id AND t.owner_id = x.owner_id
      WHERE x.owner_id = ? ORDER BY x.transfer_date DESC, x.id DESC LIMIT 50`)
      .bind(ownerId)
      .all(),
  ]);
  const accounts: FinancialAccount[] = accountRows.results.map((r) => ({
    id: r.id === null ? null : Number(r.id),
    name: String(r.name),
    institution: String(r.institution),
    openedOn: String(r.opened_on),
    balanceCents: Number(r.balance_cents),
    reservedCents: Number(r.reserved_cents),
    availableCents: Number(r.available_cents),
  }));
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  return {
    today,
    accounts,
    totals: accounts.reduce(
      (s, a) => ({
        balanceCents: s.balanceCents + a.balanceCents,
        reservedCents: s.reservedCents + a.reservedCents,
        availableCents: s.availableCents + a.availableCents,
      }),
      { balanceCents: 0, reservedCents: 0, availableCents: 0 },
    ),
    goals: goals.results.map((g) => {
      const items = allocations.results.filter(
        (a) => Number(a.goal_id) === Number(g.id),
      );
      const savedCents = items.reduce((s, a) => s + Number(a.amount), 0);
      const targetCents = Number(g.target_cents);
      return {
        id: Number(g.id),
        name: String(g.name),
        targetCents,
        targetDate: String(g.target_date),
        savedCents,
        ...goalProgress(targetCents, savedCents, String(g.target_date), today),
        allocations: items
          .filter((a) => Number(a.amount) > 0)
          .map((a) => ({
            accountId: a.account_id === null ? null : Number(a.account_id),
            accountName:
              names.get(a.account_id === null ? null : Number(a.account_id)) ??
              'Conta',
            amountCents: Number(a.amount),
          })),
      };
    }),
    transfers: transfers.results.map((r) => ({
      id: Number(r.id),
      description: String(r.description),
      amountCents: Number(r.amount_cents),
      transferDate: String(r.transfer_date),
      fromName: String(r.from_name),
      toName: String(r.to_name),
    })),
  };
}
