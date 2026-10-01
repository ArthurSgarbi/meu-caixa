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

## Integração nas abas

O resumo principal oferece as abas **Todos os bancos** (padrão), **Inter** e **Mercado Pago**, conforme as conexões disponíveis. O filtro é compartilhado com Contas, Gastos, Investimentos, Cartões, Visão Geral e o botão de saldo em Simulações. A seleção não dispara outra consulta nem modifica os dados originais. Em Contas, a visão padrão reúne os detalhes de todas as conexões; escolher uma aba restringe a consulta visual a esse banco. O total considera somente saldos bancários válidos, sem somar limites de cartão ou posições sobrepostas. Banco removido, indisponível ou com consentimento expirado nunca vira automaticamente a seleção de todos, nem expõe dados antigos. A seleção pertence à sessão do usuário e não inclui dados bancários no armazenamento do navegador.

Para o titular com integração habilitada, **Visão Geral**, **Gastos**, **Investimentos** e **Cartões** abrem no modo **Dados dos bancos**. O seletor de origem é compartilhado; **Registros manuais** preserva as ferramentas anteriores, sem somar ou importar dados para o livro-caixa. Usuários sem integração continuam com o fluxo manual. Erros bancários nunca ativam silenciosamente a visualização manual como substituta.

- Gastos: extrato por mês civil e conta, com entradas/saídas dos registros consolidados carregados. O padrão exclui cartões, que podem ser selecionados separadamente. Datas ausentes e tipos/status desconhecidos não entram nos totais. Lista de até 100 registros por conta e janela de 90 dias: não é um relatório mensal completo, nem classificação automática de renda/despesa.
- Investimentos: posições informadas, status e saldo, com soma disponível das posições ativas em BRL. Não cria ativos na carteira manual nem inventa cotação, quantidade, CDI ou rendimento diário. Consulta parcial ou banco indisponível impede apresentar um total confiável.
- Cartões: seleção dos cartões recebidos, limite total/disponível, saldo e vencimento informado. O filtro mensal é de movimentações, não de faturas oficiais. Fechamento, parcelas futuras e histórico de faturas não são inferidos do extrato.
- Visão Geral: atalhos e resumos dos cartões/posições com a mesma fonte compartilhada da área Contas. O saldo de contas segue destacado no resumo principal, separado de dívidas e investimentos.
- Simulações: botão **Usar saldo dos bancos** preenche o valor inicial após ação do usuário, somente quando o total está disponível e não negativo. Não sobrescreve automaticamente cenários nem movimenta dinheiro.

Metas, reservas, orçamentos e análises da IA continuam vinculados ao livro-caixa manual. Compartilhar os extratos bancários com um provedor de IA exige um escopo específico e não faz parte desta integração de telas. Dados bancários não são enviados automaticamente ao provedor de IA.

Após o cache expirar, o servidor verifica os itens. Se `lastUpdatedAt` não mudou, reaproveita movimentações, conforme a recomendação da API; se mudou, busca nova cópia de consulta. A API de transações usada é `/v2/transactions`.

Uma tabela guarda **a última cópia** por titular, sem acumular histórico de snapshots; não contém segredos e não participa dos backups manuais. Alterar credenciais/itens invalida o cache por hash. Erros de consulta ocultam os valores na interface, sem substituí-los por zeros. Autorizações revogadas/expiradas são ocultadas na próxima verificação (revogação pode levar até 15 minutos para ser detectada no cache).

Para desligar, remover as variáveis Pluggy da Vercel e republicar. Revogar também na origem (MeuPluggy/banco). Para apagar a cópia já armazenada, um administrador deve executar exclusão parametrizada por `owner_id` somente na tabela de snapshots. Não apaga seus lançamentos manuais.

## Referências oficiais

- [Guia da API pessoal](https://meu.pluggy.ai/api-guide)
- [Atualização diária do MeuPluggy e limitações dos proxies](https://docs.pluggy.ai/pt/docs/connections/item)
- [Autenticação](https://docs.pluggy.ai/en/reference/auth/auth-create)
- [Transações por cursor](https://docs.pluggy.ai/en/reference/transaction/transactions-list-by-cursor)
