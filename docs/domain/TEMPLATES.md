# Templates Domain (Technical Models & Organization Models)

> Realinhado na Task 03.5 — ver `docs/adr/ADR-0017-technical-model-domain.md`.
> Substitui o par `InspectionTemplate`/`ReportTemplate` por uma hierarquia de
> três níveis. Pesquisa de modelos reais em `docs/product/technical-models/`.

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
Identidade lógica de um modelo mantido pela plataforma (ex.: "Inspeção NR-13 — Caldeira"). Carrega categoria, objetivo, profissionais habilitados e status de pesquisa (ver `docs/product/technical-models/RESEARCH_PROTOCOL.md`).

### TechnicalModelVersion
Snapshot publicado e imutável de um `TechnicalModel`: árvore de seções/blocos controlados, requirements e referências de origem (provenance).

### OrganizationModel
Derivação de um `TechnicalModelVersion` específica de uma organização. Mantém sempre a referência ao modelo/versão de origem.

### OrganizationModelVersion
Snapshot publicado e imutável de um `OrganizationModel`: textos, branding, seções/blocos habilitados/reordenados, overrides de requirement.

## Estados

- draft
- published
- archived

## Invariants

- published (em qualquer dos dois níveis) é imutável;
- nova edição de published cria novo draft/version;
- section/block IDs são estáveis e independentes de labels;
- a organização nunca edita o `TechnicalModel`/`TechnicalModelVersion` diretamente — só deriva um `OrganizationModel`;
- todo `OrganizationModel` referencia o `TechnicalModelVersion` de origem (provenance nunca se perde);
- nenhum bloco executa código arbitrário do tenant (HTML/JS/SQL);
- todo `TechnicalJob` referencia uma `OrganizationModelVersion` específica e reproduzível.

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
