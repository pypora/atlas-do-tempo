# Contribuindo

1. Abra uma issue para mudanças grandes e descreva o comportamento esperado.
2. Execute `docker compose up --build` para desenvolver com PostgreSQL 17.
3. Instale as dependências de desenvolvimento com `python -m pip install -e '.[dev]'`.
4. Antes de enviar, execute `ruff check .` e `pytest` com `TEST_DATABASE_URL` apontando para um banco de testes PostgreSQL vazio.
5. Inclua migração SQL numerada para mudanças de esquema. Migrações já publicadas não devem ser editadas.
6. Inclua um teste que reproduza correções de erros de dados, permissões ou navegação.

Não inclua dumps de banco, tokens, senhas, documentos privados nem endereços da infraestrutura de produção em issues ou commits.
