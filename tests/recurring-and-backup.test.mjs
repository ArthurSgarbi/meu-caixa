import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addMonths,
  occurrenceForMonth,
  sumForecastCents,
  isValidDate,
} from '../lib/recurring.ts';
import {
  backupDigest,
  backupTables,
  csvCell,
  validateBackup,
} from '../lib/user-backup.ts';

test('recorrência do dia 31 usa o último dia do mês e respeita início/fim', () => {
  const rule = { startsOn: '2026-01-31', endsOn: '2026-03-31' };
  assert.equal(occurrenceForMonth(rule, '2026-02'), '2026-02-28');
  assert.equal(occurrenceForMonth(rule, '2026-03'), '2026-03-31');
  assert.equal(occurrenceForMonth(rule, '2026-04'), null);
  assert.equal(addMonths('2026-12', 2), '2027-02');
  assert.equal(isValidDate('2026-02-30'), false);
});

test('previsão aplica receitas e despesas sem alterar saldo confirmado', () => {
  const starting = 100_00;
  assert.equal(
    sumForecastCents(starting, [
      { type: 'income', amountCents: 200_00 },
      { type: 'expense', amountCents: 75_00 },
    ]),
    225_00,
  );
  assert.equal(starting, 100_00);
});

test('backup só aceita a própria conta e detecta corrupção', () => {
  const data = Object.fromEntries(backupTables.map(({ name }) => [name, []]));
  const backup = {
    format: 'meu-caixa-backup',
    version: 1,
    ownerId: 'usuario-1',
    exportedAt: '2026-09-28T00:00:00.000Z',
    categories: [],
    data,
  };
  const valid = { ...backup, sha256: backupDigest(backup) };
  assert.equal(validateBackup(valid, 'usuario-1').ownerId, 'usuario-1');
  assert.throws(() => validateBackup(valid, 'usuario-2'), /outra conta/);
  assert.throws(
    () =>
      validateBackup(
        { ...valid, categories: [{ id: 1, slug: 'x', type: 'expense' }] },
        'usuario-1',
      ),
    /integridade/,
  );
});

test('backup recusa data impossível mesmo com checksum recalculado', () => {
  const data = Object.fromEntries(backupTables.map(({ name }) => [name, []]));
  data.transactions = [
    {
      id: 7,
      owner_id: 'usuario-1',
      description: 'Teste',
      type: 'expense',
      amount_cents: 100,
      account_id: null,
      transaction_date: '2026-02-30',
      category_id: 1,
      recurring_rule_id: null,
      recurring_occurrence_date: null,
      created_at: '2026-09-28T00:00:00.000Z',
    },
  ];
  const backup = {
    format: 'meu-caixa-backup',
    version: 1,
    ownerId: 'usuario-1',
    exportedAt: '2026-09-28T00:00:00.000Z',
    categories: [{ id: 1, slug: 'alimentacao', type: 'expense' }],
    data,
  };
  assert.throws(
    () =>
      validateBackup({ ...backup, sha256: backupDigest(backup) }, 'usuario-1'),
    /Data inválida/,
  );
});

test('CSV neutraliza fórmulas de planilha e escapa aspas', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('Mercado "A"'), '"Mercado ""A"""');
});

test('backup recusa reserva negativa mesmo com checksum recalculado', () => {
  const data = Object.fromEntries(backupTables.map(({ name }) => [name, []]));
  data.financial_goals = [
    {
      id: 1,
      owner_id: 'usuario-1',
      name: 'Meta',
      target_cents: 10000,
      target_date: '2027-01-01',
      request_id: 'teste',
      created_at: 'now',
      updated_at: 'now',
    },
  ];
  data.goal_allocations = [
    {
      id: 1,
      owner_id: 'usuario-1',
      goal_id: 1,
      account_id: null,
      amount_cents: -100,
      request_id: 'teste',
      created_at: 'now',
    },
  ];
  const backup = {
    format: 'meu-caixa-backup',
    version: 1,
    ownerId: 'usuario-1',
    exportedAt: '2026-09-30T00:00:00Z',
    categories: [],
    data,
  };
  assert.throws(
    () =>
      validateBackup({ ...backup, sha256: backupDigest(backup) }, 'usuario-1'),
    /Reservas/,
  );
});
