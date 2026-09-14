# Decisions at a Glance

| Tema | Decisão v1 |
|---|---|
| Arquitetura | Modular monolith + workers |
| Banco | PostgreSQL |
| Plataforma inicial | Supabase |
| Multi-tenancy | shared DB/schema + organization_id + RLS |
| Auth | Supabase Auth |
| Autorização | capabilities + RLS |
| API | REST `/api/v1` + OpenAPI 3.1 |
| Documentos | Technical Model → Organization Model → Technical Job → Report (ADR-0017) |
| Blocos | Controlled block DSL (dado + apresentação juntos), sem código arbitrário |
| Published model/org versions | imutáveis |
| Technical Job answers | JSONB + entidades normalizadas |
| Evidence ordering | sempre humano/determinístico; IA nunca move/apaga/renomeia no core |
| Catálogo Fase 1 | 14 modelos (PHASE1_CATALOG.md); SST/industrial vira future_catalog |
| PDF | produto editorial independente da UI (PDF_OUTPUT_DESIGN_SPEC.md), nunca captura de tela |
| Concurrency | revision + optimistic concurrency |
| Evidence | entidade genérica + original preservado + SHA-256 |
| Storage | private object storage behind StorageProvider |
| PDF | HTML/CSS + Chromium server-side async |
| Issued reports | imutáveis/versionados |
| Jobs | PostgreSQL-backed initially |
| Offline | PWA + IndexedDB/Dexie + outbox |
| Billing | Provider abstraction + entitlements |
| Audit | append-only, separado de logs |
| Security | OWASP ASVS L2 baseline |
| LGPD | privacy by design + data map + retention + subprocessors |
| Microservices | não no MVP |
