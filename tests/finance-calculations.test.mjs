import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateBudgetProgress,
  calculateMonthlyAccountChangeCents,
  parseBudgetLimitCents,
} from '../lib/finance-calculations.ts';
import { getMonthRange } from '../lib/finance-month.ts';

test('aporte reduz a conta, mas não entra nas despesas', () => {
  const incomeCents = 500_000;
  const expenseCents = 120_000;
  const transferCents = 80_000;
  assert.equal(
    calculateMonthlyAccountChangeCents(
      incomeCents,
      expenseCents,
      transferCents,
    ),
    300_000,
  );
  assert.equal(expenseCents, 120_000);
});

test('orçamento informa saldo restante e excesso em centavos', () => {
  assert.deepEqual(calculateBudgetProgress(30_000, 25_000), {
    remainingCents: 5_000,
    usedPercentage: 83,
  });
  assert.deepEqual(calculateBudgetProgress(30_000, 32_500), {
    remainingCents: -2_500,
    usedPercentage: 108,
  });
});

test('intervalo mensal inclui o primeiro dia e exclui o mês seguinte', () => {
  assert.deepEqual(getMonthRange('2026-12'), {
    start: '2026-12-01',
    next: '2027-01-01',
  });
  assert.equal(getMonthRange('2026-13'), null);
});

test('limite mensal interpreta valores monetários sem perder centavos', () => {
  assert.equal(parseBudgetLimitCents('R$ 1.000,50'), 100_050);
  assert.equal(parseBudgetLimitCents('1.000'), 100_000);
  assert.equal(parseBudgetLimitCents('1000.50'), 100_050);
  assert.equal(parseBudgetLimitCents('1,005'), 0);
  assert.equal(parseBudgetLimitCents('-10'), 0);
});
