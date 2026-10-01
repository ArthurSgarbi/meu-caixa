import type {
  BankAccount,
  BankMovement,
  BankPosition,
  BankSnapshot,
} from './bank-connections.ts';

export function authorizedConnections(
  snapshot: BankSnapshot,
  now = Date.now(),
) {
  return snapshot.connections.filter(
    (c) =>
      c.status === 'UPDATED' &&
      (!c.consentExpiresAt || Date.parse(c.consentExpiresAt) > now),
  );
}

export function bankHasUnavailableData(
  snapshot: BankSnapshot,
  now = Date.now(),
) {
  return (
    authorizedConnections(snapshot, now).length !==
      snapshot.connections.length ||
    snapshot.connections.some((connection) => connection.partial)
  );
}

/** Null não é zero. Duplicatas divergentes bloqueiam totais, sem arredondamento binário. */
export function bankTotal(
  rows: { id: string; currency: string; cents: number | null }[],
): number | null {
  if (!rows.length) return null;
  const seen = new Map<string, number>();
  let total = BigInt(0);
  for (const row of rows) {
    if (
      row.currency !== 'BRL' ||
      row.cents === null ||
      !Number.isSafeInteger(row.cents)
    )
      return null;
    if (seen.has(row.id)) {
      if (seen.get(row.id) !== row.cents) return null;
      continue;
    }
    seen.set(row.id, row.cents);
    total += BigInt(row.cents);
  }
  const result = Number(total);
  return Number.isSafeInteger(result) ? result : null;
}

export type LinkedAccount = BankAccount & { bank: string };
export type LinkedPosition = BankPosition & { bank: string };
export type LinkedMovement = BankMovement & {
  bank: string;
  accountName: string;
  accountId: string;
  accountType: string;
  key: string;
};

export function bankAccounts(snapshot: BankSnapshot): LinkedAccount[] {
  const seen = new Set<string>();
  return authorizedConnections(snapshot).flatMap((c) =>
    c.accounts.flatMap((a) => {
      if (seen.has(a.id)) return [];
      seen.add(a.id);
      return [{ ...a, bank: c.name }];
    }),
  );
}

export function bankPositions(snapshot: BankSnapshot): LinkedPosition[] {
  const seen = new Set<string>();
  return authorizedConnections(snapshot).flatMap((c) =>
    c.investments.flatMap((p) => {
      if (seen.has(p.id)) return [];
      seen.add(p.id);
      return [{ ...p, bank: c.name }];
    }),
  );
}

export function bankOverviewTotals(snapshot: BankSnapshot) {
  const connections = authorizedConnections(snapshot);
  const complete =
    connections.length === snapshot.connections.length &&
    connections.length > 0 &&
    !connections.some((c) => c.partial);
  const cards = connections.flatMap((c) =>
    c.accounts.filter((a) => a.type === 'CREDIT'),
  );
  const positions = connections.flatMap((c) =>
    c.investments.filter((p) => p.status === 'ACTIVE'),
  );
  return {
    cardBalanceCents: complete
      ? bankTotal(
          cards.map((c) => ({
            id: c.id,
            currency: c.currency,
            cents: c.balanceCents,
          })),
        )
      : null,
    investmentsCents: complete
      ? bankTotal(
          positions.map((p) => ({
            id: p.id,
            currency: p.currency,
            cents: p.balanceCents,
          })),
        )
      : null,
  };
}

/** Datas civis do provedor; mês selecionado não altera saldos atuais de contas. */
export function bankMovements(
  snapshot: BankSnapshot,
  month: string,
  accountId = 'bank',
): LinkedMovement[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const seen = new Set<string>();
  return bankAccounts(snapshot)
    .flatMap((account) => {
      if (
        accountId === 'bank'
          ? account.type !== 'BANK'
          : account.id !== accountId
      )
        return [];
      return account.movements.flatMap((m) => {
        const key = `${account.id}:${m.id}`;
        if (seen.has(key) || !m.date || m.date.slice(0, 7) !== month) return [];
        seen.add(key);
        return [
          {
            ...m,
            bank: account.bank,
            accountName: account.name,
            accountType: account.type,
            accountId: account.id,
            key,
          },
        ];
      });
    })
    .sort(
      (a, b) =>
        (b.date ?? '').localeCompare(a.date ?? '') ||
        a.key.localeCompare(b.key),
    );
}

export function movementSampleTotals(movements: LinkedMovement[]) {
  const posted = movements.filter((m) => m.status === 'POSTED');
  const sum = (type: string) => {
    const matching = posted.filter((m) => m.type === type);
    return matching.length
      ? bankTotal(
          matching.map((m) => ({
            id: m.key,
            currency: m.currency,
            cents: m.amountCents === null ? null : Math.abs(m.amountCents),
          })),
        )
      : 0;
  };
  return {
    entriesCents: sum('CREDIT'),
    exitsCents: sum('DEBIT'),
    pendingCount: movements.length - posted.length,
    unknownCount: posted.filter(
      (m) => m.type !== 'CREDIT' && m.type !== 'DEBIT',
    ).length,
  };
}
