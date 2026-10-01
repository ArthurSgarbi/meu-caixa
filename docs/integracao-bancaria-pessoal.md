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

O site consulta automaticamente após entrar, em qualquer área, ao retornar à aba, ao reconectar a internet e a cada 15 minutos enquanto visível. Uma consulta compartilhada alimenta o resumo e os detalhes em Contas, evitando timers duplicados. O servidor mantém cache por 15 minutos. O MeuPluggy gratuito sincroniza as conexões originais a cada 24 horas e reflete as atualizações nos proxies; estes não permitem atualização forçada. Não é saldo em tempo real. Com o site fechado, o MeuPluggy continua sua sincronização e a próxima abertura consulta a cópia disponível; não há cron ou novo plano contratado.

## Saldo automático principal

O card **Saldo total nos bancos** fica em destaque em todas as áreas. Soma somente contas de tipo `BANK`, moeda `BRL`, saldo válido em centavos e conexão autorizada. Cartões, limites de crédito, posições de investimentos e controles manuais ficam separados. Investimentos podem sobrepor saldos de contas e não são somados sem conciliação. Transferências internas não alteram o total dos saldos informados; nenhum cálculo de saldo usa o extrato limitado de 100 registros.

IDs de contas repetidos não contam duas vezes. Dados divergentes, conexão indisponível, moeda estrangeira, saldo ausente ou lista parcial impedem exibir um subtotal como total. O painel mostra os valores individuais disponíveis e o motivo da indisponibilidade. Datas de consulta e atualização de cada banco são distintas; dados de mais de 48 horas ou sem data recebem aviso. Não há zeros fictícios, nem fallback silencioso para contas manuais. A preferência de ocultar valores vale também para o resumo.

Receitas, despesas, reservas e projeções do livro-caixa continuam explicitamente manuais: um Pix recebido pode ser transferência própria ou empréstimo, e um extrato parcial não permite afirmar totais mensais exatos. A automação bancária não cria duplicatas nos lançamentos existentes.

Após o cache expirar, o servidor verifica os itens. Se `lastUpdatedAt` não mudou, reaproveita movimentações, conforme a recomendação da API; se mudou, busca nova cópia de consulta. A API de transações usada é `/v2/transactions`.

Uma tabela guarda **a última cópia** por titular, sem acumular histórico de snapshots; não contém segredos e não participa dos backups manuais. Alterar credenciais/itens invalida o cache por hash. Erros de consulta ocultam os valores na interface, sem substituí-los por zeros. Autorizações revogadas/expiradas são ocultadas na próxima verificação (revogação pode levar até 15 minutos para ser detectada no cache).

Para desligar, remover as variáveis Pluggy da Vercel e republicar. Revogar também na origem (MeuPluggy/banco). Para apagar a cópia já armazenada, um administrador deve executar exclusão parametrizada por `owner_id` somente na tabela de snapshots. Não apaga seus lançamentos manuais.

## Referências oficiais

- [Guia da API pessoal](https://meu.pluggy.ai/api-guide)
- [Atualização diária do MeuPluggy e limitações dos proxies](https://docs.pluggy.ai/pt/docs/connections/item)
- [Autenticação](https://docs.pluggy.ai/en/reference/auth/auth-create)
- [Transações por cursor](https://docs.pluggy.ai/en/reference/transaction/transactions-list-by-cursor)
