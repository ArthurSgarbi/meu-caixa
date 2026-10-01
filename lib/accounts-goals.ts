import { isValidDate } from './recurring.ts';

export const maxCents = 2_147_483_647;
export class FinanceInputError extends Error {}
export type FinancialAccount = {
  id: number | null;
  name: string;
  institution: string;
  openedOn: string;
  balanceCents: number;
  reservedCents: number;
  availableCents: number;
};
export type FinancialGoal = {
  id: number;
  name: string;
  targetCents: number;
  targetDate: string;
  savedCents: number;
  remainingCents: number;
  percentage: number;
  monthsRemaining: number;
  monthlyRequiredCents: number;
  overdue: boolean;
  allocations: {
    accountId: number | null;
    accountName: string;
    amountCents: number;
  }[];
};
export type AccountsGoalsData = {
  today: string;
  accounts: FinancialAccount[];
  goals: FinancialGoal[];
  totals: {
    balanceCents: number;
    reservedCents: number;
    availableCents: number;
  };
  transfers: {
    id: number;
    fromName: string;
    toName: string;
    description: string;
    amountCents: number;
    transferDate: string;
  }[];
};

/** null é a conta principal dos registros anteriores, sem reescrever seu histórico. */
export function parseAccountId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    throw new FinanceInputError('Conta inválida.');
  return value;
}
export function positiveCents(value: unknown) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > maxCents
  )
    throw new FinanceInputError(
      'Informe um valor válido, em centavos, maior que zero.',
    );
  return value;
}
export function requestKey(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new FinanceInputError(
      'Identificador da operação inválido. Reabra o formulário.',
    );
  return value;
}
export function shortName(value: unknown, label = 'nome') {
  if (
    typeof value !== 'string' ||
    value.trim().length < 2 ||
    value.trim().length > 80
  )
    throw new FinanceInputError(`Informe ${label} entre 2 e 80 caracteres.`);
  return value.trim();
}
export function validDate(value: unknown) {
  if (typeof value !== 'string' || !isValidDate(value))
    throw new FinanceInputError('Informe uma data válida.');
  return value;
}
export function goalProgress(
  targetCents: number,
  savedCents: number,
  targetDate: string,
  today: string,
) {
  const remainingCents = Math.max(0, targetCents - savedCents);
  const months =
    (Number(targetDate.slice(0, 4)) - Number(today.slice(0, 4))) * 12 +
    Number(targetDate.slice(5, 7)) -
    Number(today.slice(5, 7)) +
    1;
  const overdue = targetDate < today && remainingCents > 0;
  const monthsRemaining = overdue ? 0 : Math.max(1, months);
  return {
    remainingCents,
    percentage: Math.min(100, Math.floor((savedCents * 100) / targetCents)),
    monthsRemaining,
    monthlyRequiredCents: Math.ceil(
      remainingCents / Math.max(1, monthsRemaining),
    ),
    overdue,
  };
}
