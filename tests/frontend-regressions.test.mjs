import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCurrencyToCents, parseDecimal } from '../lib/frontend-input.ts';
import { apiFetch, readApiJson } from '../lib/client-api.ts';
import {
  simulateDebt,
  simulateInvestment,
} from '../lib/simulation-calculations.ts';

test('valores monetários brasileiros e decimais são lidos em centavos', () => {
  for (const [input, expected] of [
    ['1.000', 100000],
    ['R$ 1.234,56', 123456],
    ['1000.50', 100050],
    ['0,01', 1],
    ['0', 0],
    [' 25,5 ', 2550],
    ['1.234.567,89', 123456789],
  ])
    assert.equal(parseCurrencyToCents(input), expected, input);
});

test('dinheiro inválido não é silenciosamente convertido em zero', () => {
  for (const input of [
    '',
    'abc',
    '-1',
    '1,234',
    '12.34,56',
    '1,2,3',
    'Infinity',
    '1e3',
    '9007199254740992',
  ]) {
    assert.ok(Number.isNaN(parseCurrencyToCents(input)), input);
  }
});

test('taxas e quantidades aceitam vírgula mas rejeitam texto e valores não finitos', () => {
  assert.equal(parseDecimal('10,50'), 10.5);
  assert.equal(parseDecimal('1.25'), 1.25);
  for (const input of ['', '10%abc', '-1', '1e3', 'NaN', '1.000,25']) {
    assert.ok(Number.isNaN(parseDecimal(input)), input);
  }
});

test('simulações válidas preservam os cálculos e pontos mensais', () => {
  const debt = simulateDebt(100000, 10, 2);
  assert.equal(debt.finalAmountCents, 121000);
  assert.equal(debt.points.length, 3);
  const investment = simulateInvestment(100000, 10000, 0, 12);
  assert.equal(investment.finalAmountCents, 220000);
  assert.equal(investment.totalEarningsCents, 0);
});

test('simulações inválidas ou fora da precisão segura não geram gráficos', () => {
  assert.deepEqual(simulateDebt(NaN, 10, 12).points, []);
  assert.deepEqual(simulateDebt(100000, 100, 120).points, []);
  assert.deepEqual(simulateInvestment(100000, 10000, 100, 600).points, []);
  assert.deepEqual(
    simulateInvestment(Number.MAX_SAFE_INTEGER, 1, 0, 1).points,
    [],
  );
});

test('resposta JSON válida é preservada', async () => {
  assert.deepEqual(await readApiJson(Response.json({ value: 42 })), {
    value: 42,
  });
});

test('HTML de sessão expirada e resposta inválida geram mensagens amigáveis', async () => {
  await assert.rejects(
    readApiJson(new Response('<html/>', { status: 401 })),
    /sessão expirou/,
  );
  await assert.rejects(
    readApiJson(new Response('<html/>', { status: 502 })),
    /resposta inválida/,
  );
});

test('falha de conexão não expõe o erro interno do navegador', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('Failed to fetch');
  });
  await assert.rejects(apiFetch('/api/test'), /Verifique sua conexão/);
});

test('cancelamento é preservado para evitar mensagens falsas nas trocas de tela', async (t) => {
  const controller = new AbortController();
  controller.abort();
  t.mock.method(globalThis, 'fetch', async () => {
    throw controller.signal.reason;
  });
  await assert.rejects(apiFetch('/api/test', { signal: controller.signal }), {
    name: 'AbortError',
  });
});

test('tempo esgotado apresenta orientação para tentar novamente', async (t) => {
  const controller = new AbortController();
  controller.abort(new DOMException('timeout', 'TimeoutError'));
  t.mock.method(AbortSignal, 'timeout', () => controller.signal);
  t.mock.method(globalThis, 'fetch', async () => {
    throw controller.signal.reason;
  });
  await assert.rejects(apiFetch('/api/test'), /demorou para responder/);
});
