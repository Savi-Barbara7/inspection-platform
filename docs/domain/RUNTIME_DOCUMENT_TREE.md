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

GroupItems podem ser aninhados (`parentGroupItemId`) — um RepeatableGroup
dentro de outro (ex.: "Edificações" → "Ambientes") — respeitando o mesmo
`MAX_SECTION_DEPTH` que toda seção já respeita. Não existe um limite de
aninhamento separado para grupos repetíveis.

> **Correção pós-Task 15 (revisão de integridade):** o parágrafo acima
> descreve o caminho feliz testado (materialização + um item por nível).
> Uma revisão posterior encontrou que `duplicate_group_item()` reencontra
> o nó container de um item aninhado por uma busca ambígua (`definition_id`
> sem escopo por `group_item_id`), podendo clonar a subárvore errada
> quando existe mais de um item externo, e que `add_group_item()` nunca
> valida que o container informado pertence de fato ao
> `parent_group_item_id` informado. Nesting também só suporta um único
> pai por item hoje (sem suporte a múltiplos pais). Ver Task 15.5A em
> `docs/product/ROADMAP_TASKS_V2.md` — nenhum desses bugs foi corrigido
> ainda; esta nota existe para que este documento não implique uma
> garantia que o código não cumpre.

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

Um cliente comum só pode alterar `state`/`position`/`parentGroupItemId`
via PATCH — a identidade (`organization_id`/`technical_job_id`/
`definition_id`/`definition_section_id`/hierarquia) é congelada por um
trigger (mesma técnica de comparação de `to_jsonb` inteira da Task 12),
nunca dependendo só de disciplina da aplicação.

## Ordem — sempre posição explícita

`position` é a única fonte de verdade de ordem (nunca índice de array em
memória, nunca timestamp). `reorder_runtime_nodes()` reatribui posição
para todos os filhos de um escopo `(parent_node_id, group_item_id)` a
partir de uma lista ordenada de ids explícita — e rejeita qualquer lista
que não corresponda exatamente ao conjunto atual de filhos (nunca
permite "esquecer" ou "inventar" um irmão). Os ids nunca mudam.

## Duplicar e arquivar

`duplicate_group_item()` clona a subárvore de UM GroupItem com ids
inteiramente novos (GroupItem + cada RuntimeNode) — nunca reaproveita os
originais. Não propaga para GroupItems aninhados (um RepeatableGroup
dentro do item duplicado) — isso é uma fronteira deliberada, documentada,
não um esquecimento.

Arquivar (`PATCH /group-items/:id {state:"archived"}`) nunca deleta
fisicamente — some da árvore padrão (`buildDocumentTree()` filtra por
padrão), mas continua acessível com `includeArchived=true` e pode ser
restaurado (`state:"active"`).

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
POST   /api/v1/technical-jobs/:id/group-items?organizationId= {containerNodeId, parentGroupItemId?}
POST   /api/v1/technical-jobs/:id/reorder?organizationId=  {parentNodeId, groupItemId, orderedNodeIds[]}
PATCH  /api/v1/group-items/:id?organizationId=&technicalJobId=  {state}
POST   /api/v1/group-items/:id/duplicate?organizationId=&technicalJobId=
```

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
