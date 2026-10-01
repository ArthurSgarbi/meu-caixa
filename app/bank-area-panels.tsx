'use client';

import { useState, type ReactNode } from 'react';
import { useBankConnectionsState } from '@/hooks/use-bank-connections';
import {
  bankAccounts,
  bankHasUnavailableData,
  bankMovements,
  bankPositions,
  bankOverviewTotals,
  movementSampleTotals,
  type LinkedMovement,
} from '@/lib/bank-views';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { useMoneyFormatter, usePreferences } from './preferences-provider';
import { currentMonthInBrazil } from '@/lib/finance-month';

export function BankArea({
  children,
  bankContent,
}: {
  children: ReactNode;
  bankContent: ReactNode;
}) {
  const { data, source, setSource } = useBankConnectionsState();
  if (data && !data.enabled) return children;
  return (
    <>
      <fieldset
        className="mx-auto flex w-full min-w-0 max-w-7xl flex-wrap gap-2 border-0 px-5 pt-6 sm:px-8 lg:px-10"
        aria-label="Origem dos dados financeiros"
      >
        <Button
          aria-pressed={source === 'bank'}
          variant={source === 'bank' ? 'default' : 'outline'}
          onClick={() => setSource('bank')}
        >
          Dados dos bancos
        </Button>
        <Button
          aria-pressed={source === 'manual'}
          variant={source === 'manual' ? 'default' : 'outline'}
          onClick={() => setSource('manual')}
        >
          Registros manuais
        </Button>
      </fieldset>
      {source === 'bank' ? bankContent : children}
    </>
  );
}

function BankSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { data, loading, error } = useBankConnectionsState();
  return (
    <section
      className="mx-auto max-w-7xl space-y-5 px-5 py-8 sm:px-8 lg:px-10"
      aria-label={title}
    >
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Origem: bancos conectados · consulta somente leitura · mesma atualização
        da área Contas.
      </p>
      {loading ? (
        <output className="block text-sm">Carregando dados bancários…</output>
      ) : error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : data?.enabled ? (
        <>
          {bankHasUnavailableData(data.snapshot) && (
            <p role="alert" className="text-sm text-destructive">
              Há conexão indisponível ou consulta parcial. Só os dados
              autorizados e disponíveis são exibidos.
            </p>
          )}
          {children}
        </>
      ) : (
        <p className="text-sm">
          A consulta bancária não está habilitada para esta conta.
        </p>
      )}
    </section>
  );
}

function useBankMoney() {
  const money = useMoneyFormatter();
  const { preferences } = usePreferences();
  return (cents: number | null, currency = 'BRL') =>
    cents === null
      ? 'Não informado'
      : currency === 'BRL'
        ? money(cents)
        : preferences.hideBalances
          ? '••••••'
          : `${(cents / 100).toFixed(2)} ${currency}`;
}

function Metric({
  title,
  cents,
  detail,
}: {
  title: string;
  cents: number | null;
  detail: string;
}) {
  const money = useBankMoney();
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="break-words text-2xl font-bold tabular-nums">
          {money(cents)}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function Movements({ movements }: { movements: LinkedMovement[] }) {
  const money = useBankMoney();
  return movements.length ? (
    <ul
      className="max-h-[32rem] space-y-3 overflow-y-auto"
      aria-label="Movimentações recebidas do banco"
    >
      {movements.map((m) => (
        <li key={m.key} className="min-w-0 rounded-xl border p-4">
          <p className="break-words font-medium">{m.description}</p>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {m.bank} · {m.accountName} ·{' '}
            {m.date?.slice(0, 10).split('-').reverse().join('/')} ·{' '}
            {m.type === 'CREDIT'
              ? 'Entrada'
              : m.type === 'DEBIT'
                ? 'Saída'
                : 'Tipo não informado'}{' '}
            ·{' '}
            {m.status === 'POSTED'
              ? 'Consolidada'
              : m.status === 'PENDING'
                ? 'Pendente'
                : 'Status não informado'}
          </p>
          <p className="mt-2 break-words font-semibold tabular-nums">
            {money(m.amountCents, m.currency)}
          </p>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">
      Nenhum registro disponibilizado para este filtro. Isso não confirma
      ausência de gastos no banco.
    </p>
  );
}

export function BankActivityPanel({
  month,
  onMonth,
}: {
  month: string;
  onMonth: (month: string) => void;
}) {
  const { data } = useBankConnectionsState();
  const [selected, setSelected] = useState('bank');
  const snapshot = data?.enabled ? data.snapshot : null;
  const accounts = snapshot ? bankAccounts(snapshot) : [];
  const account =
    selected === 'bank' || accounts.some((a) => a.id === selected)
      ? selected
      : 'bank';
  const movements = snapshot ? bankMovements(snapshot, month, account) : [];
  const totals = movementSampleTotals(movements);
  return (
    <BankSection title="Gastos e movimentações dos bancos">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="bank-activity-month">Mês do extrato bancário</Label>
          <Input
            id="bank-activity-month"
            type="month"
            value={month}
            onChange={(e) => {
              if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))
                onMonth(e.target.value);
            }}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="bank-activity-account">
            Conta do extrato bancário
          </Label>
          <NativeSelect
            id="bank-activity-account"
            value={account}
            onChange={(e) => setSelected(e.target.value)}
          >
            <NativeSelectOption value="bank">
              Todas as contas bancárias (sem cartões)
            </NativeSelectOption>
            {accounts.map((a) => (
              <NativeSelectOption key={a.id} value={a.id}>
                {a.bank} · {a.name}
                {a.type === 'CREDIT' ? ' (cartão)' : ''}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Resumo dos registros carregados, não um total mensal definitivo. Extrato
        limitado a até 100 movimentações por conta e aos últimos 90 dias.
        Transferências próprias, pagamentos de faturas e empréstimos podem
        aparecer aqui; não são classificados como receitas/despesas.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Metric
          title="Entradas no extrato carregado"
          cents={movements.length ? totals.entriesCents : null}
          detail="Só registros consolidados deste filtro. Pode incluir transferências."
        />
        <Metric
          title="Saídas no extrato carregado"
          cents={movements.length ? totals.exitsCents : null}
          detail="Só registros consolidados deste filtro. Não somar novamente às compras de cartão."
        />
      </div>
      {(totals.pendingCount > 0 || totals.unknownCount > 0) && (
        <p className="text-xs text-muted-foreground">
          Há registros pendentes ou de tipo não informado, excluídos dos dois
          resumos.
        </p>
      )}
      <Movements movements={movements} />
    </BankSection>
  );
}

export function BankInvestmentsPanel() {
  const { data } = useBankConnectionsState();
  const money = useBankMoney();
  const positions = data?.enabled ? bankPositions(data.snapshot) : [];
  const total = data?.enabled
    ? bankOverviewTotals(data.snapshot).investmentsCents
    : null;
  return (
    <BankSection title="Investimentos informados pelos bancos">
      <Metric
        title="Posições ativas disponíveis em reais"
        cents={total}
        detail="Soma das posições ativas recebidas, separada do saldo bancário e da carteira manual. Não representa rendimento diário."
      />
      <p className="text-sm text-muted-foreground">
        O banco pode não disponibilizar todas as posições, taxas, quantidades ou
        histórico de preços. Nenhum rendimento, cotação ou gráfico temporal é
        estimado como se viesse do banco.
      </p>
      {positions.length ? (
        <ul
          className="grid gap-4 sm:grid-cols-2"
          aria-label="Posições recebidas dos bancos"
        >
          {positions.map((p) => (
            <li key={p.id} className="min-w-0 rounded-xl border p-4">
              <h2 className="break-words font-semibold">{p.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {p.bank} · {p.status === 'ACTIVE' ? 'Ativo' : p.status}
              </p>
              <p className="mt-3 break-words text-xl font-bold tabular-nums">
                {money(p.balanceCents, p.currency)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhuma posição disponibilizada pelos bancos. Sua carteira manual
          continua em Registros manuais.
        </p>
      )}
    </BankSection>
  );
}

export function BankCardsPanel() {
  const { data } = useBankConnectionsState();
  const money = useBankMoney();
  const [selected, setSelected] = useState('');
  const [month, setMonth] = useState(currentMonthInBrazil);
  const snapshot = data?.enabled ? data.snapshot : null;
  const cards = snapshot
    ? bankAccounts(snapshot).filter((a) => a.type === 'CREDIT')
    : [];
  const card = cards.find((c) => c.id === selected) ?? cards[0];
  const movements =
    card && snapshot ? bankMovements(snapshot, month, card.id) : [];
  return (
    <BankSection title="Cartões informados pelos bancos">
      {card ? (
        <>
          <div className="flex flex-wrap gap-4">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="bank-card">Cartão do banco</Label>
              <NativeSelect
                id="bank-card"
                value={card.id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {cards.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.bank} · {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank-card-month">
                Mês das movimentações do cartão
              </Label>
              <Input
                id="bank-card-month"
                type="month"
                value={month}
                onChange={(e) => {
                  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))
                    setMonth(e.target.value);
                }}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric
              title="Limite total informado"
              cents={card.currency === 'BRL' ? card.limitCents : null}
              detail="Valor recebido do banco; não é saldo disponível em conta."
            />
            <Metric
              title="Limite disponível informado"
              cents={card.currency === 'BRL' ? card.availableLimitCents : null}
              detail="Calculado pelo banco, sem subtrair lançamentos manuais."
            />
            <Metric
              title="Saldo do cartão informado"
              cents={card.currency === 'BRL' ? card.balanceCents : null}
              detail="Não é confirmação do valor de uma fatura histórica selecionada."
            />
          </div>
          <p className="text-sm">
            Vencimento informado:{' '}
            {card.dueDate
              ? card.dueDate.slice(0, 10).split('-').reverse().join('/')
              : 'Não informado'}{' '}
            · Moeda: {card.currency}.
          </p>
          {card.currency !== 'BRL' && (
            <p className="text-sm">
              Saldo na moeda original: {money(card.balanceCents, card.currency)}
              . Não convertemos moedas automaticamente.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            O mês filtra as movimentações recebidas, não muda os limites atuais
            nem reconstrói uma fatura oficial. Fechamento, parcelas futuras e
            histórico de faturas não são inferidos do extrato parcial. Até 100
            registros por cartão, últimos 90 dias. Nenhum pagamento é realizado
            aqui.
          </p>
          <Movements movements={movements} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhum cartão disponibilizado pelos bancos. Os cartões cadastrados
          manualmente continuam em Registros manuais.
        </p>
      )}
    </BankSection>
  );
}

export function BankDashboardPanel({
  onNavigate,
}: {
  onNavigate: (area: string) => void;
}) {
  const { data } = useBankConnectionsState();
  const totals = data?.enabled ? bankOverviewTotals(data.snapshot) : null;
  return (
    <BankSection title="Visão geral dos bancos">
      <div className="grid gap-4 sm:grid-cols-2">
        <Metric
          title="Investimentos ativos disponibilizados"
          cents={totals?.investmentsCents ?? null}
          detail="Posições recebidas; não somadas ao saldo das contas para evitar sobreposição."
        />
        <Metric
          title="Saldo informado dos cartões"
          cents={totals?.cardBalanceCents ?? null}
          detail="Saldo recebido dos cartões; não descontado novamente das contas nem tratado como fatura histórica."
        />
      </div>
      <div
        className="flex flex-wrap gap-3"
        aria-label="Atalhos dos dados bancários"
      >
        <Button onClick={() => onNavigate('expenses')}>
          Ver extratos dos bancos
        </Button>
        <Button variant="outline" onClick={() => onNavigate('investments')}>
          Ver posições dos bancos
        </Button>
        <Button variant="outline" onClick={() => onNavigate('credit-cards')}>
          Ver cartões dos bancos
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Os mesmos dados da área Contas alimentam estas abas automaticamente.
        Seus orçamentos, reservas, recorrências e lançamentos anteriores
        continuam separados em Registros manuais.
      </p>
    </BankSection>
  );
}
