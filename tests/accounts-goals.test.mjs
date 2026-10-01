import assert from 'node:assert/strict';
import test from 'node:test';
import {
  goalProgress,
  parseAccountId,
  positiveCents,
  requestKey,
  validDate,
} from '../lib/accounts-goals.ts';
import {
  backupTables,
  backupDigest,
  validateBackup,
} from '../lib/user-backup.ts';

test('goal plan uses actual reservations and rounds the monthly requirement up', () => {
  assert.deepEqual(goalProgress(100001, 10000, '2026-12-31', '2026-09-30'), {
    remainingCents: 90001,
    percentage: 9,
    monthsRemaining: 4,
    monthlyRequiredCents: 22501,
    overdue: false,
  });
  const p = goalProgress(500000, 0, '2027-02-28', '2026-09-30');
  assert.equal(p.monthsRemaining, 6);
  assert.equal(p.monthlyRequiredCents, 83334);
  assert.ok(p.monthlyRequiredCents * p.monthsRemaining >= p.remainingCents);
});
test('completed, expired and current-month goals have explicit outcomes', () => {
  assert.equal(
    goalProgress(100, 100, '2026-09-01', '2026-09-30').remainingCents,
    0,
  );
  const overdue = goalProgress(100, 25, '2026-09-01', '2026-09-30');
  assert.equal(overdue.overdue, true);
  assert.equal(overdue.monthsRemaining, 0);
  assert.equal(overdue.monthlyRequiredCents, 75);
  assert.equal(
    goalProgress(100, 0, '2026-09-30', '2026-09-30').monthsRemaining,
    1,
  );
});
test('money, identity and dates never silently accept invalid inputs', () => {
  assert.equal(parseAccountId(null), null);
  assert.equal(parseAccountId(12), 12);
  for (const id of [0, -1, '12', NaN, {}, 1.5])
    assert.throws(() => parseAccountId(id));
  for (const n of [0, -1, '100', Infinity, 2_147_483_648, 1.5])
    assert.throws(() => positiveCents(n));
  assert.equal(positiveCents(1), 1);
  assert.throws(() => validDate('2026-02-30'));
  assert.throws(() => requestKey('unsafe'));
});
test('old backups without account/goal tables remain readable without moving history', () => {
  const names = new Set([
    'financial_accounts',
    'financial_goals',
    'account_transfers',
    'goal_allocations',
  ]);
  const data = Object.fromEntries(
    backupTables.filter((t) => !names.has(t.name)).map((t) => [t.name, []]),
  );
  data.transactions = [
    {
      id: 1,
      owner_id: 'legacy',
      description: 'Anterior',
      type: 'income',
      amount_cents: 100,
      transaction_date: '2026-09-01',
      category_id: 1,
      recurring_rule_id: null,
      recurring_occurrence_date: null,
      created_at: 'now',
    },
  ];
  const b = {
    format: 'meu-caixa-backup',
    version: 1,
    ownerId: 'legacy',
    exportedAt: 'now',
    categories: [{ id: 1, slug: 'salario', type: 'income' }],
    data,
  };
  const restored = validateBackup({ ...b, sha256: backupDigest(b) }, 'legacy');
  assert.deepEqual(restored.data.financial_accounts, []);
  assert.equal(restored.data.transactions[0].account_id, null);
  assert.equal(validateBackup(restored, 'legacy').data.transactions.length, 1);
});
