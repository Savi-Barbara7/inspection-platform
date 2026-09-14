# Technical Jobs Domain

> Renomeado de "Inspections" na Task 03.5 (o nome genérico do trabalho agora
> é `TechnicalJob`) — ver `docs/adr/ADR-0017-technical-model-domain.md`.
> Implementação começa na Task 13 (`docs/product/ROADMAP_TASKS_V2.md`).

## Estados

draft, scheduled, assigned, in_progress, submitted, under_review, changes_requested, approved, cancelled, archived.

## Invariants

- transições são comandos de domínio;
- todo `TechnicalJob` referencia uma `OrganizationModelVersion` publicada específica (provenance reproduzível);
- `revision` cresce em mudanças relevantes;
- update conflitante retorna 409;
- submit valida schema e obrigatoriedades (ver requirement levels em `docs/domain/TEMPLATES.md`);
- approve exige capability apropriada;
- emissão de report não modifica o `TechnicalJob` silenciosamente.

## Response storage

`response_json` em JSONB é a estrutura dinâmica principal (valores por seção/bloco). Evidence, Findings, Approvals e outras entidades operacionais permanecem normalizadas.
