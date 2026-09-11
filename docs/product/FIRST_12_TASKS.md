# Primeiras 13 tarefas para a IA — começando pela Task 00


Cada tarefa deve virar um PR separado ou um conjunto pequeno e coerente de PRs. Não executar tudo em uma única solicitação.

## Task 00 — Autonomous Provisioning

**Objetivo:** configurar sozinho GitHub, Supabase, Cloudflare, CI/CD e staging usando as contas autenticadas disponíveis.

Seguir integralmente `docs/infra/AUTONOMOUS_BOOTSTRAP.md`.

Entregar:
- repo privado e regras disponíveis no plano;
- documentação versionada;
- CI inicial;
- Supabase staging `sa-east-1`;
- Storage privado;
- Cloudflare Workers staging e integração Git;
- preview/smoke health check;
- `PROVISIONING_STATE.md`;
- nenhum secret no Git/log/chat.

**Gate:** infraestrutura staging criada e reproduzível sem pedir configuração técnica à proprietária.

---

## Task 01 — Repository Foundation

**Objetivo:** criar apenas a estrutura técnica do monorepo.

Entregar:
- pnpm workspace;
- Turborepo;
- `apps/admin-web`, `apps/field-pwa`, `apps/api`;
- packages vazios com boundaries;
- workers vazios;
- TypeScript strict;
- ESLint/Prettier;
- Vitest;
- scripts padronizados;
- `.env.example` validado;
- CI lint/typecheck/test/build.

**Não entregar:** auth, dashboard, banco de negócio.

**Gate:** CI verde do zero.

---

## Task 02 — Local Database & Migration Harness

**Objetivo:** preparar Postgres/Supabase local e migrations confiáveis.

Entregar:
- estrutura `supabase/migrations`;
- comandos reset/migrate/test;
- extensão/funções base estritamente necessárias;
- migration test em banco vazio;
- seeds exclusivamente fictícios.

**Gate:** `db reset` reproduz ambiente sem passo manual.

---

## Task 03 — Authentication Boundary

**Objetivo:** autenticação mínima sem regras de negócio de tenant.

Entregar:
- adapter de Supabase Auth;
- sessão web/API;
- current user contract;
- middleware de auth;
- testes auth required/invalid session;
- nenhum service-role no frontend.

**Gate:** API distingue anonymous/authenticated com testes.

---

## Task 04 — Organizations & Memberships

**Objetivo:** primeira entidade multi-tenant real.

Entregar:
- tables organizations/memberships;
- migrations;
- RLS;
- criação de organization controlada;
- membership owner inicial;
- read/update com capability apropriada;
- fixtures Org A/B.

**Gate:** cross-tenant suite verde.

---

## Task 05 — Capability Authorization

**Objetivo:** autorização consistente fora de condicionais espalhadas.

Entregar:
- capability registry;
- mapping de roles iniciais;
- authorize() central;
- resource/organization checks;
- testes de matriz de roles.

**Gate:** nenhuma rota protegida depende apenas de `role === ...` na camada UI.

---

## Task 06 — Audit Baseline

**Objetivo:** trilha de negócio desde cedo.

Entregar:
- `audit_events` append-only;
- AuditService/port;
- events para organization/member/role changes;
- request_id/actor/resource;
- testes de não vazamento de payload sensível.

**Gate:** ações administrativas críticas deixam evidência auditável.

---

## Task 07 — Customers / Sites / Assets Foundation

**Objetivo:** entidades genéricas para contexto da inspeção.

Entregar:
- customers;
- contacts;
- sites;
- assets;
- RLS/tests;
- API CRUD mínima autorizada.

**Gate:** nenhum nome de tabela específico como `obra`, `apartamento` ou `lindeiro` entra no core.

---

## Task 08 — Inspection Template Drafts

**Objetivo:** criar templates draft sem ainda publicar.

Entregar:
- inspection_templates;
- inspection_template_versions draft;
- contracts de data/ui/rules;
- validator de schema;
- IDs estáveis de campo;
- UI mínima de criação/preview.

**Gate:** invalid schemas são rejeitados de forma determinística.

---

## Task 09 — Template Publish & Immutability

**Objetivo:** formalizar versionamento.

Entregar:
- publish command server-side;
- validação completa;
- published immutable;
- create-new-draft-from-published;
- audit events;
- tests de tentativa de update direto.

**Gate:** não existe API legítima que edite version published.

---

## Task 10 — Three-Vertical Proof

**Objetivo:** provar horizontalidade do engine antes de avançar.

Criar como fixtures/templates, não lógica hardcoded:
- vistoria imobiliária;
- inspeção elétrica;
- inspeção ambiental.

Todos devem usar o mesmo runtime/component registry.

**Gate:** nenhuma condicional de core baseada em vertical.

---

## Task 11 — Inspection Lifecycle Core

**Objetivo:** criar execução concreta.

Entregar:
- inspections;
- template version binding;
- `response_json`;
- revision optimistic concurrency;
- state machine inicial;
- create/start/save/submit commands;
- RLS/capability tests.

**Gate:** stale revision produz conflito em vez de sobrescrever dados silenciosamente.

---

## Task 12 — Evidence Upload Foundation

**Objetivo:** primeira captura de evidência segura.

Entregar:
- `evidence`;
- StorageProvider;
- prepare/finalize upload;
- signed URL curta;
- private bucket;
- MIME/magic/size validation;
- SHA-256;
- thumbnail async para foto;
- estados de processing;
- testes malicious/invalid/cross-tenant.

**Gate:** nenhum arquivo fica acessível publicamente e tenant B não consegue download de evidence A.

---

## Depois da Task 12

Somente então avançar para:

- Findings;
- Review/Approval;
- Report Template;
- Report Renderer;
- ReportVersion/issuance;
- golden PDF tests;
- offline sync;
- billing;
- public API/webhooks.
