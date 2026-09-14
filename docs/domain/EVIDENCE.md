# Evidence Domain

> Metadados e princípio de organização expandidos na Task 03.5 — ver
> `docs/adr/ADR-0017-technical-model-domain.md` e
> `docs/product/ROADMAP_TASKS_V2.md` (Tasks 16–19).

## Tipos previstos

photo, document, signature, audio, video, measurement, location.

MVP: photo, document e assinatura simples quando necessária.

## Metadados

- `original_filename`, `relative_path` (estrutura de pastas é dado de primeira classe);
- `capture_time`, `import_time`;
- `position` (ordenação persistida);
- `folder`/`environment`;
- `included_in_report`;
- `caption`;
- `hash` (SHA-256);
- `original_object_key`, `derivative_object_keys` (versionados: thumbnail/preview/annotated);
- `deleted_state` (soft-delete/recuperável, não exclusão física imediata).

## Princípio de organização: controle humano, sem exceção

A ordenação, seleção e manipulação de evidências é **sempre uma operação
humana, determinística e auditável** no core. Nenhuma IA move, apaga,
renomeia ou classifica evidência automaticamente (ver Task 18 em
`docs/product/ROADMAP_TASKS_V2.md`). Uma futura funcionalidade assistiva só
pode **sugerir**, mediante confirmação humana explícita — nunca agir sozinha.

Requisitos obrigatórios de UX (Task 17/18): estrutura de pastas, ordenação
natural, seleção de primeira/última imagem, Shift+click, mover em lote,
incluir/excluir em lote, renomear em lote, exclusão com confirmação e
restauração quando aplicável.

## Invariants

- original preservado, nunca sobrescrito (nem pela anotação de imagem — Task 19);
- storage privado;
- acesso sempre autorizado;
- objeto disponível somente após finalize/validation;
- SHA-256 registrado para evidências que compõem documentos emitidos;
- derivados não substituem original;
- metadata/EXIF segue política explícita;
- toda reordenação, exclusão, restauração ou mudança de ambiente gera audit event.

## Status

pending_upload, quarantined, processing, available, rejected, deleted (soft).
