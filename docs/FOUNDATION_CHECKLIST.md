# Phase 0 — Foundation Checklist (executada pela IA)

O agente é responsável por executar e marcar estes itens. A proprietária não deve ser transformada em operadora técnica do projeto.

## A. Discovery e governança

- [ ] inventário GitHub/Cloudflare/Supabase realizado sem mutações destrutivas
- [ ] codinome provisório aplicado
- [ ] repositório privado criado/selecionado
- [ ] `main` protegida com o máximo suportado pelo plano atual
- [ ] PR/checks obrigatórios configurados quando suportados
- [ ] CODEOWNERS configurado
- [ ] secret scanning/Dependabot habilitados quando disponíveis
- [ ] nenhuma credencial registrada no Git/chat/log

## B. Tooling

- [ ] Node/runtime e pnpm fixados
- [ ] workspace/Turborepo configurados
- [ ] TypeScript strict
- [ ] ESLint/Prettier
- [ ] Vitest
- [ ] `.env.example` sem valores
- [ ] scripts `dev`, `test`, `lint`, `typecheck`, `build` padronizados

## C. Supabase

- [ ] staging criado em `sa-east-1`
- [ ] production separado criado se o plano atual permitir sem compra
- [ ] Auth baseline configurado
- [ ] Storage privado configurado
- [ ] migrations são source of truth
- [ ] RLS strategy documentada
- [ ] service-role fora de frontend/Git

## D. Cloudflare

- [ ] Workers escolhido para novos deploys
- [ ] GitHub integration/Workers Builds configurado
- [ ] preview build disponível
- [ ] staging Worker(s) configurado(s)
- [ ] `wrangler.jsonc` versionado
- [ ] secrets em mecanismo próprio de secrets, não `vars`
- [ ] health check staging funcionando

## E. Arquitetura, segurança e privacidade

- [ ] ADR-0001 a ADR-0016 revisadas pelo agente
- [ ] threat model inicial presente
- [ ] ASVS baseline presente
- [ ] Data Map inicial presente
- [ ] Subprocessors atualizado para providers efetivamente usados
- [ ] retention baseline presente
- [ ] incident response presente

## F. CI/CD

- [ ] lint
- [ ] typecheck
- [ ] unit tests
- [ ] build
- [ ] checks de segurança disponíveis
- [ ] deploy/preview não expõe secrets
- [ ] staging saudável

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
