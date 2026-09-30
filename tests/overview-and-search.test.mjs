import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildFinanceAlerts,
  pendingOccurrences,
  visibleFinanceAlerts,
  daysBetween,
} from '../lib/overview.ts';
import {
  parseTransactionSearch,
  literalSearchPattern,
} from '../lib/transaction-search.ts';
import {
  parsePreferences,
  defaultPreferences,
} from '../lib/user-preferences.ts';

test('alert thresholds do not round 79.99% into 80%, or 99.99% into 100%', () => {
  const budget = { categoryId: 1, categoryName: 'Lazer', limitCents: 10000 };
  assert.equal(
    buildFinanceAlerts('2026-09-30', [{ ...budget, spentCents: 7999 }], [], [])
      .length,
    0,
  );
  assert.equal(
    buildFinanceAlerts(
      '2026-09-30',
      [{ ...budget, spentCents: 8000 }],
      [],
      [],
    )[0].severity,
    'warning',
  );
  assert.equal(
    buildFinanceAlerts(
      '2026-09-30',
      [{ ...budget, spentCents: 9999 }],
      [],
      [],
    )[0].severity,
    'warning',
  );
  const reached = buildFinanceAlerts(
    '2026-09-30',
    [{ ...budget, spentCents: 10001 }],
    [],
    [],
  )[0];
  assert.equal(reached.severity, 'critical');
  assert.equal(reached.amountCents, -1);
  assert.equal(
    buildFinanceAlerts(
      '2026-09-30',
      [{ ...budget, spentCents: 9999, limitCents: 0 }],
      [],
      [],
    ).length,
    0,
  );
});

test('invoice notices cover overdue, today and 7 days, but not empty or distant invoices', () => {
  const invoice = {
    cardName: 'Inter',
    referenceMonth: '2026-10',
    amountCents: 12345,
  };
  const alerts = buildFinanceAlerts(
    '2026-09-30',
    [],
    [
      { ...invoice, id: 1, dueDate: '2026-09-29' },
      { ...invoice, id: 2, dueDate: '2026-09-30' },
      { ...invoice, id: 3, dueDate: '2026-10-07' },
      { ...invoice, id: 4, dueDate: '2026-10-08' },
      { ...invoice, id: 5, dueDate: '2026-09-30', amountCents: 0 },
    ],
    [],
  );
  assert.equal(alerts.length, 3);
  assert.equal(alerts[0].severity, 'critical');
  assert.match(alerts[1].title, /hoje/);
  assert.equal(daysBetween('2026-09-30', '2026-10-07'), 7);
});

test('pending recurrences exclude confirmed or disabled rules and handle month/year boundaries', () => {
  const rule = {
    id: 1,
    description: 'Aluguel',
    amountCents: 50000,
    type: 'expense',
    startsOn: '2026-01-31',
    endsOn: null,
    active: true,
  };
  assert.deepEqual(
    pendingOccurrences(
      [rule],
      [{ ruleId: 1, date: '2026-09-30' }],
      '2026-09-30',
    ),
    [],
  );
  assert.deepEqual(
    pendingOccurrences([{ ...rule, active: false }], [], '2026-09-30'),
    [],
  );
  const occurrences = pendingOccurrences(
    [{ ...rule, startsOn: '2026-01-01' }],
    [],
    '2026-12-31',
  );
  assert.deepEqual(
    occurrences.map((item) => item.date),
    ['2026-12-01', '2027-01-01'],
  );
  assert.equal(buildFinanceAlerts('2026-12-31', [], [], occurrences).length, 1);
});

test('alert preferences filter types without changing the underlying financial data', () => {
  const alerts = [
    { kind: 'budget' },
    { kind: 'invoice' },
    { kind: 'recurring' },
  ];
  assert.deepEqual(
    visibleFinanceAlerts(alerts, {
      alertBudgets: false,
      alertInvoices: true,
      alertRecurring: false,
    }),
    [{ kind: 'invoice' }],
  );
  assert.equal(alerts.length, 3);
});

test('older preferences gain alerts while retaining their theme and initial area', () => {
  const {
    alertBudgets: _alertBudgets,
    alertInvoices: _alertInvoices,
    alertRecurring: _alertRecurring,
    ...legacy
  } = defaultPreferences;
  const parsed = parsePreferences({
    ...legacy,
    defaultArea: 'expenses',
    theme: 'light',
  });
  assert.equal(parsed.defaultArea, 'expenses');
  assert.equal(parsed.theme, 'light');
  assert.equal(parsed.alertBudgets, true);
  assert.equal(
    parsePreferences({ ...defaultPreferences, alertRecurring: 'true' }),
    null,
  );
  assert.equal(
    parsePreferences({ ...defaultPreferences, alertBudgets: null }),
    null,
  );
  assert.equal(
    parsePreferences({ ...defaultPreferences, owner_id: 'other' }),
    null,
  );
  assert.equal(
    parsePreferences({ ...defaultPreferences, defaultArea: 'overview' })
      .defaultArea,
    'overview',
  );
});

test('advanced search validates dates, monetary bounds, sorting and pagination', () => {
  const valid = parseTransactionSearch(
    new URLSearchParams(
      'from=2026-09-01&to=2026-10-31&minCents=0&maxCents=99999&type=expense&page=2&sort=amount-desc',
    ),
  );
  assert.equal(valid.page, 2);
  assert.equal(valid.minCents, 0);
  assert.equal(parseTransactionSearch(new URLSearchParams()).page, 1);
  for (const query of [
    'from=2026-02-30',
    'from=2026-10-01&to=2026-09-01',
    'minCents=2&maxCents=1',
    'minCents=abc',
    'maxCents=1.5',
    'page=0',
    'page=NaN',
    'page=100001',
    'categoryId=-1',
    'sort=id;DROP TABLE',
    'type=admin',
  ]) {
    assert.equal(
      parseTransactionSearch(new URLSearchParams(query)),
      null,
      query,
    );
  }
});

test('description search is accent-insensitive and escapes wildcard characters', () => {
  assert.equal(literalSearchPattern('ALIMENTAÇÃO'), '%alimentacao%');
  assert.equal(literalSearchPattern('50%_\\'), '%50\\%\\_\\\\%');
});
