# Consulta bancária pessoal (MeuPluggy)

## Escopo e proteção

- Consulta de saldos, dados básicos dos cartões, posições e movimentações recentes.
- Apenas o usuário Clerk indicado em `PLUGGY_OWNER_ID` pode consultar os itens definidos no servidor. Outros usuários não recebem dados nem provocam chamadas à Pluggy.
- Somente proxy pessoal MeuPluggy, conector **200**. Não cria itens, pagamentos, Pix, transferências ou sincronizações forçadas.
- Não consulta identidade, CPF, credenciais bancárias ou números completos de contas/cartões.
- Estes dados ficam separados do livro-caixa manual. Não há importação automática de receitas/despesas nem soma entre saldos bancários e saldos manuais.
- Movimentações: janela de 90 dias, até 100 exibidas por conta; lista marcada como parcial quando necessário. Não serve para calcular receita/despesa total.
- Credenciais somente no servidor; nenhuma variável `NEXT_PUBLIC_*` para Pluggy. Não colocar valores no Git, prints, logs ou mensagens.

## Configuração

1. Autorizar os itens do Inter e Mercado Pago no MeuPluggy usando a aplicação Pluggy correspondente. As autorizações são feitas pelo titular no fluxo oficial.
2. Obter Client ID e Client Secret dessa aplicação e IDs dos **itens proxy**, não os itens originais do MeuPluggy.
3. Configurar de forma privada na Vercel (Production): `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_OWNER_ID` (ID exato do usuário Clerk) e `PLUGGY_ITEM_IDS` (UUIDs separados por vírgula, até cinco). Para desenvolvimento, usar apenas `.env.local`, ignorado pelo Git.
4. Aplicar a migração aditiva gerada para `bank_connection_snapshots`. Não altera tabelas financeiras existentes.
5. Publicar e testar com a conta titular e com uma segunda conta, verificando isolamento. Não contratar plano pago para executar esse roteiro.

## Atualização e retenção

O painel consulta ao abrir a área Contas, ao retornar à aba e a cada 15 minutos enquanto visível. O servidor mantém cache por 15 minutos; a frequência real de sincronização bancária depende do MeuPluggy. Não é saldo em tempo real.

Após o cache expirar, o servidor verifica os itens. Se `lastUpdatedAt` não mudou, reaproveita movimentações, conforme a recomendação da API; se mudou, busca nova cópia de consulta. A API de transações usada é `/v2/transactions`.

Uma tabela guarda **a última cópia** por titular, sem acumular histórico de snapshots; não contém segredos e não participa dos backups manuais. Alterar credenciais/itens invalida o cache por hash. Erros de consulta ocultam os valores na interface, sem substituí-los por zeros. Autorizações revogadas/expiradas são ocultadas na próxima verificação (revogação pode levar até 15 minutos para ser detectada no cache).

Para desligar, remover as variáveis Pluggy da Vercel e republicar. Revogar também na origem (MeuPluggy/banco). Para apagar a cópia já armazenada, um administrador deve executar exclusão parametrizada por `owner_id` somente na tabela de snapshots. Não apaga seus lançamentos manuais.

## Referências oficiais

- [Guia da API pessoal](https://meu.pluggy.ai/api-guide)
- [Autenticação](https://docs.pluggy.ai/en/reference/auth/auth-create)
- [Transações por cursor](https://docs.pluggy.ai/en/reference/transaction/transactions-list-by-cursor)
