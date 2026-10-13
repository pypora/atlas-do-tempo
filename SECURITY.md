# Segurança

Para reportar uma vulnerabilidade, use a opção **Report a vulnerability** na aba Security do repositório, em vez de abrir uma issue pública. Não inclua tokens nem dados pessoais em relatórios públicos.

Em produção, execute a aplicação atrás de um proxy HTTPS que autentique usuários, remova qualquer cabeçalho `X-Homelab-Gateway` recebido do cliente e insira seu próprio valor secreto. Defina `GATEWAY_TOKEN_FILE` e `PUBLIC_ORIGIN`. O modo `ATLAS_ENV=development` desabilita essa barreira e serve apenas para acesso local.
