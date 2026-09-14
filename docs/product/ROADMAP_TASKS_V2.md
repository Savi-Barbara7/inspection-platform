# Roadmap de Tasks v2 — Task 03.5 em diante

> Substitui `FIRST_12_TASKS.md` a partir da Task 05. Tasks 00–04 já foram
> executadas e concluídas sob a numeração antiga — o novo Task 04
> (Organizations & Memberships) pede exatamente o que já foi entregue, então
> nenhuma delas precisa ser refeita. Ver `docs/adr/ADR-0017-technical-model-domain.md`
> para o motivo da revisão.
>
> **Atualização pós-Task 04:** o catálogo oficial da Fase 1 ficou definido em
> exatamente 14 modelos — ver `docs/product/technical-models/PHASE1_CATALOG.md`.
> O catálogo de 20+ modelos SST/industrial pesquisado antes (`CATALOG_V1.md`)
> vira `future_catalog`/`research_archive` e não dirige mais o MVP. O contrato
> visual do documento emitido está em `docs/product/PDF_OUTPUT_DESIGN_SPEC.md`.

Cada Task vira um PR pequeno/coerente. Não pular gates.

## Task 03.5 — Domain & Product Realignment

Objetivo: atualizar documentação/ADRs para Technical Models + Organization Models + TechnicalJob + ReportVersion.

Entregar: domínio, glossário, provenance, requirement levels, controlled block DSL, atualização de TECHNICAL_SPEC/ROADMAP.

Não entregar: migrations, UI ou infra.

Gate: arquitetura aprovada.

## Task 04 — Organizations & Memberships ✅ concluída

Entregar: organizations, memberships, RLS, owner inicial, fixtures Org A/B, cross-tenant suite.

Gate: Tenant B não lê/altera/infere dados de A.

## Task 05 — Capability Authorization ✅ concluída (+ Task 05.1 hardening)

Entregar: capability registry, `authorize()` central, roles e testes.

Capabilities iniciais: `organization.members.manage`, `organization.settings.manage`, `technical_model.read`, `organization_model.create/customize/publish`, `job.create/assign/edit/review/approve`, `evidence.upload/organize/delete`, `report.render/issue/supersede`, `signature.request`, `billing.manage`, `audit.read`.

Gate: nada crítico depende de role checks espalhados na UI.

Task 05.1 (pós-revisão de segurança): fechou escalada de privilégio em `organization_memberships`, protegeu colunas internas de `organizations` via RPC (`update_organization_settings`), validação de UUID nas rotas, higiene de grants (`EXECUTE` de `anon` revogado em toda RPC exposta — ver docs/security/AUTHORIZATION.md).

## Task 06 — Audit Baseline ✅ concluída

Entregar: `audit_events` append-only, `AuditService`, request_id, actor, resource, payload redigido, eventos administrativos.

Entregue: tabela `audit_events` + RLS + `record_audit_event()` (RPC, actor sempre derivado de `auth.uid()`), port `AuditService` em `packages/domain/src/audit`, adapter Supabase, rota `GET /api/v1/organizations/:id/audit-events` (capability `audit.read`, owner/admin). Instrumentado em `organization.created`/`organization.updated` (fluxos reais já existentes) como prova do núcleo — demais categorias (membership, model, job, evidence, review, signature, report, overrides) reusam o mesmo core quando suas tasks chegarem. Ver `docs/domain/AUDIT.md`.

Gate: ações críticas auditáveis sem vazar dados sensíveis.

## Task 07 — Customers / Sites / Assets ✅ concluída

Entregar: customers, contacts, sites, assets, RLS, CRUD mínima, autorização.

Regra: não criar tabelas core como `obra`, `apartamento`, `caldeira` ou `lindeiro`.

Entregue: `customers`/`sites`/`assets` (sem `contacts` -- fora de escopo, `email`/`phone` no customer bastam por ora), RLS com composite tenant-safe foreign keys (`sites.customer_id`, `assets.site_id`, `assets.parent_asset_id` nunca podem cruzar organização/site, mesmo com `organization_id` internamente consistente na linha filha), archive (sem hard delete), capabilities `customer/site/asset.read/manage`, API REST top-level (`organizationId` como query param, sem nested routes), busca via `ILIKE`, audit events (`created/updated/archived` para as três entidades). Ver `docs/domain/CUSTOMERS_SITES_ASSETS.md`.

Gate: mesma estrutura suporta múltiplas verticais.

## Task 08 — Technical Model Catalog

Entregar: `technical_models`, `technical_model_versions`, categorias, status, references, professional scope, fixtures. Fixtures iniciais devem cobrir alguns dos 14 modelos de `docs/product/technical-models/PHASE1_CATALOG.md` (não os 20+ de `CATALOG_V1.md`).

Gate: versão publicada imutável.

## Task 09 — Controlled Document Block Engine

Blocos: Cover, TOC, Text, TechnicalInformation, Table, ImportedTable, PhotoSection, DocumentAttachment, Findings, SignatureSection, Header, Footer, PageBreak.

Entregar: schema versionado, validator, stable IDs, ordering, nested sections controladas, stable serialization, testes.

Gate: sem código arbitrário; schemas inválidos rejeitados deterministicamente.

## Task 10 — Organization Model Customization

Entregar: `organization_models`/versions, provenance, text overrides, branding, esconder/adicionar/reordenar/duplicar seções e blocos, drag-and-drop, preview.

Gate: empresa nunca altera modelo-base.

## Task 11 — Requirement & Compatibility Guard

Entregar: requirement registry, required/recommended/optional, source reference, override reason, compatibility status.

Gate: remoção de requisito obrigatório nunca passa silenciosamente como compatível.

## Task 12 — Organization Model Publish & Immutability

Entregar: draft/publish, published immutable, clone-to-draft, diff, audit.

Gate: não existe API legítima de update em published.

## Task 13 — Technical Job Foundation

Entregar: `technical_jobs`, bindings customer/site/asset/model version, responsável, status, datas, snapshots, RLS.

Gate: todo trabalho aponta para versão reproduzível do modelo.

## Task 14 — Structured Job Runtime

Entregar: section state, structured values, completion, validation, revision optimistic concurrency, save/submit, state machine.

Gate: stale revision gera conflito.

## Task 15 — Evidence Foundation

Tipos MVP: photo, document, signature.

Entregar: `evidence`, `StorageProvider`, private storage, signed URLs curtas, MIME/magic/size checks, SHA-256, original preservado, derivados versionados.

Gate: tenant B nunca acessa evidência de A.

## Task 16 — Structured Folder Import

Entregar: import session, `relative_path`, folder hierarchy, filename, metadata, natural ordering, dry-run, preview da árvore, confirmação, resume.

Regra: estrutura de pastas é dado de primeira classe.

Gate: mesmo input → mesma estrutura e ordem.

## Task 17 — Photo Workspace

Entregar: árvore de ambientes/pastas, galeria, preview, seleção simples/múltipla, Shift+click, teclado, contagem por ambiente, include/exclude, mover, legenda, filtros, virtualização.

Gate: uso fluido com centenas/milhares de fotos.

## Task 18 — Evidence Ordering, Range Selection & Batch Operations

**Substitui integralmente qualquer proposta anterior de organização automática por IA.**

Objetivo: operações humanas, previsíveis, rápidas e auditáveis.

Entregar: preservar ordem original; natural sort; ordenar por captura/importação; reorder manual persistido; modo Selecionar intervalo; marcar primeira imagem; marcar última imagem; mostrar quantidade exata; excluir/restaurar intervalo; mover intervalo; incluir/excluir do laudo; alterar ambiente; aplicar/limpar legenda; renomear por padrão; tags; exportar seleção; confirmação destrutiva; soft-delete ou mecanismo recuperável; audit event.

Proibido: IA mover; IA apagar; IA renomear; IA classificar automaticamente no core.

Gate: operações determinísticas, auditáveis e reversíveis quando aplicável.

## Task 19 — Image Annotation

Entregar: seta, retângulo, círculo, texto, derivative anotado, original imutável.

Gate: original nunca é sobrescrito.

## Task 20 — Table Engine

Modos: sistema, Excel, CSV, documento externo.

Entregar: columns, rows, types, units, validation, source, import mapping, preview.

Gate: dados separados do PDF.

## Task 21 — Documents & Attachments

Suportar ART/RRT/TRT, plantas, certificados, ensaios, memoriais, relatórios.

Modos: referência, processo, listar, incorporar como anexo final.

Gate: original rastreável.

## Task 22 — Findings / Constatações

Entregar: title, description, severity, status, location/section/block, evidence, responsible, recommendation, due date.

Gate: bloco Findings usa a entidade sem duplicar dados.

## Task 23 — Structured Conclusion

Entregar: base text, variables, summaries, finding references, editor, snapshot.

Regra: IA futura só sugere; profissional aprova.

Gate: texto emitido = aprovado.

## Task 24 — Review & Approval

Estados: draft, in_progress, under_review, changes_requested, approved, ready_to_sign.

Comentários por section/block/field.

Gate: aprovação server-side auditável.

## Task 25 — Report Renderer v1

Entregar: HTML/CSS controlado, `PdfRenderer`, cover, TOC, header/footer, pagination, text, technical info, tables, photos, findings, signatures, refs/anexos, golden PDF tests. Seguir `docs/product/PDF_OUTPUT_DESIGN_SPEC.md`.

Gate: render reprodutível a partir do mesmo snapshot/renderer version.

## Task 26 — Organization Branding

Entregar: logo, razão social, nome, CNPJ, endereço, contatos, site, cores, registros profissionais, cabeçalho/rodapé/capa padrão.

Gate: configurar uma vez, reutilizar em todos os documentos.

## Task 27 — Full Report Preview

Entregar: preview A4, navegação por TOC, warnings, contagem de assets/fotos/tabelas, status de assinatura.

Gate: pendências visíveis antes da emissão.

## Task 28 — Signature Abstraction

Entregar: `SignatureProvider`, requests, assinatura capturada, identidade, timestamp, method/provider metadata.

Futuro: ICP-Brasil/provedores/gov.br após validação.

Gate: domínio não depende de fornecedor.

## Task 29 — Report Issuance

Fluxo: authorize → validate → freeze job/model/layout/assets → render → hash → persist → ReportVersion → audit.

Gate: emitido é imutável.

## Task 30 — Report Versions & Supersede

Entregar: v1/v2, motivo, supersedes, histórico, download, audit.

Gate: versão antiga não desaparece silenciosamente.

## Task 31 — Field App

Entregar: meus trabalhos, hoje/próximos, seções, campos, foto, finding, assinatura, progresso, submit.

Gate: técnico não usa painel administrativo para trabalhar em campo.

## Task 32 — Offline Sync

Entregar: local store, outbox, operation_id, device_id, base_revision, retries, pending uploads, conflicts, sync status.

Gate: offline não perde dados persistidos.

## Task 33 — Initial Technical Model Catalog

Fase 1 = os 14 modelos de `docs/product/technical-models/PHASE1_CATALOG.md` (não 15–20). Expansão para os modelos SST/industrial/ambiental de `CATALOG_V1.md` (`future_catalog`) só depois do MVP, guiada por uso real (Task 37).

Gate: cada modelo possui pesquisa, fontes, requirement registry e status.

## Task 34 — Technical Research Registry

Entregar: `reference_type`/name/version, locator, `checked_at`, requirement mapping, reviewer, review_status, restrictions.

Gate: requisito técnico importante é rastreável.

## Task 35 — Observability & Recovery

Entregar: structured logs, error tracking, request_id, jobs, PDF/storage/DB monitoring, backup verification, restore test, runbooks.

Gate: falhas importantes são detectáveis e investigáveis.

## Task 36 — Billing

Validar combinação: usuários + trabalhos/laudos + armazenamento + recursos.

Gate: negócio consulta entitlements, não nome de plano.

## Task 37 — Closed Pilot

3–5 organizações.

Medir: tempo primeiro laudo, organização de fotos, tempo total, retrabalho, erros, operações manuais, satisfação, storage, render time, suporte.

Gate: pós-MVP guiado por uso real.
