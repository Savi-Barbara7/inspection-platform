# System Context

## Atores

- Owner/Admin da organização
- Template Manager
- Coordinator
- Inspector
- Reviewer
- Technical Responsible
- Billing Admin
- Viewer
- Cliente externo futuro
- Sistemas externos via API/webhook

## Sistemas externos previstos

- Auth provider
- PostgreSQL
- Object storage
- Email provider
- Billing provider
- Observability provider
- E-signature provider futuro
- AI provider futuro, somente com privacy review

## Trust boundaries

1. Browser/PWA ↔ API
2. API ↔ banco
3. API/workers ↔ object storage
4. API ↔ provedores externos
5. PWA offline ↔ dispositivo local
6. Tenant A ↔ Tenant B: fronteira lógica crítica
