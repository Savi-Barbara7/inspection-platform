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

Uma seção é um container ordenado de blocos; pode conter mais de um tipo:

`Cover`, `TableOfContents`, `Text`, `TechnicalInformation`, `Table`, `ImportedTable`, `PhotoSection`, `DocumentAttachment`, `Findings`, `SignatureSection`, `Header`, `Footer`, `PageBreak`.

Extensões futuras (Measurement, Calculation, Map, Chart) só entram por necessidade comprovada — nunca HTML/JS livre do tenant.

Cada bloco carrega dado e apresentação juntos: não existe um schema de coleta separado de um schema de layout (essa era a separação do modelo antigo, revertida na ADR-0017).

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
