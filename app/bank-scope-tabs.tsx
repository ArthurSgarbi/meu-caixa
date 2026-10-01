'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useBankConnectionsState } from '@/hooks/use-bank-connections';
import { bankDisplayName } from '@/lib/bank-views';

/** A seleção é compartilhada por todas as áreas, sem repetir consultas à API. */
export function BankScopeTabs() {
  const { connections, bankId, setBankId } = useBankConnectionsState();
  const choices = [
    { id: 'all', name: 'Todos os bancos' },
    ...connections.map((connection) => ({
      id: connection.id,
      name: bankDisplayName(connection.name),
    })),
  ];
  // Uma conexão removida não vira silenciosamente a visão de todos os bancos.
  if (!choices.some((choice) => choice.id === bankId))
    choices.push({ id: bankId, name: 'Banco indisponível' });

  return (
    <Tabs value={bankId} onValueChange={(value) => setBankId(String(value))}>
      <TabsList
        aria-label="Visualização dos bancos"
        className="h-auto! max-w-full flex-wrap justify-start gap-1"
      >
        {choices.map((choice) => (
          <TabsTrigger
            key={choice.id}
            value={choice.id}
            className="h-auto min-h-9 flex-none whitespace-normal px-3 py-2 text-foreground data-active:bg-primary data-active:text-primary-foreground"
          >
            {choice.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {choices.map((choice) => (
        <TabsContent key={choice.id} value={choice.id}>
          <p className="text-xs text-muted-foreground">
            {choice.id === 'all'
              ? 'Dados dos bancos juntos. Selecione uma aba para ver apenas um banco.'
              : `Exibindo somente ${choice.name}. Selecione Todos os bancos para reunir os dados novamente.`}{' '}
            Este filtro vale para todas as áreas bancárias, sem alterar seus
            registros manuais.
          </p>
        </TabsContent>
      ))}
    </Tabs>
  );
}
