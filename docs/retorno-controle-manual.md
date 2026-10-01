# Retorno ao controle manual

A interface foi restaurada a partir de `e161f671afd659d3be0b678f4ea9886d58e492d6`, última versão anterior à integração bancária. Contas, metas, reservas, investimentos, cartões, simulações, IA, configurações e registros manuais continuam disponíveis.

Não há consulta automática a Inter, Mercado Pago ou MeuPluggy. Componentes, temporizadores e clientes bancários foram removidos. `/api/bank-connections` mantém somente uma resposta autenticada `{ enabled: false }`, sem acesso ao banco de dados, às credenciais ou ao provedor; isso também desativa a consulta em abas antigas ainda abertas.

A tabela `bank_connection_snapshots`, a migração `0006` e seu histórico permanecem para não desfazer uma migração já aplicada nem apagar dados. A tabela não é lida pela aplicação manual e não participa dos backups financeiros. Nenhuma tabela de transações, investimentos, contas ou metas foi alterada por esse retorno.

Credenciais existentes na configuração da hospedagem não são usadas. Autorizações no MeuPluggy e nos bancos não foram revogadas; esse procedimento é separado e cabe ao titular no fluxo oficial. A desativação no site não revoga o serviço externo.

Cotações públicas de mercado da carteira manual continuam sendo um recurso independente. Não são sincronização com contas bancárias.

As versões da integração permanecem recuperáveis no histórico do Git. Não houve reset, reescrita de histórico ou exclusão de registros financeiros.
