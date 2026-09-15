# Authorization Model

> Implementação (Task 05): `packages/domain/src/authorization` (registry +
> `authorize()`, sem I/O) e `apps/api/src/middleware/authorization.ts`
> (`requireCapability`, adapter Supabase via `apps/api/src/authorization/`).
>
> Hardening (Task 05.1): ver `20260914150000_hardening_organization_authorization.sql`
> e a seção "Task 05.1 — Hardening" ao final deste documento.

## Princípio

Autorização é determinada por:

```text
identity + membership + organization + capability + resource state
```

## Exemplo

`report.issue` pode exigir:

- usuário autenticado;
- membership ativa na organization do report;
- capability `report.issue`;
- inspection aprovada;
- report ainda não emitido naquela versão;
- eventualmente autenticação forte.

## Browser input

`organization_id`, `role`, `user_id` e `status` enviados pelo browser nunca são suficientes para conceder permissão.

## API tokens futuros

Devem possuir escopos explícitos e estar vinculados a organization, com rotação/revogação/audit.

## Matriz role → capability (v1)

Fonte da verdade: `ROLE_CAPABILITIES` em `packages/domain/src/authorization/index.ts`
(testado exaustivamente em `packages/domain/test/authorization.test.ts`).
Nunca decidir autorização por nome de role fora desse registro.

| Capability                   | owner | admin | template_manager | coordinator | inspector | reviewer | technical_responsible | billing_admin | viewer |
| ---------------------------- | :---: | :---: | :--------------: | :---------: | :-------: | :------: | :-------------------: | :-----------: | :----: |
| organization.members.manage  |   ✓   |   ✓   |                  |             |           |          |                       |               |        |
| organization.settings.manage |   ✓   |   ✓   |                  |             |           |          |                       |               |        |
| technical_model.read         |   ✓   |   ✓   |        ✓         |      ✓      |     ✓     |    ✓     |           ✓           |               |   ✓    |
| organization_model.read      |   ✓   |   ✓   |        ✓         |      ✓      |     ✓     |    ✓     |           ✓           |               |   ✓    |
| organization_model.create    |   ✓   |   ✓   |        ✓         |             |           |          |                       |               |        |
| organization_model.customize |   ✓   |   ✓   |        ✓         |             |           |          |                       |               |        |
| organization_model.publish   |   ✓   |   ✓   |        ✓         |             |           |          |                       |               |        |
| job.create                   |   ✓   |   ✓   |                  |      ✓      |           |          |                       |               |        |
| job.assign                   |   ✓   |   ✓   |                  |      ✓      |           |          |                       |               |        |
| job.edit                     |   ✓   |   ✓   |                  |      ✓      |     ✓     |          |                       |               |        |
| job.review                   |   ✓   |   ✓   |                  |      ✓      |           |    ✓     |                       |               |        |
| job.approve                  |   ✓   |   ✓   |                  |             |           |          |           ✓           |               |        |
| evidence.upload              |   ✓   |   ✓   |                  |      ✓      |     ✓     |          |                       |               |        |
| evidence.organize            |   ✓   |   ✓   |                  |      ✓      |     ✓     |          |                       |               |        |
| evidence.delete              |   ✓   |   ✓   |                  |             |           |          |                       |               |        |
| report.render                |   ✓   |   ✓   |                  |      ✓      |           |    ✓     |           ✓           |               |        |
| report.issue                 |   ✓   |   ✓   |                  |             |           |          |           ✓           |               |        |
| report.supersede             |   ✓   |   ✓   |                  |             |           |          |           ✓           |               |        |
| signature.request            |   ✓   |   ✓   |                  |             |           |          |           ✓           |               |        |
| billing.manage               |   ✓   |       |                  |             |           |          |                       |       ✓       |        |
| audit.read                   |   ✓   |   ✓   |                  |             |           |          |                       |               |        |
| customer.read                |   ✓   |   ✓   |                  |      ✓      |     ✓     |    ✓     |           ✓           |               |   ✓    |
| customer.manage              |   ✓   |   ✓   |                  |      ✓      |           |          |                       |               |        |
| site.read                    |   ✓   |   ✓   |                  |      ✓      |     ✓     |    ✓     |           ✓           |               |   ✓    |
| site.manage                  |   ✓   |   ✓   |                  |      ✓      |           |          |                       |               |        |
| asset.read                   |   ✓   |   ✓   |                  |      ✓      |     ✓     |    ✓     |           ✓           |               |   ✓    |
| asset.manage                 |   ✓   |   ✓   |                  |      ✓      |           |          |                       |               |        |

Nota (Task 08): `technical_model.read` existe desde a Task 05 e continua
governando o futuro fluxo de derivação de `OrganizationModel`, mas **não**
é o que protege `GET /api/v1/technical-models` — esse catálogo é
plataforma-wide, sem `organization_id`, então não faz sentido checar
capability por organização ali. As rotas do catálogo usam só
`requireAuth`; RLS (modelos `active`, versões `published`/`superseded`,
`anon` sem grant algum) é quem de fato restringe o acesso — ver
`docs/domain/TEMPLATES.md`.

Nota (Task 10): `organization_model.read` é uma capability nova e
deliberadamente separada de `technical_model.read` — enxergar os modelos
já customizados pela própria organização é uma preocupação distinta de
enxergar o catálogo global, mesmo quando os dois roles coincidem hoje.
Concedida a todo role exceto `billing_admin` (inclusive `viewer`); já
`organization_model.create`/`customize`/`publish` permanecem restritas a
`owner`/`admin`/`template_manager`, sem mudança desde a Task 05. Nenhum
role de tenant tem (nem nunca terá, sem uma decisão explícita) capacidade
de escrita sobre `technical_models`/`technical_model_versions` — o
catálogo global é somente leitura para todos eles.

Nota (Task 12): `organization_model.publish` já existia desde a Task 05
mas ficava sem nenhuma rota associada até `POST /:id/publish` chegar —
reaproveitada tal como estava, sem nenhuma mudança na matriz de roles.

Racional: `owner`/`admin` cobrem operação completa (billing fica só com
`owner` + `billing_admin`, nunca `admin`, para separar "roda a operação" de
"mexe em pagamento"). `organization.settings.manage` é a capability que
protege `PATCH /api/v1/organizations/:id` (dados cadastrais como
`display_name`/`legal_name`) e é deliberadamente restrita a `owner`/`admin`,
assim como `organization.members.manage` — ambas ficam de fora de qualquer
outro role. `template_manager` é dono do ciclo de vida do Organization
Model. `coordinator` distribui e revisa trabalho; `inspector` executa e
coleta evidência do seu próprio job; `reviewer` só revisa; `technical_responsible`
detém `report.issue`/`report.supersede`/`signature.request` como parte de
seu papel de assinar e emitir/supersede o documento. `viewer` é somente
leitura. `audit.read` (Task 06) protege `GET /api/v1/organizations/:id/audit-events`
e é deliberadamente restrita a `owner`/`admin` em v1 — a trilha de auditoria
é dado administrativo sensível; RLS já permite SELECT a qualquer membro
ativo (`is_org_member`), então essa capability é o que efetivamente decide
quem acessa a rota HTTP. `customer.manage`/`site.manage`/`asset.manage`
(Task 07) cobrem create+update+archive (sem split mais fino) e vão para
`owner`/`admin`/`coordinator` — `coordinator` porque é quem distribui
trabalho e precisa poder cadastrar o cliente/local/ativo antes de criar um
job. `customer.read`/`site.read`/`asset.read` vão para esses três mais
`inspector`/`reviewer`/`technical_responsible`/`viewer` — todo mundo que
precisa saber a qual cliente/local/ativo um job se refere, exceto
`template_manager` e `billing_admin`, cujo escopo permanece isolado
(ciclo de vida do Organization Model e billing, respectivamente). Esta
matriz é o ponto de partida (Task 05) e pode
ser refinada quando tarefas futuras (07+) exigirem granularidade maior —
sempre via este registro, nunca via checagem de role solta em rota ou UI.

### `report.issue` não é o mesmo que responsabilidade técnica (assinatura)

`report.issue` é a capability **operacional** que permite executar o ato de
emitir um documento (acionar o endpoint/ação de emissão). Ela **não**
significa que quem a possui assume a responsabilidade técnica/assinatura do
laudo. Hoje `owner`, `admin` e `technical_responsible` possuem
`report.issue` — isso permanece válido para a operação (ex.: um admin pode
precisar reemitir um PDF por questão operacional), mas:

- possuir `report.issue` **não torna** um `owner`/`admin` comum o
  "responsável técnico" do documento;
- nenhuma tarefa futura (Review/Signature/Issuance) deve tratar
  `report.issue` como prova de assinatura técnica;
- antes de emitir, o fluxo de emissão deve validar o **estado do recurso**
  independentemente de quem está chamando: job aprovado (`job.approve` já
  executado), requisitos obrigatórios do modelo atendidos, assinatura
  técnica obrigatória de fato registrada (quando o modelo exigir), versão
  correta do documento, e só então checar se o chamador possui
  `report.issue`;
- a assinatura/responsabilidade técnica é um dado de estado do recurso
  (quem assinou, quando, com qual credencial), nunca inferida a partir do
  role ou da capability de quem clicou em "emitir".

## Task 05.1 — Hardening

Revisão de segurança sobre a Task 04/05, antes de iniciar a Task 06. Ver
`20260914150000_hardening_organization_authorization.sql` e
`supabase/tests/organizations_cross_tenant_test.sql`.

### 1. `organization_memberships`: fim do UPDATE direto pelo cliente

A policy de UPDATE em `organization_memberships` (que permitia a
owner/admin atualizar qualquer coluna, incluindo `role`, de qualquer
membership da própria organization) foi **removida por completo**. Sem uma
feature de gestão de membros ainda implementada, essa policy permitia a um
admin, via PostgREST direto com seu próprio JWT, se promover a owner,
rebaixar/remover o owner, ou deixar uma organization sem owner — nada disso
depende de existir UI para o ataque funcionar.

Não existe hoje nenhum caminho de escrita direta em `organization_memberships`
para o cliente autenticado (nem UPDATE, nem INSERT — que já era bloqueado
pela ausência de policy de INSERT). Quando a gestão de membros for
implementada, deve ser via RPC `SECURITY DEFINER` com, no mínimo, estas
invariantes reforçadas dentro da própria função (nunca só na UI):

- só o owner atual pode transferir ownership;
- admin nunca promove ninguém a owner;
- admin nunca modifica ou remove a membership do owner;
- uma organization nunca fica sem pelo menos um owner ativo;
- transferência de ownership é atômica (uma única transação);
- toda mudança de role/status é auditada.

### 2. `PATCH /api/v1/organizations/:id` exige capability, não só RLS

A rota agora é protegida por `requireCapability("organization.settings.manage", ...)`
além do RLS. RLS continua sendo a segunda linha de defesa (ADR-0004) — a
policy de UPDATE em `organizations` permanece, mas deixou de ser a única
barreira.

### 3. Colunas internas de `organizations` protegidas

RLS restringe **linhas**, não **colunas** — a policy de UPDATE antiga
permitia a um owner/admin autenticado, batendo direto no PostgREST com seu
próprio JWT (mesma `SUPABASE_URL`, sem passar pela API), alterar qualquer
coluna da própria organization: `slug`, `status`, `settings`, etc., mesmo
que a API só exponha `display_name`/`legal_name`.

Decisão: **Opção A** — revogar o GRANT de UPDATE em `organizations` de
`authenticated`/`anon` por completo, e introduzir a função `SECURITY DEFINER`
`update_organization_settings(p_organization_id, p_display_name, p_legal_name, p_update_legal_name)`.
A assinatura fixa da função é o que garante que só `display_name`/`legal_name`
podem ser alterados por esse caminho — adicionar uma coluna interna à
função exigiria uma mudança explícita e revisada, não um PATCH silencioso.
Não foi usado `service_role` em nenhum ponto; a função reforça
`has_org_role(...)` internamente porque `SECURITY DEFINER` ignora RLS.

Trade-off assumido: a função usa `p_update_legal_name` (boolean) para
distinguir "não mexer em `legal_name`" de "setar `legal_name`, inclusive
para `null`" — `display_name` não precisa disso porque é `NOT NULL` e
`coalesce(p_display_name, display_name)` já expressa "não mexer" com
`NULL`. O adapter (`supabase-organizations-repository.ts`) mapeia
`legalName !== undefined` do `UpdateOrganizationInput` para esse flag, então
o comportamento observável pela API (incluindo limpar `legal_name`
explicitamente) não mudou.

### 4. Validação de UUID nas rotas

`organization_id` é validado como UUID (`z.string().uuid()`) em
`apps/api/src/organizations/routes.ts` antes de qualquer chamada ao
repositório ou ao `MembershipLookup` — um valor malformado nunca chega ao
PostgREST, retornando sempre `422 validation_error`. Valores usados na
construção de filtros/URLs do PostgREST (`supabase-organizations-repository.ts`,
`supabase-membership-lookup.ts`) também passam por `encodeURIComponent`
como defesa em profundidade.

### 5. Higiene de Git/segredos

Auditado: `.gitignore` raiz já cobre `node_modules/`, `dist/`, `.turbo/`,
`.wrangler/`, `.dev.vars`/`.env` (com exceção dos `.example`), `.DS_Store`.
`git ls-files` confirma que nenhum desses artefatos, nem `apps/api/.dev.vars`,
nunca foi commitado — só `.dev.vars.example`/`.env.example`, que contêm
apenas placeholders fictícios. Nenhum secret real foi encontrado versionado.

### 6. EXECUTE grants em funções de `public` — comportamento e regra

**Comportamento observado do Supabase/Postgres:** este projeto define, via
`pg_default_acl`, que toda função nova criada por `postgres` no schema
`public` recebe `EXECUTE` automaticamente para `anon`, `authenticated` e
`service_role` no momento do `CREATE FUNCTION` — antes de qualquer
`GRANT`/`REVOKE` explícito rodar depois, no restante da mesma migration.
Isso pegou `create_organization()`, `update_organization_settings()` e
`set_updated_at()` de surpresa: um `revoke all on function ... from public`
logo após o `CREATE FUNCTION` **não** remove esses grants, porque eles
foram feitos diretamente a `anon`/`authenticated`/`service_role` (roles
nomeados), não ao pseudo-role `PUBLIC` — `REVOKE ... FROM PUBLIC` só afeta
o que foi concedido a `PUBLIC`. Corrigido para as três funções em
`20260914160000_revoke_anon_execute_update_organization_settings.sql`,
`20260914170000_revoke_anon_execute_create_organization.sql` e
`20260914180000_revoke_execute_set_updated_at.sql`.

**Regra de desenvolvimento:** toda nova RPC/função exposta em `public`
deve declarar/revisar explicitamente seus `EXECUTE` grants **na mesma
migration** que a cria — nunca assumir que o grant padrão do projeto está
correto para o caso de uso. Para uma função `authenticated`-only, isso
significa, logo após o `CREATE FUNCTION`: `revoke execute ... from anon,
public;` (ou `revoke all ... from public;` seguido de um `revoke execute
... from anon;` **explícito**, já que o primeiro sozinho não basta).

**Teste genérico de regressão:** existe em
`supabase/tests/organizations_cross_tenant_test.sql` um assert que lista,
via `has_function_privilege('anon', ...)`, todas as funções de `public`
executáveis por `anon` e compara contra uma allow-list explícita (hoje:
só `has_org_role`/`is_org_member`, os helpers de predicado de RLS, que
precisam ser executáveis por `anon`/`authenticated` para as próprias
policies de RLS conseguirem avaliar as próprias queries). Uma função nova
que ganhe `EXECUTE` de `anon` sem estar nessa lista quebra o teste
imediatamente, em vez de passar despercebida — foi esse teste que pegou o
caso do `set_updated_at()` nesta mesma revisão. Esse teste genérico é
suficiente e não é frágil porque depende só de um fato objetivo do
catálogo (`has_function_privilege`), não de heurística sobre o corpo da
função; mantemos, além dele, os testes explícitos por função (grant +
comportamento) já que provam coisas que o teste genérico não prova
(que `authenticated` legítimo continua funcionando, que a negação
acontece pelo motivo certo, etc.).
