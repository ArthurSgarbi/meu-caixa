import type { BankAccount, BankSnapshot } from './bank-connections.ts';

export const BANK_REFRESH_MS = 15 * 60_000;

/** O saldo vem do banco, nunca da soma de extratos parciais ou de limites de crédito. */
export function summarizeBanks(snapshot: BankSnapshot, now = Date.now()) {
  const accounts = new Map<string, BankAccount>();
  const rows: {
    id: string;
    bank: string;
    name: string;
    cents: number | null;
  }[] = [];
  let incomplete = snapshot.connections.length === 0;
  let balance = BigInt(0);
  for (const connection of snapshot.connections) {
    const authorized =
      connection.status === 'UPDATED' &&
      (!connection.consentExpiresAt ||
        Date.parse(connection.consentExpiresAt) > now);
    if (!authorized || connection.partial) incomplete = true;
    if (!authorized) continue;
    let bankAccounts = 0;
    for (const account of connection.accounts) {
      if (account.type !== 'BANK') continue;
      bankAccounts++;
      const previous = accounts.get(account.id);
      if (previous) {
        // Repetições idênticas não contam duas vezes; divergências impedem um total confiável.
        if (
          previous.balanceCents !== account.balanceCents ||
          previous.currency !== account.currency
        )
          incomplete = true;
        continue;
      }
      accounts.set(account.id, account);
      const cents =
        account.currency === 'BRL' && Number.isSafeInteger(account.balanceCents)
          ? account.balanceCents
          : null;
      rows.push({
        id: account.id,
        bank: connection.name,
        name: account.name,
        cents,
      });
      if (cents === null) incomplete = true;
      else balance += BigInt(cents);
    }
    if (!bankAccounts) incomplete = true;
  }
  const validCount = rows.filter((row) => row.cents !== null).length;
  // Nunca divulgar um subtotal como saldo total quando falta banco, moeda ou valor.
  const balanceCents =
    !incomplete && validCount > 0 && Number.isSafeInteger(Number(balance))
      ? Number(balance)
      : null;
  return {
    balanceCents,
    rows,
    incomplete: incomplete || balanceCents === null,
    stale: snapshot.connections.some(
      (connection) =>
        !connection.lastUpdatedAt ||
        !Number.isFinite(Date.parse(connection.lastUpdatedAt)) ||
        now - Date.parse(connection.lastUpdatedAt) > 48 * 60 * 60_000,
    ),
    checkedAt: snapshot.checkedAt,
  };
}
