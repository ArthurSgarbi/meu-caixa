import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeBanks, BANK_REFRESH_MS } from '../lib/bank-summary.ts';

const now = Date.parse('2026-10-01T18:00:00Z');
const account = (id, cents, extra = {}) => ({
  id,
  name: id,
  type: 'BANK',
  currency: 'BRL',
  balanceCents: cents,
  movements: [],
  partialMovements: false,
  ...extra,
});
const connection = (id, accounts, extra = {}) => ({
  id,
  name: id,
  status: 'UPDATED',
  lastUpdatedAt: '2026-10-01T12:00:00Z',
  consentExpiresAt: null,
  accounts,
  investments: [],
  partial: false,
  ...extra,
});
const summary = (...connections) =>
  summarizeBanks(
    { version: 1, checkedAt: '2026-10-01T18:00:00Z', connections },
    now,
  );

test('saldo automático soma Inter e Mercado Pago em centavos sem extratos', () => {
  const result = summary(
    connection('Inter', [account('a', 10001)]),
    connection('MP', [account('b', 22222)]),
  );
  assert.equal(result.balanceCents, 32223);
  assert.equal(result.incomplete, false);
  assert.equal(result.rows.length, 2);
  assert.equal(BANK_REFRESH_MS, 900000);
});
test('cartões, limites e investimentos não aumentam o saldo bancário', () => {
  const result = summary(
    connection(
      'Inter',
      [
        account('a', 1000),
        account('card', 50000, { type: 'CREDIT', limitCents: 1000000 }),
      ],
      {
        investments: [
          {
            id: 'invest',
            balanceCents: 90000,
            currency: 'BRL',
            status: 'ACTIVE',
          },
        ],
      },
    ),
  );
  assert.equal(result.balanceCents, 1000);
  assert.equal(result.rows.length, 1);
});
test('saldos negativos e zeros válidos são preservados', () => {
  assert.equal(
    summary(connection('bank', [account('a', -1001), account('b', 0)]))
      .balanceCents,
    -1001,
  );
  assert.equal(summary(connection('bank', [account('a', 0)])).balanceCents, 0);
});
test('transferir entre bancos mantém o total sem classificar como renda', () => {
  const before = summary(
    connection('Inter', [account('a', 10000)]),
    connection('MP', [account('b', 5000)]),
  );
  const after = summary(
    connection('Inter', [account('a', 8000)]),
    connection('MP', [account('b', 7000)]),
  );
  assert.equal(before.balanceCents, after.balanceCents);
});
test('conta duplicada não conta duas vezes; divergência bloqueia total', () => {
  assert.equal(
    summary(
      connection('1', [account('a', 100)]),
      connection('2', [account('a', 100)]),
    ).balanceCents,
    100,
  );
  assert.equal(
    summary(
      connection('1', [account('a', 100)]),
      connection('2', [account('a', 101)]),
    ).balanceCents,
    null,
  );
});
test('banco indisponível ou autorização expirada não expõe saldo antigo', () => {
  for (const extra of [
    { status: 'REAUTHORIZATION_REQUIRED' },
    { consentExpiresAt: '2026-09-30T12:00:00Z' },
  ]) {
    const result = summary(
      connection('Inter', [account('a', 100)], extra),
      connection('MP', [account('b', 200)]),
    );
    assert.equal(result.balanceCents, null);
    assert.equal(result.rows.length, 1);
    assert.equal(result.incomplete, true);
  }
});
test('saldo ausente, moeda não BRL ou lista parcial nunca vira total fictício', () => {
  for (const a of [
    account('a', null),
    account('a', 100, { currency: 'USD' }),
    account('a', Number.NaN),
  ]) {
    assert.equal(summary(connection('bank', [a])).balanceCents, null);
  }
  assert.equal(
    summary(connection('bank', [account('a', 100)], { partial: true }))
      .balanceCents,
    null,
  );
  assert.equal(summary(connection('bank', [])).balanceCents, null);
  assert.equal(summary().balanceCents, null);
});
test('limite de inteiros seguros impede total impreciso', () => {
  assert.equal(
    summary(
      connection('bank', [
        account('a', Number.MAX_SAFE_INTEGER),
        account('b', 1),
      ]),
    ).balanceCents,
    null,
  );
});
test('acumulação de grandes saldos positivos e negativos não perde centavos', () => {
  assert.equal(
    summary(
      connection('bank', [
        account('a', Number.MAX_SAFE_INTEGER),
        account('b', 2),
        account('c', -Number.MAX_SAFE_INTEGER),
      ]),
    ).balanceCents,
    2,
  );
});
test('data desatualizada ou ausente recebe aviso sem fingir tempo real', () => {
  assert.equal(summary(connection('bank', [account('a', 100)])).stale, false);
  assert.equal(
    summary(connection('bank', [account('a', 100)], { lastUpdatedAt: null }))
      .stale,
    true,
  );
  assert.equal(
    summary(
      connection('bank', [account('a', 100)], {
        lastUpdatedAt: '2026-09-28T12:00:00Z',
      }),
    ).stale,
    true,
  );
});
