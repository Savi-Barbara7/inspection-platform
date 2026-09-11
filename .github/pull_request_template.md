## Contexto

Explique o problema e o objetivo.

## Escopo

- [ ] Código
- [ ] Banco/migration
- [ ] RLS/autorização
- [ ] API/OpenAPI
- [ ] UI
- [ ] Worker/job
- [ ] Documentação

## Segurança / Multi-tenancy

- Tenant afetado:
- Permissão exigida:
- Há risco cross-tenant? Como foi testado?
- Há upload, token, URL assinada ou segredo?

## Privacidade / LGPD

- Novos dados pessoais?
- Nova finalidade?
- Nova retenção?
- Novo suboperador?

## Testes

- [ ] Unit
- [ ] Integration
- [ ] RLS/cross-tenant
- [ ] E2E
- [ ] Migration
- [ ] Security/negative cases

## Documentação

- [ ] ADR atualizada/criada quando necessário
- [ ] Documentação de domínio atualizada
- [ ] OpenAPI atualizada

## Checklist

- [ ] lint
- [ ] typecheck
- [ ] tests
- [ ] build
- [ ] sem secrets/logs sensíveis
