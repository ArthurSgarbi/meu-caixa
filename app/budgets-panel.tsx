'use client';
import { apiFetch, readApiJson } from '@/lib/client-api';
import { useLatestRequest } from '@/hooks/use-latest-request';

import {
  SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AlertCircle, LoaderCircle, PiggyBank, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import {
  calculateBudgetProgress,
  parseBudgetLimitCents,
} from '@/lib/finance-calculations';

type BudgetCategory = {
  categoryId: number;
  categoryName: string;
  limitCents: number | null;
  spentCents: number;
};

type BudgetsResponse = {
  categories: BudgetCategory[];
  error?: string;
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatCurrency(cents: number) {
  return currencyFormatter.format(cents / 100);
}

export function BudgetsPanel({
  month,
  refreshKey,
}: {
  month: string;
  refreshKey: number;
}) {
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [limitInput, setLimitInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [message, setMessage] = useState('');

  const beginBudgetsRequest = useLatestRequest();
  const loadBudgets = useCallback(
    async (signal?: AbortSignal) => {
      signal = beginBudgetsRequest(signal).signal;
      if (signal.aborted) return false;
      setLoading(true);
      setLoadFailed(false);
      setError('');
      try {
        const response = await apiFetch(`/api/budgets?month=${month}`, {
          signal,
        });
        const result = (await readApiJson(response)) as BudgetsResponse;
        if (!response.ok)
          throw new Error(
            result.error ?? 'Não foi possível carregar os orçamentos.',
          );
        if (signal.aborted) return false;
        setCategories(
          result.categories.map((category) => ({
            categoryId: Number(category.categoryId),
            categoryName: category.categoryName,
            limitCents:
              category.limitCents === null ? null : Number(category.limitCents),
            spentCents: Number(category.spentCents),
          })),
        );
        return true;
      } catch (requestError) {
        if (signal.aborted) return false;
        if (
          requestError instanceof DOMException &&
          requestError.name === 'AbortError'
        )
          return false;
        setLoadFailed(true);
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Não foi possível carregar os orçamentos.',
        );
        return false;
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [month, beginBudgetsRequest],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadBudgets(controller.signal);
    });
    return () => controller.abort();
  }, [loadBudgets, refreshKey]);

  const activeBudgets = useMemo(
    () => categories.filter((category) => category.limitCents !== null),
    [categories],
  );
  const currentCategoryId = categories.some(
    (category) => String(category.categoryId) === selectedCategoryId,
  )
    ? selectedCategoryId
    : String(categories[0]?.categoryId ?? '');

  async function saveBudget(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const limitCents = parseBudgetLimitCents(limitInput);
    if (
      !Number.isSafeInteger(limitCents) ||
      limitCents <= 0 ||
      limitCents > 2_147_483_647
    ) {
      setError('Informe um limite mensal maior que zero.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch('/api/budgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          categoryId: Number(currentCategoryId),
          limitCents,
        }),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? 'Não foi possível salvar o orçamento.');
      if (await loadBudgets()) setMessage('Limite mensal salvo.');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível salvar o orçamento.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeBudget(category: BudgetCategory) {
    if (
      !window.confirm(
        `Remover o orçamento de ${category.categoryName} neste mês?`,
      )
    )
      return;
    setRemovingId(category.categoryId);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch('/api/budgets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, categoryId: category.categoryId }),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok)
        throw new Error(
          result.error ?? 'Não foi possível remover o orçamento.',
        );
      if (await loadBudgets()) {
        setMessage(
          'Orçamento removido. Os gastos registrados foram preservados.',
        );
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível remover o orçamento.',
      );
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section
      id="monthly-budgets"
      className="mx-auto max-w-7xl px-5 pb-8 pt-6 sm:px-8 lg:px-10"
      aria-label="Orçamentos por categoria"
    >
      <Card className="border-0 shadow-[0_18px_50px_rgba(0,0,0,.2)] ring-1 ring-white/15">
        <CardHeader className="border-b border-white/10 pb-4">
          <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <PiggyBank className="size-5 text-primary" /> Orçamentos por
            categoria
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Defina quanto pretende gastar em cada categoria no mês selecionado.
            Aportes em investimentos não entram nesse cálculo.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <form
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
            onSubmit={saveBudget}
          >
            <div className="space-y-2">
              <Label htmlFor="budget-category">Categoria</Label>
              <NativeSelect
                id="budget-category"
                value={currentCategoryId}
                onChange={(event) => {
                  setSelectedCategoryId(event.target.value);
                  const selected = categories.find(
                    (category) =>
                      String(category.categoryId) === event.target.value,
                  );
                  setLimitInput(
                    selected?.limitCents
                      ? (selected.limitCents / 100).toFixed(2).replace('.', ',')
                      : '',
                  );
                }}
                disabled={loading || categories.length === 0}
                className="w-full"
              >
                {categories.map((category) => (
                  <NativeSelectOption
                    key={category.categoryId}
                    value={String(category.categoryId)}
                  >
                    {category.categoryName}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget-limit">Limite mensal</Label>
              <Input
                id="budget-limit"
                value={limitInput}
                onChange={(event) => setLimitInput(event.target.value)}
                inputMode="decimal"
                placeholder="R$ 0,00"
                required
                className="h-11"
              />
            </div>
            <Button
              type="submit"
              disabled={
                saving || loading || removingId !== null || !currentCategoryId
              }
              className="h-11"
            >
              {saving && <LoaderCircle className="animate-spin" />}
              {saving ? 'Salvando...' : 'Salvar limite'}
            </Button>
          </form>

          {(error || message) && (
            <output
              aria-live="polite"
              className={`flex items-center gap-2 text-sm ${error ? 'text-red-200' : 'text-white'}`}
            >
              {error && <AlertCircle className="size-4" />}
              {error || message}
            </output>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Carregando
              orçamentos...
            </div>
          ) : loadFailed ? (
            <Button variant="outline" onClick={() => void loadBudgets()}>
              Tentar carregar orçamentos novamente
            </Button>
          ) : activeBudgets.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/20 p-5 text-sm text-muted-foreground">
              Nenhum limite definido para este mês. Escolha uma categoria acima
              para começar.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {activeBudgets.map((category) => {
                const limit = category.limitCents ?? 0;
                const {
                  remainingCents: remaining,
                  usedPercentage: percentage,
                } = calculateBudgetProgress(limit, category.spentCents);
                return (
                  <div
                    key={category.categoryId}
                    className="space-y-3 rounded-xl border border-white/15 bg-white/5 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold">
                          {category.categoryName}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(category.spentCents)} de{' '}
                          {formatCurrency(limit)}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-semibold tabular-nums ${remaining < 0 ? 'text-red-300' : 'text-white'}`}
                      >
                        {percentage}%
                      </span>
                    </div>
                    <Progress
                      value={Math.min(percentage, 100)}
                      aria-label={`Uso do orçamento de ${category.categoryName}`}
                    />
                    <p
                      className={`text-sm ${remaining < 0 ? 'text-red-300' : 'text-muted-foreground'}`}
                    >
                      {remaining < 0
                        ? `Excedeu ${formatCurrency(-remaining)}`
                        : `Restam ${formatCurrency(remaining)}`}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedCategoryId(String(category.categoryId));
                          setLimitInput(
                            (limit / 100).toFixed(2).replace('.', ','),
                          );
                          document.getElementById('budget-limit')?.focus();
                        }}
                      >
                        Ajustar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void removeBudget(category)}
                        disabled={removingId !== null || saving || loading}
                        aria-label={`Remover orçamento de ${category.categoryName}`}
                      >
                        {removingId === category.categoryId ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <Trash2 />
                        )}
                        Remover
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
