import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { after, before, beforeEach, mock, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const authModule = new URL('../app/chatgpt-auth.ts', import.meta.url);
const dbModule = new URL('../db/index.ts', import.meta.url);

// These tests exercise the real route handlers. Only the identity provider
// and the external Neon connection are replaced with deterministic fixtures.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context);
    const path = join(projectRoot, specifier.slice(2));
    const resolved =
      path.endsWith('/db') || path.endsWith('\\db')
        ? join(path, 'index.ts')
        : `${path}.ts`;
    return nextResolve(pathToFileURL(resolved).href, context);
  },
});

let currentOwner = null;
let testDatabase;

mock.module(authModule, {
  exports: {
    getChatGPTUser: async () =>
      currentOwner
        ? {
            userId: currentOwner,
            email: '',
            displayName: 'Teste',
            fullName: null,
          }
        : null,
  },
});
mock.module(dbModule, { exports: { getDb: () => testDatabase } });

const transactionsRoute = await import('../app/api/transactions/route.ts');
const budgetsRoute = await import('../app/api/budgets/route.ts');
const cardsRoute = await import('../app/api/credit-cards/route.ts');
const walletRoute = await import('../app/api/investment-wallet/route.ts');
const exportRoute = await import('../app/api/data-export/route.ts');
const restoreRoute = await import('../app/api/data-restore/route.ts');
const investmentsRoute = await import('../app/api/investments/route.ts');
const recurringRoute = await import('../app/api/recurring/route.ts');
const recurringConfirmRoute =
  await import('../app/api/recurring/confirm/route.ts');
const simulationsRoute = await import('../app/api/simulations/route.ts');
const assistantRoute = await import('../app/api/assistant/route.ts');

function normalizeSql(query) {
  let parameterIndex = 0;
  let normalized = query
    .replace(/\?/g, () => `$${++parameterIndex}`)
    .replace(/\bAS\s+([a-z]+[A-Z][A-Za-z0-9_]*)/g, 'AS "$1"');
  const ignoresConflict = /\bINSERT\s+OR\s+IGNORE\s+INTO\b/i.test(normalized);
  normalized = normalized.replace(
    /\bINSERT\s+OR\s+IGNORE\s+INTO\b/i,
    'INSERT INTO',
  );
  if (ignoresConflict && !/\bON\s+CONFLICT\b/i.test(normalized)) {
    normalized = `${normalized.trim().replace(/;$/, '')} ON CONFLICT DO NOTHING`;
  }
  return normalized;
}

function inMemoryAdapter(pg) {
  function prepare(query, values = []) {
    const sqlText = normalizeSql(query);
    return {
      bind: (...params) => prepare(query, params),
      all: async () => ({ results: (await pg.query(sqlText, values)).rows }),
      first: async () => (await pg.query(sqlText, values)).rows[0] ?? null,
      run: async () => {
        const isInsert = /^\s*INSERT\b/i.test(sqlText);
        const executable =
          isInsert && !/\bRETURNING\b/i.test(sqlText)
            ? `${sqlText.trim().replace(/;$/, '')} RETURNING id`
            : sqlText;
        const result = await pg.query(executable, values);
        return {
          meta: {
            changes: result.affectedRows ?? result.rows.length,
            last_row_id: Number(result.rows[0]?.id) || null,
          },
        };
      },
    };
  }
  return {
    prepare,
    batch: async (statements) => {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };
}

let pg;
before(async () => {
  pg = new PGlite();
  for (const file of [
    '0000_gorgeous_grandmaster.sql',
    '0001_free_ronan.sql',
    '0002_reclassificar_aportes.sql',
    '0003_tiresome_gamora.sql',
  ]) {
    const migration = readFileSync(join(projectRoot, 'drizzle', file), 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) await pg.exec(statement);
    }
  }
  testDatabase = inMemoryAdapter(pg);
});
after(async () => {
  if (pg) await pg.close();
});
beforeEach(async () => {
  currentOwner = null;
  await pg.exec(`TRUNCATE TABLE budgets, categories, credit_card_invoices,
    credit_card_transactions, credit_cards, investment_contributions,
    investment_wallets, investments, saved_simulations, transactions,
    recurring_rules RESTART IDENTITY CASCADE`);
});

test('handler returns 401 without authentication', async () => {
  currentOwner = null;
  const response = await transactionsRoute.GET(
    new Request('https://local.test/api/transactions?month=2026-09'),
  );
  assert.equal(response.status, 401);
});

function jsonRequest(path, method, body) {
  assert.notEqual(method, 'GET');
  const options = {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
  return new Request(`https://local.test${path}`, options);
}

async function categoryIds() {
  currentOwner = 'test-owner-a';
  const response = await transactionsRoute.GET(
    new Request('https://local.test/api/transactions?month=2026-09'),
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  return Object.fromEntries(
    data.categories.map((category) => [category.name, category.id]),
  );
}

async function createIncomeForA(amountCents = 500_001) {
  const categories = await categoryIds();
  currentOwner = 'test-owner-a';
  const income = {
    description: 'Salário privado A',
    type: 'income',
    amountCents,
    transactionDate: '2026-09-02',
    categoryId: categories['Salário'],
  };
  const response = await transactionsRoute.POST(
    jsonRequest('/api/transactions', 'POST', income),
  );
  assert.equal(response.status, 201);
  return { categories, income, id: (await response.json()).id };
}

test('two users cannot read or edit each other’s transactions and budgets', async () => {
  const { categories, income, id: transactionIdA } = await createIncomeForA();
  const budgetA = await budgetsRoute.PUT(
    jsonRequest('/api/budgets', 'PUT', {
      month: '2026-09',
      categoryId: categories['Lazer'],
      limitCents: 12_345,
    }),
  );
  assert.equal(budgetA.status, 200);

  currentOwner = 'test-owner-b';
  const responseB = await transactionsRoute.GET(
    new Request('https://local.test/api/transactions?month=2026-09'),
  );
  assert.equal(responseB.status, 200);
  const dataB = await responseB.json();
  assert.deepEqual(dataB.transactions, []);
  assert.equal(dataB.summary.balanceCents, 0);

  const changedByB = await transactionsRoute.PATCH(
    jsonRequest('/api/transactions', 'PATCH', {
      ...income,
      id: transactionIdA,
      description: 'Adulterado por B',
      amountCents: 1,
    }),
  );
  assert.equal(changedByB.status, 404);

  const budgetViewB = await budgetsRoute.GET(
    new Request('https://local.test/api/budgets?month=2026-09'),
  );
  assert.equal(budgetViewB.status, 200);
  const bLazer = (await budgetViewB.json()).categories.find(
    (item) => item.categoryName === 'Lazer',
  );
  assert.equal(bLazer.limitCents, null);
  const budgetDeleteByB = await budgetsRoute.DELETE(
    jsonRequest('/api/budgets', 'DELETE', {
      month: '2026-09',
      categoryId: categories['Lazer'],
    }),
  );
  assert.equal(budgetDeleteByB.status, 404);

  currentOwner = 'test-owner-a';
  const responseA = await transactionsRoute.GET(
    new Request('https://local.test/api/transactions?month=2026-09'),
  );
  const dataA = await responseA.json();
  assert.equal(dataA.transactions.length, 1);
  assert.equal(dataA.transactions[0].description, income.description);
  assert.equal(dataA.summary.balanceCents, income.amountCents);
  const budgetViewA = await budgetsRoute.GET(
    new Request('https://local.test/api/budgets?month=2026-09'),
  );
  const aLazer = (await budgetViewA.json()).categories.find(
    (item) => item.categoryName === 'Lazer',
  );
  assert.equal(aLazer.limitCents, 12_345);
});

test('card purchases stay private and installments preserve every cent', async () => {
  currentOwner = 'test-owner-a';
  const created = await cardsRoute.POST(
    jsonRequest('/api/credit-cards', 'POST', {
      action: 'create_card',
      name: 'Cartão A',
      brand: 'Visa',
      lastFour: '1234',
      creditLimitCents: 20_000,
      closingDay: 15,
      dueDay: 25,
    }),
  );
  assert.equal(created.status, 201);
  const cardId = (await created.json()).id;

  const zeroCentInstallment = await cardsRoute.POST(
    jsonRequest('/api/credit-cards', 'POST', {
      action: 'create_purchase',
      cardId,
      description: 'Parcelas sem valor',
      totalAmountCents: 2,
      purchaseDate: '2026-09-28',
      installmentCount: 3,
    }),
  );
  assert.equal(zeroCentInstallment.status, 400);

  const purchase = await cardsRoute.POST(
    jsonRequest('/api/credit-cards', 'POST', {
      action: 'create_purchase',
      cardId,
      description: 'Compra parcelada A',
      totalAmountCents: 10_001,
      purchaseDate: '2026-09-28',
      installmentCount: 3,
    }),
  );
  assert.equal(purchase.status, 201);
  const purchaseGroupId = (await purchase.json()).purchaseGroupId;

  const amounts = [];
  let firstInvoiceId;
  for (const month of ['2026-10', '2026-11', '2026-12']) {
    const response = await cardsRoute.GET(
      new Request(
        `https://local.test/api/credit-cards?month=${month}&cardId=${cardId}`,
      ),
    );
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.transactions.length, 1);
    amounts.push(data.transactions[0].amountCents);
    assert.equal(data.summary.availableCents, 9_999);
    if (month === '2026-10') firstInvoiceId = data.invoice.id;
  }
  assert.deepEqual(amounts, [3_334, 3_334, 3_333]);
  assert.equal(
    amounts.reduce((sum, value) => sum + value, 0),
    10_001,
  );

  currentOwner = 'test-owner-b';
  const viewB = await cardsRoute.GET(
    new Request(
      `https://local.test/api/credit-cards?month=2026-10&cardId=${cardId}`,
    ),
  );
  assert.equal(viewB.status, 200);
  assert.deepEqual((await viewB.json()).cards, []);
  const purchaseByB = await cardsRoute.POST(
    jsonRequest('/api/credit-cards', 'POST', {
      action: 'create_purchase',
      cardId,
      description: 'Tentativa B',
      totalAmountCents: 1,
      purchaseDate: '2026-09-28',
      installmentCount: 1,
    }),
  );
  assert.equal(purchaseByB.status, 404);
  const invoiceUpdateByB = await cardsRoute.PATCH(
    jsonRequest('/api/credit-cards', 'PATCH', {
      invoiceId: firstInvoiceId,
      status: 'paid',
    }),
  );
  assert.equal(invoiceUpdateByB.status, 404);
  const purchaseDeleteByB = await cardsRoute.DELETE(
    jsonRequest('/api/credit-cards', 'DELETE', {
      purchaseGroupId,
    }),
  );
  assert.equal(purchaseDeleteByB.status, 404);
  const ownCardB = await cardsRoute.POST(
    jsonRequest('/api/credit-cards', 'POST', {
      action: 'create_card',
      name: 'Cartão A',
      brand: 'Visa',
      lastFour: '5678',
      creditLimitCents: 30_000,
      closingDay: 15,
      dueDay: 25,
    }),
  );
  assert.equal(ownCardB.status, 201);
  const ownCardIdB = (await ownCardB.json()).id;
  const requestedForeignCard = await cardsRoute.GET(
    new Request(
      `https://local.test/api/credit-cards?month=2026-10&cardId=${cardId}`,
    ),
  );
  assert.equal((await requestedForeignCard.json()).selectedCard.id, ownCardIdB);

  currentOwner = 'test-owner-a';
  const afterAttack = await cardsRoute.GET(
    new Request(
      `https://local.test/api/credit-cards?month=2026-10&cardId=${cardId}`,
    ),
  );
  const stillA = await afterAttack.json();
  assert.equal(stillA.invoice.status, 'open');
  assert.equal(stillA.transactions.length, 1);
  assert.equal(stillA.summary.availableCents, 9_999);
  const paid = await cardsRoute.PATCH(
    jsonRequest('/api/credit-cards', 'PATCH', {
      invoiceId: firstInvoiceId,
      status: 'paid',
    }),
  );
  assert.equal(paid.status, 200);
  const afterPayment = await cardsRoute.GET(
    new Request(
      `https://local.test/api/credit-cards?month=2026-10&cardId=${cardId}`,
    ),
  );
  assert.equal((await afterPayment.json()).summary.availableCents, 13_333);
});

test('investment assets, recurring rules and simulations are owner-scoped', async () => {
  const categories = await categoryIds();
  currentOwner = 'test-owner-a';
  const investment = {
    name: 'Ativo A',
    assetClass: 'Ações',
    investedCents: 10_001,
    currentValueCents: 10_050,
    ticker: 'PETR4',
    quantity: 1,
    acquisitionDate: '2026-09-01',
  };
  const createdAsset = await investmentsRoute.POST(
    jsonRequest('/api/investments', 'POST', investment),
  );
  assert.equal(createdAsset.status, 201);
  const assetId = (await createdAsset.json()).id;
  const createdRule = await recurringRoute.POST(
    jsonRequest('/api/recurring', 'POST', {
      description: 'Assinatura A',
      type: 'expense',
      amountCents: 1_001,
      categoryId: categories['Lazer'],
      startsOn: '2026-09-29',
      endsOn: null,
    }),
  );
  assert.equal(createdRule.status, 201);
  const ruleId = (await createdRule.json()).id;
  const createdSimulation = await simulationsRoute.POST(
    jsonRequest('/api/simulations', 'POST', {
      name: 'Plano privado A',
      simulationType: 'investment',
      input: {
        initialValueCents: 10_000,
        monthlyContributionCents: 1_000,
        monthlyRatePercent: 1,
        futureExpenseCents: 15_000,
        durationValue: 12,
        durationUnit: 'months',
        goalName: 'Meta A',
      },
    }),
  );
  assert.equal(createdSimulation.status, 201);

  currentOwner = 'test-owner-b';
  const assetsB = await investmentsRoute.GET();
  assert.deepEqual((await assetsB.json()).investments, []);
  const editForeignAsset = await investmentsRoute.PATCH(
    jsonRequest('/api/investments', 'PATCH', {
      ...investment,
      id: assetId,
      name: 'Alterado por B',
    }),
  );
  assert.equal(editForeignAsset.status, 404);
  const deleteForeignAsset = await investmentsRoute.DELETE(
    jsonRequest('/api/investments', 'DELETE', { id: assetId }),
  );
  assert.equal(deleteForeignAsset.status, 404);

  const rulesB = await recurringRoute.GET(
    new Request('https://local.test/api/recurring?month=2026-09'),
  );
  assert.deepEqual((await rulesB.json()).rules, []);
  const editForeignRule = await recurringRoute.PATCH(
    jsonRequest('/api/recurring', 'PATCH', { id: ruleId, active: false }),
  );
  assert.equal(editForeignRule.status, 404);
  const deleteForeignRule = await recurringRoute.DELETE(
    jsonRequest('/api/recurring', 'DELETE', { id: ruleId }),
  );
  assert.equal(deleteForeignRule.status, 404);
  const confirmForeignRule = await recurringConfirmRoute.POST(
    jsonRequest('/api/recurring/confirm', 'POST', {
      ruleId,
      date: '2026-09-29',
    }),
  );
  assert.equal(confirmForeignRule.status, 400);

  const simulationsB = await simulationsRoute.GET();
  assert.deepEqual((await simulationsB.json()).simulations, []);
  const sameNameB = await simulationsRoute.POST(
    jsonRequest('/api/simulations', 'POST', {
      name: 'Plano privado A',
      simulationType: 'debt',
      input: {
        principalCents: 5_000,
        monthlyRatePercent: 2,
        months: 2,
      },
    }),
  );
  assert.equal(sameNameB.status, 201);

  currentOwner = 'test-owner-a';
  const assetsA = await investmentsRoute.GET();
  assert.equal((await assetsA.json()).investments[0].name, 'Ativo A');
  const rulesA = await recurringRoute.GET(
    new Request('https://local.test/api/recurring?month=2026-09'),
  );
  assert.equal((await rulesA.json()).rules[0].active, true);
  const simulationsA = await simulationsRoute.GET();
  const onlyA = (await simulationsA.json()).simulations;
  assert.equal(onlyA.length, 1);
  assert.equal(onlyA[0].simulationType, 'investment');
});

test('investment transfer does not become an expense or leak to another user', async () => {
  await createIncomeForA();
  currentOwner = 'test-owner-a';
  const contribution = await walletRoute.POST(
    jsonRequest('/api/investment-wallet', 'POST', {
      amountCents: 100_001,
      contributionDate: '2026-09-29',
      description: 'Aporte A',
    }),
  );
  assert.equal(contribution.status, 201);
  assert.equal((await contribution.json()).mainBalanceCents, 400_000);
  const summary = await transactionsRoute.GET(
    new Request('https://local.test/api/transactions?month=2026-09'),
  );
  const totals = (await summary.json()).summary;
  assert.deepEqual(totals, {
    incomeCents: 500_001,
    expenseCents: 0,
    transferCents: 100_001,
    balanceCents: 400_000,
  });

  currentOwner = 'test-owner-b';
  const otherWallet = await walletRoute.GET();
  assert.equal(otherWallet.status, 200);
  const otherData = await otherWallet.json();
  assert.equal(otherData.mainBalanceCents, 0);
  assert.equal(otherData.wallet.balanceCents, 0);
  assert.deepEqual(otherData.contributions, []);
  const attemptedContribution = await walletRoute.POST(
    jsonRequest('/api/investment-wallet', 'POST', {
      amountCents: 1,
      contributionDate: '2026-09-29',
      description: 'Tentativa B',
    }),
  );
  assert.equal(attemptedContribution.status, 400);

  currentOwner = 'test-owner-a';
  const ownWallet = await walletRoute.GET();
  assert.equal((await ownWallet.json()).wallet.balanceCents, 100_001);
});

test('CSV and JSON backups contain only the signed-in owner’s financial records', async () => {
  const { categories } = await createIncomeForA();
  const expense = await transactionsRoute.POST(
    jsonRequest('/api/transactions', 'POST', {
      description: 'Despesa privada A',
      type: 'expense',
      amountCents: 101,
      transactionDate: '2026-09-03',
      categoryId: categories['Lazer'],
    }),
  );
  assert.equal(expense.status, 201);
  const card = await cardsRoute.POST(
    jsonRequest('/api/credit-cards', 'POST', {
      action: 'create_card',
      name: 'Cartão A',
      brand: 'Visa',
      lastFour: '1234',
      creditLimitCents: 20_000,
      closingDay: 15,
      dueDay: 25,
    }),
  );
  assert.equal(card.status, 201);
  currentOwner = 'test-owner-b';
  const csvB = await exportRoute.GET(
    new Request('https://local.test/api/data-export?format=csv'),
  );
  assert.equal(csvB.status, 200);
  assert.equal(csvB.headers.get('cache-control'), 'private, no-store');
  assert.equal((await csvB.text()).includes('Salário privado A'), false);
  const backupB = await exportRoute.GET(
    new Request('https://local.test/api/data-export?format=backup'),
  );
  assert.equal(backupB.status, 200);
  const b = await backupB.json();
  assert.equal(b.ownerId, 'test-owner-b');
  assert.deepEqual(b.data.transactions, []);
  assert.deepEqual(b.data.credit_cards, []);

  currentOwner = 'test-owner-a';
  const backupA = await exportRoute.GET(
    new Request('https://local.test/api/data-export?format=backup'),
  );
  assert.equal(backupA.status, 200);
  const a = await backupA.json();
  assert.equal(a.ownerId, 'test-owner-a');
  assert.equal(a.data.transactions.length, 2);
  assert.equal(a.data.credit_cards.length, 1);

  currentOwner = 'test-owner-b';
  for (const mode of ['preview', 'restore']) {
    const attemptedRestore = await restoreRoute.POST(
      jsonRequest(`/api/data-restore?mode=${mode}`, 'POST', a),
    );
    assert.equal(attemptedRestore.status, 400);
  }
  const untouchedB = await transactionsRoute.GET(
    new Request('https://local.test/api/transactions?month=2026-09'),
  );
  assert.deepEqual((await untouchedB.json()).transactions, []);
});

test('assistant sends only the authenticated user’s context to the AI provider', async () => {
  await createIncomeForA();
  const previousFetch = globalThis.fetch;
  const previousAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const previousToken = process.env.CLOUDFLARE_WORKERS_AI_TOKEN;
  let requestBody;
  process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
  process.env.CLOUDFLARE_WORKERS_AI_TOKEN = 'test-token';
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return Response.json({
      success: true,
      result: { response: 'Resposta de teste' },
    });
  };
  try {
    currentOwner = 'test-owner-b';
    const response = await assistantRoute.POST(
      jsonRequest('/api/assistant', 'POST', {
        message: 'Qual é meu saldo?',
      }),
    );
    assert.equal(response.status, 200);
    const systemMessage = requestBody.messages[0].content;
    const contextStart = systemMessage.lastIndexOf('<contexto_financeiro>');
    const contextEnd = systemMessage.indexOf(
      '</contexto_financeiro>',
      contextStart,
    );
    assert.ok(contextStart >= 0 && contextEnd > contextStart);
    const context = JSON.parse(
      systemMessage.slice(
        contextStart + '<contexto_financeiro>'.length,
        contextEnd,
      ),
    );
    assert.equal(context.mainAccountBalanceCents, 0);
    assert.deepEqual(context.recentTransactions, []);
    assert.equal(systemMessage.includes('Salário privado A'), false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = previousAccount;
    if (previousToken === undefined)
      delete process.env.CLOUDFLARE_WORKERS_AI_TOKEN;
    else process.env.CLOUDFLARE_WORKERS_AI_TOKEN = previousToken;
  }
});
