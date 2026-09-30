'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Pencil,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiFetch, readApiJson } from '@/lib/client-api';
import { parseCurrencyToCents } from '@/lib/frontend-input';
import { getMonthRange } from '@/lib/finance-month';
import { parseTransactionSearch } from '@/lib/transaction-search';
import { useLatestRequest } from '@/hooks/use-latest-request';
import { useMoneyFormatter } from './preferences-provider';
import { formatDate } from './overview-panel';

type SearchTransaction = {
  id: number;
  description: string;
  type: 'income' | 'expense' | 'transfer';
  amountCents: number;
  transactionDate: string;
  categoryId: number;
  categoryName: string;
};
type SearchResult = {
  transactions: SearchTransaction[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    incomeCents: number;
    expenseCents: number;
    transferCents: number;
    balanceCents: number;
  };
};

export function TransactionSearchPanel({
  month,
  categories,
  active,
  onActiveChange,
  refreshKey,
  onEdit,
}: {
  month: string;
  categories: { id: number; name: string; type: 'income' | 'expense' }[];
  active: boolean;
  onActiveChange: (active: boolean) => void;
  refreshKey: number;
  onEdit: (transaction: SearchTransaction) => void;
}) {
  const money = useMoneyFormatter();
  const begin = useLatestRequest();
  const [query, setQuery] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [retry, setRetry] = useState(0);
  const range = getMonthRange(month)!;
  const lastDay = new Date(`${range.next}T00:00:00Z`);
  lastDay.setUTCDate(lastDay.getUTCDate() - 1);

  useEffect(() => {
    if (!active || query === null) return;
    const request = begin();
    const params = new URLSearchParams(query);
    params.set('page', String(page));
    void (async () => {
      await Promise.resolve();
      if (!request.isCurrent()) return;
      setLoading(true);
      setError('');
      setResult(null);
      try {
        const response = await apiFetch(`/api/transactions/search?${params}`, {
          cache: 'no-store',
          signal: request.signal,
        });
        const data = (await readApiJson(response)) as SearchResult & {
          error?: string;
        };
        if (!request.isCurrent()) return;
        if (!response.ok)
          throw new Error(data.error ?? 'Não foi possível pesquisar.');
        // Uma edição pode remover o último resultado da página atual.
        const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setResult(data);
      } catch (failure) {
        if (request.isCurrent())
          setError(
            failure instanceof Error
              ? failure.message
              : 'Não foi possível pesquisar.',
          );
      } finally {
        if (request.isCurrent()) setLoading(false);
      }
    })();
    return () => {
      begin();
    };
  }, [active, query, page, refreshKey, retry, begin]);

  function search(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const formString = (key: string) => {
      const value = form.get(key);
      return typeof value === 'string' ? value : '';
    };
    setValidationError('');
    for (const key of ['q', 'from', 'to', 'type', 'categoryId', 'sort'])
      params.set(key, formString(key));
    for (const key of ['minCents', 'maxCents']) {
      const input = formString(key).trim();
      if (input) {
        const value = parseCurrencyToCents(input);
        if (!Number.isSafeInteger(value)) {
          setValidationError('Informe valores válidos, como 100,50.');
          return;
        }
        params.set(key, String(value));
      }
    }
    if (!parseTransactionSearch(params)) {
      setValidationError(
        'Confira o período e os limites de valor: o mínimo não pode superar o máximo.',
      );
      return;
    }
    setResult(null);
    setPage(1);
    setQuery(params.toString());
    setRetry((value) => value + 1);
  }

  return (
    <div className="border-b border-border px-5 py-4">
      <Button
        variant="outline"
        type="button"
        aria-expanded={active}
        aria-controls="advanced-transaction-search"
        onClick={() => onActiveChange(!active)}
      >
        <Search aria-hidden="true" />
        {active ? 'Voltar às movimentações do mês' : 'Busca avançada'}
      </Button>
      {active && (
        <div id="advanced-transaction-search" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Pesquise em qualquer período do seu histórico. Apague as datas para
            consultar todos os meses. Os filtros não alteram o resumo mensal.
          </p>
          <form onSubmit={search}>
            <fieldset
              disabled={loading}
              className="grid gap-4 sm:grid-cols-2 disabled:opacity-60"
            >
              <legend className="sr-only">Filtros de movimentações</legend>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="search-description">Descrição</Label>
                <Input
                  id="search-description"
                  name="q"
                  maxLength={120}
                  placeholder="Ex.: mercado, salário, aluguel"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="search-from">De</Label>
                <Input
                  id="search-from"
                  name="from"
                  type="date"
                  defaultValue={range.start}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="search-to">Até</Label>
                <Input
                  id="search-to"
                  name="to"
                  type="date"
                  defaultValue={lastDay.toISOString().slice(0, 10)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="search-type">Tipo</Label>
                <NativeSelect id="search-type" name="type" className="w-full">
                  <NativeSelectOption value="">Todos</NativeSelectOption>
                  <NativeSelectOption value="income">
                    Receitas
                  </NativeSelectOption>
                  <NativeSelectOption value="expense">
                    Despesas
                  </NativeSelectOption>
                  <NativeSelectOption value="transfer">
                    Transferências para investimentos
                  </NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="search-category">Categoria</Label>
                <NativeSelect
                  id="search-category"
                  name="categoryId"
                  className="w-full"
                >
                  <NativeSelectOption value="">Todas</NativeSelectOption>
                  {categories.map((category) => (
                    <NativeSelectOption key={category.id} value={category.id}>
                      {category.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="search-min">Valor mínimo (R$)</Label>
                <Input
                  id="search-min"
                  name="minCents"
                  inputMode="decimal"
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="search-max">Valor máximo (R$)</Label>
                <Input
                  id="search-max"
                  name="maxCents"
                  inputMode="decimal"
                  placeholder="Sem limite"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="search-sort">Ordenação</Label>
                <NativeSelect id="search-sort" name="sort" className="w-full">
                  <NativeSelectOption value="date-desc">
                    Mais recentes
                  </NativeSelectOption>
                  <NativeSelectOption value="date-asc">
                    Mais antigas
                  </NativeSelectOption>
                  <NativeSelectOption value="amount-desc">
                    Maior valor
                  </NativeSelectOption>
                  <NativeSelectOption value="amount-asc">
                    Menor valor
                  </NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Button type="submit">
                  <Search />
                  Pesquisar
                </Button>
                <Button
                  type="reset"
                  variant="outline"
                  onClick={() => {
                    setQuery(null);
                    setResult(null);
                    setError('');
                    setValidationError('');
                    setPage(1);
                  }}
                >
                  Limpar filtros
                </Button>
              </div>
            </fieldset>
          </form>
          {validationError && (
            <p role="alert" className="text-sm text-destructive">
              {validationError}
            </p>
          )}
          {loading ? (
            <output className="flex items-center gap-2 text-sm">
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
              Pesquisando…
            </output>
          ) : error ? (
            <div role="alert" className="space-y-2 text-sm">
              <p>{error}</p>
              <Button
                variant="outline"
                onClick={() => setRetry((value) => value + 1)}
              >
                Tentar novamente
              </Button>
            </div>
          ) : result ? (
            <>
              <div aria-live="polite" className="space-y-2 text-sm">
                <p className="font-semibold">
                  {result.total}{' '}
                  {result.total === 1
                    ? 'movimentação encontrada'
                    : 'movimentações encontradas'}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-muted-foreground">
                  <span>Receitas: {money(result.summary.incomeCents)}</span>
                  <span>Despesas: {money(result.summary.expenseCents)}</span>
                  <span>Aportes: {money(result.summary.transferCents)}</span>
                  <span>
                    Saldo dos resultados: {money(result.summary.balanceCents)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Totais de todos os resultados da última busca, não apenas
                  desta página.
                </p>
              </div>
              {!result.transactions.length ? (
                <p className="py-5 text-sm text-muted-foreground">
                  Nenhuma movimentação corresponde aos filtros.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrição / categoria</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>
                        <span className="sr-only">Ações</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.transactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(transaction.transactionDate)}
                        </TableCell>
                        <TableCell>
                          <p className="max-w-72 break-words whitespace-normal font-medium">
                            {transaction.description}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {transaction.type === 'transfer'
                              ? 'Transferência · Investimentos'
                              : transaction.categoryName}
                          </p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                          {transaction.type === 'income' ? '+ ' : '− '}
                          {money(transaction.amountCents)}
                        </TableCell>
                        <TableCell>
                          {transaction.type !== 'transfer' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Editar ${transaction.description}`}
                              onClick={() => onEdit(transaction)}
                            >
                              <Pencil />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {result.total > result.pageSize && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    <ChevronLeft />
                    Anterior
                  </Button>
                  <p className="text-sm">
                    Página {page} de {Math.ceil(result.total / result.pageSize)}
                  </p>
                  <Button
                    variant="outline"
                    disabled={page * result.pageSize >= result.total}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Próxima
                    <ChevronRight />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Escolha seus filtros e clique em Pesquisar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
