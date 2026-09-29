export type RecurringRule = {
  id: number;
  description: string;
  type: 'income' | 'expense';
  amountCents: number;
  categoryId: number;
  categoryName: string;
  startsOn: string;
  endsOn: string | null;
  active: boolean;
};

export function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

export function addMonths(month: string, count: number) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + count, 1));
  return date.toISOString().slice(0, 7);
}

export function occurrenceForMonth(
  rule: Pick<RecurringRule, 'startsOn' | 'endsOn'>,
  month: string,
) {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!Number.isInteger(year) || monthNumber < 1 || monthNumber > 12)
    return null;
  const day = Number(rule.startsOn.slice(8, 10));
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const date = `${month}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  return date >= rule.startsOn && (!rule.endsOn || date <= rule.endsOn)
    ? date
    : null;
}

export function cashChangeCents(
  type: 'income' | 'expense',
  amountCents: number,
) {
  return type === 'income' ? amountCents : -amountCents;
}

export function sumForecastCents(
  startingBalanceCents: number,
  changes: { type: 'income' | 'expense'; amountCents: number }[],
) {
  return changes.reduce(
    (balance, change) =>
      balance + cashChangeCents(change.type, change.amountCents),
    startingBalanceCents,
  );
}
