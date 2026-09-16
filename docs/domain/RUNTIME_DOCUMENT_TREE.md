# Technical Job Foundation & Runtime Document Tree (Task 15)

> **Implementação:** `packages/domain/src/technical-jobs` (a entidade real, substituindo o placeholder da Task 14), `packages/domain/src/job-source-assignments`, `packages/domain/src/runtime-document-tree` (o motor — puro, sem I/O), `apps/api/src/technical-jobs`, `apps/api/src/group-items`, `apps/api/src/runtime-document-tree`, `apps/api/src/job-source-assignments`, `20260915030000_technical_job_runtime_document_tree.sql`.

## Princípio central

**MODELO PUBLICADO ≠ DOCUMENTO RUNTIME.**

Um `OrganizationModelVersion.definition` (Task 09/12/13) é estrutura — um
JSON validado, imutável depois de publicado. Um `TechnicalJob` nunca lê
essa definição "ao vivo" para saber sua própria forma: na criação, a
árvore inteira é **materializada uma única vez** em linhas `runtime_nodes`
com identidade própria, estável, gerada de novo — nunca reaproveitando o
`id` do section/block da definição (esse vira apenas `definitionId`, um
retrato de origem, não a identidade runtime).

```
OrganizationModelVersion.definition        (Task 09/12 — estrutura, imutável)
        │
        │  materialize_technical_job()  (uma vez, na criação do job)
        ▼
TechnicalJob                               ("instância congelada" na versão)
        │
        ▼
Runtime Document Tree
  ├── RuntimeNode (section/block, id próprio ≠ definitionId)
  │     └── RuntimeNode (filhos, mesma regra)
  └── RuntimeNode (RepeatableGroup container, is_repeatable_container=true)
        └── GroupItem (uma instância — "Imóvel 01")
              └── RuntimeNode (subárvore própria desse item, id próprio)
        └── GroupItem (outra instância — "Imóvel 02")
              └── RuntimeNode (subárvore própria, ids DIFERENTES, mesmo definitionId)
        ▼
JobRuntimeValue (Task 14) — contextual: {kind:"job"} | {kind:"groupItem", groupItemId}
```

## O exemplo que prova a imutabilidade (Task 15 seção 21/53)

```
MODEL VERSION v3  →  publicada  →  JOB A criado, captura v3 (organizationModelVersionId = v3)
MODEL VERSION v4  →  publicada depois (novo draft, editado, publicado)
JOB A continua v3 — nada em JOB A muda. current_published_version_id do
OrganizationModel agora aponta pra v4, mas isso é irrelevante pro JOB A:
ele nunca é "re-resolvido" contra a versão atual, só contra a que
capturou na criação.
```

Provado tanto em pgTAP (`supabase/tests/technical_job_runtime_document_tree_test.sql`,
assertions 21) quanto no smoke test real via `wrangler dev` + Supabase local.

## TechnicalJob — de placeholder (Task 14) a entidade real

```ts
interface TechnicalJob {
  id: string;
  organizationId: string;
  organizationModelVersionId: string; // sempre uma versão PUBLICADA — nunca draft/"latest"
  name: string;
  status: "draft" | "active" | "archived"; // deliberadamente mínimo — sem workflow de revisão/emissão ainda
  createdBy: string;
  responsibleProfessionalId: string | null; // TechnicalProfessional ainda não tem tabela própria (gap documentado desde a Task 14)
  createdAt: string;
  updatedAt: string;
}
```

## Job Source References — identidade do job, não um RuntimeValue

Um `JobSourceAssignment` (`packages/domain/src/job-source-assignments`)
registra **qual entidade real** ocupa cada `SourceRole` (Task 13) naquele
job — `customer`, `outgoingContractor`, `supportingProfessional`... Isso é
**identidade do job**, atribuída atomicamente na criação — nunca embutida
dentro de um `JobRuntimeValue`.

Cardinalidade é declarada, nunca inferida: um role `"single"` (a maioria)
não pode ser atribuído duas vezes no mesmo job — `validateSourceAssignments()`
rejeita isso na camada de aplicação (primeira linha de defesa) e um
índice único parcial em `job_source_assignments(technical_job_id, role)
where role <> 'supportingProfessional'` rejeita estruturalmente (segunda
linha). Um role `"multiple"` (hoje só `supportingProfessional`) aceita
quantas atribuições forem necessárias.

## RepeatableGroup — o motor genérico (Task 15 seção 8/28)

Um `Section.repeatable` (extensão da Task 15 ao DSL de blocos da Task 09)
descreve o que **UMA instância** parece:

```ts
interface RepeatableGroupConfig {
  labelSingular: string; // "Imóvel", "Pavimento", "Sistema" — dado do template, não vocabulário do motor
  labelPlural: string;
  fields: RepeatableGroupFieldDefinition[]; // o schema DESSE grupo — nunca um catálogo global
}
```

Na materialização do job, uma seção `repeatable` vira **um único**
`RuntimeNode` container (`is_repeatable_container = true`) — seu próprio
`blocks`/`sections` **não** são materializados ali. Cada `GroupItem`
(adicionado depois, explicitamente, via `add_group_item()`) recebe sua
própria cópia dessa subárvore, com `runtime_nodes.group_item_id` apontando
pra ele — o mesmo `definitionId` ("blk-nome-da-area", por exemplo) aparece
em cada item, mas com um `id` de runtime **diferente e independente** a
cada vez. Zero colisão.

GroupItems podem ser aninhados — um RepeatableGroup dentro de outro (ex.:
"Edificações" → "Ambientes") — respeitando o mesmo `MAX_SECTION_DEPTH`
que toda seção já respeita. Não existe um limite de aninhamento separado
para grupos repetíveis. Nesting só suporta um único pai por item (sem
suporte a múltiplos pais).

> **Task 15.5A — Runtime Tree Integrity (implementada):** um
> RepeatableGroup aninhado materializa **um `RuntimeNode` container novo
> por instância do grupo externo** — "Edificação A" e "Edificação B" cada
> uma tem seu próprio container "Ambientes", e os dois compartilham o
> mesmo `definitionSectionId` ("sec-inner"). Antes desta task, o código
> reencontrava "o" container de um `GroupItem` buscando por
> `definitionSectionId` — ambíguo sempre que mais de um container assim
> existisse, podendo atribuir/clonar a subárvore errada. A correção
> adiciona `GroupItem.containerNodeId`: a referência única e autoritativa
> ao `RuntimeNode` exato daquele item — nunca mais re-derivada por busca.
> `parentGroupItemId` deixou de ser aceito como input independente em
> `add_group_item()` (era exatamente como um container de um pai podia
> ser combinado com um `parentGroupItemId` de outro) — agora é sempre
> **derivado no servidor** a partir do próprio `container_node_id`
> (`runtime_nodes.group_item_id`), eliminando essa classe de bug
> estruturalmente em vez de apenas validá-la. Migration:
> `20260915040000_task_15_5a_runtime_tree_integrity.sql`.

## GroupItem como DataBinding source (fechando o débito da Task 13)

A Task 13 deixou o catálogo de campos de `GroupItem` deliberadamente vazio
— não existe (e nunca vai existir) um registro global do tipo
"lindeiro.address" ou "pavimento.nivel", porque esses nomes são dado de
template, não vocabulário do motor. A Task 15 fecha esse débito em dois
lugares:

1. **Validação estática** (`validateDataBindingsInDefinition()`,
   `packages/domain/src/data-sources`): ao validar uma definição, um
   binding `currentGroupItem`/`ancestorGroupItem` é resolvido contra o
   `repeatable.fields` do grupo que efetivamente o envolve na árvore (via
   uma pilha de grupos ancestrais) — nunca um catálogo global.
2. **Resolução em runtime** (`resolveBindingFieldType()`,
   `apps/api/src/job-runtime-values`): ao capturar um valor com
   `context: {kind:"groupItem", groupItemId}`, o `fieldType` semântico é
   resolvido buscando o `GroupItem.definitionSectionId` na definição
   congelada do job e olhando o `repeatable.fields` **daquela** seção —
   de novo, nunca uma busca por slug de modelo.

## Estado runtime — nunca um "sumiço" silencioso

```
RuntimeNode.state:
  visible               → normal
  hidden                → escondido explicitamente, ainda persistido por completo
  conditional_inactive  → uma condição materializada avalia falso agora — nunca removido da árvore

GroupItem.state:
  active     → parte da estrutura viva
  archived   → soft-hidden, recuperável, NUNCA um DELETE físico
```

Um cliente **não** pode alterar `state`/`position`/`parent_group_item_id`
de um `GroupItem` via PATCH direto — `UPDATE` em `group_items` é
revogado de `authenticated`/`anon` inteiramente (correção pós-15.5A,
achado de red-team: a policy de RLS anterior permitia isso e contornava
completamente as invariantes de `archive_group_item()`/
`restore_group_item()`/`reorder_group_items()`). Toda mutação estrutural
de um `GroupItem` passa por uma RPC `SECURITY DEFINER` — nunca um PATCH
cru na tabela. O trigger de imutabilidade de identidade (mesma técnica
de comparação de `to_jsonb` inteira da Task 12) continua existindo como
segunda camada de defesa (útil mesmo dentro de uma RPC, caso algum
código futuro tente indevidamente reescrever a identidade), mas a
revogação do `GRANT UPDATE` é a defesa primária agora — um PATCH nem
chega a ser avaliado pelo trigger, é rejeitado antes disso
(`42501 permission denied`). `RuntimeNode.state`/`position` continuam
PATCH-áveis diretamente (mudar visibilidade de um nó não é uma operação
estrutural no mesmo sentido) — essa distinção é deliberada, não uma
inconsistência.

## Ordem — sempre posição explícita

`position` é a única fonte de verdade de ordem (nunca índice de array em
memória, nunca timestamp). `reorder_runtime_nodes()` reatribui posição
para todos os filhos de um escopo `(parent_node_id, group_item_id)` a
partir de uma lista ordenada de ids explícita — e rejeita qualquer lista
que não corresponda exatamente ao conjunto atual de filhos (nunca
permite "esquecer" ou "inventar" um irmão). Os ids nunca mudam.

`reorder_group_items()` (Task 15.5A) é o mesmo contrato para GroupItems:
escopado por `container_node_id` (que sozinho já identifica o conjunto de
irmãos — sem precisar de um segundo parâmetro "qual pai", diferente do
reorder de RuntimeNode). Reatribui posição em duas fases dentro da
transação (desloca todo o conjunto para fora da faixa `[0, N)` antes de
atribuir os valores finais) porque o índice único parcial
`(container_node_id, position) WHERE state='active'` é verificado por
statement, não é deferrable (índice parcial não pode virar constraint
deferrable) — atribuir posições finais uma a uma sem essa fase
intermediária colidiria consigo mesmo ao trocar dois itens de lugar.

**Concorrência otimista (correção pós-15.5A, achado de red-team):** um
lock de linha impede colisão física entre duas chamadas concorrentes,
mas não impede uma "lost update" — dois reorders calculados a partir do
MESMO estado inicial, enviados quase ao mesmo tempo, usam exatamente o
mesmo conjunto de ids (nada omitido/duplicado), então a validação de
conjunto exato sozinha não pega isso. `runtime_nodes.group_items_revision`
é um contador monotônico no próprio nó container, incrementado por
`add_group_item()`/`duplicate_group_item()`/`archive_group_item()`/
`restore_group_item()`/`reorder_group_items()` toda vez que o conjunto/
ordem ativo de GroupItems daquele container realmente muda (nunca num
no-op idempotente). `reorder_group_items()` agora exige
`p_expected_revision` e rejeita a chamada (`errcode 40001`, mapeado para
HTTP 409) se não bater com o valor atual — o cliente lê
`groupItemsRevision` do container na árvore de documento e o devolve na
chamada de reorder; se o container mudou nesse meio-tempo, a chamada
falha em vez de sobrescrever silenciosamente. Provado com duas conexões
Postgres reais e concorrentes (não apenas pgTAP sequencial): uma
`duplicate_group_item()` segurando o lock do container por 3s bloqueou
de fato uma `reorder_group_items()` concorrente por ~2.1s (nem deadlock,
nem falha instantânea) — ao desbloquear, o reorder detectou a revisão
alterada e abortou corretamente, sem aplicar nenhuma mudança parcial.

## Duplicar e arquivar

`duplicate_group_item()` clona a subárvore de UM GroupItem com ids
inteiramente novos (GroupItem + cada RuntimeNode) — nunca reaproveita os
originais. Não propaga para GroupItems aninhados (um RepeatableGroup
dentro do item duplicado fica com seu próprio container novo, vazio) —
isso é uma fronteira deliberada, documentada, não um esquecimento; também
não copia `JobRuntimeValue`s. Resolve seu próprio container via
`container_node_id` diretamente (Task 15.5A) — nunca mais por busca
ambígua.

**Ordem de lock padronizada (correção pós-15.5A, achado de red-team):**
toda mutação estrutural — `add_group_item()`, `duplicate_group_item()`,
`archive_group_item()`, `restore_group_item()`, `reorder_group_items()`
— trava primeiro o `RuntimeNode` container, depois o(s) `GroupItem`(s)
que toca. Antes desta correção, `duplicate_group_item()`/
`restore_group_item()` travavam o item primeiro e só depois o container
— ordem invertida em relação a `reorder_group_items()` (que sempre
travou o container primeiro), um risco real de deadlock entre um
duplicate/restore e um reorder concorrentes no mesmo container. Provado
com duas transações Postgres reais e concorrentes que a nova ordem
nunca gera deadlock (só bloqueio serializado, com o tempo de espera
exato esperado).

Arquivar (`archive_group_item()`, Task 15.5A red-team fix — antes um
PATCH direto na coluna `state`, agora RPC-only, simétrico a restaurar)
nunca deleta fisicamente — some da árvore padrão (`buildDocumentTree()`
filtra por padrão), mas continua acessível com `includeArchived=true`.
Arquivar um item já arquivado é um no-op idempotente.

Restaurar (`restore_group_item()`, Task 15.5A) recalcula uma posição
**nova**, ao final da lista de irmãos ativos, em vez de tentar
reaproveitar a posição antiga do item. Isso fecha o cenário exato que
motivou essa task: item na posição 1 → arquivado → um item novo assume
a posição 1 → o item arquivado é restaurado — sem a posição recalculada,
ele colidiria com o item novo. Restaurar um item já ativo é um no-op
idempotente (retorna o item sem mudar nada). `PATCH /group-items/:id
{state}` na API é o único ponto de entrada HTTP para ambos — despacha
internamente para `archive_group_item()`/`restore_group_item()` conforme
o valor de `state`, nunca um PATCH cru na tabela em nenhum dos dois
casos.

## Document Tree — shape de leitura, nunca um blob armazenado

`buildDocumentTree()` (pura, testável sem banco) monta a árvore a partir
de `runtime_nodes`/`group_items` relacionais — nunca lida como um JSON
único. Deliberadamente **não carrega título/label**: isso vive só na
definição congelada da versão publicada, que o cliente já buscou e pode
cachear indefinidamente (é imutável). Duplicar texto apresentacional em
cada nó, em cada leitura, custaria mais do que essa única busca — e é
exatamente o tipo de carregamento desnecessário de blob que a Task 15
pede pra evitar em documentos grandes (500+ páginas, centenas de nós).

## API

```
POST   /api/v1/technical-jobs                          {organizationModelId, name, sourceAssignments[]}
GET    /api/v1/technical-jobs?organizationId=
GET    /api/v1/technical-jobs/:id?organizationId=        → {job, sourceAssignments}
PATCH  /api/v1/technical-jobs/:id?organizationId=         {name?, status?, responsibleProfessionalId?}
GET    /api/v1/technical-jobs/:id/document-tree?organizationId=&includeArchived=
POST   /api/v1/technical-jobs/:id/group-items?organizationId= {containerNodeId}
POST   /api/v1/technical-jobs/:id/reorder?organizationId=  {parentNodeId, groupItemId, orderedNodeIds[]}
POST   /api/v1/technical-jobs/:id/group-items/reorder?organizationId=  {containerNodeId, orderedGroupItemIds[], expectedRevision}
PATCH  /api/v1/group-items/:id?organizationId=&technicalJobId=  {state}
POST   /api/v1/group-items/:id/duplicate?organizationId=&technicalJobId=
```

`containerNodeId` sozinho basta para adicionar/reordenar um GroupItem
(Task 15.5A) — `parentGroupItemId` não é mais aceito como input: o
schema é `.strict()` e rejeita esse campo com 422 (correção pós-15.5A;
antes era silenciosamente ignorado). `expectedRevision` (correção
pós-15.5A, concorrência otimista) é o `groupItemsRevision` do container
lido pelo cliente na árvore de documento — se o container mudou desde
então, a chamada falha com **409**, nunca sobrescreve silenciosamente.
`PATCH {state:"active"}`/`{state:"archived"}` sobre um GroupItem
despacha para `restore_group_item()`/`archive_group_item()`
internamente — nunca um PATCH cru na tabela em nenhum dos dois casos;
direto via PostgREST, um `UPDATE` em `group_items` é rejeitado com
`403`/`42501` para qualquer campo, sempre.

Nenhum endpoint por tipo de bloco. `organizationId`/`technicalJobId` como
query params obrigatórios em recursos de topo, nunca aninhados no path —
mesma convenção já usada desde a Task 07.

## O que a Task 15 explicitamente NÃO constrói

Fotos/evidências, importação de pastas, findings, `CommunicationRecord`
completo, motor de comparação de laudos, renderer/PDF, volumes finais,
frontend, Field App, OCR/IA, billing. Ver `docs/product/ROADMAP_TASKS_V2.md`
para onde cada um desses entra depois.

## Fronteiras documentadas (débitos explícitos, não esquecimentos)

- `responsibleProfessionalId`/`TechnicalProfessional`/`Project` como
  `sourceEntityId` em `job_source_assignments`: sem tabela própria ainda
  (mesmo gap da Task 14) — carregado sem FK estrutural.
- Captura inicial de `JobRuntimeValue`s para bindings ligados a
  SourceRole na criação do job é _best-effort_ (mesmo padrão de
  `recordAuditEventBestEffort`) — a existência do job nunca depende de
  todo campo de origem resolver com sucesso.
- `duplicate_group_item()` não propaga para GroupItems aninhados.
- Mover um RuntimeNode de bloco para uma seção diferente (reparenting)
  não tem um endpoint dedicado nesta task — não fazia parte dos 24
  cenários obrigatórios; reordenar (mesmo pai) está completo.
