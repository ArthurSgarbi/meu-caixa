'use client';
import { useState } from 'react';
import { Landmark, RefreshCw, ShieldCheck } from 'lucide-react';
import { useBankConnectionsState } from '@/hooks/use-bank-connections';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { useMoneyFormatter, usePreferences } from './preferences-provider';

function date(value: string | null, calendarDay = false) {
  // Vencimentos e datas de lançamentos são dias civis, não instantes UTC.
  if (value && calendarDay)
    return value.slice(0, 10).split('-').reverse().join('/');
  return value
    ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : 'Não informado';
}

export function BankConnectionsPanel() {
  const { data, loading, error, reload } = useBankConnectionsState();
  const [selected, setSelected] = useState('');
  const money = useMoneyFormatter();
  const { preferences } = usePreferences();
  const snapshot = data?.enabled ? data.snapshot : null;
  const connection =
    snapshot?.connections.find((c) => c.id === selected) ??
    snapshot?.connections[0];
  const amount = (cents: number | null, currency: string) => {
    if (cents === null) return 'Não informado';
    if (currency === 'BRL') return money(cents);
    return preferences.hideBalances
      ? '••••••'
      : `${(cents / 100).toFixed(2)} ${currency}`;
  };
  return (
    <section
      className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8"
      aria-label="Consulta de bancos conectados"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Landmark className="size-5 shrink-0" /> Bancos conectados
            </CardTitle>
            <Button
              variant="outline"
              onClick={() => void reload()}
              disabled={loading}
              aria-label="Atualizar consulta dos bancos"
            >
              <RefreshCw
                className={loading ? 'size-4 animate-spin' : 'size-4'}
              />{' '}
              {loading ? 'Consultando…' : 'Atualizar consulta'}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Consulta somente leitura. Estes valores não são somados às contas e
            lançamentos manuais abaixo.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div aria-live="polite">
            {!data && loading && (
              <p className="text-sm text-muted-foreground">
                Consultando conexões autorizadas…
              </p>
            )}
            {data && !data.enabled && (
              <p className="text-sm text-muted-foreground">
                A consulta bancária pessoal ainda não está habilitada para esta
                conta.
              </p>
            )}
          </div>
          {snapshot && connection && !loading && (
            <>
              <div className="space-y-2">
                <Label htmlFor="bank-connection">
                  Banco / conexão autorizada
                </Label>
                <NativeSelect
                  id="bank-connection"
                  value={connection.id}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  {snapshot.connections.map((c) => (
                    <NativeSelectOption key={c.id} value={c.id}>
                      {c.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <p className="text-xs text-muted-foreground">
                Última consulta: {date(snapshot.checkedAt)}. Última atualização
                do banco: {date(connection.lastUpdatedAt)}. A frequência depende
                do MeuPluggy; não é saldo em tempo real.
              </p>
              {connection.status !== 'UPDATED' ? (
                <output className="block text-sm">
                  Esta conexão precisa de atualização ou nova autorização.
                  Confira no MeuPluggy; os dados ficam ocultos até a conexão
                  estar atualizada.
                </output>
              ) : (
                <>
                  {connection.partial && (
                    <p className="text-sm text-muted-foreground">
                      Algumas contas ou posições não foram carregadas. Esta
                      consulta pode estar incompleta.
                    </p>
                  )}
                  <div className="grid gap-4 md:grid-cols-2">
                    {connection.accounts.map((account) => (
                      <div
                        key={account.id}
                        className="min-w-0 rounded-xl border p-4"
                      >
                        <h3 className="break-words font-semibold">
                          {account.name}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {account.type === 'CREDIT'
                            ? 'Saldo informado do cartão'
                            : 'Saldo informado da conta'}
                        </p>
                        <p className="break-words text-xl font-semibold">
                          {amount(account.balanceCents, account.currency)}
                        </p>
                        {account.type === 'CREDIT' && (
                          <dl className="mt-3 space-y-1 text-sm">
                            <div>
                              <dt className="text-muted-foreground">
                                Limite total
                              </dt>
                              <dd>
                                {amount(account.limitCents, account.currency)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                Limite disponível
                              </dt>
                              <dd>
                                {amount(
                                  account.availableLimitCents,
                                  account.currency,
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                Vencimento informado
                              </dt>
                              <dd>{date(account.dueDate, true)}</dd>
                            </div>
                          </dl>
                        )}
                        <h4 className="mt-5 text-sm font-semibold">
                          Movimentações recentes (até 90 dias)
                        </h4>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Até 100 registros por conta. Entradas não são
                          necessariamente receitas; saídas podem ser
                          transferências.
                        </p>
                        {account.partialMovements && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Há mais movimentações no banco; esta lista é
                            parcial.
                          </p>
                        )}
                        <ul className="mt-3 max-h-72 space-y-3 overflow-y-auto">
                          {account.movements.map((m) => (
                            <li
                              key={m.id}
                              className="min-w-0 border-t pt-2 text-sm"
                            >
                              <p className="break-words">{m.description}</p>
                              <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                                <span>{date(m.date, true)}</span>
                                <span>
                                  {m.type === 'CREDIT'
                                    ? 'Entrada'
                                    : m.type === 'DEBIT'
                                      ? 'Saída'
                                      : 'Movimentação'}{' '}
                                  ·{' '}
                                  {m.status === 'PENDING'
                                    ? 'Pendente'
                                    : m.status === 'POSTED'
                                      ? 'Consolidada'
                                      : 'Status não informado'}
                                </span>
                              </div>
                              <p className="mt-1 font-medium">
                                {amount(m.amountCents, m.currency)}
                              </p>
                            </li>
                          ))}
                        </ul>
                        {!account.movements.length && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Nenhuma movimentação disponibilizada nesta consulta.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold">
                      Investimentos informados pelo banco
                    </h3>
                    {connection.investments.map((position) => (
                      <div
                        key={position.id}
                        className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"
                      >
                        <span className="min-w-0 break-words">
                          {position.name} ·{' '}
                          {position.status === 'ACTIVE'
                            ? 'Ativo'
                            : 'Status informado: ' + position.status}
                        </span>
                        <span>
                          {amount(position.balanceCents, position.currency)}
                        </span>
                      </div>
                    ))}
                    {!connection.investments.length && (
                      <p className="text-sm text-muted-foreground">
                        Nenhuma posição disponibilizada nesta conexão.
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          )}
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0" /> A integração não realiza
            Pix, pagamentos ou transferências. Gerencie ou revogue o
            compartilhamento no MeuPluggy e no seu banco.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
