# PDF Failure Runbook

## Sinais

- job falhando repetidamente;
- Chromium crash;
- asset inacessível;
- timeout;
- fonte/layout inesperado;
- PDF incompleto.

## Diagnóstico

1. localizar `job_id`, `report_id`, `request_id`;
2. verificar render manifest;
3. validar assets e hashes;
4. reproduzir no renderer versionado;
5. não alterar ReportVersion emitida existente.

## Recuperação

Se ainda não emitido, corrigir e rerenderizar job. Se já emitido e houver erro material, criar processo de supersede/nova versão; não sobrescrever silenciosamente.
