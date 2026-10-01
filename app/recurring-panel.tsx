'use client';
import { useMoneyFormatter } from './preferences-provider';
import { apiFetch, readApiJson } from '@/lib/client-api';
import { useLatestRequest } from '@/hooks/use-latest-request';

import {
  SyntheticEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AlertCircle,
  CalendarClock,
  LoaderCircle,
  Pause,
  Play,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { parseBudgetLimitCents } from '@/lib/finance-calculations';
import type { RecurringRule } from '@/lib/recurring';
import { AccountSelect } from './account-select';
import { AccountsContext } from '@/hooks/use-accounts-goals';

type Category = { id: number; name: string; type: 'income' | 'expense' };
type Occurrence = RecurringRule & { date: string; confirmed: boolean };
type ForecastMonth = {
  month: string;
  incomeCents: number;
  expenseCents: number;
  transferCents: number;
  endingBalanceCents: number;
};
type RecurringResponse = {
  today: string;
  startingBalanceCents: number;
  rules: RecurringRule[];
  occurrences: Occurrence[];
  forecast: ForecastMonth[];
  error?: string;
};

const monthLabel = new Intl.DateTimeFormat('pt-BR', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const formatMonth = (month: string) =>
  monthLabel.format(new Date(`${month}-01T12:00:00Z`));

export function RecurringPanel({
  month,
  categories,
  refreshKey,
  onConfirmed,
}: {
  month: string;
  categories: Category[];
  refreshKey: number;
  onConfirmed: () => Promise<void>;
}) {
  const formatMoney = useMoneyFormatter();
  const [data, setData] = useState<RecurringResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [startsOn, setStartsOn] = useState(() => `${month}-01`);
  const [endsOn, setEndsOn] = useState('');
  const [confirmationAccount, setConfirmationAccount] = useState('main');
  const accountsState = useContext(AccountsContext);
  const selectedAccount = accountsState?.data?.accounts.find(
    (account) =>
      (account.id === null ? 'main' : String(account.id)) ===
      confirmationAccount,
  );
  const accountReady = Boolean(selectedAccount && !accountsState?.error);

  const matchingCategories = useMemo(
    () => categories.filter((category) => category.type === type),
    [categories, type],
  );
  const currentCategoryId = matchingCategories.some(
    (category) => String(category.id) === categoryId,
  )
    ? categoryId
    : String(matchingCategories[0]?.id ?? '');

  const beginRecurringRequest = useLatestRequest();
  const load = useCallback(
    async (signal?: AbortSignal) => {
      signal = beginRecurringRequest(signal).signal;
      if (signal.aborted) return false;
      setLoading(true);
      setLoadFailed(false);
      setError('');
      try {
        const response = await apiFetch(`/api/recurring?month=${month}`, {
          signal,
        });
        const result = (await readApiJson(response)) as RecurringResponse;
        if (!response.ok)
          throw new Error(
            result.error ?? 'Não foi possível carregar as recorrências.',
          );
        if (signal.aborted) return false;
        setData(result);
        return true;
      } catch (cause) {
        if (signal.aborted) return false;
        if (cause instanceof DOMException && cause.name === 'AbortError')
          return false;
        setLoadFailed(true);
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível carregar as recorrências.',
        );
        return false;
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [month, beginRecurringRequest],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load, refreshKey]);

  async function mutate(
    method: 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload: object,
    success: string,
  ) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok)
        throw new Error(
          result.error ?? 'Não foi possível concluir a operação.',
        );
      if (await load()) setMessage(success);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível concluir a operação.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCents = parseBudgetLimitCents(amount);
    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0 ||
      amountCents > 2_147_483_647
    ) {
      setError('Informe um valor válido maior que zero.');
      return;
    }
    const saved = await mutate(
      'POST',
      '/api/recurring',
      {
        description,
        type,
        amountCents,
        categoryId: Number(currentCategoryId),
        startsOn,
        endsOn: endsOn || null,
      },
      'Recorrência salva. O saldo real só muda após a confirmação de cada ocorrência.',
    );
    if (saved) {
      setDescription('');
      setAmount('');
    }
  }

  async function confirm(occurrence: Occurrence) {
    if (!accountReady) return;
    if (
      !window.confirm(
        `Confirmar ${occurrence.description} de ${formatMoney(occurrence.amountCents)} em ${occurrence.date} como lançamento real na conta ${selectedAccount?.name}?`,
      )
    )
      return;
    const saved = await mutate(
      'POST',
      '/api/recurring/confirm',
      {
        ruleId: occurrence.id,
        date: occurrence.date,
        accountId:
          confirmationAccount === 'main' ? null : Number(confirmationAccount),
      },
      'Ocorrência confirmada e lançada no saldo real.',
    );
    if (saved) await onConfirmed();
  }

  return (
    <section
      className="mx-auto max-w-7xl px-5 pb-8 sm:px-8 lg:px-10"
      aria-label="Recorrências e previsão de caixa"
    >
      <Card className="border-0 shadow-[0_18px_50px_rgba(0,0,0,.2)] ring-1 ring-foreground/15">
        <div className="px-5 pt-5">
          <AccountSelect
            id="recurrence-account"
            name="recurrenceAccount"
            label="Conta para as próximas confirmações"
            value={confirmationAccount}
            onChange={setConfirmationAccount}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Cada confirmação será lançada nesta conta. Você também pode alterar
            a conta depois em Editar transação.
          </p>
        </div>
        <CardHeader className="border-b border-foreground/10 pb-4">
          <CardTitle className="flex items-center gap-2 text-lg font-bold">
            <CalendarClock className="size-5 text-primary" /> Recorrências e
            previsão de caixa
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Salário, aluguel e assinaturas ficam previstos até você confirmar o
            pagamento ou recebimento. Previsão não é saldo disponível.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={create}
          >
            <div className="space-y-2">
              <Label htmlFor="recurrence-description">Descrição</Label>
              <Input
                id="recurrence-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Ex.: Aluguel"
                minLength={2}
                maxLength={120}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurrence-type">Tipo</Label>
              <NativeSelect
                id="recurrence-type"
                value={type}
                onChange={(event) => {
                  setType(event.target.value as 'income' | 'expense');
                  setCategoryId('');
                }}
              >
                <NativeSelectOption value="expense">Despesa</NativeSelectOption>
                <NativeSelectOption value="income">Receita</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurrence-category">Categoria</Label>
              <NativeSelect
                id="recurrence-category"
                value={currentCategoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                disabled={!matchingCategories.length}
              >
                {matchingCategories.map((category) => (
                  <NativeSelectOption
                    key={category.id}
                    value={String(category.id)}
                  >
                    {category.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurrence-amount">Valor mensal</Label>
              <Input
                id="recurrence-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                placeholder="R$ 0,00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurrence-start">Primeira data</Label>
              <Input
                id="recurrence-start"
                type="date"
                value={startsOn}
                onChange={(event) => setStartsOn(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurrence-end">Última data (opcional)</Label>
              <Input
                id="recurrence-end"
                type="date"
                value={endsOn}
                min={startsOn}
                onChange={(event) => setEndsOn(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={busy || loading || !currentCategoryId}
              className="sm:col-span-2 lg:col-span-3"
            >
              {busy && <LoaderCircle className="animate-spin" />} Criar
              recorrência mensal
            </Button>
          </form>
          {(error || message) && (
            <output
              aria-live="polite"
              className={`flex items-center gap-2 text-sm ${error ? 'text-destructive' : 'text-foreground'}`}
            >
              {error && <AlertCircle className="size-4" />}
              {error || message}
            </output>
          )}
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Carregando
              previsões...
            </p>
          ) : loadFailed ? (
            <Button variant="outline" onClick={() => void load()}>
              Tentar carregar previsões novamente
            </Button>
          ) : (
            <>
              <div className="space-y-3">
                <h3 className="font-semibold">
                  Lançamentos previstos em {formatMonth(month)}
                </h3>
                {!data?.occurrences.length ? (
                  <p className="rounded-lg border border-dashed border-foreground/20 p-4 text-sm text-muted-foreground">
                    Nenhuma recorrência prevista neste mês.
                  </p>
                ) : (
                  data.occurrences.map((item) => (
                    <div
                      key={`${item.id}:${item.date}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-foreground/15 bg-inverse/5 p-4"
                    >
                      <div>
                        <p className="font-medium">
                          {item.description} · {formatMoney(item.amountCents)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {item.date} · {item.categoryName} ·{' '}
                          {item.confirmed
                            ? 'Confirmado no saldo real'
                            : item.date < (data?.today ?? '')
                              ? 'Pendente (data passou)'
                              : 'Previsto'}
                        </p>
                      </div>
                      {!item.confirmed && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy || !accountReady}
                          onClick={() => void confirm(item)}
                        >
                          Confirmar lançamento
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="space-y-3">
                <h3 className="font-semibold">
                  Saldo projetado para os próximos 6 meses
                </h3>
                <p className="text-sm text-muted-foreground">
                  Partindo do saldo confirmado de hoje (
                  {formatMoney(data?.startingBalanceCents ?? 0)}). Inclui
                  recorrências pendentes e lançamentos futuros já registrados;
                  valores podem mudar.
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data?.forecast.map((item) => (
                    <div
                      key={item.month}
                      className="rounded-xl border border-foreground/15 bg-inverse/5 p-4"
                    >
                      <p className="text-sm text-muted-foreground">
                        {formatMonth(item.month)}
                      </p>
                      <p className="mt-1 text-xl font-bold tabular-nums">
                        {formatMoney(item.endingBalanceCents)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        + {formatMoney(item.incomeCents)} · −{' '}
                        {formatMoney(item.expenseCents + item.transferCents)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="font-semibold">Regras mensais</h3>
                {!data?.rules.length ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma recorrência cadastrada.
                  </p>
                ) : (
                  data.rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-foreground/15 p-3"
                    >
                      <div>
                        <p className="font-medium">
                          {rule.description} · {formatMoney(rule.amountCents)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {rule.categoryName} · dia{' '}
                          {Number(rule.startsOn.slice(8))} ·{' '}
                          {rule.active ? 'ativa' : 'pausada'}
                          {rule.endsOn ? ` · até ${rule.endsOn}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              'PATCH',
                              '/api/recurring',
                              { id: rule.id, active: !rule.active },
                              rule.active
                                ? 'Recorrência pausada.'
                                : 'Recorrência reativada.',
                            )
                          }
                        >
                          {rule.active ? <Pause /> : <Play />}
                          {rule.active ? 'Pausar' : 'Ativar'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remover a regra “${rule.description}”? Se houver lançamentos confirmados, pause a regra para preservar o histórico.`,
                              )
                            )
                              void mutate(
                                'DELETE',
                                '/api/recurring',
                                { id: rule.id },
                                'Regra sem lançamentos confirmados removida.',
                              );
                          }}
                        >
                          <Trash2 /> Remover
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
