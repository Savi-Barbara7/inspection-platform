# Job Runtime Values, Provenance & Overrides (Task 14)

> **Implementação:** `packages/domain/src/job-runtime-values` (o motor —
> puro, sem I/O) + `packages/domain/src/technical-jobs` (placeholder
> mínimo — ver aviso abaixo) + `apps/api/src/job-runtime-values` +
> `apps/api/src/technical-jobs` + `20260915020000_job_runtime_values_foundation.sql`.

## Princípio central

**CADASTRO ≠ VALOR DO TRABALHO.**

Quando um trabalho captura um valor de uma fonte externa (Customer, Site,
Organization, TechnicalProfessional...) para um `DataBinding` (Task 13),
esse valor ganha identidade própria dentro do trabalho: um
`JobRuntimeValue`. O cadastro pode mudar depois — o trabalho nunca muda
sozinho. Só uma ação explícita (refresh) atualiza a captura.

## O fluxo completo (o mesmo exemplo do brief da Task 14)

```
Customer record (Horizonte Empreendimentos, taxId = A)
      ↓
SourceRole: customer (Task 13)
      ↓
DataBinding: {scope: {kind:"role", role:"customer"}, fieldId:"taxId"} (Task 13)
      ↓
CAPTURE — POST /api/v1/job-runtime-values
      ↓
JobRuntimeValue.capturedValue = {kind:"resolved", scalar:{fieldType:"identifier", value:"A"}}
JobRuntimeValue.provenance = {type:"SOURCE_RECORD", sourceType:"Customer", sourceEntityId:<real id>, ...}
      ↓
(opcional) override → JobRuntimeValue.override = {value: X, setBy, setAt, reason?}
      ↓
effectiveValue = override?.value ?? capturedValue   (nunca `capturedValue || override`)
```

Depois, se o cadastro mudar:

```
Customer.taxId muda de A para B
      ↓
JobRuntimeValue.capturedValue continua A (nada muda sozinho)
      ↓
POST /:id/compare {current: {available:true, value:{rawValue:"B"}}} → {status:"changed", capturedValue:A, currentValue:B}
      ↓
NENHUMA alteração automática acontece por causa desse compare
      ↓
POST /:id/refresh {value:{rawValue:"B"}, provenance:{...}} — ação explícita
      ↓
JobRuntimeValue.capturedValue passa a ser B; um override ativo (se houver) é preservado intacto
```

## Quatro conceitos, nunca confundidos (continuação da Task 13)

```
FieldDefinition   →  O QUE o dado significa (Task 13 — global, sem I/O)
DataBinding       →  DE ONDE o bloco deve buscar aquele dado (Task 13 — nunca um id real)
FieldPlacement    →  COMO aquele dado aparece no bloco (Task 13 — label/format, presentational)
JobRuntimeValue   →  QUAL o valor efetivo desse dado NESTE trabalho (Task 14 — pode conter um id real)
```

A regra da Task 13 ("um `DataBinding` nunca contém um id de entidade
real") continua válida — ela é sobre a _definição_ do modelo. Um
`JobRuntimeValue.provenance` é um conceito completamente diferente: ele
**pode e deve** carregar o id da entidade real de onde o valor veio,
porque é exatamente aí — no trabalho, nunca no template — que essa
associação pertence.

## Estados de valor: nunca um `null` sozinho

```ts
type ResolvedValue =
  | { kind: "resolved"; scalar: RuntimeScalarValue } // há um valor real, tipado
  | { kind: "missing" } // não há valor (ainda)
  | { kind: "not_applicable" } // este campo não se aplica aqui
  | { kind: "invalid"; rawValue: unknown; reason: string };
```

`missing` é sempre distinto de `not_applicable` — o segundo só é definido explicitamente pelo chamador, nunca inferido de um valor ausente/vazio. `false`, `0` e `""` (quando o tipo do campo permite string vazia) são sempre `resolved` de verdade — `validateScalarValue()` nunca faz `value || fallback`.

`effectiveValue` (o que um renderer futuro deve consumir) é sempre:

```ts
override ? override.value : capturedValue;
```

nunca uma coalescência por truthiness. `getEffectiveState()` retorna `"overridden"` sempre que há um override ativo — visível explicitamente, nunca escondido dentro do estado do valor capturado.

## Provenance

```ts
type ProvenanceType =
  | "SOURCE_RECORD" // veio de um cadastro real (Customer, Site, ...) — implementado
  | "MANUAL_INPUT" // digitado pelo usuário para este trabalho — implementado
  | "DEFAULT" // inicializado a partir do defaultValue do template (Task 10) — implementado
  | "IMPORT"
  | "CALCULATION"
  | "PRIOR_JOB"
  | "FIELD_COLLECTION"; // reservados, não construídos ainda
```

`SOURCE_RECORD` carrega `sourceType`, `sourceRole`, `sourceEntityId`, `sourceFieldId`, `sourceReference?` e `capturedAt` — este é o único lugar em todo o domínio onde um id de entidade real é uma informação legítima e esperada.

## Override — nunca destrói a captura original

`setOverride()` grava `{value, reason?, setBy, setAt}` num campo separado (`override`), sem tocar em `capturedValue`/`provenance`. "Restaurar valor capturado" (`removeOverride()`) apenas apaga esse campo — **nunca busca o cadastro atual**. Isso é uma operação deliberadamente diferente de "refresh".

## Refresh — sempre explícito, sempre preserva o override

`refreshCapturedValue()` substitui `capturedValue`/`provenance` pelo valor/proveniência que o chamador já resolveu externamente (este módulo nunca lê Customer/Site/etc. sozinho). Um override ativo continua prevalecendo depois do refresh — só é removido por uma ação separada e explícita (`removeOverride`).

## Compare — puro, nunca automático

`compareWithCurrentSource(capturedValue, current)` é uma função pura: o valor "atual" vem de fora (quem chama já sabe como ler a fonte — hoje, o único caminho real é `GET /api/v1/customers/:id`, já existente desde a Task 07). Resultado: `unchanged` | `changed` | `source_missing` (entidade/campo não existe mais) | `source_unavailable` (existe mas não pôde ser lido agora, ex.: arquivado). Em nenhum dos casos o valor capturado é alterado — comparar nunca modifica nada.

## "Nunca resolver direto no renderer"

Esta é uma regra arquitetural, não só uma convenção: nenhuma função neste módulo (nem em nenhum outro deste domínio) sabe como ler um Customer/Site ao vivo. Um futuro `RenderPlan`/PDF deve consumir exclusivamente `JobRuntimeValue.capturedValue`/`override` — nunca reabrir uma consulta ao cadastro. Como o próprio motor não tem capacidade de fazer essa consulta, essa regra é estruturalmente impossível de violar a partir daqui.

## TechnicalJob — placeholder deliberado (substituído pela Task 15)

`packages/domain/src/technical-jobs` existia **apenas** para dar a `JobRuntimeValue` uma âncora tenant-safe (`{id, organizationId, organizationModelVersionId}`). A Task 15 substitui esse placeholder pela entidade real (workflow mínimo, árvore de documento em runtime, RepeatableGroup, SourceRole assignments) — ver `docs/domain/RUNTIME_DOCUMENT_TREE.md`. O princípio "sempre a versão publicada, nunca o draft atual" (Task 14 seção 35) permanece exatamente o mesmo depois da Task 15: `organizationModelVersionId` é fixado na criação e nunca re-resolvido, nem depois que uma versão mais nova é publicada.

## GroupItem-scoped values (Task 15)

`resolveBindingFieldType()` (`apps/api/src/job-runtime-values`) agora resolve um binding `GroupItem`-scoped (`context: {kind:"groupItem", groupItemId}`) contra o `repeatable.fields` da própria seção do `GroupItem` (via `GroupItem.definitionSectionId`, buscado na definição congelada do job) — nunca contra o catálogo global (que continua vazio para `GroupItem`, de propósito). O restante do fluxo de captura/override/refresh é idêntico ao de qualquer outro `SourceType`: identidade é `(technicalJobId, bindingId, contextKey)`, e dois `GroupItem`s com o mesmo `bindingId` recebem `JobRuntimeValue`s completamente independentes (contexts diferentes, sem colisão).

## Isolamento (Task 14 seção 22)

`job_runtime_values.source_customer_id`/`source_site_id` são colunas dedicadas com FK composta tenant-safe para `customers`/`sites` — uma referência cross-tenant é um `23503` estrutural, não uma promessa da aplicação. Para `TechnicalProfessional`/`Project`/etc., que ainda não têm tabela própria (ver `docs/domain/DATA_SOURCES.md`), essa validação estrutural **não existe ainda** — uma lacuna conhecida e documentada, a ser fechada quando essas tabelas existirem, nunca um descuido silencioso.

## Versionamento do FieldDefinition (Task 14 seção 34)

`JobRuntimeValue.fieldType` é uma cópia (snapshot) do `FieldDefinition.fieldType` no momento da captura — override/refresh sempre validam contra esse `fieldType` já guardado, nunca contra o catálogo global atual. Se o catálogo mudar no futuro, valores já capturados continuam interpretáveis exatamente como foram gravados.

## Fora de escopo da Task 14 (deliberado)

`RepeatableGroup` runtime; árvore de documento; evidência/fotos; importação de pastas; findings; `CommunicationRecord` runtime completo; comparação de baseline entre jobs; renderer/PDF/`RenderPlan`; frontend; Field App; OCR; IA; billing. Um resolvedor genérico "leia o valor atual de qualquer `SourceType`" também não foi construído — só `Customer`/`Site` têm tabela real hoje, e mesmo para eles a leitura "atual" é responsabilidade de quem chama `/compare`/`/refresh`, nunca deste módulo.
