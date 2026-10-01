import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizedConnections,
  bankScopeSnapshot,
  bankDisplayName,
  bankHasUnavailableData,
  bankAccounts,
  bankPositions,
  bankMovements,
  bankTotal,
  bankOverviewTotals,
  movementSampleTotals,
} from '../lib/bank-views.ts';
import { summarizeBanks } from '../lib/bank-summary.ts';

const account = (id, extra = {}) => ({
  id,
  name: id,
  type: 'BANK',
  currency: 'BRL',
  balanceCents: 1000,
  movements: [],
  ...extra,
});
const position = (id, extra = {}) => ({
  id,
  name: id,
  status: 'ACTIVE',
  currency: 'BRL',
  balanceCents: 2000,
  ...extra,
});
const connection = (id, extra = {}) => ({
  id,
  name: id,
  status: 'UPDATED',
  consentExpiresAt: null,
  partial: false,
  accounts: [account(`${id}-account`)],
  investments: [position(`${id}-position`)],
  ...extra,
});
const snapshot = (...connections) => ({
  version: 1,
  checkedAt: new Date().toISOString(),
  connections,
});
const movement = (id, extra = {}) => ({
  id,
  description: id,
  date: '2026-10-01T00:00:00Z',
  type: 'DEBIT',
  status: 'POSTED',
  currency: 'BRL',
  amountCents: -100,
  ...extra,
});

test('todas as abas usam somente conexões autorizadas, sem posições antigas', () => {
  const s = snapshot(
    connection('good'),
    connection('expired', { consentExpiresAt: '2000-01-01' }),
    connection('bad', { status: 'REAUTHORIZATION_REQUIRED' }),
  );
  assert.equal(authorizedConnections(s).length, 1);
  assert.equal(bankAccounts(s).length, 1);
  assert.equal(bankPositions(s).length, 1);
  assert.equal(bankOverviewTotals(s).investmentsCents, null);
  assert.equal(bankHasUnavailableData(s), true);
  assert.equal(bankHasUnavailableData(snapshot(connection('ok'))), false);
  assert.equal(
    bankHasUnavailableData(snapshot(connection('partial', { partial: true }))),
    true,
  );
  const timed = snapshot(
    connection('timed', { consentExpiresAt: '2026-10-01T12:00:00Z' }),
  );
  assert.equal(
    bankHasUnavailableData(timed, Date.parse('2026-10-01T11:59:59Z')),
    false,
  );
  assert.equal(
    bankHasUnavailableData(timed, Date.parse('2026-10-01T12:00:00Z')),
    true,
  );
});
test('extrato usa mês civil e conta selecionada; cartões ficam fora do padrão', () => {
  const s = snapshot(
    connection('bank', {
      accounts: [
        account('a', {
          movements: [
            movement('first'),
            movement('last', { date: '2026-10-31T23:59:59Z' }),
            movement('old', { date: '2026-09-30T23:59:59Z' }),
            movement('next', { date: '2026-11-01T00:00:00Z' }),
          ],
        }),
        account('card', { type: 'CREDIT', movements: [movement('purchase')] }),
      ],
    }),
  );
  assert.deepEqual(
    bankMovements(s, '2026-10').map((m) => m.id),
    ['last', 'first'],
  );
  assert.deepEqual(
    bankMovements(s, '2026-10', 'card').map((m) => m.id),
    ['purchase'],
  );
  assert.deepEqual(bankMovements(s, '2026-13'), []);
  assert.deepEqual(bankMovements(s, '2026-10', 'not-authorized'), []);
});
test('IDs repetidos não duplicam contas, posições ou movimentações', () => {
  const a = account('a', { movements: [movement('m'), movement('m')] });
  const s = snapshot(
    connection('bank', {
      accounts: [a, a],
      investments: [position('p'), position('p')],
    }),
  );
  assert.equal(bankAccounts(s).length, 1);
  assert.equal(bankPositions(s).length, 1);
  assert.equal(bankMovements(s, '2026-10').length, 1);
});
test('resumo de extrato não mistura pendências nem tipos desconhecidos', () => {
  const s = snapshot(
    connection('bank', {
      accounts: [
        account('a', {
          movements: [
            movement('income', { type: 'CREDIT', amountCents: 1001 }),
            movement('debit'),
            movement('pending', { status: 'PENDING' }),
            movement('unknown', { type: 'UNKNOWN' }),
          ],
        }),
      ],
    }),
  );
  const totals = movementSampleTotals(bankMovements(s, '2026-10'));
  assert.equal(totals.entriesCents, 1001);
  assert.equal(totals.exitsCents, 100);
  assert.equal(totals.pendingCount, 1);
  assert.equal(totals.unknownCount, 1);
  assert.equal(Object.hasOwn(totals, 'incomeCents'), false);
});
test('valores ausentes ou moedas diferentes não são convertidos em zeros', () => {
  for (const row of [
    { id: 'a', currency: 'USD', cents: 10 },
    { id: 'a', currency: 'BRL', cents: null },
    { id: 'a', currency: 'BRL', cents: 1.5 },
  ])
    assert.equal(bankTotal([row]), null);
  assert.equal(bankTotal([]), null);
  assert.equal(bankTotal([{ id: 'a', currency: 'BRL', cents: 0 }]), 0);
});
test('total bancário usa centavos exatos e recusa duplicatas conflitantes', () => {
  const rows = [Number.MAX_SAFE_INTEGER, 2, -Number.MAX_SAFE_INTEGER].map(
    (cents, i) => ({ id: String(i), currency: 'BRL', cents }),
  );
  assert.equal(bankTotal(rows), 2);
  const row = { id: 'a', currency: 'BRL', cents: 100 };
  assert.equal(bankTotal([row, row]), 100);
  assert.equal(bankTotal([row, { ...row, cents: 200 }]), null);
  assert.equal(bankTotal(rows.slice(0, 2)), null);
});
test('visão geral não soma saldos de contas, cartões e investimentos entre si', () => {
  const s = snapshot(
    connection('bank', {
      accounts: [
        account('cash'),
        account('card', {
          type: 'CREDIT',
          balanceCents: -3000,
          limitCents: 90000,
        }),
      ],
      investments: [
        position('active'),
        position('closed', { status: 'CLOSED', balanceCents: 999999 }),
      ],
    }),
  );
  assert.deepEqual(bankOverviewTotals(s), {
    cardBalanceCents: -3000,
    investmentsCents: 2000,
  });
  assert.equal(
    bankOverviewTotals(snapshot(connection('bank', { partial: true })))
      .investmentsCents,
    null,
  );
  assert.equal(
    bankOverviewTotals(snapshot(connection('bank', { accounts: [] })))
      .cardBalanceCents,
    null,
  );
});
test('movimentos iguais em contas diferentes são eventos separados, não dedup por valor', () => {
  const s = snapshot(
    connection('bank', {
      accounts: [
        account('a', { movements: [movement('m')] }),
        account('b', { movements: [movement('m')] }),
      ],
    }),
  );
  assert.equal(bankMovements(s, '2026-10').length, 2);
});

test('abas reúnem os bancos por padrão e filtram todos os dados sem alterar a origem', () => {
  const s = snapshot(
    connection('inter', {
      name: 'BANCO INTER',
      accounts: [
        account('inter-account', {
          balanceCents: 1001,
          movements: [movement('inter-tx')],
        }),
      ],
    }),
    connection('mp', {
      name: 'Mercado Pago',
      accounts: [
        account('mp-account', {
          balanceCents: 2002,
          movements: [movement('mp-tx')],
        }),
      ],
    }),
  );
  const before = structuredClone(s);
  assert.equal(bankScopeSnapshot(s), s);
  assert.equal(summarizeBanks(bankScopeSnapshot(s)).balanceCents, 3003);
  for (const [id, balance, tx] of [
    ['inter', 1001, 'inter-tx'],
    ['mp', 2002, 'mp-tx'],
  ]) {
    const scoped = bankScopeSnapshot(s, id);
    assert.equal(summarizeBanks(scoped).balanceCents, balance);
    assert.deepEqual(
      bankAccounts(scoped).map((a) => a.id),
      [`${id === 'mp' ? 'mp' : 'inter'}-account`],
    );
    assert.deepEqual(
      bankMovements(scoped, '2026-10').map((m) => m.id),
      [tx],
    );
    assert.deepEqual(
      bankPositions(scoped).map((p) => p.id),
      [`${id}-position`],
    );
    assert.equal(scoped.checkedAt, s.checkedAt);
  }
  assert.deepEqual(s, before);
  assert.equal(bankDisplayName('BANCO INTER'), 'Inter');
  assert.equal(bankDisplayName('Mercado Pago'), 'Mercado Pago');
});

test('banco desconhecido, removido ou expirado não amplia o filtro nem expõe dados antigos', () => {
  const s = snapshot(
    connection('good'),
    connection('expired', { consentExpiresAt: '2000-01-01' }),
  );
  for (const id of ['unknown', 'expired']) {
    const scoped = bankScopeSnapshot(s, id);
    assert.equal(summarizeBanks(scoped).balanceCents, null);
    assert.equal(bankAccounts(scoped).length, 0);
    assert.equal(bankPositions(scoped).length, 0);
    assert.equal(bankMovements(scoped, '2026-10').length, 0);
    assert.equal(bankOverviewTotals(scoped).investmentsCents, null);
  }
});

test('um banco indisponível bloqueia o consolidado, mas não o saldo do banco válido selecionado', () => {
  const s = snapshot(
    connection('good'),
    connection('bad', { status: 'REAUTHORIZATION_REQUIRED' }),
  );
  assert.equal(summarizeBanks(s).balanceCents, null);
  assert.equal(summarizeBanks(bankScopeSnapshot(s, 'good')).balanceCents, 1000);
  assert.equal(
    bankOverviewTotals(bankScopeSnapshot(s, 'good')).investmentsCents,
    2000,
  );
  assert.equal(summarizeBanks(bankScopeSnapshot(s, 'bad')).balanceCents, null);
});
