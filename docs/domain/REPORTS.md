# Reports Domain

## Separação

Inspection Template define coleta. Report Template define apresentação.

## Emissão

ReportVersion emitida contém:

- inspection snapshot;
- inspection template snapshot;
- report template snapshot;
- asset manifest;
- renderer version;
- PDF storage key;
- PDF SHA-256;
- timestamps/actor.

## Invariants

- issued é imutável;
- correção gera nova versão;
- renderer server-side;
- relatório histórico deve ser reproduzível/auditável a partir dos artefatos registrados.
