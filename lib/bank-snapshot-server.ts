import type { Database } from '../db/index.ts';
import type { BankSnapshot } from './bank-connections.ts';
import { createPluggyClient, type PluggyConfig } from './pluggy-client.ts';
import { BANK_REFRESH_MS } from './bank-summary.ts';

const ttl = BANK_REFRESH_MS;
const client = createPluggyClient();
const pending = new Map<string, Promise<BankSnapshot>>();

/** Cache privado, separado do livro-caixa: transações nunca viram receitas/despesas automaticamente. */
export async function loadBankSnapshot(
  db: Database,
  config: PluggyConfig,
): Promise<BankSnapshot> {
  const existing = pending.get(config.scope);
  if (existing) return existing;
  const promise = refresh();
  pending.set(config.scope, promise);
  try {
    return await promise;
  } finally {
    pending.delete(config.scope);
  }

  async function refresh() {
    const row = await db
      .prepare(
        'SELECT payload FROM bank_connection_snapshots WHERE owner_id = ? AND scope_hash = ?',
      )
      .bind(config.ownerId, config.scope)
      .first<{ payload: string }>();
    let previous: BankSnapshot | undefined;
    if (row) {
      try {
        const candidate = JSON.parse(row.payload) as BankSnapshot;
        if (
          candidate.version === 1 &&
          Array.isArray(candidate.connections) &&
          Number.isFinite(Date.parse(candidate.checkedAt))
        )
          previous = candidate;
      } catch {
        /* Um cache inválido é descartado, nunca exibido como saldo zero. */
      }
    }
    const now = Date.now();
    const expiredConsent = previous?.connections.some(
      (c) => c.consentExpiresAt && Date.parse(c.consentExpiresAt) <= now,
    );
    if (
      previous &&
      !expiredConsent &&
      Date.parse(previous.checkedAt) <= now &&
      now - Date.parse(previous.checkedAt) < ttl
    )
      return previous;
    const snapshot = await client.snapshot(config, previous);
    await db
      .prepare(`INSERT INTO bank_connection_snapshots (owner_id, scope_hash, payload, fetched_at)
      VALUES (?, ?, ?, ?) ON CONFLICT (owner_id) DO UPDATE
      SET scope_hash = EXCLUDED.scope_hash, payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at
      WHERE bank_connection_snapshots.fetched_at <= EXCLUDED.fetched_at`)
      .bind(
        config.ownerId,
        config.scope,
        JSON.stringify(snapshot),
        snapshot.checkedAt,
      )
      .run();
    return snapshot;
  }
}
