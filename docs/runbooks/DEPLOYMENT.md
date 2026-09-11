# Deployment Runbook

## Staging

Todo merge em main deve poder gerar deploy de staging após CI.

## Produção

Produção requer release/version tag e environment approval.

## Ordem geral

1. validar CI;
2. revisar migrations;
3. aplicar mudanças compatíveis;
4. deploy API/workers/web;
5. smoke tests;
6. observar métricas/erros;
7. executar backfill quando necessário;
8. confirmar health checks.

## Rollback

Preferir forward-fix quando migration não for reversível. Nunca aplicar rollback destrutivo de banco sem análise de dados.
