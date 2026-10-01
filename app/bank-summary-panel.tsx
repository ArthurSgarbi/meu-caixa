'use client';

import { Landmark, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { summarizeBanks } from '@/lib/bank-summary';
import { useBankConnectionsState } from '@/hooks/use-bank-connections';
import { useMoneyFormatter } from './preferences-provider';
import { BankScopeTabs } from './bank-scope-tabs';
import { bankDisplayName } from '@/lib/bank-views';

function timestamp(value: string | null) {
  return value
    ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : 'Não informado';
}

export function BankSummaryPanel({ onAccounts }: { onAccounts: () => void }) {
  const { data, loading, error, reload, bankId, connections } =
    useBankConnectionsState();
  const money = useMoneyFormatter();
  if (data && !data.enabled) return null;
  const snapshot = data?.enabled ? data.snapshot : null;
  const summary = snapshot ? summarizeBanks(snapshot) : null;
  return (
    <section
      className="mx-auto w-full max-w-7xl px-5 pt-6 sm:px-8 lg:px-10"
      aria-label="Saldo automático dos bancos"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Landmark className="size-5" aria-hidden="true" />
              {bankId === 'all'
                ? 'Saldo total nos bancos'
                : `Saldo no ${bankDisplayName(connections.find((c) => c.id === bankId)?.name ?? 'banco selecionado')}`}
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onAccounts}>
                Ver bancos
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => void reload()}
                aria-label="Atualizar saldo dos bancos"
              >
                <RefreshCw
                  className={loading ? 'size-4 animate-spin' : 'size-4'}
                  aria-hidden="true"
                />
                {loading ? 'Consultando…' : 'Consultar agora'}
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Saldo bancário automático em reais · somente contas, sem limite de
            cartão, investimentos ou registros manuais.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {snapshot && <BankScopeTabs />}
          <p
            className="break-words text-3xl font-bold tabular-nums"
            aria-live="polite"
          >
            {!loading &&
            !error &&
            summary?.balanceCents !== null &&
            summary?.balanceCents !== undefined
              ? money(summary.balanceCents)
              : '—'}
          </p>
          {loading && (
            <output className="block text-sm text-muted-foreground">
              Consultando automaticamente os bancos autorizados…
            </output>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error} O saldo total está indisponível; seus registros manuais
              não o substituem.
            </p>
          )}
          {summary && !loading && !error && snapshot && (
            <>
              {summary.incomplete && (
                <p role="alert" className="text-sm text-destructive">
                  Saldo total indisponível: há conexão, conta, moeda ou saldo
                  não disponível. Confira os bancos abaixo; valores parciais não
                  são um total.
                </p>
              )}
              {summary.stale && (
                <output className="block text-sm text-muted-foreground">
                  Há banco sem atualização recente. Os saldos abaixo
                  correspondem à última informação recebida, não ao instante
                  atual.
                </output>
              )}
              <ul className="grid gap-3 sm:grid-cols-2">
                {summary.rows.map((row) => (
                  <li key={row.id} className="min-w-0 rounded-xl border p-3">
                    <p className="break-words text-sm font-medium">
                      {row.bank}
                      {row.bank !== row.name ? ` · ${row.name}` : ''}
                    </p>
                    <p className="mt-1 break-words text-xl font-semibold tabular-nums">
                      {row.cents === null
                        ? 'Não disponível em BRL'
                        : money(row.cents)}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Consulta ao provedor: {timestamp(summary.checkedAt)} (Brasília).
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {snapshot.connections.map((connection) => (
                  <li key={connection.id}>
                    {connection.name}: dados bancários de{' '}
                    {timestamp(connection.lastUpdatedAt)}
                    {connection.status !== 'UPDATED'
                      ? ' · autorização precisa de atenção'
                      : ''}
                    .
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Consulta automática ao abrir o site, ao voltar à aba e a cada 15
            minutos com a página visível. O MeuPluggy gratuito sincroniza os
            bancos a cada 24 horas; consultar novamente não força atualização
            bancária. Transferências e extratos parciais não são tratados
            automaticamente como receitas ou despesas.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
