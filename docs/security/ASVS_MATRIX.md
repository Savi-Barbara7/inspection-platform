# ASVS Matrix — Baseline interno

Este arquivo não substitui o padrão oficial. Ele funciona como checklist interno de evidências.

| Área | Requisito interno | Evidência esperada | Status |
|---|---|---|---|
| Architecture | trust boundaries documentadas | architecture docs | TODO |
| Authentication | auth provider + MFA roadmap | auth tests/docs | TODO |
| Session | tokens não expostos em URL/log | tests/review | TODO |
| Access Control | capability + RLS | RLS/auth tests | TODO |
| Validation | Zod/JSON Schema no boundary | tests | TODO |
| Stored XSS | sanitização/CSP | security tests | TODO |
| Files | type/size/magic/quarantine | upload tests | TODO |
| Data Protection | classification/retention | privacy docs | TODO |
| Logging | sem secrets/sensitive payload | logger tests/review | TODO |
| API | authz/rate-limit/idempotency | API tests | TODO |
| Configuration | secrets/env separation | CI/env docs | TODO |

Antes do beta real, transformar este documento em matriz detalhada alinhada à versão oficial vigente do ASVS e executar revisão dedicada.
