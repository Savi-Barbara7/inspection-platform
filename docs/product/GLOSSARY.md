# Glossary

> Revisado na Task 03.5 — ver `docs/adr/ADR-0017-technical-model-domain.md`.
> Estendido na Task 15 com o vocabulário das Tasks 09–15 (ver `docs/domain/TEMPLATES.md`, `docs/domain/DATA_SOURCES.md`, `docs/domain/JOB_RUNTIME_VALUES.md`, `docs/domain/RUNTIME_DOCUMENT_TREE.md`).

**Organization / Tenant** — empresa que assina e utiliza a plataforma.

**Customer** — cliente da Organization.

**Site** — local físico/operacional associado a trabalhos técnicos.

**Asset** — objeto inspecionável com histórico próprio.

**Technical Model** — modelo técnico mantido pela plataforma (ex.: "Inspeção NR-13 — Caldeira"), com pesquisa e fonte de origem por trás. Substitui o antigo _Inspection Template_.

**Technical Model Version** — uma versão de um Technical Model: seções, blocos controlados e requirements. Pode existir como `draft` (mutável, ainda sendo editada) ou `published` (imutável a partir do momento em que é publicada — a imutabilidade é uma propriedade do **estado**, não do conceito "versão" em si; uma versão nasce como draft e só se torna um snapshot congelado ao publicar).

**Organization Model** — derivação de um Technical Model Version personalizada por uma organização (textos, branding, seções). Nunca altera o modelo original.

**Organization Model Version** — uma versão de um Organization Model, com o mesmo ciclo `draft`→`published` do Technical Model Version acima: mutável enquanto rascunho, imutável (reforçado por trigger no Postgres, Task 12) só depois de publicada. `TechnicalJob` sempre referencia uma versão já publicada, nunca o draft atual.

**Model Lineage Provenance** — referência sempre mantida de qual Technical Model Version deu origem a um Organization Model, e de qual Organization Model Version um Technical Job utilizou. É sobre **de onde uma versão/definição veio** (linhagem/versionamento) — não confundir com o próximo termo.

**Runtime Value Provenance** — a `Provenance` de um `JobRuntimeValue` (`SOURCE_RECORD`/`MANUAL_INPUT`/`DEFAULT`, Task 14/15): de onde um valor de campo específico veio **dentro de um trabalho**. É sobre **a origem de um dado capturado**, um conceito totalmente diferente de "Model Lineage Provenance" acima — os dois usam a palavra "provenance" em inglês/no código-fonte, mas nomeiam coisas diferentes (linhagem de definição vs. origem de valor); o glossário os separa aqui exatamente para evitar essa confusão.

**Requirement** — item de um Technical Model Version com nível `required`/`recommended`/`optional`, fonte de origem e efeito de compatibilidade quando removido/sobrescrito.

**Controlled Block** — unidade de conteúdo dentro de uma seção (Cover, Text, TechnicalInformation, Table, ImportedTable, PhotoSection, DocumentAttachment, Findings, SignatureSection, Header, Footer, PageBreak, TableOfContents). Carrega **configuração, placements e apresentação** — nunca código arbitrário do tenant, e nunca um valor real de trabalho: `defaultValue`/`sampleRows` são ilustrativos, não dado capturado; o valor real de um campo vinculado por `bindingId` vive num `Job Runtime Value` separado (Task 14), nunca dentro do próprio bloco/definição.

**Technical Job** — execução concreta de uma Organization Model Version. Substitui o antigo _Inspection_ como nome geral do trabalho. Sempre fixado à versão publicada que capturou na criação (Task 14/15) — publicar uma versão mais nova do mesmo Organization Model nunca migra um job existente.

**Source Type** — o tipo de uma fonte de dado (`Customer`, `Site`, `Organization`, `Project`, `TechnicalProfessional`, `TechnicalJob`, `InspectionEvent`, `GroupItem`, `CustomData` — Task 13). Nem todo Source Type tem tabela própria hoje; ver `docs/product/CODEX_REVIEW_RESPONSE_TASK15.md` para os gaps documentados (Project/TechnicalProfessional/InspectionEvent).

**Source Role** — o papel que uma entidade exerce num Technical Job (`customer`, `outgoingContractor`, `primaryProfessional`...), com cardinalidade `single`/`multiple` declarada (Task 13). Dois papéis podem apontar para a mesma entidade real sem que isso seja assumido por igualdade de nome.

**Field Definition** — identidade semântica de um dado, no catálogo **global** (`Customer.taxId`, `Site.name`...), com tipo e label — nunca redefinida por bloco (Task 13). Não confundir com o próximo termo: um `Field Definition` vale para todo mundo; um campo de `Repeatable Group` só vale dentro daquele grupo específico.

**Repeatable Group Field** — um campo declarado em `Section.repeatable.fields` (Task 15) — o schema de dados de UM grupo repetível específico, nunca um `Field Definition` do catálogo global. É por isso que `GroupItem` não tem (e nunca terá) um catálogo global de campos: "nome da área", "nível do pavimento" etc. são dado de template, não vocabulário do motor. Um `Data Binding` `currentGroupItem`/`ancestorGroupItem` resolve contra o `Repeatable Group Field` do grupo que o envolve, nunca contra `Field Definition`.

**Data Binding** — de onde um bloco deve buscar um dado (papel/escopo + `fieldId`) — nunca contém um id de entidade real; a associação com uma entidade real só existe dentro de um Technical Job (Task 13).

**Job Runtime Value** — o valor efetivo e histórico de um Data Binding dentro de UM Technical Job específico — nunca confundido com o cadastro que o originou (Task 14, "CADASTRO ≠ VALOR DO TRABALHO"). Tem estados explícitos (`resolved`/`missing`/`not_applicable`/`invalid`), nunca um `null` genérico.

**Repeatable Group** — a marcação (`Section.repeatable`) de que uma seção descreve o template de UMA instância repetível (Task 15) — o schema de campos é local a esse grupo, nunca um catálogo global.

**Group Item** — uma instância real de um Repeatable Group dentro de um Technical Job (ex.: um "Imóvel" entre vários) — o mesmo motor genérico serve qualquer nome que um modelo dê ao grupo (Task 15).

**Runtime Node** — um nó materializado da Runtime Document Tree de um job, com identidade própria e estável, distinta do id da seção/bloco na definição que o originou (Task 15).

**Job Source Assignment** — qual entidade real ocupa um Source Role num Technical Job específico. É um registro **independente** de qualquer `Job Runtime Value` (Task 15): existe mesmo que nenhum campo daquele papel jamais seja capturado, e sua existência não implica nem depende da existência de nenhum `Job Runtime Value` associado. Identidade do job, atribuída na criação — nunca embutida dentro de, derivada de, ou confundida com um Job Runtime Value.

**Evidence** — foto, documento, assinatura, medição ou outro artefato comprobatório.

**Finding** — constatação/não conformidade.

**Report** — documento em elaboração a partir de um Technical Job.

**Report Version** — versão imutável de documento emitido, com snapshot e hash. Não existe mais um _Report Template_ separado — a apresentação já está definida na Organization Model Version.

**Capability** — permissão granular.

**Audit Event** — registro de negócio append-only.

**Entitlement** — recurso/limite habilitado por assinatura.
