# Typed Data Sources, Roles & Bindings (Task 13)

> **Implementação:** `packages/domain/src/data-sources` (catálogo global,
> puro, sem I/O) + duas adições mínimas em
> `packages/domain/src/templates/blocks.ts` (Task 09) +
> `apps/api/src/data-sources` (rota de leitura do catálogo) +
> `PATCH /api/v1/organization-models/:id/draft` (Task 10/11) reaproveitado
> para validar bindings. **Nenhuma migration nova** — bindings vivem
> dentro da coluna `definition jsonb` já existente desde a Task 09/10.

## Princípio central

**CRIAR UM DADO ≠ CRIAR UM BLOCO.**

Um dado (`Customer.taxId`) tem identidade semântica própria. Um bloco só
o **apresenta**. O mesmo CNPJ pode aparecer na capa, num bloco de
informações, numa tabela e (futuramente) num texto corrido — todas essas
ocorrências devem apontar para o mesmo slot semântico, nunca cópias
independentes.

## Sete conceitos, nunca confundidos

```
SourceType        →  QUE TIPO de entidade (Customer, Site, Organization...)
SourceEntity      →  UMA entidade real, tenant-bound (não existe nesta task)
SourceRole        →  QUE PAPEL uma entidade exerce num job (customer, requester...)
FieldDefinition   →  O QUE um campo significa (Customer.taxId é um "identifier")
DataBinding       →  DE ONDE um bloco deve buscar aquele dado (role + fieldId)
FieldPlacement    →  COMO aquele dado aparece ali (label, format — presentational)
JobRuntimeValue   →  QUAL o valor real (Task 14 — não existe ainda)
```

`SourceType` e `SourceRole` não são a mesma coisa: `Customer` é um tipo;
`customer`/`requester`/`owner`/`outgoingContractor` são papéis que uma
entidade `Customer` pode exercer num job — dois papéis podem apontar
para a mesma entidade real, e nada nisso é assumido por igualdade de
nome.

## Exemplo completo (o mesmo do brief da Task 13)

```
Customer (SourceType)
  ↓
role "customer" (SourceRole — cardinalidade single)
  ↓
fieldId "taxId" (FieldDefinition: fieldType "identifier", label "Documento (CPF/CNPJ)")
  ↓
DataBinding { id: "bind-tax-id", scope: {kind:"role", role:"customer"}, fieldId: "taxId" }
  ↓
TechnicalInformationField { id:"f-cnpj", label:"CNPJ", bindingId:"bind-tax-id", format:"identifierFormatted" }
  ↓
futuro JobRuntimeValue (Task 14) — o CNPJ real daquele trabalho específico
```

Note que o `label` do campo ("CNPJ") é puramente apresentacional — trocar
para "Documento fiscal" nunca muda o `bindingId`, e portanto nunca muda
o que aquele campo *significa*. Da mesma forma, dois campos ambos
rotulados "Endereço" podem ser slots completamente diferentes
(`Customer.primaryAddress` vs. `Site.address`) — identidade é sempre
`(sourceType, fieldId)`, nunca o texto do label.

## Catálogo de fontes (global, determinístico)

`packages/domain/src/data-sources/index.ts` define, para cada
`SourceType`, um registro fixo de `FieldDefinition`s (`FIELD_DEFINITIONS`)
e, para cada `SourceRoleId`, seu `sourceType` esperado e cardinalidade
(`SOURCE_ROLES`). `getDataSourceCatalog()`/`getSourceRoleCatalog()`
expõem isso de forma **determinística e sem parâmetros** — não recebem
`organizationId` nem `technicalModelId`/slug, porque o catálogo é o
mesmo para todo mundo. `GET /api/v1/data-sources` expõe essa mesma
função via HTTP (`requireAuth` apenas, sem capability, mesmo racional do
catálogo de `technical-models` da Task 08).

Fontes cobertas nesta task: `Organization`, `Customer`, `Site`,
`Project`, `TechnicalProfessional`, `TechnicalJob`, `InspectionEvent`,
`GroupItem` (deliberadamente vazio — RepeatableGroup ainda não existe,
seu schema será definido pelo modelo, não globalmente), `CustomData`
(um pequeno conjunto fixo de exemplo: `contractNumber`,
`constructionPermitNumber`, `internalReference` — organização poder
definir os próprios campos customizados é trabalho futuro).

Papéis cobertos: `customer`, `requester`, `owner`, `contractor`,
`insurer`, `previousContractor`, `outgoingContractor`,
`incomingContractor`, `primarySite`, `project`, `primaryProfessional`
(cardinalidade `single`), `supportingProfessional` (cardinalidade
`multiple`). Registro plano, não-verticalizado — nenhum papel é
específico de um modelo técnico; `outgoingContractor`/
`incomingContractor` existem para a Transição de Construtora, mas são
tão genéricos quanto qualquer outro papel, sem nenhum `if` no motor.

## DataBinding: WHERE, nunca WHO

```ts
interface DataBinding {
  id: string;
  scope: BindingScope; // { kind: "role", role } | currentGroupItem | ancestorGroupItem | job | inspectionEvent
  fieldId: string;
}
```

`scope` nunca é um índice de array (`groups[0]`) — bindings precisam
sobreviver a reorder. E, fundamental para isolamento (`docs/security/`):
**um `DataBinding` nunca contém um id de entidade real** — o schema é
`.strict()` e não existe nenhum campo que pudesse carregar um
`customerId`/`siteId`. A associação com uma entidade real de uma
organização específica só vai existir dentro de um `TechnicalJob`
(Task 15+), nunca dentro da definição de um modelo. Isso é comprovado
por teste: uma tentativa de incluir `customerId` num `DataBinding` é
rejeitada como campo desconhecido.

`resolveScopeSourceType(scope)` deriva o `SourceType` a partir do
`scope` — nunca é declarado separadamente e nunca pode discordar dele
(elimina uma classe inteira de estado inválido "role X mas sourceType
Y").

## FieldPlacement: como o dado aparece, nunca o que ele significa

Em vez de introduzir uma estrutura paralela, a Task 13 estende
minimamente `TechnicalInformationField` (Task 09) com dois campos
opcionais:

- `bindingId?: string` — referencia um `DataBinding.id` do array
  `dataBindings` da própria `DocumentDefinition`.
- `format?: FieldFormat` — um enum fechado e tipado
  (`dateShort`/`dateLong`/`identifierFormatted`/`addressSingleLine`/
  `addressMultiLine`/`numberFormatted`/`currency`/`default`) — nunca uma
  expressão livre, nunca `eval`. Um `format` incompatível com o
  `fieldType` semântico do `FieldDefinition` referenciado é rejeitado
  (ex.: `dateShort` num campo `identifier`).

Um `DataBinding` pode ser referenciado por vários `TechnicalInformationField`s
ao mesmo tempo (o mesmo CNPJ na capa e no corpo do documento), e o mesmo
`FieldDefinition` pode ser usado por vários `DataBinding`s independentes
(dois bindings diferentes, ambos para `Customer.taxId`, com `id`s
distintos — por exemplo um para `customer` e outro para
`outgoingContractor`).

## Onde isso vive no schema

`dataBindings?: DataBinding[]` foi adicionado como campo opcional de
`DocumentDefinition` (Task 09). Como `definition jsonb` já existia desde
a Task 08/10 em `technical_model_versions`/`organization_model_versions`,
**nenhuma migration nova foi necessária** para a Task 13 — toda
definição gravada antes desta task simplesmente não tem `dataBindings`,
e continua válida sem qualquer migração de dados. Os 14 modelos já
seedados da Fase 1 não foram tocados.

Isso também significa que a imutabilidade da Task 12 já protege
`dataBindings` automaticamente: o trigger `prevent_published_organization_model_version_mutation`
compara a linha inteira via `jsonb`, então uma versão publicada com
bindings fica tão congelada quanto qualquer outra — nenhum código novo
foi necessário para isso.

## Duas camadas de validação, deliberadamente separadas

1. **`validateDocumentDefinition()`** (Task 09, inalterada em sua lógica
   central) continua validando forma + unicidade de id + profundidade.
   Como `dataBindings` agora faz parte do shape schema, um `DataBinding`
   com campo desconhecido, `scope.kind` inválido ou `role` desconhecido
   já é rejeitado **nesta camada**, antes de qualquer coisa mais
   específica rodar.
2. **`validateDataBindingsInDefinition()`** (nova, Task 13) faz as
   checagens semânticas que a Task 09 não tem como saber: todo
   `bindingId` referenciado por um campo realmente existe em
   `dataBindings`; todo `DataBinding` aponta para um `fieldId` que
   realmente existe no `FieldDefinition` do `SourceType` resolvido
   (pulado para `GroupItem`, cujo schema é dinâmico); todo `format`
   declarado é compatível com o tipo semântico do campo vinculado.

`PATCH /api/v1/organization-models/:id/draft` chama as duas, na ordem,
exatamente como já fazia com `validateRequirementOverrides()` (Task 11)
— reaproveitando o mesmo endpoint estruturado único, sem nenhum novo
endpoint de microedição por binding.

## O teste arquitetural que prova isto é genérico

`packages/domain/test/data-sources.test.ts` inclui um teste que lê o
próprio arquivo-fonte de `data-sources/index.ts` e garante que ele nunca
contém o nome de nenhuma vertical específica (Cautelar, Lindeiro,
Sinistro, Transição...) nem qualquer padrão de comparação por
slug/id de `TechnicalModel`. Complementarmente, um teste de integração
usa a **mesma** definição JSON, byte a byte, contra duas
`OrganizationModel`s de organizações diferentes (uma "estilo Cautelar",
outra "estilo Entrega") e prova que ambas aceitam o binding
`Customer.taxId` sem qualquer branch de código — e que
`outgoingContractor`/`incomingContractor` (o caso de uso da Transição de
Construtora) resolvem para o mesmo `SourceType` (`Customer`) sob papéis
diferentes, também sem nenhum código específico de modelo.

## Fora de escopo da Task 13 (deliberado)

`JobRuntimeValue` (o valor real que um campo tem num trabalho
específico), provenance, overrides de valor, captura/refresh a partir do
cadastro real — tudo isso é Task 14. `RepeatableGroup` runtime (por isso
`GroupItem` não tem um catálogo de campos global). `TechnicalJob`
persistence completa (Task 15). Editor de rich text/tokens de texto
(a arquitetura já permite que um token futuro referencie o mesmo
`DataBinding` usado por um bloco, já que `dataBindings` vive num único
lugar por documento — mas nenhum editor foi construído). UI. Lookup
externo de CNPJ. OCR/IA.
