# Especificação Técnica v1 — Núcleo SaaS Multi-Tenant

## 1. Escopo

Construir uma plataforma SaaS B2B multi-tenant para criação de templates de inspeção, execução de vistorias, coleta de evidências, constatações, revisão, aprovação, geração e emissão versionada de documentos técnicos.

O produto deve atender múltiplas verticais sem que cada nova vertical exija um sistema independente.

## 2. Não escopo inicial

Ficam fora do MVP:

- microserviços;
- Kubernetes;
- Kafka;
- BPMN completo;
- apps nativos separados;
- colaboração CRDT;
- marketplace;
- SSO/SCIM;
- custom roles;
- AI vision autônoma;
- assinatura digital própria;
- ERP/CRM/financeiro completo.

## 3. Princípios

1. **Multi-tenancy real:** `organization_id` + RLS + autorização em aplicação + testes cross-tenant.
2. **Dados antes do PDF:** PDF é derivado de dados e snapshots estruturados.
3. **Imutabilidade:** template publicado e relatório emitido não são sobrescritos.
4. **Configuração segura:** templates usam schema/DSL; sem código arbitrário.
5. **Modular monolith:** módulos bem definidos e workers assíncronos.
6. **Provider abstraction:** domínio não depende de storage, billing ou auth provider.
7. **Privacy/security by design:** decisões de dados e segurança entram no design.
8. **Offline-ready:** contratos de revision/idempotency existem antes da PWA offline.

## 4. Stack alvo

### Frontend administrativo
- React + TypeScript
- Vite
- TanStack Query
- React Hook Form
- Zod
- Tailwind + shadcn/ui/Radix
- TipTap quando rich text for realmente necessário

### PWA de campo
- React + TypeScript
- Vite PWA
- IndexedDB + Dexie
- Service Worker

### API
- Cloudflare Workers + TypeScript
- Hono
- Zod
- OpenAPI 3.1
- domínio desacoplado do runtime Cloudflare

### Dados
- PostgreSQL
- Supabase como plataforma inicial para Postgres/Auth
- RLS obrigatório para tabelas tenant-owned

### Storage
- interface `StorageProvider`
- primeira implementação: Supabase Storage privado no projeto `sa-east-1`
- origem do Storage acompanha a região do projeto
- uploads/downloads autorizados ou por URL assinada de curta duração
- provider pode ser substituído futuramente sem alterar domínio

### Deploy / edge
- Cloudflare Workers para web, PWA e API
- Workers Builds/GitHub integration para preview/deploy
- `wrangler.jsonc` versionado; secrets fora do Git

### Jobs
- fila baseada em PostgreSQL no início quando a semântica exigir durable jobs
- workers lógicos separados para PDF, mídia, notificações e webhooks

### PDF
- HTML/CSS → Chromium server-side
- `PdfRenderer` abstraído
- implementação inicial preferencial: Cloudflare Browser Run/Chromium
- geração assíncrona quando aplicável
- `ReportVersion` imutável

## 5. Modelo organizacional

```text
Organization
├── Memberships
├── BusinessUnits
├── Teams
├── Customers
│   └── Contacts
├── Sites
│   └── Assets
├── Templates
├── Inspections
└── Reports
```

`Organization` é o tenant pagante. `Customer` é cliente do tenant.

## 6. Roles iniciais

- owner
- admin
- template_manager
- coordinator
- inspector
- reviewer
- technical_responsible
- billing_admin
- viewer

Autorização interna deve usar capabilities para não acoplar regras aos nomes das roles.

## 7. Capabilities iniciais

Exemplos:

- `organization.members.manage`
- `template.create`
- `template.publish`
- `inspection.create`
- `inspection.assign`
- `inspection.execute`
- `inspection.review`
- `inspection.approve`
- `report.render`
- `report.issue`
- `billing.manage`

## 8. Entidades de domínio

- Organization
- Membership
- BusinessUnit
- Team
- Customer
- Contact
- Site
- Asset
- InspectionTemplate
- InspectionTemplateVersion
- ReportTemplate
- ReportTemplateVersion
- Inspection
- InspectionAssignment
- Evidence
- Finding
- CorrectiveAction
- Review
- Approval
- Report
- ReportVersion
- AuditEvent
- WebhookEndpoint
- WebhookDelivery
- Plan
- Subscription
- Entitlement
- UsageRecord

## 9. Template Engine

Templates de inspeção possuem `data_schema_json`, `ui_schema_json`, `rules_json` e defaults. Templates publicados são imutáveis.

IDs de campos são estáveis e não dependem de labels.

Regras condicionais usam DSL declarativa controlada. Fórmulas são limitadas a operadores/funções aprovados. É proibida execução arbitrária de JavaScript/SQL.

## 10. Inspection Engine

Estados iniciais:

```text
draft → scheduled → assigned → in_progress → submitted
                                         ↓
                                  under_review
                                  ↙          ↘
                      changes_requested    approved
```

Outros estados: `cancelled`, `archived`.

Transições são comandos de domínio, não simples UPDATE de status.

Cada inspeção possui `revision` para optimistic concurrency.

## 11. Evidence

`Evidence` é entidade genérica. Tipos possíveis: photo, document, signature, audio, video, measurement, location.

MVP prioriza foto, documento e assinatura simples.

Fluxo de upload:

```text
prepare → signed upload → quarantine → validate/scan → process → available
```

Original é preservado. Derivados podem incluir thumbnail/preview/annotated.

## 12. Findings

Não conformidades/constatações são entidades separadas e podem futuramente gerar `CorrectiveAction`.

## 13. Report Engine

Inspection Template define o que coletar. Report Template define como apresentar.

Renderer usa DSL de componentes controlados, por exemplo:

- Cover
- Heading
- Text
- FieldValue
- Table
- EvidenceGrid
- FindingList
- SignatureBlock
- Header
- Footer
- PageBreak
- TOC

## 14. Emissão

Emitir relatório significa:

1. validar permissão;
2. validar estado e campos obrigatórios;
3. congelar snapshot de inspeção/template/layout;
4. gerar asset manifest;
5. criar job de render;
6. gerar PDF em ambiente controlado;
7. calcular hash;
8. armazenar;
9. criar `ReportVersion` emitida;
10. auditar.

Correção cria versão nova.

## 15. Multi-tenancy

Estratégia inicial: banco e schema compartilhados, `organization_id` em todas as tabelas tenant-owned, RLS e authorization layer.

Não usar banco por tenant nem schema por tenant no MVP.

## 16. API

REST `/api/v1` com contratos OpenAPI 3.1. Operações privilegiadas devem passar pelo backend, mesmo quando outras leituras simples possam usar capacidades da plataforma de dados.

Operações críticas devem avaliar idempotência: emissão, billing webhooks, sync offline, finalize upload, webhook processing.

## 17. Audit

Audit trail é append-only e separado de logs técnicos. Eventos incluem publicação de template, mudanças de role, submissão/reabertura/aprovação, emissão/supersede de relatório, exclusão de evidência e exportações.

## 18. Billing

Domínio usa `BillingProvider`. Código de negócio consulta `Entitlement`, não `plan === 'premium'`.

## 19. Offline

PWA offline sincroniza somente o necessário para o usuário. Operações carregam `operation_id`, `device_id`, `inspection_id` e `base_revision`.

Evidence é preferencialmente append-only. Comandos críticos permanecem server-authoritative.

## 20. Qualidade

CI obrigatório: format/lint/typecheck/unit/database/RLS/security/build/integration.

Testes obrigatórios: unit, integration, database, cross-tenant, API authorization, E2E, PDF golden, migration, offline/sync quando aplicável.

## 21. LGPD

O produto deve manter data map, classificação, retenção, suboperadores e processos para incidentes/direitos do titular. Base legal não deve ser reduzida a checkbox de consentimento. Revisão jurídica especializada é exigida antes de produção comercial.

## 22. Milestones

1. Secure Multi-Tenant Foundation
2. Generic Template Engine
3. Complete Inspection Lifecycle
4. Reproducible Technical Document
5. Field PWA Offline
6. Billing
7. API/Webhooks
8. Enterprise
