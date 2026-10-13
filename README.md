# Atlas do Tempo

Uma linha do tempo proporcional dos 4,54 bilhões de anos da Terra. Cada acontecimento tem um documento com texto e imagens, pode apontar para outros documentos e aparece na busca. A interface usa o design system [AURA](https://github.com/pypora/aura).

## Executar localmente

Requer Docker com Compose. Execute:

```sh
docker compose up --build
```

Acesse <http://127.0.0.1:8084/>. O Compose sobe uma instância PostgreSQL 17 e ativa o modo de desenvolvimento, acessível apenas no loopback do computador. O volume `postgres_data` conserva os registros entre reinícios. Para apagar **somente os dados locais de desenvolvimento**, execute `docker compose down -v`.

## Arquitetura

- `public/`: interface sem framework, com linha do tempo, editor e AURA.
- `atlas/api.py`: rotas HTTP, proteção de origem e cabeçalho do gateway.
- `atlas/schemas.py`: validação de entradas e conversão de datas.
- `atlas/documents.py`: sanitização do HTML e texto para busca.
- `atlas/repository.py`: consultas e transações de documentos e relações.
- `atlas/database.py` e `migrations/`: pool PostgreSQL e migrações versionadas.

Os documentos e relações ficam em tabelas separadas com chaves estrangeiras. A API usa transações explícitas e consultas parametrizadas. A busca ignora acentos e usa índice trigram. As migrações são executadas na inicialização com um bloqueio transacional, antes de aceitar tráfego. Os 15 exemplos são criados somente em banco novo e vazio.

## Configuração de produção

O exemplo em `compose.yaml` **não é uma configuração de produção**. Use PostgreSQL com usuário e banco dedicados, acesso limitado pela rede privada e backups periódicos. Configure:

| Variável | Uso |
| --- | --- |
| `DATABASE_URL_FILE` | Arquivo contendo a URL PostgreSQL com usuário de acesso mínimo. |
| `GATEWAY_TOKEN_FILE` | Arquivo contendo o token compartilhado com o proxy autenticador. |
| `PUBLIC_ORIGIN` | Origem HTTPS exata aceita para operações de escrita. |
| `ATLAS_ENV` | Omitida ou `production` para exigir as proteções. |

As variantes sem `_FILE` existem para desenvolvimento ou ambientes com gerenciador de segredos. O proxy deve remover cabeçalhos `X-Homelab-Gateway` vindos do cliente, autenticar a requisição e só então definir o cabeçalho com o token. A aplicação não implementa contas ou permissões por usuário; o controle de acesso é responsabilidade desse proxy. Restrinja o acesso direto à porta da aplicação.

Para backup, execute `pg_dump` regularmente e guarde cópias fora do host. Teste a restauração em um banco separado. O botão **Baixar cópia** exporta JSON de documentos, mas não substitui o backup do PostgreSQL.

## API

| Método e rota | Função |
| --- | --- |
| `GET /api/events` | Lista os documentos. |
| `GET /api/search?q=texto` | Busca título, resumo e documento. |
| `POST /api/events` | Cria um documento. |
| `PUT /api/events/{id}` | Atualiza um documento. |
| `DELETE /api/events/{id}` | Exclui um documento. |
| `GET /api/export` | Exporta no formato `atlas-do-tempo-v1`. |
| `POST /api/import` | Importa até 500 documentos. |
| `GET /health` | Verifica a conexão com o banco. |

As mutações recebem JSON. Cada documento recebe `title`, `summary`, `body` (HTML limitado), `era`, `dateMode` (`bp`, `bce`, `ce`), `dateValue` e `relatedIds`. A resposta inclui `bp`, `created_at`, `updated_at`, `relatedIds` e `referencedByIds`.

## Desenvolvimento e testes

```sh
python -m pip install -e '.[dev]'
ruff check .
docker compose exec db createdb -U atlas atlas_test
TEST_DATABASE_URL=postgresql://atlas:atlas-local-development@localhost:5433/atlas_test pytest
```

Use um banco **exclusivo para testes**: os testes de integração removem seus documentos. O pipeline CI sobe seu próprio PostgreSQL. Nunca aponte `TEST_DATABASE_URL` para produção.

## Licenças

O código do Atlas é MIT. A fonte Manrope distribuída em `public/assets/aura/fontes-aura/` usa a licença SIL Open Font License, incluída no diretório. O design system AURA é mantido em repositório próprio pela Pypora.
