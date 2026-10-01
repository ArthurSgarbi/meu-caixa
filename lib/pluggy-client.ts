// Módulo exclusivamente de servidor: não importar em componentes React.
import { createHash } from 'node:crypto';
import {
  bankCents,
  bankCurrency,
  bankDate,
  bankText,
  normalizeMovement,
  record,
  type BankSnapshot,
  type BankConnection,
  type BankAccount,
} from './bank-connections.ts';

export type PluggyConfig = {
  clientId: string;
  clientSecret: string;
  ownerId: string;
  itemIds: string[];
  scope: string;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function personalPluggyConfig(
  ownerId: string,
  env: NodeJS.ProcessEnv = process.env,
): PluggyConfig | null {
  // A identidade vem do Clerk, jamais de parâmetros enviados pelo navegador.
  if (!env.PLUGGY_OWNER_ID || ownerId !== env.PLUGGY_OWNER_ID) return null;
  const clientId = env.PLUGGY_CLIENT_ID ?? '',
    clientSecret = env.PLUGGY_CLIENT_SECRET ?? '';
  const itemIds = [
    ...new Set(
      (env.PLUGGY_ITEM_IDS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].sort();
  if (
    !uuid.test(clientId) ||
    !clientSecret ||
    !itemIds.length ||
    itemIds.length > 5 ||
    itemIds.some((id) => !uuid.test(id))
  )
    return null;
  const scope = createHash('sha256')
    .update(JSON.stringify([ownerId, clientId, clientSecret, itemIds]))
    .digest('hex');
  return { ownerId, clientId, clientSecret, itemIds, scope };
}

export class PluggyUnavailable extends Error {
  constructor() {
    super(
      'Não foi possível consultar os bancos. Confira a autorização no MeuPluggy e tente novamente mais tarde.',
    );
  }
}
type Transport = typeof fetch;
// Uma API key curta permanece só na memória do servidor; nunca é persistida no banco.
export function createPluggyClient(
  transport: Transport = (input, init) => fetch(input, init),
  clock: () => number = Date.now,
) {
  let token: { scope: string; key: string; until: number } | null = null;
  let authPending: { scope: string; promise: Promise<string> } | null = null;
  async function json(path: string, init: RequestInit) {
    try {
      const response = await transport(`https://api.pluggy.ai${path}`, {
        ...init,
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new PluggyUnavailable();
      // Não devolver textos de erro ou objetos brutos do provedor à interface.
      const content = await response.text();
      if (content.length > 3_000_000) throw new PluggyUnavailable();
      return record(JSON.parse(content));
    } catch {
      throw new PluggyUnavailable();
    }
  }
  async function apiKey(config: PluggyConfig): Promise<string> {
    if (token?.scope === config.scope && token.until > clock())
      return token.key;
    if (authPending?.scope === config.scope) return authPending.promise;
    const promise = (async () => {
      const result = await json('/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: config.clientId,
          clientSecret: config.clientSecret,
        }),
      });
      if (typeof result.apiKey !== 'string' || !result.apiKey)
        throw new PluggyUnavailable();
      token = {
        scope: config.scope,
        key: result.apiKey,
        until: clock() + 110 * 60_000,
      };
      return result.apiKey;
    })();
    authPending = { scope: config.scope, promise };
    try {
      return await promise;
    } finally {
      if (authPending?.promise === promise) authPending = null;
    }
  }
  async function snapshot(
    config: PluggyConfig,
    previous?: BankSnapshot,
  ): Promise<BankSnapshot> {
    const key = await apiKey(config);
    const get = (path: string) =>
      json(path, { method: 'GET', headers: { 'X-API-KEY': key } });
    async function list(path: string, itemId: string) {
      const rows: unknown[] = [];
      let partial = false;
      for (let page = 1; page <= 5; page++) {
        const result = await get(
          `${path}?${new URLSearchParams({ itemId, page: String(page), pageSize: '100' })}`,
        );
        if (
          !Array.isArray(result.results) ||
          typeof result.totalPages !== 'number' ||
          !Number.isInteger(result.totalPages) ||
          result.totalPages < 0
        )
          throw new PluggyUnavailable();
        rows.push(...result.results);
        partial = result.totalPages > page;
        if (!partial) break;
      }
      return { rows, partial };
    }
    async function connection(
      id: string,
      index: number,
    ): Promise<BankConnection> {
      const item = await get(`/items/${id}`);
      // Só o proxy pessoal gratuito é aceito. Não criar conectores pagos nem sincronizações forçadas.
      if (item.id !== id || record(item.connector).id !== 200)
        throw new PluggyUnavailable();
      const lastUpdatedAt = bankDate(item.lastUpdatedAt),
        consentExpiresAt = bankDate(item.consentExpiresAt);
      const ready =
        item.status === 'UPDATED' &&
        (!consentExpiresAt || Date.parse(consentExpiresAt) > clock());
      const old = previous?.connections.find((c) => c.id === id);
      const base = {
        id,
        name: `Conexão ${index + 1}`,
        status: ready ? 'UPDATED' : 'REAUTHORIZATION_REQUIRED',
        lastUpdatedAt,
        consentExpiresAt,
        accounts: [],
        investments: [],
        partial: false,
      } satisfies BankConnection;
      if (!ready) return base; // Um consentimento inválido nunca expõe o snapshot antigo.
      if (
        lastUpdatedAt &&
        old?.lastUpdatedAt === lastUpdatedAt &&
        old.status === 'UPDATED'
      )
        return { ...old, consentExpiresAt };
      const products = Array.isArray(item.products) ? item.products : [];
      const accountList = await list('/accounts', id);
      const accounts = await Promise.all(
        accountList.rows.map(async (value) => {
          const row = record(value);
          if (
            row.itemId !== id ||
            typeof row.id !== 'string' ||
            !uuid.test(row.id)
          )
            throw new PluggyUnavailable();
          const accountId = row.id;
          const credit = row.creditData ? record(row.creditData) : {};
          // Uma consulta por sincronização, janela limitada e explicitamente parcial se houver cursor.
          const dateFrom = new Date(clock() - 90 * 86_400_000)
            .toISOString()
            .slice(0, 10);
          const tx = products.includes('TRANSACTIONS')
            ? await get(
                `/v2/transactions?${new URLSearchParams({ accountId: row.id, dateFrom })}`,
              )
            : { results: [], next: null };
          if (
            !Array.isArray(tx.results) ||
            !(tx.next === null || typeof tx.next === 'string')
          )
            throw new PluggyUnavailable();
          const movements = tx.results
            .map((v) => normalizeMovement(v, accountId))
            .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
          return {
            id: row.id,
            name: bankText(row.name, 'Conta'),
            type: bankText(row.type, 'UNKNOWN'),
            currency: bankCurrency(row.currencyCode),
            balanceCents: bankCents(row.balance),
            limitCents: bankCents(credit.creditLimit),
            availableLimitCents: bankCents(credit.availableCreditLimit),
            dueDate: bankDate(credit.balanceDueDate),
            movements: movements.slice(0, 100),
            partialMovements: tx.next !== null || movements.length > 100,
          } satisfies BankAccount;
        }),
      );
      const positions = products.includes('INVESTMENTS')
        ? await list('/investments', id)
        : { rows: [], partial: false };
      const investments = positions.rows.map((value) => {
        const row = record(value);
        if (row.itemId !== id || typeof row.id !== 'string')
          throw new PluggyUnavailable();
        return {
          id: row.id,
          name: bankText(row.name, 'Investimento'),
          currency: bankCurrency(row.currencyCode),
          balanceCents: bankCents(row.balance),
          status: bankText(row.status, 'UNKNOWN'),
        };
      });
      return {
        ...base,
        name: accounts.find((a) => a.type === 'BANK')?.name ?? base.name,
        accounts,
        investments,
        partial: accountList.partial || positions.partial,
      };
    }
    try {
      return {
        version: 1,
        checkedAt: new Date(clock()).toISOString(),
        connections: await Promise.all(config.itemIds.map(connection)),
      };
    } catch {
      token = null;
      throw new PluggyUnavailable();
    }
  }
  return { snapshot };
}
