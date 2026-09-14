# Templates Domain (Technical Models & Organization Models)

> Realinhado na Task 03.5 — ver `docs/adr/ADR-0017-technical-model-domain.md`.
> Substitui o par `InspectionTemplate`/`ReportTemplate` por uma hierarquia de
> três níveis. Catálogo oficial da Fase 1: **14 modelos**, ver
> `docs/product/technical-models/PHASE1_CATALOG.md`.
>
> **Implementação (Task 08):** `packages/domain/src/templates` (port
> `TechnicalModelsRepository`, sem I/O) + `apps/api/src/technical-models`
> (adapter Supabase, rotas `GET /api/v1/technical-models`). Só a camada
> `TechnicalModel`/`TechnicalModelVersion`/catálogo foi implementada —
> `OrganizationModel`/`OrganizationModelVersion` continuam apenas
> documentadas, chegam em tasks futuras (10+).

## Quatro conceitos que não devem ser confundidos

- **TechnicalModel** = referência técnica mantida pela plataforma (este
  documento). Não é o laudo de um cliente, não é customização de nenhuma
  organização, não é um PDF, não é um `TechnicalJob`.
- **OrganizationModel** = derivação customizada de uma organização a
  partir de um `TechnicalModelVersion` publicado (branding, textos,
  seções/blocos habilitados/reordenados, overrides de requirement). Ainda
  não implementado (Task 10+).
- **TechnicalJob** = execução concreta de um `OrganizationModelVersion`
  para um `Site`/`Asset` real — o trabalho de campo. Ver
  `docs/domain/INSPECTIONS.md`. Ainda não implementado.
- **Report/ReportVersion** = o documento resultante, gerado e emitido a
  partir de um `TechnicalJob`. Ver `docs/domain/REPORTS.md`. Ainda não
  implementado.

## Objetivo

Permitir que organizações produzam laudos e documentos técnicos a partir de
modelos técnicos prontos (mantidos pela plataforma), personalizando-os sem
nunca alterar o original — em vez de montar um documento do zero.

## Hierarquia

```text
TechnicalModel
  -> TechnicalModelVersion (published, immutable)
    -> OrganizationModel
      -> OrganizationModelVersion (published, immutable)
        -> TechnicalJob (execução concreta — ver docs/domain/INSPECTIONS.md)
```

## Entidades

### TechnicalModel

Identidade lógica de um modelo mantido pela plataforma (ex.: "Inspeção Predial"). Carrega slug estável, nome, categoria (`building_engineering`, `specialized_engineering`, `property_inspection`, `real_estate`, `electrical`), descrição, objetivo, quando usar, tipo de objeto tipicamente inspecionado, `usageProfile` (uma estrutura tipada única — `usesPhotos`/`usesTables`/`usesAttachments`/`supportsComparative`/`involvesTechnicalResponsibility` — em vez de colunas booleanas soltas), tags de busca, `jurisdictionScope` (texto livre: `BR`, `BR/RS`, `municipal`, `organization-specific`, `generic/international`, ...) e `status` (`active`/`retired` — se o modelo está oferecido no catálogo, não a maturidade de nenhuma versão). **Não é tenant-owned: nunca tem `organization_id`.**

### TechnicalModelVersion

Snapshot de um `TechnicalModel`: título, descrição, `technicalBasis` (array de referências normativas/institucionais — tipo, título, identificador, edição, fonte, notas, `verifiedAt` — nunca o texto integral de uma norma proprietária) e `professionalScope` (quem tipicamente elabora/revisa/assina, ainda esparso — pesquisa aprofundada é Task 34). Uma versão **publicada é imutável**: mudança relevante cria `version_number` seguinte, nunca edita a existente.

### Research status × editorial status (nunca confundir)

Duas dimensões independentes de uma `TechnicalModelVersion`:

- **`researchStatus`** — quão tecnicamente apurado é o conteúdo:
  `RESEARCH_ONLY` → `DRAFT` → `INTERNAL_REVIEW` → `PROFESSIONAL_REVIEW` →
  `VERIFIED_REFERENCE_MODEL` (vocabulário exato de
  `docs/product/technical-models/RESEARCH_PROTOCOL.md`, incluindo
  caixa-alta). Os 14 modelos da Fase 1 nascem em `DRAFT` — nenhum é
  `VERIFIED_REFERENCE_MODEL` sem revisão profissional real (ver Section
  11 da Task 08 / `PHASE1_CATALOG.md` "Status de validação").
- **`status`** — lifecycle editorial/de publicação: `draft` → `published`
  → `superseded`, ou `archived`. Uma versão pode estar **`published` e ao
  mesmo tempo `researchStatus: DRAFT`** — isso não é uma contradição, é
  honestidade: o catálogo está ao vivo/consultável, mas o conteúdo ainda
  não passou por revisão técnica formal. Nunca inferir maturidade de
  pesquisa a partir do status editorial, nem vice-versa.

### OrganizationModel

Derivação de um `TechnicalModelVersion` específica de uma organização. Mantém sempre a referência ao modelo/versão de origem.

### OrganizationModelVersion

Snapshot publicado e imutável de um `OrganizationModel`: textos, branding, seções/blocos habilitados/reordenados, overrides de requirement.

## Estados (lifecycle editorial)

`TechnicalModelVersion`: `draft` → `published` → `superseded` (substituída por versão mais nova, mas ainda legível para provenance de trabalhos antigos), ou `archived` (retirada). `OrganizationModelVersion` (futuro): `draft` → `published` → `archived`.

## Invariants

- published (em qualquer dos dois níveis) é imutável;
- nova edição de published cria novo draft/version;
- section/block IDs são estáveis e independentes de labels;
- a organização nunca edita o `TechnicalModel`/`TechnicalModelVersion` diretamente — só deriva um `OrganizationModel`;
- todo `OrganizationModel` referencia o `TechnicalModelVersion` de origem (provenance nunca se perde);
- nenhum bloco executa código arbitrário do tenant (HTML/JS/SQL);
- todo `TechnicalJob` referencia uma `OrganizationModelVersion` específica e reproduzível;
- **quem escreve `TechnicalModel`/`TechnicalModelVersion` (Task 08):** nenhuma role tenant (nem `owner`) escreve no catálogo base — owner de uma organização não é "admin da plataforma". Não existe `platform_admin` nesta arquitetura; escrita é só via migration/seed/processo interno. `authenticated` só tem `SELECT`, restrito por RLS a modelos `active`/versões `published`+`superseded`; `anon` não tem nenhum grant na tabela. Acesso ao catálogo não depende de pertencer a nenhuma organização — ver `docs/security/AUTHORIZATION.md`.

## Controlled Block DSL

> **Implementação (Task 09):** `packages/domain/src/templates/blocks.ts` —
> engine genérico puro (sem I/O, sem lógica de nenhum modelo específico).
> Usado por qualquer `TechnicalModelVersion`/`OrganizationModelVersion`
> futura; não persiste nada sozinho — quem grava a definição (Task 10+)
> chama `validateDocumentDefinition()` antes.

Uma seção é um container ordenado de blocos; pode conter mais de um tipo, e pode aninhar subseções (até `MAX_SECTION_DEPTH = 3` níveis — aninhamento controlado, não recursão arbitrária):

`Cover`, `TableOfContents`, `Text`, `TechnicalInformation`, `Table`, `ImportedTable`, `PhotoSection`, `DocumentAttachment`, `Findings`, `SignatureSection`, `Header`, `Footer`, `PageBreak`.

Extensões futuras (Measurement, Calculation, Map, Chart) só entram por necessidade comprovada — nunca HTML/JS livre do tenant. Cada schema de bloco é `.strict()` (Zod): um campo desconhecido/extra (ex.: uma tentativa de `html`/`script`) é rejeitado deterministicamente, não ignorado silenciosamente — essa é a garantia real de "nenhum bloco executa código arbitrário do tenant", não só uma convenção.

Cada bloco carrega dado e apresentação juntos: não existe um schema de coleta separado de um schema de layout (essa era a separação do modelo antigo, revertida na ADR-0017). Note que cada bloco só carrega seu **contrato de configuração/exibição** — dados de runtime que pertencem a outros domínios ainda não construídos (arquivos de evidência, constatações, assinaturas) não vivem aqui; `PhotoSection`/`Findings`/`SignatureSection` etc. declaram "existe uma seção deste tipo, configurada assim", e os registros reais vêm das Tasks 15/22/28 quando existirem.

**Schema vs. dado real de trabalho:** essa mesma regra vale dentro de cada campo, não só entre blocos. `TechnicalInformationField.defaultValue` e `Table`/`ImportedTable.sampleRows` (nomeados assim deliberadamente, nunca `value`/`rows`) carregam apenas um valor padrão/ilustrativo — nunca a resposta real preenchida numa vistoria. O preenchimento real de um `TechnicalJob` (Task 13+) vive num registro de runtime separado que instancia esta estrutura; ele nunca é escrito de volta em `TechnicalModelVersion.definition` nem em `OrganizationModelVersion.definition`, que permanecem apenas definição.

### API do engine

- `validateDocumentDefinition(input: unknown)` — ponto de entrada único; valida forma (Zod `.strict()`), unicidade de `id` em toda a árvore (mesmo entre seção e bloco não relacionados) e profundidade máxima de aninhamento. Determinístico: a mesma entrada sempre produz o mesmo resultado, nunca aceita parcialmente.
- `generateSectionId()` / `generateBlockId()` — IDs estáveis (`sec-<uuid>`/`blk-<uuid>`), independentes de label/posição — sobrevivem a reordenação e renomeação.
- `reorder(items, id, newIndex, getId)` — reordena sem mutar o array de entrada e sem alterar nenhum ID; posição no array é a única fonte de verdade de ordem (sem campo `order` paralelo que possa dessincronizar).
- `canonicalize()` / `serializeDefinitionCanonical()` — serialização estável: duas definições logicamente idênticas produzem sempre a mesma string, independente da ordem de inserção das chaves usada para construí-las (ordem de array é preservada, por ser semanticamente significativa).
- `CURRENT_DEFINITION_SCHEMA_VERSION` — versão do próprio DSL; uma mudança quebradora futura nos blocos incrementa essa constante em vez de reinterpretar definições já armazenadas sob a versão antiga.

### Fora de escopo da Task 09 (deliberado)

Nenhuma tabela nova foi criada para persistir uma `DocumentDefinition` real — isso fica para quando `OrganizationModel`/publicação (Task 10+) precisar de um lugar concreto para gravá-la. Task 09 entrega o engine validado e testado (inclusive contra uma estrutura realista de um dos 14 modelos da Fase 1, nos testes), não a integração de persistência.

## OrganizationModel / OrganizationModelVersion (Task 10)

> **Implementação:** `packages/domain/src/organization-models` (port) +
> `apps/api/src/organization-models` (rotas + adapter Supabase) +
> `supabase/migrations/20260914240000_organization_models.sql`.

Uma organização nunca começa de um modelo em branco: `OrganizationModel` é sempre derivado de uma `TechnicalModelVersion` **publicada** (`technical_models.status = 'active'` e com `current_published_version_id`), via a RPC `derive_organization_model(p_organization_id, p_technical_model_id, p_name)`. Ela cria, na mesma transação, o `OrganizationModel` e sua primeira `OrganizationModelVersion` (`status = 'draft'`, `version_number = 1`), copiando a `definition`/`definition_schema_version` da versão de origem **verbatim** — nunca em branco.

`TechnicalModelVersion.definition` também passou a existir na Task 10 (coluna `definition jsonb`, populada para os 14 modelos da Fase 1 na mesma leva de migrations) justamente para que essa cópia inicial tivesse conteúdo real, e não um documento vazio.

Invariantes:

- um `OrganizationModel` pertence a exatamente uma organização; a organização A nunca vê nem altera o modelo derivado da organização B (RLS + FK composta tenant-safe: `organization_model_versions.organization_model_id` referencia `organization_models(id, organization_id)`, tornando uma referência cross-tenant estruturalmente impossível mesmo com um `organization_id` internamente consistente na própria linha);
- a versão derivada mantém `technical_model_version_id` como proveniência — nunca perdida, mesmo depois de futuras edições do rascunho;
- toda `definition` gravada passa por `validateDocumentDefinition()` (Task 09) antes de chegar ao Postgres — a API nunca redeclara os 13 schemas de bloco; um bloco desconhecido, um campo extra/desconhecido, ou um id duplicado é rejeitado deterministicamente com 422;
- a organização nunca altera `TechnicalModel`/`TechnicalModelVersion` — nenhum role de tenant tem grant de escrita no catálogo global;
- edição do rascunho (título/descrição/definição) é um PATCH estruturado único e validado (`PATCH /:id/draft`) — não uma dezena de endpoints de microedição por bloco.

Capability nova: `organization_model.read` (concedida a todo role exceto `billing_admin`) é distinta de `technical_model.read` — ver `docs/security/AUTHORIZATION.md`. `organization_model.create`/`customize`/`publish` permanecem restritas a `owner`/`admin`/`template_manager` desde a Task 05.

### Fora de escopo da Task 10 (deliberado)

Requirement & Compatibility Guard (Task 11); publicação/imutabilidade de `OrganizationModelVersion` (Task 12); `TechnicalJob` e qualquer dado de execução real (Task 13+); editor visual/frontend; fotos; renderizador de PDF; branding; assinaturas.

## Requirements

Cada requisito de uma `TechnicalModelVersion` tem:

- `requirement_id`, `label`, `level` (`required` | `recommended` | `optional`);
- `source_reference` (norma/lei/manual de origem);
- `applies_when` (condição de aplicabilidade);
- `covered_by` (section/block/fields que atendem o requisito);
- `organization_override` + `override_reason` quando a organização altera;
- `compatibility_effect` (se remover um `required` derruba o status "compatível com o modelo-base").

Nenhum modelo declara conformidade normativa (ex.: "conforme NBR X") sem fonte, versão e revisão por profissional habilitado com acesso legítimo à norma — ver `docs/product/technical-models/RESEARCH_PROTOCOL.md` para os status (`RESEARCH_ONLY` → `VERIFIED_REFERENCE_MODEL`).

## Contratos (mantidos do modelo anterior, agora por seção/bloco)

`data_schema_json`-equivalente: contrato de dados de cada bloco (ex.: campos do `TechnicalInformation`).

`rules_json`: condições/ações declarativas (visibilidade condicional de seção/bloco).

`defaults_json`: valores iniciais seguros.
