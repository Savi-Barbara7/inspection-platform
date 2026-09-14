# Phase 0 — Foundation Checklist (executada pela IA)

O agente é responsável por executar e marcar estes itens. A proprietária não deve ser transformada em operadora técnica do projeto.

## A. Discovery e governança

- [x] inventário GitHub/Cloudflare/Supabase realizado sem mutações destrutivas
- [x] codinome provisório aplicado (`inspection-platform`)
- [x] repositório privado criado/selecionado
- [ ] `main` protegida com o máximo suportado pelo plano atual — **gap**: branch protection/rulesets exigem GitHub Pro em repo privado (ver PROVISIONING_STATE.md)
- [ ] PR/checks obrigatórios configurados quando suportados — mesmo gap acima
- [x] CODEOWNERS configurado
- [x] secret scanning/Dependabot habilitados quando disponíveis — Dependabot sim; secret scanning indisponível em repo privado no plano Free (gap registrado)
- [x] nenhuma credencial registrada no Git/chat/log

## B. Tooling

- [x] Node/runtime e pnpm fixados
- [x] workspace/Turborepo configurados
- [x] TypeScript strict
- [x] ESLint/Prettier
- [x] Vitest
- [x] `.env.example` sem valores
- [x] scripts `dev`, `test`, `lint`, `typecheck`, `build` padronizados

## C. Supabase

- [x] staging criado em `sa-east-1`
- [ ] production separado criado se o plano atual permitir sem compra — adiado deliberadamente até a fase de promoção (ver ADR/AUTONOMOUS_BOOTSTRAP.md)
- [x] Auth baseline configurado (Task 03 — adapter de Supabase Auth, middleware `requireAuth`, sem regras de tenant)
- [ ] Storage privado configurado (Task 12)
- [x] migrations são source of truth (`supabase/migrations`, Task 02)
- [x] RLS strategy documentada (`docs/database/RLS.md`; implementação começa na Task 04)
- [x] service-role fora de frontend/Git

## D. Cloudflare

- [x] Workers escolhido para novos deploys
- [x] GitHub integration/Workers Builds configurado
- [ ] preview build disponível — não verificado ainda
- [x] staging Worker(s) configurado(s) (`inspection-api-staging`, `inspection-admin-staging`, `inspection-field-staging`)
- [x] `wrangler.jsonc` versionado
- [ ] secrets em mecanismo próprio de secrets, não `vars` — ainda não há secrets a configurar
- [x] health check staging funcionando

## E. Arquitetura, segurança e privacidade

- [ ] ADR-0001 a ADR-0016 revisadas pelo agente
- [ ] threat model inicial presente
- [ ] ASVS baseline presente
- [ ] Data Map inicial presente
- [ ] Subprocessors atualizado para providers efetivamente usados
- [ ] retention baseline presente
- [ ] incident response presente

## F. CI/CD

- [x] lint
- [x] typecheck
- [x] unit tests
- [x] build
- [x] checks de segurança disponíveis (Dependabot alerts + automated security fixes)
- [x] deploy/preview não expõe secrets
- [x] staging saudável

## G. Gate multi-tenant antes do Template Engine

- [ ] organizations/memberships implementadas
- [ ] fixtures Org A/B
- [ ] cross-tenant SELECT bloqueado
- [ ] cross-tenant INSERT bloqueado
- [ ] cross-tenant UPDATE bloqueado
- [ ] cross-tenant DELETE bloqueado
- [ ] testes executados automaticamente no CI

## Blockers humanos legítimos

Só registrar aqui bloqueios de pagamento/contrato/domínio/MFA pessoal/ação destrutiva incerta. Não registrar tarefas técnicas que o agente pode executar sozinho.
