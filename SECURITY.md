# Política de segurança

## Relato responsável

Não publique vulnerabilidades em uma issue pública. Envie o relato diretamente ao proprietário do repositório pelo canal privado disponibilizado no perfil do GitHub.

## Práticas adotadas

- autenticação e sessões delegadas ao Clerk;
- isolamento de registros por `owner_id` verificado no servidor;
- valores monetários armazenados como inteiros em centavos;
- consultas parametrizadas contra injeção de SQL;
- segredos fora do Git e das respostas do navegador;
- cabeçalhos de proteção para conteúdo, enquadramento e permissões;
- chave da OpenAI acessível somente nas rotas do servidor;
- histórico de migrações versionado e auditável.

## Segredos comprometidos

Se qualquer chave for exposta, revogue-a imediatamente no provedor, gere outra e atualize apenas as variáveis de ambiente da Vercel e o `.env.local`.
