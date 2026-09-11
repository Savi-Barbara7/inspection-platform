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
| Templates | JSON Schema + UI Schema + declarative rules |
| Published templates | imutáveis |
| Inspection answers | JSONB + entidades normalizadas |
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
