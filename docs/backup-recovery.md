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

Esse ensaio de recuperação de infraestrutura depende das permissões e da retenção configuradas no projeto Neon. **Não foi executado contra o banco de produção nesta entrega.**
