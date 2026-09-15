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

## Task 08 — Technical Model Catalog ✅ concluída

Entregar: `technical_models`, `technical_model_versions`, categorias, status, references, professional scope, fixtures. Fixtures iniciais devem cobrir alguns dos 14 modelos de `docs/product/technical-models/PHASE1_CATALOG.md` (não os 20+ de `CATALOG_V1.md`).

Gate: versão publicada imutável.

Entregue: os 14 modelos completos (não "alguns"), seed idempotente, `research_status` separado do `status` editorial (todos `DRAFT`/`published`, nenhum overclaim de `VERIFIED_REFERENCE_MODEL`), grants sem write path tenant-facing (`anon` sem grant, `authenticated` só `SELECT` via RLS), API read-only (`GET /technical-models`, `/:idOrSlug`, `/:idOrSlug/versions`, `/:idOrSlug/versions/:versionNumber`) sem depender de organização. Ver `docs/domain/TEMPLATES.md`.

## Task 09 — Controlled Document Block Engine ✅ concluída

Blocos: Cover, TOC, Text, TechnicalInformation, Table, ImportedTable, PhotoSection, DocumentAttachment, Findings, SignatureSection, Header, Footer, PageBreak.

Entregar: schema versionado, validator, stable IDs, ordering, nested sections controladas, stable serialization, testes.

Gate: sem código arbitrário; schemas inválidos rejeitados deterministicamente.

Entregue: `packages/domain/src/templates/blocks.ts` — engine 100% genérico (nenhuma lógica de modelo específico), 13 tipos de bloco como Zod discriminated union `.strict()` (campo desconhecido é rejeitado, não ignorado), `validateDocumentDefinition()` (forma + unicidade de id em toda a árvore + profundidade máxima), `generateSectionId()`/`generateBlockId()` (IDs estáveis), `reorder()` (sem mutação, IDs nunca mudam), `canonicalize()`/`serializeDefinitionCanonical()` (serialização estável). Sem tabela nova/persistência — isso é Task 10. 21 testes, incluindo uma estrutura realista de um dos 14 modelos da Fase 1. Ver `docs/domain/TEMPLATES.md`.

## Task 10 — Organization Model Customization ✅ concluída

Entregar: `organization_models`/versions, provenance, text overrides, branding, esconder/adicionar/reordenar/duplicar seções e blocos, drag-and-drop, preview.

Gate: empresa nunca altera modelo-base.

Entregue: `packages/domain/src/organization-models` (port) + `apps/api/src/organization-models` (rotas + adapter Supabase) + `20260914240000_organization_models.sql` (`organization_models`/`organization_model_versions`, RLS, FK composta tenant-safe, RPC `derive_organization_model` SECURITY DEFINER com grants corretos). Derivação sempre a partir de uma `TechnicalModelVersion` publicada, nunca em branco (por isso `technical_model_versions.definition` também foi populado nesta task para os 14 modelos da Fase 1 — `20260914230000_technical_model_version_definitions.sql`). Edição do rascunho via um único PATCH estruturado (`PATCH /:id/draft`), reaproveitando `validateDocumentDefinition()` da Task 09 sem redeclarar os 13 schemas de bloco na API. Nova capability `organization_model.read` (todo role exceto `billing_admin`); `create`/`customize`/`publish` continuam owner/admin/template_manager (Task 05). Correção adicional feita nesta task (achado pós-auditoria, sem abrir task separada): o DSL da Task 09 tinha dois campos ambíguos entre schema e dado real de trabalho — `TechnicalInformationField.value` e `Table`/`ImportedTable.rows` — renomeados para `defaultValue`/`sampleRows` (e `required` adicionado ao field) para deixar explícito que só carregam default/amostra de configuração, nunca uma resposta real de vistoria; ver `docs/domain/TEMPLATES.md` "Schema vs. dado real de trabalho". Testes: 29 asserções pgTAP (`organization_models_test.sql`) + 40 testes Vitest de API (`organization-models.test.ts`), cobrindo derivação, isolamento cross-tenant, matriz de capability, anon bloqueado, definição válida/inválida/campo desconhecido/id duplicado, catálogo global intacto, eventos de auditoria, RLS/grants. Verificado ponta a ponta via `wrangler dev` contra Supabase local real (signup, derivação, PATCH de rascunho com `defaultValue`/`sampleRows`, rejeição determinística do nome de campo antigo `value`).

## Task 11 — Requirement & Compatibility Guard ✅ concluída

Entregar: requirement registry, required/recommended/optional, source reference, override reason, compatibility status.

Gate: remoção de requisito obrigatório nunca passa silenciosamente como compatível.

Entregue: `packages/domain/src/templates/requirements.ts` (`Requirement`, `RequirementOverride`, `validateRequirements()`, `validateRequirementOverrides()`, `evaluateCompatibility()` — puro, sem I/O) + `20260915000000_requirement_compatibility_guard.sql` (`technical_model_versions.requirements`, `organization_model_versions.requirement_overrides`/`compatibility_status`/`compatibility_violations`, sem nova tabela/RLS/grant). `compatibilityStatus` é recalculado pela API a cada `PATCH /:id/draft` (nunca aceito como valor do cliente); vira `incompatible` se, e somente se, um requisito `required` perder cobertura sem um `requirementOverride` correspondente com motivo — `recommended`/`optional` nunca afetam o status. Override para um `requirementId` inexistente no registro da `TechnicalModelVersion` de origem é rejeitado com 422 (`UnknownRequirementIdError`), nunca ignorado silenciosamente. Nenhum dos 14 modelos da Fase 1 recebeu requisitos regulatórios reais (registry vazio, trivialmente compatível) — evita alegação de conformidade sem fonte/revisão, conforme já estabelecido para `research_status`. Risco residual aceito e documentado (mesma classe de `organizations.settings`/`sites.address`): a coluna `compatibility_status` não é recalculada por trigger no Postgres, só pela API — ver `docs/domain/TEMPLATES.md`. Testes: 15 testes Vitest de domínio (`requirements.test.ts`, incluindo o teste "THE GATE"), 6 testes Vitest de API cobrindo o fluxo completo (gate flipando para incompatible, override limpando a violação, requirementId desconhecido rejeitado, reason em branco rejeitado, campo desconhecido rejeitado), 11 asserções pgTAP (`requirement_compatibility_guard_test.sql`, cobrindo defaults, CHECK constraint, e o risco residual documentado como fato observado). Verificado ponta a ponta via `wrangler dev` contra Supabase local real (requisito fictício populado diretamente, remoção do bloco cobridor via PATCH flipando o status, override com motivo revertendo, requirementId desconhecido rejeitado com 422).

## Task 12 — Organization Model Publish & Immutability ✅ concluída

Entregar: draft/publish, published immutable, clone-to-draft, diff, audit.

Gate: não existe API legítima de update em published.

Entregue: `packages/domain/src/organization-models` (`publish()`, `getPublishedVersion()`, `OrganizationModelIncompatibleError`/`OrganizationModelVersionNotDraftError`/`OrganizationModelVersionConflictError`) + `apps/api/src/organization-models` (`POST /:id/publish`, `GET /:id/published`) + `20260915010000_organization_model_publish_immutability.sql`. `organization_models.current_published_version_id` é identidade explícita (nunca inferida por timestamp/version_number), com FK composta mesmo-modelo-seguro `(id, organization_model_id)` — mesma proteção retroativamente aplicada a `current_draft_version_id`. `publish_organization_model_version()` (RPC `SECURITY DEFINER`) congela o rascunho atômicamente (`status='published'`, `published_at`) e abre o próximo rascunho como cópia exata, com `version_number` sequencial (nunca timestamp). Compatibilidade nunca é confiada: `apps/api` recomputa `evaluateCompatibility()` (Task 11) a partir do rascunho recém-lido antes de sequer chamar a RPC; a RPC ainda rejeita (`55000` → 409) se a linha não estiver mais em `draft` (publish duplicado/retry nunca cria versão extra) e (`40001` → 409) se `updated_at` mudou entre a leitura da API e o lock da transação (edição concorrente invalidando a compatibilidade computada). Imutabilidade é reforçada por um trigger `BEFORE UPDATE` no Postgres (`prevent_published_organization_model_version_mutation`, compara a linha inteira via `jsonb` exceto `archived_at`/`updated_at`) — vale até para o owner/admin/template_manager da própria organização, não só "a UI não chama PATCH". Capability `organization_model.publish` reaproveitada tal como existia desde a Task 05, sem mudança de matriz. Testes: 25 asserções pgTAP (`organization_model_publish_test.sql` — ciclo completo v1→v2→v3, imutabilidade sob role normal, publish duplicado, conflito de concorrência, cross-tenant, FK composta mesmo-modelo) + 14 testes Vitest de API (capability matrix, gate de incompatibilidade, conflitos 409, leitura da versão publicada). Verificado ponta a ponta via `wrangler dev` contra Supabase local real (derivar → publicar v1 → editar v2 → publicar v2 → tentar UPDATE direto via psql na v1 publicada, bloqueado pelo trigger → remover cobertura de um requisito obrigatório no v3 → tentativa de publish bloqueada com 422).

Decisões de produto registradas nesta task (sem implementação — apenas roadmap/documentação, ver seções 20–23 da instrução original):

- **Catálogo de lançamento**: os 14 modelos de Fase 1/pesquisa (`docs/product/technical-models/PHASE1_CATALOG.md`) permanecem intactos no banco, sem reescrita da Task 08. O pacote comercial do MVP foi refinado para 4 modelos-base — Vistoria Cautelar de Vizinhança, Laudo de Entrega de Empreendimento, Laudo de Sinistro/Danos, Laudo de Transição de Construtora — mais 1 derivado (Comparativo/Revistoria, baseado em baseline anterior). Ativação final do launch pack é a Task 31. Os demais modelos ficam como catálogo futuro/research.
- **Padrão editorial único do MVP**: "Atlas Technical Classic", inspirado na formatação mais madura do Laudo Cautelar/Lindeiro já validada no LVL Pro — mesma gramática (capa, sumário, margens, hierarquia, títulos, paginação, tabelas, registro fotográfico, anexos, conclusão, responsabilidade, assinaturas) para todos os modelos, que diferem apenas por conteúdo/composição. Formalizado na Task 25; nenhum renderer implementado ainda.
- **Camada de gestão do trabalho técnico**: Atlas terá uma camada de overview/status/responsável/equipe/progresso/documentos/evidências/histórico/emissões — formalizada na Task 24, não implementada ainda.
- **Field app adiado**: nenhum PWA de campo/câmera/voice capture/offline/sync mobile nesta fase — consolidado em Task 36+, guiado por uso real pós-piloto. A arquitetura atual não deve ser desenhada em torno de UX mobile específica, mas também não deve criar impedimentos artificiais para esse suporte futuro.

## Task 13 — Typed Data Sources, Roles & Bindings ✅ concluída

Entregar: tipos de dado versionados por campo/tabela, roles de vínculo (customer/site/asset/professional), bindings tipados entre `OrganizationModelVersion` e as entidades reais que um job vai referenciar.

Gate: um binding nunca aponta para uma entidade de outra organização (FK composta tenant-safe, mesmo padrão já usado em customers/sites/assets e organization-models).

Entregue: `packages/domain/src/data-sources` (novo, puro, sem I/O) — `SourceType` (Organization/Customer/Site/Project/TechnicalProfessional/TechnicalJob/InspectionEvent/GroupItem/CustomData), `FIELD_DEFINITIONS` (catálogo global de campos por fonte), `SourceRoleId`/`SOURCE_ROLES` (papel ≠ tipo de fonte; cardinalidade `single`/`multiple` declarada explicitamente, nunca "pega o primeiro encontrado"), `BindingScope` (`role`/`currentGroupItem`/`ancestorGroupItem`/`job`/`inspectionEvent` — nunca índice de array), `DataBinding` (`.strict()`, sem nenhum campo que possa carregar um id de entidade real), `FIELD_FORMATS` com checagem de compatibilidade por tipo semântico, `validateDataBinding()`/`validateDataBindingsInDefinition()`, `getDataSourceCatalog()`/`getSourceRoleCatalog()`. O gate original previa uma FK composta tenant-safe; a modelagem que emergiu é estruturalmente mais forte — um `DataBinding` nunca contém id de entidade nenhum (nem da própria organização, nem de outra), então não existe FK para proteger porque não existe o próprio ponteiro. `TechnicalInformationField` (Task 09) ganhou `bindingId`/`format` opcionais (mudança mínima, lógica de `validateDocumentDefinition()` inalterada); `DocumentDefinition` ganhou `dataBindings?: DataBinding[]` opcional. **Nenhuma migration nova** — bindings vivem dentro do `definition jsonb` já existente desde a Task 08/10, então a imutabilidade da Task 12 já os protege automaticamente. Nova rota `GET /api/v1/data-sources` (catálogo, `requireAuth` apenas, sem organizationId). `PATCH /:id/draft` (Task 10/11) passou a também chamar `validateDataBindingsInDefinition()`. Testes: 29 Vitest de domínio (`data-sources.test.ts`, incluindo o teste arquitetural que faz grep do próprio arquivo-fonte por nomes de vertical) + 8 Vitest de API (catálogo + bindings no draft PATCH). Verificado ponta a ponta via `wrangler dev`: catálogo real via HTTP, o mesmo payload JSON de "Informações do Contratante" (`Customer.legalName/taxId/primaryAddress`) aplicado sem nenhuma diferença de código a duas organizações distintas, `outgoingContractor`/`incomingContractor` (caso da Transição de Construtora) resolvendo ao mesmo `SourceType`, e as duas rejeições estruturais (role inexistente, id de entidade real smuggled) retornando 422 determinístico.

## Task 14 — Job Runtime Values, Provenance & Overrides ✅ concluída

Entregar: o contrato de "valor real preenchido durante um job" — distinto e nunca gravado em `OrganizationModelVersion.definition` (ver Task 10 "Schema vs. dado real de trabalho"). Provenance (qual definition/version originou o valor) e overrides em nível de runtime (não confundir com `requirement_overrides` da Task 11, que é sobre a definição, não sobre um job específico).

Gate: dado de trabalho real nunca é gravado em uma tabela de definição/template.

Entregue: `packages/domain/src/job-runtime-values` (motor puro — `ResolvedValue`/`Provenance`/`RuntimeValueContext`/`JobRuntimeValue`, `validateScalarValue()`, `setOverride()`/`removeOverride()`/`refreshCapturedValue()`/`compareWithCurrentSource()`) + `packages/domain/src/technical-jobs` (placeholder deliberadamente mínimo, não a Task 15 real) + `20260915020000_job_runtime_values_foundation.sql` (`technical_jobs`, `job_runtime_values`, FK composta tenant-safe real para `source_customer_id`/`source_site_id` — as duas únicas fontes com tabela própria hoje — lacuna documentada para as demais). `effectiveValue` é sempre `override?.value ?? capturedValue`, nunca `||`; `missing`/`not_applicable`/`resolved`/`invalid` são estados explícitos, `false`/`0`/`""` sempre preservados. Override nunca destrói a captura original; refresh é sempre uma ação explícita (nunca automático) e preserva um override ativo intacto. `fieldType` é snapshotado no momento da captura (nunca depende do catálogo atual). API mínima: `POST /technical-jobs` (âncora a uma versão publicada, nunca o draft — reaproveita `job.create`), `POST/GET/PATCH .../job-runtime-values` (capture/override/remove-override/refresh/compare, reaproveitando `job.edit` — nenhuma capability nova). Testes: 21 Vitest de domínio (incluindo o cenário obrigatório completo A→B→override X→refresh→remove) + 27 Vitest de API + 19 pgTAP (cross-tenant real via FK, unicidade `(technical_job_id, binding_id, context_key)`, CHECK de exclusividade mútua, DELETE revogado, `job.edit` incluindo inspector). Verificado ponta a ponta via `wrangler dev` com dados reais: Customer real criado, capturado, cadastro alterado via API real, compare detectando a diferença, override, refresh preservando o override, remoção do override, e rejeição 422 de uma tentativa de provenance cross-tenant contra um Customer de outra organização.

## Task 15 — Technical Job Foundation & Runtime Document Tree ✅ concluída

Entregar: `technical_jobs`, bindings customer/site/asset/model version (usando a Task 13), responsável, status, datas, snapshot da `OrganizationModelVersion` publicada usada, árvore de documento em runtime (instância navegável da `DocumentDefinition` publicada, preenchível), RLS.

Gate: todo trabalho aponta para uma versão publicada e imutável do modelo (nunca um draft).

Entregue: `TechnicalJob` (Task 14 placeholder → entidade real: `name`/`status` draft-active-archived/`createdBy`/`responsibleProfessionalId`) + `packages/domain/src/job-source-assignments` (`JobSourceAssignment`, `validateSourceAssignments()` — cardinalidade single/multiple declarada em `SOURCE_ROLES`, Task 13, nunca "pega o primeiro") + `packages/domain/src/runtime-document-tree` (motor puro — `buildMaterializationPlan()`/`buildGroupItemMaterializationPlan()`, `buildDocumentTree()`, `GroupItem`/`RuntimeNode`, `reorderIds()`) + `Section.repeatable?: RepeatableGroupConfig` (extensão aditiva ao DSL da Task 09 — todo `Section` anterior continua válido). Fecha o débito documentado da Task 13: `validateDataBindingsInDefinition()` agora resolve um binding `currentGroupItem`/`ancestorGroupItem` contra o `repeatable.fields` do grupo que realmente o envolve (pilha de grupos ancestrais, nunca slug de modelo), e `resolveBindingFieldType()` (API) resolve o mesmo em runtime via `GroupItem.definitionSectionId`. Migration `20260915030000_technical_job_runtime_document_tree.sql`: `job_source_assignments` (índice único parcial por `role` exceto `supportingProfessional`), `group_items`/`runtime_nodes` (identidade congelada por trigger `BEFORE UPDATE`, mesma técnica de diff `to_jsonb` da Task 12) e 5 RPCs `SECURITY DEFINER` (`materialize_technical_job`, `add_group_item`, `duplicate_group_item`, `reorder_runtime_nodes`, mais os helpers recursivos de materialização). Um `RepeatableGroup` materializa como **um único** nó container; cada `GroupItem` recebe sua própria subárvore com ids de runtime novos, mesmo compartilhando o mesmo `definitionId` — zero colisão, provado tanto em pgTAP quanto no smoke real. API mínima e genérica (`POST/GET/PATCH technical-jobs`, `GET .../document-tree`, `POST .../group-items`, `POST .../reorder`, `PATCH`/`POST .../duplicate` em `/group-items`) — nenhum endpoint por tipo de bloco. Captura inicial de `JobRuntimeValue`s para bindings ligados a SourceRole na criação do job é _best-effort_ (mesmo padrão de `recordAuditEventBestEffort`). Testes: 22 Vitest de domínio novos (materialização, hierarquia, `buildDocumentTree()` com grupos aninhados e itens arquivados, teste arquitetural de grep por nome de vertical) + 2 Vitest de domínio para cardinalidade + Vitest de API (technical-jobs/group-items/job-runtime-values estendidos) + 42 pgTAP (`technical_job_runtime_document_tree_test.sql` — materialização, cardinalidade estrutural, cross-tenant, cross-job, hidden/conditional persistence, duplicate/archive, imutabilidade do job após publicar v2). Verificado ponta a ponta via `wrangler dev` + Supabase local com dados reais (nenhum mock): modelo Cautelar-shaped com RepeatableGroup publicado, job criado atomicamente, dois `GroupItem`s com valores independentes para o mesmo binding (`areaName` = "Sala"/"Cozinha"), `customer.taxId` auto-capturado batendo com o `document_number` real do Customer, reorder/duplicate/archive reais, publicação de v2 confirmando que o job permanece preso a v1, e um segundo modelo Entrega-shaped (nomenclatura totalmente diferente) passando pelo mesmo motor sem nenhuma linha de código específica. Esse mesmo smoke test pegou um bug real que os pgTAP (rodando como `postgres`) não pegaram: `duplicate_group_item()` usava um `DELETE` sem `WHERE` numa tabela temporária, rejeitado pelo guard `plan_filter` do Supabase para o role `authenticated` — corrigido removendo o `DELETE` (desnecessário, já que `ON COMMIT DROP` garante que a tabela nunca sobrevive à transação).

## Task 16 — Evidence Foundation

Tipos MVP: photo, document, signature.

Entregar: `evidence`, `StorageProvider`, private storage, signed URLs curtas, MIME/magic/size checks, SHA-256, original preservado, derivados versionados.

Gate: tenant B nunca acessa evidência de A.

## Task 17 — Structured Folder Import

Entregar: import session, `relative_path`, folder hierarchy, filename, metadata, natural ordering, dry-run, preview da árvore, confirmação, resume.

Regra: estrutura de pastas é dado de primeira classe.

Gate: mesmo input → mesma estrutura e ordem.

## Task 18 — Photo Scale & Batch Operations

Consolida o antigo "Photo Workspace" + "Evidence Ordering/Range Selection/Batch Operations". **Substitui integralmente qualquer proposta anterior de organização automática por IA.**

Entregar: árvore de ambientes/pastas, galeria, preview, seleção simples/múltipla, Shift+click, teclado, contagem por ambiente; preservar ordem original; natural sort; ordenar por captura/importação; reorder manual persistido; modo Selecionar intervalo; marcar primeira/última imagem; excluir/restaurar/mover intervalo; incluir/excluir do laudo; alterar ambiente; legenda; tags; exportar seleção; confirmação destrutiva; soft-delete/mecanismo recuperável; audit event; virtualização para centenas/milhares de fotos.

Proibido: IA mover; IA apagar; IA renomear; IA classificar automaticamente no core.

Gate: operações determinísticas, auditáveis, reversíveis quando aplicável, fluidas em escala.

## Task 19 — Image Annotation & Derivatives

Entregar: seta, retângulo, círculo, texto, derivative anotado, original imutável, versionamento de derivados.

Gate: original nunca é sobrescrito.

## Task 20 — Documents & Communications

Consolida o antigo "Table Engine" (dados) e "Documents & Attachments" (ART/RRT/TRT, plantas, certificados, ensaios, memoriais, relatórios — referência/processo/listar/anexo final) com um componente novo de comunicações do trabalho (registro de trocas relevantes ao job).

Gate: dados de tabela separados do PDF; original de documento rastreável.

## Task 21 — Findings, Pendencies, Tables & Checklists Runtime

Consolida "Findings/Constatações" com pendências e o runtime de tabelas/checklists de um job real (distinto do `Table`/`TechnicalInformation` do block engine, que é só schema — Task 09/14).

Entregar: title, description, severity, status, location/section/block, evidence, responsible, recommendation, due date; pendências com dono e prazo; checklist runtime.

Gate: bloco Findings usa a entidade sem duplicar dados.

## Task 22 — Baseline & Comparison Engine

Entregar: mecanismo de baseline (uma emissão anterior) e comparação estruturada contra ela — a base técnica do modelo derivado "Comparativo/Revistoria" (ver decisão de catálogo na Task 12).

Gate: uma comparação sempre referencia uma emissão concreta e imutável, nunca um draft.

## Task 23 — Structured Text, Content Fragments & Conclusion

Entregar: base text, variables, summaries, finding references, fragmentos de conteúdo reutilizáveis, editor, snapshot.

Regra: IA futura só sugere; profissional aprova.

Gate: texto emitido = aprovado.

## Task 24 — Technical Work Management Layer

Formaliza a decisão registrada na Task 12: overview do trabalho técnico, status, responsável, equipe, progresso, documentos, evidências, histórico, emissões.

Gate: estado do trabalho é sempre derivável do dado real (job/evidence/findings/report), nunca uma cópia paralela que pode dessincronizar.

## Task 25 — Atlas Document Standard / Technical Classic

Formaliza a decisão registrada na Task 12: um único padrão editorial ("Atlas Technical Classic") para todo o MVP — capa, sumário, margens, hierarquia, títulos, paginação, tabelas, registro fotográfico, anexos, conclusão, responsabilidade, assinaturas. Modelos diferem por conteúdo/composição, nunca por gramática visual.

Gate: qualquer um dos modelos de lançamento produz um documento na mesma gramática visual.

## Task 26 — Document Projection, RenderPlan, PagePlan & Preflight

Entregar: projeção de um job + `OrganizationModelVersion` publicada + Atlas Technical Classic em um `RenderPlan`/`PagePlan` — a estrutura intermediária que o renderer de fato consome, com preflight (validação de completude/pendências) antes de qualquer render.

Gate: um `RenderPlan` é determinístico a partir do mesmo job/snapshot; preflight bloqueia render de trabalho incompleto.

## Task 27 — PDF Renderer v1

Entregar: HTML/CSS controlado, `PdfRenderer` consumindo o `RenderPlan` da Task 26, cover, TOC, header/footer, pagination, text, technical info, tables, photos, findings, signatures, refs/anexos, golden PDF tests. Seguir `docs/product/PDF_OUTPUT_DESIGN_SPEC.md`.

Gate: render reprodutível a partir do mesmo `RenderPlan`/renderer version.

## Task 28 — Output Partitions / Volumes

Entregar: particionamento de um documento grande em volumes/partes de saída (ex.: anexos separados, volumes por tamanho) quando o `RenderPlan` exigir.

Gate: partições de um mesmo documento permanecem referenciáveis e coerentes entre si.

## Task 29 — Review & Approval

Estados: draft, in_progress, under_review, changes_requested, approved, ready_to_sign.

Comentários por section/block/field.

Gate: aprovação server-side auditável.

## Task 30 — Signature, Emission Snapshot & Report Versions

Consolida "Signature Abstraction", "Report Issuance" e "Report Versions & Supersede".

Entregar: `SignatureProvider` (assinatura capturada, identidade, timestamp, method/provider metadata — domínio não depende de fornecedor; ICP-Brasil/gov.br é um provider futuro); fluxo de emissão (authorize → validate → freeze job/model/layout/assets → render → hash → persist → `EmissionSnapshot`/`ReportVersion` → audit); versionamento (v1/v2, motivo, supersedes, histórico, download).

Gate: emitido é imutável; versão antiga nunca desaparece silenciosamente.

## Task 31 — Launch Model Pack — 4 base + Comparative

Ativação comercial da decisão de catálogo registrada na Task 12: os 4 modelos-base (Vistoria Cautelar de Vizinhança, Laudo de Entrega de Empreendimento, Laudo de Sinistro/Danos, Laudo de Transição de Construtora) mais o derivado Comparativo/Revistoria, prontos ponta a ponta (derivação → publish → job → render → emissão) sob o Atlas Technical Classic.

Gate: os 5 modelos de lançamento produzem um laudo emitido completo e reproduzível.

## Task 32 — Desktop Frontend v1

Entregar: frontend desktop (admin-web) cobrindo o fluxo completo do MVP — customização de modelo, gestão do trabalho técnico (Task 24), evidências, revisão, emissão.

Gate: um usuário completa o fluxo inteiro sem depender de chamadas diretas à API.

## Task 33 — Cross-model Consistency & Regression

Entregar: suíte de regressão cruzando os 5 modelos de lançamento — mesmo Atlas Technical Classic, mesmo pipeline de publish/job/render, sem drift silencioso entre modelos.

Gate: uma mudança no pipeline nunca quebra um modelo silenciosamente sem os outros acusarem.

## Task 34 — Observability, Recovery & Large-document Hardening

Consolida "Observability & Recovery" com hardening específico para documentos grandes (muitas fotos/páginas/volumes).

Entregar: structured logs, error tracking, request_id, jobs, PDF/storage/DB monitoring, backup verification, restore test, runbooks, limites/timeouts testados para documentos grandes.

Gate: falhas importantes são detectáveis e investigáveis; documento grande não derruba o sistema.

## Task 35 — Closed Pilot

3–5 organizações.

Medir: tempo primeiro laudo, organização de fotos, tempo total, retrabalho, erros, operações manuais, satisfação, storage, render time, suporte.

Gate: pós-MVP guiado por uso real.

## Task 36+ — Expansão futura

Field App (PWA de campo, câmera, voice capture, offline/sync — adiado desde a Task 12); expansão de catálogo para os modelos SST/industrial/ambiental de `CATALOG_V1.md` (`future_catalog`), guiada pelo uso real do piloto; integrações; billing (validar combinação usuários + trabalhos/laudos + armazenamento + recursos — negócio consulta entitlements, não nome de plano).
