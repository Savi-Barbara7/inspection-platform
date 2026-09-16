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

## Task 15 — Technical Job Foundation & Runtime Document Tree ⚠️ implementação principal entregue — Task 15.5A corrigida, Task 15.5B pendente

Entregar: `technical_jobs`, bindings customer/site/asset/model version (usando a Task 13), responsável, status, datas, snapshot da `OrganizationModelVersion` publicada usada, árvore de documento em runtime (instância navegável da `DocumentDefinition` publicada, preenchível), RLS.

Gate: todo trabalho aponta para uma versão publicada e imutável do modelo (nunca um draft).

Entregue: `TechnicalJob` (Task 14 placeholder → entidade real: `name`/`status` draft-active-archived/`createdBy`/`responsibleProfessionalId`) + `packages/domain/src/job-source-assignments` (`JobSourceAssignment`, `validateSourceAssignments()` — cardinalidade single/multiple declarada em `SOURCE_ROLES`, Task 13, nunca "pega o primeiro") + `packages/domain/src/runtime-document-tree` (motor puro — `buildMaterializationPlan()`/`buildGroupItemMaterializationPlan()`, `buildDocumentTree()`, `GroupItem`/`RuntimeNode`, `reorderIds()`) + `Section.repeatable?: RepeatableGroupConfig` (extensão aditiva ao DSL da Task 09 — todo `Section` anterior continua válido). Fecha o débito documentado da Task 13: `validateDataBindingsInDefinition()` agora resolve um binding `currentGroupItem`/`ancestorGroupItem` contra o `repeatable.fields` do grupo que realmente o envolve (pilha de grupos ancestrais, nunca slug de modelo), e `resolveBindingFieldType()` (API) resolve o mesmo em runtime via `GroupItem.definitionSectionId`. Migration `20260915030000_technical_job_runtime_document_tree.sql`: `job_source_assignments` (índice único parcial por `role` exceto `supportingProfessional`), `group_items`/`runtime_nodes` (identidade congelada por trigger `BEFORE UPDATE`, mesma técnica de diff `to_jsonb` da Task 12) e 5 RPCs `SECURITY DEFINER` (`materialize_technical_job`, `add_group_item`, `duplicate_group_item`, `reorder_runtime_nodes`, mais os helpers recursivos de materialização). Um `RepeatableGroup` materializa como **um único** nó container; cada `GroupItem` recebe sua própria subárvore com ids de runtime novos, mesmo compartilhando o mesmo `definitionId` — zero colisão, provado tanto em pgTAP quanto no smoke real. API mínima e genérica (`POST/GET/PATCH technical-jobs`, `GET .../document-tree`, `POST .../group-items`, `POST .../reorder`, `PATCH`/`POST .../duplicate` em `/group-items`) — nenhum endpoint por tipo de bloco. Captura inicial de `JobRuntimeValue`s para bindings ligados a SourceRole na criação do job é _best-effort_ (mesmo padrão de `recordAuditEventBestEffort`). Testes: 22 Vitest de domínio novos (materialização, hierarquia, `buildDocumentTree()` com grupos aninhados e itens arquivados, teste arquitetural de grep por nome de vertical) + 2 Vitest de domínio para cardinalidade + Vitest de API (technical-jobs/group-items/job-runtime-values estendidos) + 42 pgTAP (`technical_job_runtime_document_tree_test.sql` — materialização, cardinalidade estrutural, cross-tenant, cross-job, hidden/conditional persistence, duplicate/archive, imutabilidade do job após publicar v2). Verificado ponta a ponta via `wrangler dev` + Supabase local com dados reais (nenhum mock): modelo Cautelar-shaped com RepeatableGroup publicado, job criado atomicamente, dois `GroupItem`s com valores independentes para o mesmo binding (`areaName` = "Sala"/"Cozinha"), `customer.taxId` auto-capturado batendo com o `document_number` real do Customer, reorder de `RuntimeNode`s (seções de nível superior — não de `GroupItem`, que não tem reorder próprio; ver Task 15.5A)/duplicate/archive de `GroupItem` reais, publicação de v2 confirmando que o job permanece preso a v1, e um segundo modelo Entrega-shaped (nomenclatura totalmente diferente) passando pelo mesmo motor sem nenhuma linha de código específica. Esse mesmo smoke test pegou um bug real que os pgTAP (rodando como `postgres`) não pegaram: `duplicate_group_item()` usava um `DELETE` sem `WHERE` numa tabela temporária, rejeitado pelo guard `plan_filter` do Supabase para o role `authenticated` — corrigido removendo o `DELETE` (desnecessário, já que `ON COMMIT DROP` garante que a tabela nunca sobrevive à transação).

> **Nota de status (revisão pós-Task 15, 2026-09-15):** a funcionalidade principal acima está implementada, testada (pgTAP + Vitest + smoke real via `wrangler dev`) e em produção de staging. Uma segunda revisão confrontou o `RuntimeNode`/`GroupItem`/`JobSourceAssignment` construídos contra cenários de integridade estrutural não cobertos pelos testes originais (nested groups em profundidade, reorder de `GroupItem`, concorrência de escrita, coerência `role`↔`source_type` na fronteira do banco) e confirmou lacunas reais — ver Task 15.5 abaixo. A Task 15 **não deve ser tratada como arquiteturalmente fechada** até que a Task 15.5A e a Task 15.5B (ou uma decisão explícita de aceitar o risco) sejam resolvidas. Isso não invalida o que já está entregue: os testes existentes continuam corretos para os cenários que cobrem, e nenhum bug encontrado afeta isolamento entre tenants.
>
> **Atualização (2026-09-16):** a Task 15.5A (identidade de container, reorder de `GroupItem`, invariantes de archive/restore, concorrência estrutural) foi implementada e verificada — ver seção própria abaixo. A Task 15.5B (integridade de `job_source_assignments`/criação de job) continua pendente. A Task 15 segue **parcialmente** fechada arquiteturalmente: a parte de runtime tree/`GroupItem` está resolvida; a parte de criação de job/source assignment ainda não.

## Task 15.5 — Runtime & Job Creation Integrity (marco de acompanhamento, não uma task executável)

> Registrado a partir de uma revisão externa pós-Task 15 (Codex) confrontada achado-a-achado com o código real — ver `docs/product/CODEX_REVIEW_RESPONSE_TASK15.md`. **Este marco não é implementável como está** — ele agrupa duas tasks técnicas concretas (15.5A e 15.5B, abaixo) mais uma lista de owners futuros e decisões pendentes. Segue o mesmo padrão de numeração decimal da Task 03.5, sem renumerar nada. Ordem/prioridade/decisão de iniciar ficam com o dono do produto — nada aqui foi implementado ou iniciado.

### Task 15.5A — Runtime Tree Integrity ✅ implementada (2026-09-16)

Achados confirmados por leitura direta de `supabase/migrations/20260915030000_technical_job_runtime_document_tree.sql`, e seu status após a implementação (migration `20260915040000_task_15_5a_runtime_tree_integrity.sql`):

- **Identidade explícita do runtime container por `GroupItem`. ✅ corrigido.** `duplicate_group_item()` reencontrava o nó container de um item aninhado consultando `runtime_nodes` só por `definition_id`/`is_repeatable_container` — sem escopo por `group_item_id`/ancestral, ambíguo sempre que existisse mais de um item externo. Corrigido adicionando `group_items.container_node_id` (NOT NULL, FK composta tenant/job-safe): a referência única e autoritativa ao `RuntimeNode` container exato de cada `GroupItem`, usada agora tanto pelas RPCs quanto pelo motor puro (`buildDocumentTree()`/`groupItemToTreeNode()`) — nunca mais uma busca por `definitionSectionId`.
- **Validação container ↔ `parent_group_item_id`. ✅ eliminado estruturalmente (não apenas validado).** `add_group_item()` não aceita mais `p_parent_group_item_id` como input independente — a assinatura passou de 4 para 3 argumentos. `parent_group_item_id` é sempre **derivado no servidor** a partir de `v_container.group_item_id` (a própria linha do container, já travada `FOR UPDATE`), tornando estruturalmente impossível construir um `GroupItem` cujo container e `parent_group_item_id` apontem para pais diferentes.
- **Nested groups com múltiplos pais. Sem mudança — fora do escopo desta task (confirmado deliberadamente).** O schema continua com um único pai por item aninhado; suportar múltiplos pais exigiria um desenho novo, não solicitado nem necessário para os cenários cobertos.
- **Reorder de `GroupItem`. ✅ implementado.** Novo RPC `reorder_group_items(p_organization_id, p_technical_job_id, p_container_node_id, p_ordered_group_item_ids)` — mesmo contrato de exact-set validation já usado por `reorder_runtime_nodes()` (ids nunca mudam, lista deve corresponder exatamente aos filhos ativos atuais do container, rejeita lista com id estranho/omitido/duplicado). Nova rota `POST /technical-jobs/:id/group-items/reorder`.
- **Invariantes de posição em archive/restore. ✅ corrigido.** Novo índice único parcial `group_items_active_position_uidx (container_node_id, position) WHERE state='active'` como rede de segurança estrutural. Novo RPC `restore_group_item()` sempre recalcula uma posição **nova**, ao final da lista de ativos, em vez de reaproveitar a posição antiga do item — fecha exatamente o cenário "item pos 1 → arquivado → item novo assume pos 1 → restaurar o antigo colide". `PATCH /group-items/:id {state:"active"}` passou a rotear para essa RPC (nunca mais um PATCH cru na coluna).
- **Semântica de `duplicate`. Decisão técnica reafirmada, não uma decisão de produto nova.** `duplicate_group_item()` continua sem cascatear para `GroupItem`s aninhados (o clone recebe seu próprio container novo, vazio) e continua sem duplicar `JobRuntimeValue`s capturados — comportamento pré-existente, agora testado explicitamente (pgTAP + smoke real) e documentado em `docs/domain/RUNTIME_DOCUMENT_TREE.md`. Continua **pendente como decisão de produto** (ver "Decisões pendentes" abaixo) — esta task não a validou com o usuário, só evitou inventar um comportamento novo sem justificativa.
- **Concorrência estrutural. ✅ corrigido.** `add_group_item()` já travava seu container (`FOR UPDATE`); `duplicate_group_item()` não travava — corrigido, agora trava o container antes de calcular a posição do clone. `reorder_group_items()` e `restore_group_item()` (novos) também travam o container primeiro, dando um único ponto de serialização compartilhado por toda mutação estrutural sob um container. Mecanismo escolhido: row-locking simples (`FOR UPDATE`), consistente com o resto da Task 15 — sem CRDT, sem infraestrutura nova.

Testes: 130→131 Vitest de domínio (nova suíte de regressão do bug de identidade + performance envelope ~600 RuntimeNodes/600 GroupItems aninhados) + 225 Vitest de API (reorder de GroupItem, restore via PATCH, remoção de `parentGroupItemId` do payload) + 37 novos pgTAP (`task_15_5a_runtime_tree_integrity_test.sql` — nested groups com dois pais externos, container/parent incompatível rejeitado, cross-job/cross-tenant, reorder com sucesso/rejeição, archive→add→restore sem colisão, duplicate de item aninhado e de item com subgrupo próprio, regressão Task 15). Verificado ponta a ponta via `wrangler dev` + Supabase local com um usuário `authenticated` real (não `postgres`): os dois GroupItems externos cada um com seu próprio container "Ambientes" isolado, reorder real, archive→add→restore sem colisão de posição, e duplicate de um item com subgrupo próprio recebendo um container novo vazio (sem cascata) — nenhum mock.

> **Rodada de red-team (2026-09-16, migration `20260916150000_task_15_5a_redteam_fixes.sql`):** uma revisão independente pós-implementação devolveu **VERDICT: BLOCK**. Achados confirmados e corrigidos: (1) **bypass de escrita direta** — a policy de RLS `UPDATE` original em `group_items` permitia que um cliente `authenticated` alterasse `state`/`position`/`parent_group_item_id` via PATCH direto, contornando inteiramente `archive`/`restore`/`reorder` — corrigido revogando `UPDATE` de `authenticated`/`anon` por completo (mesmo tratamento já dado a `INSERT`/`DELETE`) e removendo `parent_group_item_id` do conjunto isento do trigger de imutabilidade; (2) **archive ainda era PATCH direto** — novo RPC `archive_group_item()`, simétrico a `restore_group_item()`; (3) **ordem de lock inconsistente** — `duplicate_group_item()`/`restore_group_item()` travavam o item antes do container, `reorder_group_items()` sempre travou o container antes dos itens — risco real de deadlock, corrigido padronizando container-primeiro em toda mutação estrutural, **provado sem deadlock com duas transações Postgres reais e concorrentes**; (4) **reorder sem proteção contra lost update** — novo `runtime_nodes.group_items_revision` (contador monotônico por container) e `reorder_group_items()` passou a exigir `p_expected_revision`, rejeitando com `40001`/HTTP 409 uma chamada baseada em estado obsoleto — **também provado com duas transações reais concorrentes**, não só pgTAP sequencial; (5) o teste cross-tenant passou a usar uma Org B real (modelo próprio, versão publicada própria, job materializado próprio) em vez de um `gen_random_uuid()`; (6) `addGroupItemSchema` passou a `.strict()`, rejeitando `parentGroupItemId` com 422 em vez de ignorá-lo silenciosamente; (7) o backfill de `container_node_id` da migration já aplicada (`20260915040000`) não foi reescrito (regra do repositório: nunca editar migration já aplicada) — a nova migration adiciona uma checagem estrutural que roda **depois** do backfill e **aborta** (nunca escolhe arbitrariamente) se algum `group_items.container_node_id` divergir do pai real de sua própria subárvore materializada; isso é **detecção pós-backfill, não prevenção do backfill histórico** — a migration original já rodou, e só funcionou corretamente porque staging e local tinham zero linhas em `group_items` no momento (verificado antes e depois); nenhuma instalação com `GroupItem`s pré-existentes foi de fato testada contra aquele backfill. Testes: +51 pgTAP no arquivo 15.5A (revisão completa de todos os 37 anteriores + novos: revogação de escrita direta sob role `authenticated` real, duplicate id em reorder, cross-tenant real, revision mismatch), +2 pgTAP no arquivo Task 15 original (fechamento de escrita direta), 227 Vitest de API (archive via RPC, 409 de revision), 132 Vitest de domínio. Ledger de migrations de staging (`lxechulbjswneiqowant`) reconciliado com o histórico local — `supabase migration list --linked` confirma `local=remote` em todas as entradas; `20260916130021`/`20260916135256` são registros de reconciliação (sem alteração de schema, ver comentário de cada arquivo).

### Task 15.5B — Job Creation & Source Assignment Integrity (especificada, não iniciada)

Achados confirmados por leitura direta da mesma migration:

- **`SourceRole` → `SourceType` garantido na fronteira do banco.** `job_source_assignments` tem dois `check` independentes (`role in (...)`, `source_type in (...)`) mas nenhum que amarre um role específico ao seu `source_type` correto. A camada de app (`resolveSourceType()`) sempre calcula o par certo, mas nada impede um `INSERT` direto (via PostgREST) com um par incoerente (ex.: `role='customer'` com `source_type='Site'`).
- **Impedir writes diretos incoerentes.** Diferente de `group_items`/`runtime_nodes` (que revogam `INSERT` de `authenticated`/`anon` e só aceitam escrita via RPC `SECURITY DEFINER`), `job_source_assignments` **tem uma política RLS de `INSERT` direta** para owner/admin/coordinator, e nenhuma trigger de imutabilidade de identidade como as de `group_items`/`runtime_nodes`. Isso significa que o caminho sancionado (`materialize_technical_job()`) não é o único caminho de escrita possível — um cliente pode inserir/atualizar `job_source_assignments` diretamente via PostgREST, ignorando a validação de cardinalidade feita em `validateSourceAssignments()` na API (o índice único parcial no banco ainda protege contra role singular duplicado, mas nada mais).
- **Idempotência de criação.** `materialize_technical_job()` não aceita nenhuma chave de idempotência — um retry de rede ou duplo clique no "criar trabalho" cria dois `TechnicalJob`s distintos, cada um com sua própria árvore materializada.
- **Atomicidade real da criação/captura.** A parte estrutural (job + `job_source_assignments` + árvore) é de fato atômica (uma única transação/RPC). A captura inicial de `JobRuntimeValue`s para bindings ligados a `SourceRole` **não é** — é um passo _best-effort_ separado, feito depois do commit da RPC, via múltiplas chamadas REST subsequentes da camada de API. Isso foi uma decisão deliberada (documentada), mas "atomicidade real" da criação como um todo não é o que está entregue.
- **Estado observável/retry de captura.** Como consequência do item anterior: se uma captura individual falhar (erro de rede, campo sem mapeamento, etc.), a falha é silenciosamente engolida (`catch { /* best-effort */ }`) — o cliente não tem hoje nenhuma forma de saber quais bindings foram capturados com sucesso e quais não, nem um jeito de pedir um retry específico daquela captura sem recriar o job inteiro.
- **Atribuição explícita dos itens reduzidos da Task 15.** Registrar aqui, explicitamente (em vez de deixar implícito no código): a Task 15 não implementou "mover" um `RuntimeNode` de bloco entre seções diferentes (reparenting) como uma operação de primeira classe, não propagou `duplicate` para grupos aninhados, e não deu à captura inicial de `JobRuntimeValue` a mesma garantia de atomicidade que o resto da criação do job.

Gate proposto: mesmo padrão da 15.5A — reproduzir, teste falhando, correção mínima, regressão. A decisão de "captura atômica com falha bloqueando a criação do job" vs. "captura best-effort com estado observável de pendência" é uma decisão de produto ("Decisões pendentes antes de qualquer implementação" abaixo), não uma correção técnica unilateral.

### Owners futuros registrados (sem task number ainda — aguardando priorização do dono do produto)

- **Source Assignment Relink** — atualização/relink de um `JobSourceAssignment` depois da criação do job (hoje só leitura).
- **Job Read & Update Contract** — `job.read` como capability própria (hoje toda leitura usa `job.edit`), um contrato explícito de o que pode ser editado estruturalmente num job depois de criado, e proteção de concorrência (`expectedUpdatedAt` ou equivalente) em `PATCH /technical-jobs/:id` (hoje não tem nenhuma — diferente de `publish_organization_model_version()`, Task 12, que já usa esse padrão).
- **TechnicalProfessional Foundation** — tabela própria, FK tenant-safe, RLS, API (hoje só um `SourceType` catalogado sem persistência).
- **Asset DataSource + SourceResolver** — expor `Asset` (Task 07) como `SourceType` em `data-sources`, e um `SourceResolver` genérico server-side (hoje só existe um mapeamento pequeno e explícito Customer/Site→coluna, usado só na captura best-effort de criação de job).
- **CustomFieldDefinition** — mecanismo para uma organização definir seus próprios campos customizados (hoje `CustomData` é uma lista fixa de 3 campos hardcoded).
- **Organization Members & Invites** — `organization.members.manage` já existe como capability desde a Task 05, mas nenhum endpoint a usa (só existe `GET /:id/membership`, a própria membership do chamador).
- **OrganizationModelVersion History/Diff** — `GET .../organization-models/:id/versions` (listar todas as versões) e diff entre duas versões; hoje só existem `GET .../draft` e `GET .../published`.
- **UserProfile** — hoje `GET /me` só retorna `{id, email}` do Supabase Auth.

### Decisões pendentes antes de qualquer implementação

- **`Project` vs. `Site`**: `Project` é uma entidade própria, um apelido de `Site`, ou metadata de `TechnicalJob`? Hoje só existe como `SourceType` catalogado, sem tabela — implementar uma tabela sem essa decisão arriscaria construir o modelo errado.
- **`InspectionEvent`**: precisa mesmo de tabela própria para suportar múltiplas visitas por job, ou isso pode esperar até um caso de produto concreto exigir? Hoje só catalogado.
- **Semântica de `duplicate` de `GroupItem`**: duplicar deveria cascatear para grupos aninhados? Deveria copiar os `JobRuntimeValue`s capturados do original, ou sempre começar vazio? A Task 15 entregou "começa vazio, não cascateia" como decisão técnica de escopo, nunca validada como requisito de produto.
- **Captura inicial atômica vs. recuperável**: a criação de um job deveria falhar inteira se uma captura de `JobRuntimeValue` falhar (atomicidade total), ou deveria sempre suceder com um estado observável de "captura pendente" retomável (o que a Task 15.5B propõe expor, mas ainda não decide qual comportamento é o correto)?

### Fronteiras explícitas desta revisão

- **Branding da Organization permanece explicitamente escopo da Task 25** (Atlas Document Standard / Technical Classic) — não faz parte do Task 15.5/owners futuros acima; removido da lista anterior deste documento, que o havia listado incorretamente como candidato sem dono.
- **Observabilidade avançada (Sentry, monitoramento externo, log centralizado) permanece explicitamente escopo da Task 34** — nada disso foi implementado nesta revisão nem deve ser lido como candidato do Task 15.5.
- **`BackgroundOperation` (operação assíncrona comum) tem owner registrado: Task 17** (fundação mínima e reutilizável, ver nota lá) **para a implementação, Task 34 para hardening/observabilidade/escala avançados dela** — não é um item do Task 15.5 nem dos owners futuros acima; não implementado nesta revisão.

## Task 16 — Evidence Foundation

Tipos MVP: photo, document, signature.

Entregar: `evidence`, `StorageProvider`, private storage, signed URLs curtas, MIME/magic/size checks, SHA-256, original preservado, derivados versionados.

Gate: tenant B nunca acessa evidência de A.

## Task 17 — Structured Folder Import

Entregar: import session, `relative_path`, folder hierarchy, filename, metadata, natural ordering, dry-run, preview da árvore, confirmação, resume.

Regra: estrutura de pastas é dado de primeira classe.

Gate: mesmo input → mesma estrutura e ordem.

> **Ownership registrado (revisão pós-Task 15):** esta é a task-dona da fundação mínima de `BackgroundOperation` (operação assíncrona comum) — o gap identificado na revisão do Codex (ver `docs/product/CODEX_REVIEW_RESPONSE_TASK15.md`). Task 17 é o primeiro caso real que exige operação longa persistente, estados explícitos (`queued`/`running`/`completed`/`partially_completed`/`failed`), progresso quantitativo, partial success, retry, retomada, falhas persistidas, idempotência e a garantia de que o usuário pode continuar trabalhando enquanto a operação roda. A abstração construída aqui deve ser **reutilizável**, não uma solução batizada `ImportBackgroundOperation` — outras operações longas futuras (processamento de imagens, renderização, PDF, emissão) devem poder reaproveitá-la. Hardening operacional, observabilidade avançada, recuperação avançada, escala, filas travadas, alertas e operação em produção continuam com a Task 34 (não duplicado aqui).

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

> Confirmado na revisão pós-Task 15: o contrato de branding da Organization (logo, tema documental, cor institucional) pertence explicitamente a esta task, não a nenhum item de gap registrado na Task 15.5.

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

> Confirmado na revisão pós-Task 15: observabilidade avançada (Sentry, monitoramento externo, log centralizado) permanece explicitamente escopo desta task — nada disso foi implementado nem deve ser antecipado pela Task 15.5. Isso inclui o hardening/escala/filas-travadas/alertas de qualquer `BackgroundOperation` que a Task 17 introduzir como fundação — a fundação em si é da Task 17, o hardening operacional dela é desta task.

## Task 35 — Closed Pilot

3–5 organizações.

Medir: tempo primeiro laudo, organização de fotos, tempo total, retrabalho, erros, operações manuais, satisfação, storage, render time, suporte.

Gate: pós-MVP guiado por uso real.

## Task 36+ — Expansão futura

Field App (PWA de campo, câmera, voice capture, offline/sync — adiado desde a Task 12); expansão de catálogo para os modelos SST/industrial/ambiental de `CATALOG_V1.md` (`future_catalog`), guiada pelo uso real do piloto; integrações; billing (validar combinação usuários + trabalhos/laudos + armazenamento + recursos — negócio consulta entitlements, não nome de plano).
