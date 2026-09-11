# Templates Domain

## Objetivo

Permitir que organizações definam inspeções diferentes sem alterar o core.

## Entidades

### InspectionTemplate
Identidade lógica do template.

### InspectionTemplateVersion
Snapshot imutável de schema, UI, rules e defaults.

## Estados

- draft
- published
- archived

## Invariants

- published é imutável;
- nova edição de published cria novo draft/version;
- field IDs são estáveis;
- labels podem mudar;
- nenhuma regra executa código arbitrário;
- versionamento deve ser referenciado por inspections.

## Contratos

`data_schema_json`: estrutura e validação.

`ui_schema_json`: layout e componentes permitidos.

`rules_json`: condições/ações declarativas.

`defaults_json`: valores iniciais seguros.
