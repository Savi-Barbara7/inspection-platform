# Offline Sync Failure Runbook

## Categorias

- auth expired;
- revision conflict;
- duplicate operation;
- failed media upload;
- server validation error;
- schema/template incompatibility.

## Regras

- operações usam `operation_id` único;
- retry não pode duplicar mutation;
- conflito de revision não é resolvido silenciosamente para comandos críticos;
- mídia pode retentar independentemente de respostas;
- logs devem identificar device/operation sem conter payload sensível integral.
