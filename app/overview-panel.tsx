'use client';

import type { ReactNode } from 'react';

import {
  Bell,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  LoaderCircle,
  PiggyBank,
  RefreshCw,
  ReceiptText,
  WalletCards,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  daysBetween,
  type FinanceAlert,
  type OverviewData,
} from '@/lib/overview';
import { useMoneyFormatter, usePreferences } from './preferences-provider';

type StatusProps = { loading: boolean; error: string; onReload: () => void };
export function OverviewStatus({ loading, error, onReload }: StatusProps) {
  return (
    <div
      role={error ? 'alert' : 'status'}
      aria-live="polite"
      className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground"
    >
      {loading ? (
        <>
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Atualizando dados…
        </>
      ) : error ? (
        <>
          {error}
          <Button variant="outline" onClick={onReload}>
            Tentar novamente
          </Button>
        </>
      ) : null}
    </div>
  );
}

export function FinanceAlertList({
  alerts,
  onNavigate,
}: {
  alerts: FinanceAlert[];
  onNavigate: (area: string) => void;
}) {
  const money = useMoneyFormatter();
  const { preferences } = usePreferences();
  if (!alerts.length)
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Nenhum alerta ativo nas categorias habilitadas.
      </p>
    );
  return (
    <ul className="space-y-3">
      {alerts.map((alert) => (
        <li
          key={alert.id}
          className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-xl border border-border p-4"
        >
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">
              {alert.severity === 'critical'
                ? 'Atenção prioritária'
                : alert.severity === 'warning'
                  ? 'Atenção'
                  : 'Lembrete'}
            </p>
            <p className="break-words font-medium">{alert.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {alert.kind === 'budget'
                ? `${preferences.hideBalances ? '••••••' : `${alert.percentage}%`} utilizado · ${alert.amountCents >= 0 ? 'Restante' : 'Excedente'}: ${money(Math.abs(alert.amountCents))}`
                : `${alert.date ? formatDate(alert.date) + ' · ' : ''}${money(alert.amountCents)}`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate(alert.area)}
          >
            Ver {alert.area === 'credit-cards' ? 'cartões' : 'gastos'}
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function AlertsDialog({
  open,
  onOpenChange,
  alerts,
  loading,
  error,
  onReload,
  onNavigate,
}: StatusProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alerts: FinanceAlert[];
  onNavigate: (area: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell aria-hidden="true" />
            Central de alertas
          </DialogTitle>
          <DialogDescription>
            Avisos baseados nos seus registros. Eles não confirmam movimentações
            nem consultam seu banco.
          </DialogDescription>
        </DialogHeader>
        <OverviewStatus loading={loading} error={error} onReload={onReload} />
        {!loading && !error && (
          <FinanceAlertList
            alerts={alerts}
            onNavigate={(area) => {
              onOpenChange(false);
              onNavigate(area);
            }}
          />
        )}
        <Button
          variant="outline"
          onClick={() => {
            onOpenChange(false);
            onNavigate('settings');
          }}
        >
          Preferências de alertas
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

export function OverviewPanel({
  data,
  alerts,
  loading,
  error,
  onReload,
  onNavigate,
  onAlerts,
}: StatusProps & {
  data: OverviewData | null;
  alerts: FinanceAlert[];
  onNavigate: (area: string) => void;
  onAlerts: () => void;
}) {
  const money = useMoneyFormatter();
  const upcoming =
    data?.invoices.filter(
      (invoice) => daysBetween(data.today, invoice.dueDate) <= 30,
    ) ?? [];
  const pendingCents = upcoming.reduce(
    (sum, invoice) => sum + invoice.amountCents,
    0,
  );
  return (
    <section
      className="mx-auto max-w-7xl space-y-6 px-5 py-8 sm:px-8 lg:px-10"
      aria-labelledby="overview-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            id="overview-title"
            className="flex items-center gap-3 text-2xl font-bold tracking-tight"
          >
            <LayoutDashboard aria-hidden="true" />
            Visão Geral
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Seu dinheiro e seus próximos compromissos em um só lugar.
          </p>
        </div>
        <Button variant="outline" onClick={onReload} disabled={loading}>
          <RefreshCw aria-hidden="true" />
          Atualizar
        </Button>
      </div>
      <OverviewStatus loading={loading} error={error} onReload={onReload} />
      {data && !loading && !error ? (
        <>
          <p className="text-xs text-muted-foreground">
            Controle manual até {formatDate(data.today)} · Atualizado às{' '}
            {new Intl.DateTimeFormat('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/Sao_Paulo',
            }).format(new Date(data.updatedAt))}{' '}
            (Brasília)
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <OverviewMetric
              title="Saldo das contas manuais"
              value={money(data.accountBalanceCents)}
              detail="Controle manual, incluindo saldos iniciais. Não integra o saldo bancário automático acima."
              icon={<WalletCards aria-hidden="true" />}
            />
            <OverviewMetric
              title="Saldo de aportes"
              value={money(data.walletBalanceCents)}
              detail="Saldo registrado no calculador CDI/CDB."
              icon={<PiggyBank aria-hidden="true" />}
            />
            <OverviewMetric
              title="Carteira cadastrada"
              value={money(data.portfolioValueCents)}
              detail="Valores registrados dos ativos; não é cotação ao vivo."
              icon={<PiggyBank aria-hidden="true" />}
            />
            <OverviewMetric
              title="Faturas a acompanhar"
              value={money(pendingCents)}
              detail="Vencidas e a vencer nos próximos 30 dias, não marcadas como pagas."
              icon={<CreditCard aria-hidden="true" />}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-4 text-sm">
            <span>
              Reservado para metas: {money(data.reservedGoalCents ?? 0)}
            </span>
            <span>
              Saldo livre no controle manual:{' '}
              {money(data.availableBalanceCents ?? data.accountBalanceCents)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('goals')}
            >
              Ver metas
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('accounts')}
            >
              Ver contas
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Aportes e carteira são controles separados e podem representar o
            mesmo dinheiro. Não os somamos como patrimônio. Faturas não são
            descontadas novamente do saldo; o saldo depende dos lançamentos da
            conta.
          </p>
          <div
            className="flex flex-wrap gap-2"
            aria-label="Atalhos financeiros"
          >
            <Button onClick={() => onNavigate('expenses')}>
              <ReceiptText />
              Registrar movimentação
            </Button>
            <Button variant="outline" onClick={() => onNavigate('investments')}>
              <PiggyBank />
              Ver investimentos
            </Button>
            <Button
              variant="outline"
              onClick={() => onNavigate('credit-cards')}
            >
              <CreditCard />
              Ver faturas
            </Button>
            <Button variant="outline" onClick={onAlerts}>
              <Bell />
              Alertas ({alerts.length})
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Registros manuais deste mês</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Receitas</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {money(data.monthly.incomeCents)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Despesas</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {money(data.monthly.expenseCents)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Transferido para investimentos
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {money(data.monthly.transferCents)}
                </p>
              </div>
            </CardContent>
          </Card>
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays />
                  Faturas e vencimentos
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!upcoming.length ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma fatura pendente vencida ou a vencer nos próximos 30
                    dias.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {upcoming.map((invoice) => (
                      <li
                        key={invoice.id}
                        className="flex flex-wrap justify-between gap-2 border-b border-border pb-3"
                      >
                        <div className="min-w-0">
                          <p className="break-words font-medium">
                            {invoice.cardName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(invoice.dueDate)} ·{' '}
                            {invoice.dueDate < data.today
                              ? 'Vencida, sem confirmação de pagamento'
                              : 'A vencer'}
                          </p>
                        </div>
                        <p className="font-semibold tabular-nums">
                          {money(invoice.amountCents)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Recorrências a acompanhar</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-xs text-muted-foreground">
                  Pendências do mês e previsões dos próximos 30 dias. Só entram
                  no saldo após confirmação.
                </p>
                {!data.occurrences.length ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma recorrência pendente neste período.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {data.occurrences.map((occurrence) => (
                      <li
                        key={`${occurrence.id}:${occurrence.date}`}
                        className="flex flex-wrap justify-between gap-2 border-b border-border pb-3"
                      >
                        <div className="min-w-0">
                          <p className="break-words font-medium">
                            {occurrence.description}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(occurrence.date)} ·{' '}
                            {occurrence.date <= data.today
                              ? 'Confirmar em Gastos'
                              : 'Previsão'}
                          </p>
                        </div>
                        <p className="font-semibold tabular-nums">
                          {occurrence.type === 'income' ? '+ ' : '− '}
                          {money(occurrence.amountCents)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : !loading && !error ? (
        <p className="text-sm text-muted-foreground">
          Carregando sua visão geral…
        </p>
      ) : null}
    </section>
  );
}

function OverviewMetric({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-start justify-between gap-2 text-sm">
          <span>{title}</span>
          <span className="shrink-0 text-muted-foreground [&>svg]:size-5">
            {icon}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="break-words text-2xl font-bold tabular-nums">{value}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {detail}
        </p>
      </CardContent>
    </Card>
  );
}
