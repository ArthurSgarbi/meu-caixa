# Exportação e recuperação do Meu Caixa

## Backup do usuário

Na aba **Gastos → Seus dados e backup**, baixe o CSV para abrir as transações em planilhas ou o JSON para guardar uma cópia de todas as áreas financeiras da conta: transações, recorrências, orçamentos, carteira, aportes, ativos, simulações, cartões, faturas e compras.

O JSON inclui um SHA-256 para detectar corrupção acidental. Isso **não é uma assinatura digital**: quem altera o arquivo também pode recalcular o hash. Trate o arquivo como dado financeiro privado e guarde-o fora do repositório.

## Restauração pelo aplicativo

1. Entre na **mesma conta** que gerou o arquivo.
2. Escolha o JSON no campo de restauração. A prévia valida formato, titular, integridade, categorias, vínculos e colisões de IDs, sem gravar dados.
3. Confira quantos registros ausentes serão adicionados e confirme explicitamente.
4. O servidor insere apenas registros ausentes, em uma transação de banco. Dados existentes não são apagados nem sobrescritos. Depois, volte às áreas correspondentes e confira totais e vínculos.

Limite atual por operação: 2 MB e 2.000 registros. Se o backup ultrapassar esse limite, mantenha o arquivo e faça uma recuperação assistida; **não** divida manualmente o JSON, pois isso quebraria o checksum e as relações. Restaurar na mesma conta em um banco diferente pode encontrar IDs já ocupados por outros usuários; o processo para e não mescla dados de titulares diferentes.

## Desastre do banco Neon

O JSON é um backup portátil por conta. Não substitui a recuperação da instância PostgreSQL como um todo. Para incidentes no Neon:

1. Identifique o horário anterior ao incidente.
2. Crie uma **branch de recuperação** no painel Neon, sem apontar imediatamente o site de produção para ela.
3. Valide nessa branch a integridade das tabelas, contagem por `owner_id`, migrações e fluxos críticos em ambiente de teste.
4. Só então planeje a troca da conexão da Vercel ou a recuperação de registros específicos, mantendo uma cópia do estado atual para possível reversão.

### Ensaio isolado em 29/09/2026

O procedimento de recuperação pontual foi testado no projeto Neon `meu-caixa-db`, **sem restaurar nem escrever na branch `main`**:

1. Uma branch temporária foi criada a partir de um instante anterior da `main`.
2. As contagens foram comparadas por consultas somente leitura: 12 categorias e nenhum registro nas tabelas financeiras verificadas, tanto na origem quanto na cópia.
3. Uma tabela e um registro sintéticos foram criados **somente na branch temporária** para simular uma alteração indesejada.
4. A prévia histórica mostrou que a tabela sintética não existia no ponto escolhido. A restauração da branch temporária foi concluída e uma nova consulta confirmou que a tabela desapareceu, preservando as 12 categorias.
5. Uma consulta final na `main` confirmou que a tabela sintética nunca esteve lá. A branch restaurada e a cópia anterior gerada pelo Neon foram configuradas para expirar em 30/09/2026, por volta de 22h20 e 22h23 (horário de São Paulo), respectivamente.

O projeto estava com **retenção histórica de 6 horas** no momento do ensaio. Portanto, esse teste comprova a recuperação pontual de uma branch isolada dentro dessa janela, mas **não** uma restauração completa do site ou de dados financeiros reais: não havia registros financeiros nessas tabelas. Em um incidente real, confirme primeiro o horário recuperável, valide os dados e a aplicação na cópia e só depois decida como recuperar a produção.
