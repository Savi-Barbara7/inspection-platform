# Backup & Restore Runbook

## Escopo

Backup deve cobrir separadamente:

- PostgreSQL;
- object storage;
- configuração crítica exportável;
- secrets por estratégia de secret manager, não por dump de texto.

## Teste de restore

Periodicamente restaurar em ambiente isolado e validar:

1. login;
2. organization/membership;
3. inspection;
4. evidence;
5. report histórico;
6. geração de novo report de teste;
7. integridade de hashes/links críticos.

## Critério

Backup não testado por restauração não deve ser tratado como garantia de recuperação.
