/** DTOs: somente dados de consulta. Nunca são lançamentos do livro-caixa. */
export type BankMovement = {
  id: string;
  description: string;
  date: string | null;
  amountCents: number | null;
  currency: string;
  type: string;
  status: string;
};
export type BankAccount = {
  id: string;
  name: string;
  type: string;
  currency: string;
  balanceCents: number | null;
  limitCents: number | null;
  availableLimitCents: number | null;
  dueDate: string | null;
  movements: BankMovement[];
  partialMovements: boolean;
};
export type BankPosition = {
  id: string;
  name: string;
  currency: string;
  balanceCents: number | null;
  status: string;
};
export type BankConnection = {
  id: string;
  name: string;
  status: string;
  lastUpdatedAt: string | null;
  consentExpiresAt: string | null;
  accounts: BankAccount[];
  investments: BankPosition[];
  partial: boolean;
};
export type BankSnapshot = {
  version: 1;
  checkedAt: string;
  connections: BankConnection[];
};
export type BankResponse =
  | { enabled: false }
  | { enabled: true; snapshot: BankSnapshot };

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Resposta bancária inválida.');
  return value as Record<string, unknown>;
}
export function bankText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.slice(0, 240) : fallback;
}
export function bankDate(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}(T|$)/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    return null;
  return new Date(value).toISOString();
}
export function bankCurrency(value: unknown): string {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : 'N/D';
}
/** Converte unidades monetárias para centavos sem multiplicação binária de ponto flutuante. */
export function bankCents(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const match = /^(-?)(\d{1,13})(?:\.(\d{1,8}))?$/.exec(String(value));
  if (!match) return null;
  const fraction = (match[3] ?? '').padEnd(3, '0');
  const cents =
    BigInt(match[2]) * BigInt(100) +
    BigInt(fraction.slice(0, 2)) +
    BigInt(Number(fraction[2]) >= 5 ? 1 : 0);
  const signed = Number(match[1] ? -cents : cents);
  return Number.isSafeInteger(signed) ? signed : null;
}
export function normalizeMovement(
  value: unknown,
  accountId: string,
): BankMovement {
  const row = record(value);
  if (row.accountId !== accountId || typeof row.id !== 'string')
    throw new Error('Movimentação fora da conexão autorizada.');
  return {
    id: row.id,
    description: bankText(row.description, 'Movimentação'),
    date: bankDate(row.date),
    amountCents: bankCents(row.amount),
    currency: bankCurrency(row.currencyCode),
    type: bankText(row.type, 'UNKNOWN'),
    status: bankText(row.status, 'UNKNOWN'),
  };
}
