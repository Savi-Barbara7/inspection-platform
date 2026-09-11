# Autonomous Bootstrap — Task 00

## Objetivo

Provisionar sozinho a fundação técnica do produto usando as sessões autenticadas existentes de GitHub, Cloudflare e Supabase, deixando um ambiente reproduzível, seguro e documentado antes da primeira feature.

## 1. Discovery sem mutação

Primeiro inventariar:

- conta/workspace GitHub disponível e permissões;
- repos existentes com nomes relacionados;
- regras de segurança disponíveis no plano;
- conta Cloudflare, Workers subdomain, Git integration e projetos existentes;
- conta Supabase, projetos existentes, regiões e limites do plano;
- integrações já autorizadas entre GitHub/Cloudflare;
- existência de domínio que claramente pertença ao projeto (não assumir que qualquer domínio pode ser usado).

Registrar apenas metadados não sensíveis em `PROVISIONING_STATE.md`.

## 2. GitHub

Default:

- repo privado: `inspection-platform` ou variante disponível;
- não criar organização GitHub nova se existir workspace adequado;
- default branch: `main`;
- PR obrigatório sempre que o plano permitir;
- impedir force-push/delete de `main`;
- exigir CI verde;
- habilitar Dependabot e secret scanning quando disponíveis;
- configurar CODEOWNERS com o owner real detectado;
- criar labels `security`, `architecture`, `database`, `privacy`, `breaking-change`.

Se um recurso de proteção exigir plano pago, aplicar o máximo gratuito disponível e registrar o gap. Não comprar upgrade.

## 3. Monorepo bootstrap

Criar estrutura definida na Technical Spec, TypeScript strict, pnpm/Turborepo, lint/typecheck/test/build e GitHub Actions.

CI é responsável por qualidade. Deploy fica separado e deve ocorrer somente após checks relevantes.

## 4. Supabase

### Staging

Criar projeto específico em:

`South America (São Paulo) / sa-east-1`

Nome sugerido:

`inspection-platform-staging`

Configurar:

- database;
- Auth baseline;
- URLs de redirect somente necessárias;
- Storage;
- bucket `evidence-staging` privado;
- buckets futuros continuam private-by-default;
- migrations via repositório, não alterações manuais sem migration;
- RLS nas tabelas tenant-owned;
- seed exclusivamente fictício.

### Production

Criar projeto separado `inspection-platform-production` em `sa-east-1` somente se isso estiver disponível no plano atual sem contratação nova.

Se não estiver, não comprar nada. Registrar pendência e manter production config declarativa pronta para provisionamento posterior.

### Secrets

Guardar chaves somente em secret stores apropriados. Public/anon key pode existir onde tecnicamente esperado; service role/S3 secret/server keys nunca no frontend ou Git.

## 5. Storage v1

Usar Supabase Storage como primeira implementação de `StorageProvider` porque já está disponível na conta e o origin do Storage acompanha a região do projeto.

Regras:

- buckets privados;
- acesso por autorização/RLS/signed URL curta;
- originals preservados;
- derivados separados;
- nenhuma URL pública permanente;
- S3-compatible credentials somente server-side se forem realmente necessárias.

A interface continua provider-independent para futura migração a S3/R2 sem alterar domínio.

## 6. Cloudflare Workers

Usar **Workers**, não iniciar novo projeto em Pages.

Criar deployments separados ou ambientes claramente separados para:

- admin web;
- field PWA;
- API Worker.

Codinomes podem ser:

- `inspection-admin-staging`;
- `inspection-field-staging`;
- `inspection-api-staging`.

Production equivalente só é promovida quando a fase correspondente estiver pronta.

Usar `wrangler.jsonc` como source of truth de configuração versionável; secrets ficam fora do arquivo.

## 7. API

API v1 roda em Cloudflare Workers usando Hono.

O domínio permanece Web-Standards/TypeScript puro e não conhece Hono/Cloudflare.

Rotas começam em `/api/v1`.

Não usar D1 como banco do domínio: PostgreSQL/Supabase permanece source of truth.

## 8. GitHub ↔ Cloudflare

Preferir Workers Builds / integração GitHub nativa para deploy e previews, evitando token de deploy long-lived no GitHub quando não necessário.

Configurar:

- build a partir do repo correto;
- `main` como branch de produção quando houver production real;
- branches/PRs como versões de preview;
- build watch paths no monorepo quando útil;
- nomes Workers idênticos aos nomes em `wrangler.jsonc`.

## 9. Secrets

Usar Cloudflare Secrets/Secrets Store para Worker secrets.

Nunca usar `vars` para valores sensíveis.

Nunca registrar valores em:

- PR;
- issue;
- README;
- screenshot;
- chat;
- terminal compartilhado/log persistente.

Manter `env.example` apenas com nomes.

## 10. URLs e domínio

Não pedir compra de domínio.

Usar inicialmente:

- `*.workers.dev`;
- URLs Supabase geradas pela plataforma.

Custom domain entra em tarefa posterior quando marca/domínio forem decididos.

## 11. Observabilidade inicial

Ativar o máximo de observabilidade nativa sem contratação adicional:

- Workers logs/observability;
- Supabase logs;
- request IDs;
- health endpoint sem dados sensíveis.

Não enviar payload integral de inspeções para logs.

## 12. Smoke tests obrigatórios

Comprovar automaticamente:

- CI funciona em PR;
- Worker de staging responde health check;
- aplicação web staging carrega;
- API staging responde `/api/v1/health`;
- Supabase staging é acessível somente com env correto;
- bucket é privado;
- secret não aparece em build logs;
- migration/reset local é reproduzível quando a Task 02 for concluída.

## 13. PROVISIONING_STATE.md

Gerar/atualizar com:

- nome do repo;
- GitHub workspace;
- URLs staging não sensíveis;
- Worker names;
- Supabase project refs/names/região (sem keys);
- buckets;
- data da configuração;
- gaps por limitação de plano;
- itens que ainda dependem de decisão comercial.

## 14. Definition of Done da Task 00

Task 00 só termina quando:

- repositório existe e está privado;
- docs estão versionadas;
- CI básico existe;
- Supabase staging em São Paulo existe;
- Cloudflare deploy staging existe ou está preparado com uma razão técnica documentada;
- secrets estão fora do Git;
- nenhum gasto novo foi contratado sem autorização;
- `PROVISIONING_STATE.md` está atualizado;
- PR da fundação está verde.
