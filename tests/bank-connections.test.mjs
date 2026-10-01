import assert from 'node:assert/strict';
import test from 'node:test';
import { bankCents, normalizeMovement } from '../lib/bank-connections.ts';
import {
  personalPluggyConfig,
  createPluggyClient,
} from '../lib/pluggy-client.ts';
import { backupTables } from '../lib/user-backup.ts';

const itemId = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';
const env = {
  PLUGGY_CLIENT_ID: '33333333-3333-4333-8333-333333333333',
  PLUGGY_CLIENT_SECRET: 'fixture-secret',
  PLUGGY_OWNER_ID: 'user_fixture',
  PLUGGY_ITEM_IDS: itemId,
};
const config = personalPluggyConfig('user_fixture', env);
const clock = () => Date.parse('2026-10-01T15:00:00Z');
function provider(overrides = {}) {
  const paths = [];
  const fetch = async (url, options) => {
    paths.push(new URL(url).pathname);
    assert.equal(new URL(url).origin, 'https://api.pluggy.ai');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    const path = new URL(url).pathname;
    if (path !== '/auth') {
      assert.equal(options.method, 'GET');
      assert.equal(options.headers['X-API-KEY'], 'fixture-token');
    }
    const defaults = {
      '/auth': { apiKey: 'fixture-token' },
      [`/items/${itemId}`]: {
        id: itemId,
        connector: { id: 200 },
        status: 'UPDATED',
        lastUpdatedAt: '2026-10-01T14:00:00Z',
        consentExpiresAt: '2027-01-01',
        products: ['ACCOUNTS', 'TRANSACTIONS', 'INVESTMENTS'],
        credentials: { password: 'never-copy' },
      },
      '/accounts': {
        totalPages: 1,
        results: [
          {
            id: accountId,
            itemId,
            name: 'Banco de teste',
            type: 'BANK',
            balance: 123.45,
            currencyCode: 'BRL',
            number: 'do-not-copy-account-number',
            taxNumber: 'do-not-copy-cpf',
          },
        ],
      },
      '/v2/transactions': {
        next: '?after=opaque',
        results: [
          {
            id: 'movement',
            accountId,
            amount: -10.55,
            currencyCode: 'BRL',
            type: 'DEBIT',
            status: 'POSTED',
            date: '2026-09-30',
            description: 'Compra de teste',
            paymentData: { receiver: 'private' },
          },
        ],
      },
      '/investments': {
        totalPages: 1,
        results: [
          {
            id: 'investment',
            itemId,
            name: 'Posição teste',
            balance: 200.03,
            currencyCode: 'BRL',
            status: 'ACTIVE',
            amount: 9999,
            owner: { cpf: 'do-not-copy' },
          },
        ],
      },
    };
    assert.ok(path in defaults, `unexpected endpoint ${path}`);
    return Response.json(overrides[path] ?? defaults[path]);
  };
  return { paths, client: createPluggyClient(fetch, clock) };
}

test('bank monetary normalization preserves cents, signs and unavailable values', () => {
  assert.equal(bankCents(123.45), 12345);
  assert.equal(bankCents('1.005'), 101);
  assert.equal(bankCents('-1.005'), -101);
  assert.equal(bankCents(0), 0);
  for (const input of [
    null,
    undefined,
    NaN,
    Infinity,
    '',
    '1,23',
    {},
    '10000000000000000',
  ])
    assert.equal(bankCents(input), null);
});
test('personal access is disabled for other tenants and incomplete configuration', () => {
  assert.equal(personalPluggyConfig('user_attacker', env), null);
  assert.equal(
    personalPluggyConfig('user_fixture', { ...env, PLUGGY_CLIENT_SECRET: '' }),
    null,
  );
  assert.equal(
    personalPluggyConfig('user_fixture', {
      ...env,
      PLUGGY_ITEM_IDS: 'https://attacker',
    }),
    null,
  );
  assert.notEqual(
    config.scope,
    personalPluggyConfig('user_fixture', {
      ...env,
      PLUGGY_CLIENT_SECRET: 'rotation',
    }).scope,
  );
  assert.ok(!config.scope.includes(env.PLUGGY_CLIENT_SECRET));
});
test('consultation whitelists fields, converts reais and labels partial recent history', async () => {
  const p = provider();
  const snapshot = await p.client.snapshot(config);
  const c = snapshot.connections[0];
  assert.equal(c.accounts[0].balanceCents, 12345);
  assert.equal(c.accounts[0].movements[0].amountCents, -1055);
  assert.equal(c.accounts[0].partialMovements, true);
  assert.equal(c.investments[0].balanceCents, 20003); // Not the original amount.
  const json = JSON.stringify(snapshot);
  for (const forbidden of [
    'fixture-secret',
    'fixture-token',
    'never-copy',
    'do-not-copy',
    'paymentData',
    'taxNumber',
    'credentials',
  ])
    assert.ok(!json.includes(forbidden));
  assert.ok(!p.paths.includes('/identity'));
});
test('unchanged synchronization reuses transactions instead of fetching on every page reload', async () => {
  const p = provider();
  const first = await p.client.snapshot(config);
  p.paths.length = 0;
  const second = await p.client.snapshot(config, first);
  assert.deepEqual(p.paths, [`/items/${itemId}`]);
  assert.deepEqual(second.connections, first.connections);
});
test('expired or invalid consent removes cached finances from the response', async () => {
  const valid = await provider().client.snapshot(config);
  const p = provider({
    [`/items/${itemId}`]: {
      id: itemId,
      connector: { id: 200 },
      status: 'UPDATED',
      lastUpdatedAt: '2026-10-01T14:00:00Z',
      consentExpiresAt: '2026-09-30',
    },
  });
  const result = await p.client.snapshot(config, valid);
  assert.equal(result.connections[0].status, 'REAUTHORIZATION_REQUIRED');
  assert.deepEqual(result.connections[0].accounts, []);
  assert.deepEqual(result.connections[0].investments, []);
  assert.deepEqual(p.paths, ['/auth', `/items/${itemId}`]);
});
test('rejects non-personal paid connectors and accounts outside the fixed authorized items', async () => {
  await assert.rejects(
    provider({
      [`/items/${itemId}`]: {
        id: itemId,
        connector: { id: 1 },
        status: 'UPDATED',
      },
    }).client.snapshot(config),
  );
  await assert.rejects(
    provider({
      '/accounts': {
        totalPages: 1,
        results: [{ id: accountId, itemId: 'foreign' }],
      },
    }).client.snapshot(config),
  );
  assert.throws(() =>
    normalizeMovement({ id: 'x', accountId: 'foreign', amount: 1 }, accountId),
  );
});
test('errors never expose raw provider responses or credentials', async () => {
  const client = createPluggyClient(
    async () =>
      new Response('secret sensitive finance fixture', { status: 403 }),
    clock,
  );
  await assert.rejects(
    client.snapshot(config),
    (error) =>
      !error.message.includes('sensitive') &&
      !error.message.includes('fixture-secret'),
  );
});
test('bank snapshots are excluded from manual finance backups', () => {
  assert.ok(!backupTables.some((t) => t.name === 'bank_connection_snapshots'));
});
