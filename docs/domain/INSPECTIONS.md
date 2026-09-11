# Inspections Domain

## Estados

draft, scheduled, assigned, in_progress, submitted, under_review, changes_requested, approved, cancelled, archived.

## Invariants

- transições são comandos de domínio;
- inspection referencia versão publicada de template;
- `revision` cresce em mudanças relevantes;
- update conflitante retorna 409;
- submit valida schema e obrigatoriedades;
- approve exige capability apropriada;
- emissão de report não modifica inspection silenciosamente.

## Response storage

`response_json` em JSONB é a estrutura dinâmica principal. Evidence, Findings, Approvals e outras entidades operacionais permanecem normalizadas.
