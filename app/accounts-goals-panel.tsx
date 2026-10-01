'use client';
import { useContext, useState, type SyntheticEvent } from 'react';
import { ArrowRightLeft, Landmark, Pencil, Plus, Target } from 'lucide-react';
import { AccountsContext } from '@/hooks/use-accounts-goals';
import type { FinancialAccount, FinancialGoal } from '@/lib/accounts-goals';
import { apiFetch, readApiJson } from '@/lib/client-api';
import { parseCurrencyToCents } from '@/lib/frontend-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { AccountSelect, formAccountId } from './account-select';
import { formatDate, OverviewStatus } from './overview-panel';
import { useMoneyFormatter, usePreferences } from './preferences-provider';

type Operation =
  | { kind: 'account'; account?: FinancialAccount }
  | { kind: 'goal'; goal?: FinancialGoal }
  | { kind: 'transfer' }
  | { kind: 'reserve' | 'release'; goal: FinancialGoal };
function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}
function currency(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',');
}
function Field({
  id,
  label,
  type = 'text',
  value,
  placeholder,
  min,
  maxLength = 80,
}: {
  id: string;
  label: string;
  type?: string;
  value?: string;
  placeholder?: string;
  min?: string;
  maxLength?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type={type}
        required
        defaultValue={value}
        placeholder={placeholder}
        min={min}
        maxLength={maxLength}
        inputMode={
          id.includes('amount') || (id.includes('target') && type !== 'date')
            ? 'decimal'
            : undefined
        }
      />
    </div>
  );
}
export function AccountsGoalsPanel({ mode }: { mode: 'accounts' | 'goals' }) {
  const state = useContext(AccountsContext)!,
    money = useMoneyFormatter(),
    { preferences } = usePreferences();
  const [operation, setOperation] = useState<Operation | null>(null),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [requestId, setRequestId] = useState('');
  function open(next: Operation) {
    setRequestId(crypto.randomUUID());
    setError('');
    setMessage('');
    setOperation(next);
  }
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!operation || saving) return;
    const form = new FormData(event.currentTarget);
    const isAccount = operation.kind === 'account',
      isGoal = operation.kind === 'goal';
    let url = '/api/accounts',
      method = 'POST';
    let body: Record<string, unknown> = { requestId };
    if (isAccount) {
      body = {
        ...body,
        action: 'create',
        name: text(form, 'account-name'),
        institution: text(form, 'account-institution'),
        openingBalanceCents: parseCurrencyToCents(text(form, 'account-amount')),
        openedOn: text(form, 'account-date'),
      };
      if (operation.account) {
        method = 'PATCH';
        body = {
          id: operation.account.id,
          name: body.name,
          institution: body.institution,
        };
      }
    } else if (isGoal) {
      url = '/api/goals';
      body = {
        ...body,
        action: 'create',
        name: text(form, 'goal-name'),
        targetCents: parseCurrencyToCents(text(form, 'goal-target')),
        targetDate: text(form, 'goal-date'),
      };
      if (operation.goal) {
        method = 'PATCH';
        body = { ...body, id: operation.goal.id };
      }
    } else if (operation.kind === 'transfer') {
      body = {
        ...body,
        action: 'transfer',
        fromAccountId: formAccountId(form.get('transfer-from')),
        toAccountId: formAccountId(form.get('transfer-to')),
        amountCents: parseCurrencyToCents(text(form, 'transfer-amount')),
        description: text(form, 'transfer-description'),
      };
    } else {
      url = '/api/goals';
      body = {
        ...body,
        action: operation.kind,
        goalId: operation.goal.id,
        accountId: formAccountId(form.get('goal-account')),
        amountCents: parseCurrencyToCents(text(form, 'goal-amount')),
      };
    }
    setSaving(true);
    setError('');
    try {
      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? 'Não foi possível salvar.');
      setOperation(null);
      setMessage('Alteração salva na sua conta.');
      await state.reload();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Não foi possível salvar.',
      );
    } finally {
      setSaving(false);
    }
  }
  const data = state.data;
  return (
    <section
      className="mx-auto max-w-7xl space-y-6 px-5 py-8 sm:px-8 lg:px-10"
      aria-labelledby={`${mode}-title`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            id={`${mode}-title`}
            className="flex items-center gap-3 text-2xl font-bold"
          >
            {mode === 'accounts' ? (
              <Landmark aria-hidden="true" />
            ) : (
              <Target aria-hidden="true" />
            )}
            {mode === 'accounts'
              ? 'Contas e instituições'
              : 'Metas financeiras'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {mode === 'accounts'
              ? 'Controle manual das suas contas. Transferências internas não são receitas nem despesas e não movimentam seu banco.'
              : 'Reserve valores reais do saldo registrado nas contas. A reserva não é despesa e não aumenta seu patrimônio.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void state.reload()}
            disabled={state.loading}
          >
            Atualizar
          </Button>
          <Button
            disabled={!data || Boolean(state.error)}
            onClick={() =>
              open({ kind: mode === 'accounts' ? 'account' : 'goal' })
            }
          >
            <Plus />
            {mode === 'accounts' ? 'Nova conta' : 'Nova meta'}
          </Button>
          {mode === 'accounts' && (
            <Button
              variant="outline"
              disabled={
                !data || data.accounts.length < 2 || Boolean(state.error)
              }
              onClick={() => open({ kind: 'transfer' })}
            >
              <ArrowRightLeft />
              Transferir entre contas
            </Button>
          )}
        </div>
      </div>
      <OverviewStatus
        loading={state.loading}
        error={state.error}
        onReload={() => void state.reload()}
      />
      {message && (
        <output className="block rounded-xl border p-3 text-sm">
          {message}
        </output>
      )}
      {data && !state.error && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ['Saldo consolidado', data.totals.balanceCents],
              ['Reservado para metas', data.totals.reservedCents],
              ['Saldo livre', data.totals.availableCents],
            ].map(([name, amount]) => (
              <Card key={String(name)}>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{name}</p>
                  <p className="mt-2 break-words text-2xl font-bold tabular-nums">
                    {money(Number(amount))}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          {data.accounts.some((a) => a.availableCents < 0) && (
            <p
              role="alert"
              className="rounded-xl border border-destructive p-4 text-sm"
            >
              Há conta com saldo livre negativo. Revise os lançamentos ou libere
              reservas; uma reserva é organização contábil, não bloqueio no
              banco.
            </p>
          )}
          {mode === 'accounts' ? (
            <>
              <p className="text-sm text-muted-foreground">
                O saldo inicial é o dinheiro que já existia antes dos
                lançamentos dessa conta, não uma receita. Não cadastre novamente
                valores que já estão na Conta principal; use a transferência
                para separá-los.
              </p>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.accounts.map((account) => (
                  <Card key={account.id ?? 'main'} className="min-w-0">
                    <CardHeader>
                      <CardTitle className="flex flex-wrap items-start justify-between gap-2">
                        <span className="min-w-0 break-words">
                          {account.name}
                        </span>
                        {account.id !== null && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Editar conta ${account.name}`}
                            onClick={() => open({ kind: 'account', account })}
                          >
                            <Pencil />
                          </Button>
                        )}
                      </CardTitle>
                      <p className="break-words text-sm text-muted-foreground">
                        {account.institution}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-2xl font-bold tabular-nums">
                        {money(account.balanceCents)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Reservado: {money(account.reservedCents)}
                      </p>
                      <p className="text-sm">
                        Livre: {money(account.availableCents)}
                      </p>
                      {account.id !== null && (
                        <p className="text-xs text-muted-foreground">
                          Saldo inicial em {formatDate(account.openedOn)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Transferências entre contas</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Últimas 50 operações. A saída e a entrada são registradas
                    juntas.
                  </p>
                </CardHeader>
                <CardContent>
                  {!data.transfers.length ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma transferência registrada.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {data.transfers.map((t) => (
                        <li
                          key={t.id}
                          className="flex flex-wrap justify-between gap-2 py-4"
                        >
                          <div className="min-w-0">
                            <p className="break-words font-medium">
                              {t.fromName} → {t.toName}
                            </p>
                            <p className="break-words text-sm text-muted-foreground">
                              {formatDate(t.transferDate)} · {t.description}
                            </p>
                          </div>
                          <span className="tabular-nums">
                            {money(t.amountCents)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                O aporte mensal necessário é calculado sem supor rendimentos,
                dividindo o valor restante pelos meses até o prazo, incluindo o
                mês atual. O dinheiro continua na conta em que foi reservado.
              </p>
              {!data.goals.length ? (
                <Card>
                  <CardContent>
                    <h2 className="font-semibold">
                      Qual é o seu próximo objetivo?
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Crie uma meta para sua reserva de emergência, viagem ou
                      outro projeto. Apenas valores reservados entram no
                      progresso.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid items-start gap-4 lg:grid-cols-2">
                  {data.goals.map((goal) => (
                    <Card key={goal.id} className="min-w-0">
                      <CardHeader>
                        <CardTitle className="flex items-start justify-between gap-3">
                          <span className="min-w-0 break-words">
                            {goal.name}
                          </span>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Editar meta ${goal.name}`}
                            onClick={() => open({ kind: 'goal', goal })}
                          >
                            <Pencil />
                          </Button>
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Prazo: {formatDate(goal.targetDate)}
                          {goal.overdue
                            ? ' · Prazo vencido'
                            : goal.remainingCents === 0
                              ? ' · Meta atingida'
                              : ''}
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex flex-wrap justify-between gap-2">
                          <span>Reservado: {money(goal.savedCents)}</span>
                          <span>Objetivo: {money(goal.targetCents)}</span>
                        </div>
                        <progress
                          className="h-3 w-full overflow-hidden rounded-full bg-muted accent-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
                          aria-label={`Progresso da meta ${goal.name}`}
                          value={preferences.hideBalances ? 0 : goal.percentage}
                          max={100}
                          aria-valuetext={
                            preferences.hideBalances
                              ? 'Progresso oculto no modo discreto'
                              : `${goal.percentage}%`
                          }
                        />
                        <p className="text-sm">
                          {preferences.hideBalances
                            ? '••••••'
                            : `${goal.percentage}%`}{' '}
                          · Falta {money(goal.remainingCents)}
                        </p>
                        <div className="rounded-xl border p-3">
                          <p className="text-sm text-muted-foreground">
                            {goal.overdue
                              ? 'Valor restante para concluir agora'
                              : 'Aporte mensal necessário'}
                          </p>
                          <p className="mt-1 text-xl font-semibold">
                            {money(goal.monthlyRequiredCents)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {goal.overdue
                              ? 'Revise o prazo ou conclua a reserva.'
                              : `${goal.monthsRemaining} mês(es), sem rendimento presumido.`}
                          </p>
                        </div>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                          {goal.allocations.map((a) => (
                            <li
                              key={a.accountId ?? 'main'}
                              className="break-words"
                            >
                              {a.accountName}: {money(a.amountCents)}
                            </li>
                          ))}
                        </ul>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={goal.remainingCents === 0}
                            onClick={() => open({ kind: 'reserve', goal })}
                          >
                            Reservar dinheiro
                          </Button>
                          <Button
                            variant="outline"
                            disabled={goal.savedCents === 0}
                            onClick={() => open({ kind: 'release', goal })}
                          >
                            Liberar reserva
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
      <Dialog
        open={Boolean(operation)}
        onOpenChange={(v) => {
          if (!v && !saving) setOperation(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {operation?.kind === 'account'
                ? operation.account
                  ? 'Editar conta'
                  : 'Nova conta'
                : operation?.kind === 'goal'
                  ? operation.goal
                    ? 'Editar meta'
                    : 'Nova meta'
                  : operation?.kind === 'transfer'
                    ? 'Transferir entre contas'
                    : operation?.kind === 'reserve'
                      ? 'Reservar para a meta'
                      : 'Liberar reserva'}
            </DialogTitle>
            <DialogDescription>
              {operation?.kind === 'transfer'
                ? 'Registro manual feito hoje. O dinheiro reservado para metas não pode ser transferido sem liberar a reserva.'
                : operation?.kind === 'account'
                  ? 'Use saldo inicial apenas para dinheiro que ainda não está registrado. O saldo inicial não é alterado pela edição; registre entradas e saídas em Gastos.'
                  : 'A reserva apenas separa o saldo no Meu Caixa. Nenhuma operação será feita no seu banco.'}
            </DialogDescription>
          </DialogHeader>
          {operation && (
            <form key={requestId} onSubmit={submit} className="space-y-4">
              {operation.kind === 'account' ? (
                <>
                  <Field
                    id="account-name"
                    label="Nome da conta"
                    value={operation.account?.name}
                    placeholder="Ex.: Inter"
                  />
                  <Field
                    id="account-institution"
                    label="Instituição"
                    value={operation.account?.institution}
                    placeholder="Ex.: Banco Inter ou Dinheiro"
                  />
                  {!operation.account && (
                    <>
                      <Field
                        id="account-amount"
                        label="Saldo inicial (R$)"
                        value="0,00"
                      />
                      <Field
                        id="account-date"
                        label="Data do saldo inicial"
                        type="date"
                        value={data?.today}
                      />
                    </>
                  )}
                </>
              ) : operation.kind === 'goal' ? (
                <>
                  <Field
                    id="goal-name"
                    label="Nome da meta"
                    value={operation.goal?.name}
                    placeholder="Ex.: Viagem"
                  />
                  <Field
                    id="goal-target"
                    label="Valor objetivo (R$)"
                    value={
                      operation.goal
                        ? currency(operation.goal.targetCents)
                        : undefined
                    }
                  />
                  <Field
                    id="goal-date"
                    label="Prazo da meta"
                    type="date"
                    min={data?.today}
                    value={operation.goal?.targetDate}
                  />
                </>
              ) : operation.kind === 'transfer' ? (
                <>
                  <AccountSelect
                    id="transfer-from"
                    name="transfer-from"
                    label="Conta de origem"
                    showBalance
                  />
                  <AccountSelect
                    id="transfer-to"
                    name="transfer-to"
                    label="Conta de destino"
                    defaultValue={
                      data?.accounts.find((a) => a.id !== null)?.id ?? null
                    }
                  />
                  <Field
                    id="transfer-amount"
                    label="Valor da transferência (R$)"
                  />
                  <Field
                    id="transfer-description"
                    label="Descrição"
                    value="Transferência entre minhas contas"
                  />
                </>
              ) : (
                <>
                  <p className="break-words font-medium">
                    {operation.goal.name}
                  </p>
                  {operation.kind === 'release' ? (
                    <div className="space-y-2">
                      <Label htmlFor="goal-account">Conta da reserva</Label>
                      <NativeSelect
                        id="goal-account"
                        name="goal-account"
                        required
                        className="w-full"
                      >
                        {operation.goal.allocations.map((a) => (
                          <NativeSelectOption
                            key={a.accountId ?? 'main'}
                            value={
                              a.accountId === null
                                ? 'main'
                                : String(a.accountId)
                            }
                          >
                            {a.accountName} — {money(a.amountCents)}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                  ) : (
                    <AccountSelect
                      id="goal-account"
                      name="goal-account"
                      label="Conta que guarda o dinheiro"
                      showBalance
                    />
                  )}
                  <Field
                    id="goal-amount"
                    label={
                      operation.kind === 'release'
                        ? 'Valor a liberar (R$)'
                        : 'Valor a reservar (R$)'
                    }
                  />
                </>
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setOperation(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saving || state.loading || Boolean(state.error)}
                >
                  {saving ? 'Salvando…' : 'Salvar'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
