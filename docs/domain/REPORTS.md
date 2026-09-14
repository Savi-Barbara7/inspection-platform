# Reports Domain

> Realinhado na Task 03.5 — ver `docs/adr/ADR-0017-technical-model-domain.md`.

## Separação

Não existe mais um `ReportTemplate` separado do template de coleta. A
`OrganizationModelVersion` (ver `docs/domain/TEMPLATES.md`) já define, por
seção/bloco, tanto o que é coletado quanto como é apresentado. `TechnicalJob`
é a execução concreta; `Report`/`ReportVersion` é o documento emitido a
partir dela.

## Emissão

Emitir um `ReportVersion` significa congelar:

- `technical_job` snapshot (respostas/dados estruturados);
- `organization_model_version` snapshot (estrutura, textos, branding);
- `technical_model_version` de origem (provenance);
- asset manifest (evidências, tabelas, documentos anexos referenciados);
- findings e conclusão estruturada;
- assinaturas;
- renderer version.

O `ReportVersion` emitido contém:

- todos os snapshots acima;
- PDF storage key;
- PDF SHA-256;
- timestamps/actor.

## Invariants

- issued é imutável;
- correção gera nova versão (supersede), nunca sobrescrita silenciosa;
- renderer server-side;
- relatório histórico deve ser reproduzível/auditável a partir dos artefatos registrados, mesmo que o `OrganizationModel` evolua depois.
