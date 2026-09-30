import { isValidDate } from './recurring.ts';

export const searchPageSize = 50;
export const searchSorts = [
  'date-desc',
  'date-asc',
  'amount-desc',
  'amount-asc',
] as const;
export type TransactionSearch = {
  query: string;
  from: string;
  to: string;
  type: '' | 'income' | 'expense' | 'transfer';
  categoryId: number | null;
  minCents: number | null;
  maxCents: number | null;
  sort: (typeof searchSorts)[number];
  page: number;
};

/** Valores vazios significam sem filtro; valores inválidos nunca viram zero. */
export function parseTransactionSearch(
  params: URLSearchParams,
): TransactionSearch | null {
  const query = (params.get('q') ?? '').trim();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const type = params.get('type') ?? '';
  const sort = params.get('sort') ?? 'date-desc';
  if (
    query.length > 120 ||
    (from && !isValidDate(from)) ||
    (to && !isValidDate(to)) ||
    (from && to && from > to)
  )
    return null;
  if (
    !['', 'income', 'expense', 'transfer'].includes(type) ||
    !searchSorts.includes(sort as TransactionSearch['sort'])
  )
    return null;
  function integer(key: string, min: number): number | null | undefined {
    const value = params.get(key);
    if (value === null || value === '') return null;
    if (!/^\d+$/.test(value)) return undefined;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) &&
      parsed >= min &&
      parsed <= 2_147_483_647
      ? parsed
      : undefined;
  }
  const categoryId = integer('categoryId', 1);
  const minCents = integer('minCents', 0);
  const maxCents = integer('maxCents', 0);
  const page = integer('page', 1) ?? (params.get('page') ? undefined : 1);
  if (
    categoryId === undefined ||
    minCents === undefined ||
    maxCents === undefined ||
    page === undefined ||
    page > 100_000 ||
    (minCents !== null && maxCents !== null && minCents > maxCents)
  )
    return null;
  return {
    query,
    from,
    to,
    type: type as TransactionSearch['type'],
    sort: sort as TransactionSearch['sort'],
    categoryId,
    minCents,
    maxCents,
    page,
  };
}

export function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Escapa LIKE para que %, _ e barra invertida sejam texto, não curingas. */
export function literalSearchPattern(value: string) {
  return `%${normalizeSearchText(value).replace(/[\\%_]/g, '\\$&')}%`;
}
