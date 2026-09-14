-- Task 10 — adds the `definition` column that Task 09's Controlled Block
-- Engine was built for, and backfills real (not blank) structure for the
-- 14 Phase 1 versions, so that deriving an OrganizationModel actually
-- starts from something concrete -- see Task 10's explicit rule "o
-- usuário não começa com modelo em branco".
--
-- 20260914130505_organizations_and_memberships.sql and
-- 20260914210000_technical_model_catalog.sql are already applied and
-- must not be edited -- this is a new migration adding a column, not a
-- change to either.
--
-- The definition content below is DATA, not code: it's the same generic
-- 13-block DSL from packages/domain/src/templates/blocks.ts, configured
-- per model exactly per the block lists already documented in
-- docs/product/technical-models/PHASE1_CATALOG.md ("Blocos-chave"). No
-- vertical-specific logic exists anywhere -- the difference between
-- models is only which of the same 13 block types they use and in what
-- order, matching PHASE1_CATALOG.md's own statement that all 14 use the
-- controlled block DSL exclusively.
--
-- Every definition here was validated with
-- packages/domain/src/templates/blocks.ts's validateDocumentDefinition()
-- before being written into this migration (see Task 10 delivery notes).

alter table public.technical_model_versions
  add column definition jsonb not null default '{"schemaVersion": 1, "sections": []}'::jsonb,
  add column definition_schema_version integer not null default 1;

comment on column public.technical_model_versions.definition is
  'A DocumentDefinition per packages/domain/src/templates/blocks.ts -- validated at the '
  'application layer with validateDocumentDefinition() before every write. Postgres cannot '
  'enforce this shape itself (jsonb accepts any valid JSON); this is a known, accepted, '
  'app-layer-only validation boundary, same as organizations.settings/sites.address.';

-- 1. Vistoria Cautelar de Vizinhança -- Cover, TOC, TechnicalInformation, Text, PhotoSection, Findings, DocumentAttachment, SignatureSection
update public.technical_model_versions
set definition = '{
  "schemaVersion": 1,
  "sections": [
    {"id": "sec-1", "title": "Capa", "blocks": [{"id": "blk-1", "type": "Cover", "title": "Vistoria Cautelar de Vizinhança"}]},
    {"id": "sec-2", "title": "Sumário", "blocks": [{"id": "blk-2", "type": "TableOfContents"}]},
    {"id": "sec-3", "title": "Conteúdo Técnico", "blocks": [
      {"id": "blk-3", "type": "TechnicalInformation", "fields": []},
      {"id": "blk-4", "type": "Text", "title": "Descrição do Imóvel", "content": ""},
      {"id": "blk-5", "type": "PhotoSection", "layout": "grid"},
      {"id": "blk-6", "type": "Findings"},
      {"id": "blk-7", "type": "DocumentAttachment"}
    ]},
    {"id": "sec-4", "title": "Encerramento", "blocks": [{"id": "blk-8", "type": "SignatureSection"}]}
  ]
}'::jsonb
where technical_model_id = (select id from public.technical_models where slug = 'neighborhood-preconstruction-survey')
  and version_number = 1;

-- 2. Inspeção Predial -- Cover, TOC, TechnicalInformation, Table, PhotoSection, Findings, Text, SignatureSection
update public.technical_model_versions
set definition = '{
  "schemaVersion": 1,
  "sections": [
    {"id": "sec-1", "title": "Capa", "blocks": [{"id": "blk-1", "type": "Cover", "title": "Inspeção Predial"}]},
    {"id": "sec-2", "title": "Sumário", "blocks": [{"id": "blk-2", "type": "TableOfContents"}]},
    {"id": "sec-3", "title": "Conteúdo Técnico", "blocks": [
      {"id": "blk-3", "type": "TechnicalInformation", "fields": []},
      {"id": "blk-4", "type": "Table", "columns": [], "sampleRows": []},
      {"id": "blk-5", "type": "PhotoSection", "layout": "grid"},
      {"id": "blk-6", "type": "Findings"},
      {"id": "blk-7", "type": "Text", "title": "Recomendações Gerais", "content": ""}
    ]},
    {"id": "sec-4", "title": "Encerramento", "blocks": [{"id": "blk-8", "type": "SignatureSection"}]}
  ]
}'::jsonb
where technical_model_id = (select id from public.technical_models where slug = 'building-inspection')
  and version_number = 1;

-- 3. Laudo de Manifestações Patológicas -- Cover, TOC, Text, TechnicalInformation, Findings, Table, PhotoSection, DocumentAttachment, SignatureSection
update public.technical_model_versions
set definition = '{
  "schemaVersion": 1,
  "sections": [
    {"id": "sec-1", "title": "Capa", "blocks": [{"id": "blk-1", "type": "Cover", "title": "Laudo de Manifestações Patológicas"}]},
    {"id": "sec-2", "title": "Sumário", "blocks": [{"id": "blk-2", "type": "TableOfContents"}]},
    {"id": "sec-3", "title": "Conteúdo Técnico", "blocks": [
      {"id": "blk-3", "type": "Text", "title": "Introdução", "content": ""},
      {"id": "blk-4", "type": "TechnicalInformation", "fields": []},
      {"id": "blk-5", "type": "Findings"},
      {"id": "blk-6", "type": "Table", "columns": [], "sampleRows": []},
      {"id": "blk-7", "type": "PhotoSection", "layout": "grid"},
      {"id": "blk-8", "type": "DocumentAttachment"}
    ]},
    {"id": "sec-4", "title": "Encerramento", "blocks": [{"id": "blk-9", "type": "SignatureSection"}]}
  ]
}'::jsonb
where technical_model_id = (select id from public.technical_models where slug = 'pathology-report')
  and version_number = 1;

-- 4. Laudo Estrutural -- Cover, TOC, TechnicalInformation, Findings, Table, PhotoSection, ImportedTable, DocumentAttachment, Text, SignatureSection
update public.technical_model_versions
set definition = '{
  "schemaVersion": 1,
  "sections": [
    {"id": "sec-1", "title": "Capa", "blocks": [{"id": "blk-1", "type": "Cover", "title": "Laudo Estrutural"}]},
    {"id": "sec-2", "title": "Sumário", "blocks": [{"id": "blk-2", "type": "TableOfContents"}]},
    {"id": "sec-3", "title": "Conteúdo Técnico", "blocks": [
      {"id": "blk-3", "type": "TechnicalInformation", "fields": []},
      {"id": "blk-4", "type": "Findings"},
      {"id": "blk-5", "type": "Table", "columns": [], "sampleRows": []},
      {"id": "blk-6", "type": "PhotoSection", "layout": "grid"},
      {"id": "blk-7", "type": "ImportedTable", "columns": [], "sampleRows": []},
      {"id": "blk-8", "type": "DocumentAttachment"},
      {"id": "blk-9", "type": "Text", "title": "Parecer Técnico", "content": ""}
    ]},
    {"id": "sec-4", "title": "Encerramento", "blocks": [{"id": "blk-10", "type": "SignatureSection"}]}
  ]
}'::jsonb
where technical_model_id = (select id from public.technical_models where slug = 'structural-report')
  and version_number = 1;

-- 5. Vistoria de Fachadas -- Cover, TOC, TechnicalInformation, Findings, Table, PhotoSection, DocumentAttachment, Text, SignatureSection
update public.technical_model_versions
set definition = '{
  "schemaVersion": 1,
  "sections": [
    {"id": "sec-1", "title": "Capa", "blocks": [{"id": "blk-1", "type": "Cover", "title": "Vistoria de Fachadas"}]},
    {"id": "sec-2", "title": "Sumário", "blocks": [{"id": "blk-2", "type": "TableOfContents"}]},
    {"id": "sec-3", "title": "Conteúdo Técnico", "blocks": [
      {"id": "blk-3", "type": "TechnicalInformation", "fields": []},
      {"id": "blk-4", "type": "Findings"},
      {"id": "blk-5", "type": "Table", "columns": [], "sampleRows": []},
      {"id": "blk-6", "type": "PhotoSection", "layout": "grid"},
      {"id": "blk-7", "type": "DocumentAttachment"},
      {"id": "blk-8", "type": "Text", "title": "Recomendações", "content": ""}
    ]},
    {"id": "sec-4", "title": "Encerramento", "blocks": [{"id": "blk-9", "type": "SignatureSection"}]}
  ]
}'::jsonb
where technical_model_id = (select id from public.technical_models where slug = 'facade-inspection')
  and version_number = 1;

-- 6. Vistoria de Entrega de Obra -- Cover, TOC, TechnicalInformation, Table, Findings, PhotoSection, DocumentAttachment, SignatureSection
update public.technical_model_versions
set definition = '{
  "schemaVersion": 1,
  "sections": [
    {"id": "sec-1", "title": "Capa", "blocks": [{"id": "blk-1", "type": "Cover", "title": "Vistoria de Entrega de Obra"}]},
    {"id": "sec-2", "title": "Sumário", "blocks": [{"id": "blk-2", "type": "TableOfContents"}]},
    {"id": "sec-3", "title": "Conteúdo Técnico", "blocks": [
      {"id": "blk-3", "type": "TechnicalInformation", "fields": []},
      {"id": "blk-4", "type": "Table", "columns": [], "sampleRows": []},
      {"id": "blk-5", "type": "Findings"},
      {"id": "blk-6", "type": "PhotoSection", "layout": "grid"},
      {"id": "blk-7", "type": "DocumentAttachment"}
    ]},
    {"id": "sec-4", "title": "Encerramento", "blocks": [{"id": "blk-8", "type": "SignatureSection"}]}
  ]
}'::jsonb
where technical_model_id = (select id from public.technical_models where slug = 'construction-handover')
  and version_number = 1;

-- 7. Recebimento de Obra / Punch List -- Cover, TOC, TechnicalInformation, Table, Findings, PhotoSection, DocumentAttachment, SignatureSection
update public.technical_model_versions
set definition = '{
  "schemaVersion": 1,
  "sections": [
    {"id": "sec-1", "title": "Capa", "blocks": [{"id": "blk-1", "type": "Cover", "title": "Recebimento de Obra / Punch List"}]},
    {"id": "sec-2", "title": "Sumário", "blocks": [{"id": "blk-2", "type": "TableOfContents"}]},
    {"id": "sec-3", "title": "Conteúdo Técnico", "blocks": [
      {"id": "blk-3", "type": "TechnicalInformation", "fields": []},
      {"id": "blk-4", "type": "Table", "columns": [], "sampleRows": []},
      {"id": "blk-5", "type": "Findings"},
      {"id": "blk-6", "type": "PhotoSection", "layout": "grid"},
      {"id": "blk-7", "type": "DocumentAttachment"}
    ]},
    {"id": "sec-4", "title": "Encerramento", "blocks": [{"id": "blk-8", "type": "SignatureSection"}]}
  ]
}'::jsonb
where technical_model_id = (select id from public.technical_models where slug = 'construction-punch-list')
  and version_number = 1;

-- 8. Vistoria de Apartamento Novo / Assistência na Entrega -- Cover, TOC, TechnicalInformation, Table, Findings, PhotoSection, SignatureSection
update public.technical_model_versions
set definition = '{
  "schemaVersion": 1,
  "sections": [
    {"id": "sec-1", "title": "Capa", "blocks": [{"id": "blk-1", "type": "Cover", "title": "Vistoria de Apartamento Novo"}]},
    {"id": "sec-2", "title": "Sumário", "blocks": [{"id": "blk-2", "type": "TableOfContents"}]},
    {"id": "sec-3", "title": "Conteúdo Técnico", "blocks": [
      {"id": "blk-3", "type": "TechnicalInformation", "fields": []},
      {"id": "blk-4", "type": "Table", "columns": [], "sampleRows": []},
      {"id": "blk-5", "type": "Findings"},
      {"id": "blk-6", "type": "PhotoSection", "layout": "grid"}
    ]},
    {"id": "sec-4", "title": "Encerramento", "blocks": [{"id": "blk-7", "type": "SignatureSection"}]}
  ]
}'::jsonb
where technical_model_id = (select id from public.technical_models where slug = 'new-apartment-handover')
  and version_number = 1;

-- 9. Vistoria Imobiliária de Entrada -- Cover, TOC, TechnicalInformation, Table, PhotoSection, Text, SignatureSection
update public.technical_model_versions
set definition = '{
  "schemaVersion": 1,
  "sections": [
    {"id": "sec-1", "title": "Capa", "blocks": [{"id": "blk-1", "type": "Cover", "title": "Vistoria Imobiliária de Entrada"}]},
    {"id": "sec-2", "title": "Sumário", "blocks": [{"id": "blk-2", "type": "TableOfContents"}]},
    {"id": "sec-3", "title": "Conteúdo Técnico", "blocks": [
      {"id": "blk-3", "type": "TechnicalInformation", "fields": []},
      {"id": "blk-4", "type": "Table", "columns": [], "sampleRows": []},
      {"id": "blk-5", "type": "PhotoSection", "layout": "grid"},
      {"id": "blk-6", "type": "Text", "title": "Observações", "content": ""}
    ]},
    {"id": "sec-4", "title": "Encerramento", "blocks": [{"id": "blk-7", "type": "SignatureSection"}]}
  ]
}'::jsonb
where technical_model_id = (select id from public.technical_models where slug = 'rental-entry-inspection')
  and version_number = 1;

-- 10. Vistoria Imobiliária de Saída e Comparativo -- Cover, TOC, TechnicalInformation, Table, PhotoSection, Text, SignatureSection
update public.technical_model_versions
set definition = '{
  "schemaVersion": 1,
  "sections": [
    {"id": "sec-1", "title": "Capa", "blocks": [{"id": "blk-1", "type": "Cover", "title": "Vistoria Imobiliária de Saída e Comparativo"}]},
    {"id": "sec-2", "title": "Sumário", "blocks": [{"id": "blk-2", "type": "TableOfContents"}]},
    {"id": "sec-3", "title": "Conteúdo Técnico", "blocks": [
      {"id": "blk-3", "type": "TechnicalInformation", "fields": []},
      {"id": "blk-4", "type": "Table", "columns": [], "sampleRows": []},
      {"id": "blk-5", "type": "PhotoSection", "layout": "grid"},
      {"id": "blk-6", "type": "Text", "title": "Comparativo com a Vistoria de Entrada", "content": ""}
    ]},
    {"id": "sec-4", "title": "Encerramento", "blocks": [{"id": "blk-7", "type": "SignatureSection"}]}
  ]
}'::jsonb
where technical_model_id = (select id from public.technical_models where slug = 'rental-exit-comparison')
  and version_number = 1;

-- 11. Avaliação de Imóvel Urbano -- Cover, TOC, TechnicalInformation, ImportedTable, Table, PhotoSection, Text, DocumentAttachment, SignatureSection
update public.technical_model_versions
set definition = '{
  "schemaVersion": 1,
  "sections": [
    {"id": "sec-1", "title": "Capa", "blocks": [{"id": "blk-1", "type": "Cover", "title": "Avaliação de Imóvel Urbano"}]},
    {"id": "sec-2", "title": "Sumário", "blocks": [{"id": "blk-2", "type": "TableOfContents"}]},
    {"id": "sec-3", "title": "Conteúdo Técnico", "blocks": [
      {"id": "blk-3", "type": "TechnicalInformation", "fields": []},
      {"id": "blk-4", "type": "ImportedTable", "columns": [], "sampleRows": []},
      {"id": "blk-5", "type": "Table", "columns": [], "sampleRows": []},
      {"id": "blk-6", "type": "PhotoSection", "layout": "grid"},
      {"id": "blk-7", "type": "Text", "title": "Metodologia e Memória de Cálculo", "content": ""},
      {"id": "blk-8", "type": "DocumentAttachment"}
    ]},
    {"id": "sec-4", "title": "Encerramento", "blocks": [{"id": "blk-9", "type": "SignatureSection"}]}
  ]
}'::jsonb
where technical_model_id = (select id from public.technical_models where slug = 'urban-property-valuation')
  and version_number = 1;

-- 12. Laudo de Sinistro / Danos em Edificação -- Cover, TOC, TechnicalInformation, Findings, Table, PhotoSection, DocumentAttachment, Text, SignatureSection
update public.technical_model_versions
set definition = '{
  "schemaVersion": 1,
  "sections": [
    {"id": "sec-1", "title": "Capa", "blocks": [{"id": "blk-1", "type": "Cover", "title": "Laudo de Sinistro / Danos em Edificação"}]},
    {"id": "sec-2", "title": "Sumário", "blocks": [{"id": "blk-2", "type": "TableOfContents"}]},
    {"id": "sec-3", "title": "Conteúdo Técnico", "blocks": [
      {"id": "blk-3", "type": "TechnicalInformation", "fields": []},
      {"id": "blk-4", "type": "Findings"},
      {"id": "blk-5", "type": "Table", "columns": [], "sampleRows": []},
      {"id": "blk-6", "type": "PhotoSection", "layout": "grid"},
      {"id": "blk-7", "type": "DocumentAttachment"},
      {"id": "blk-8", "type": "Text", "title": "Caracterização do Evento", "content": ""}
    ]},
    {"id": "sec-4", "title": "Encerramento", "blocks": [{"id": "blk-9", "type": "SignatureSection"}]}
  ]
}'::jsonb
where technical_model_id = (select id from public.technical_models where slug = 'building-damage-report')
  and version_number = 1;

-- 13. Laudo de Infiltrações e Impermeabilização -- Cover, TOC, TechnicalInformation, Findings, Table, PhotoSection, DocumentAttachment, Text, SignatureSection
update public.technical_model_versions
set definition = '{
  "schemaVersion": 1,
  "sections": [
    {"id": "sec-1", "title": "Capa", "blocks": [{"id": "blk-1", "type": "Cover", "title": "Laudo de Infiltrações e Impermeabilização"}]},
    {"id": "sec-2", "title": "Sumário", "blocks": [{"id": "blk-2", "type": "TableOfContents"}]},
    {"id": "sec-3", "title": "Conteúdo Técnico", "blocks": [
      {"id": "blk-3", "type": "TechnicalInformation", "fields": []},
      {"id": "blk-4", "type": "Findings"},
      {"id": "blk-5", "type": "Table", "columns": [], "sampleRows": []},
      {"id": "blk-6", "type": "PhotoSection", "layout": "grid"},
      {"id": "blk-7", "type": "DocumentAttachment"},
      {"id": "blk-8", "type": "Text", "title": "Investigação de Origem", "content": ""}
    ]},
    {"id": "sec-4", "title": "Encerramento", "blocks": [{"id": "blk-9", "type": "SignatureSection"}]}
  ]
}'::jsonb
where technical_model_id = (select id from public.technical_models where slug = 'waterproofing-infiltration-report')
  and version_number = 1;

-- 14. Inspeção de Instalações Elétricas -- Cover, TOC, TechnicalInformation, Table, ImportedTable, Findings, PhotoSection, DocumentAttachment, Text, SignatureSection
update public.technical_model_versions
set definition = '{
  "schemaVersion": 1,
  "sections": [
    {"id": "sec-1", "title": "Capa", "blocks": [{"id": "blk-1", "type": "Cover", "title": "Inspeção de Instalações Elétricas"}]},
    {"id": "sec-2", "title": "Sumário", "blocks": [{"id": "blk-2", "type": "TableOfContents"}]},
    {"id": "sec-3", "title": "Conteúdo Técnico", "blocks": [
      {"id": "blk-3", "type": "TechnicalInformation", "fields": []},
      {"id": "blk-4", "type": "Table", "columns": [], "sampleRows": []},
      {"id": "blk-5", "type": "ImportedTable", "columns": [], "sampleRows": []},
      {"id": "blk-6", "type": "Findings"},
      {"id": "blk-7", "type": "PhotoSection", "layout": "grid"},
      {"id": "blk-8", "type": "DocumentAttachment"},
      {"id": "blk-9", "type": "Text", "title": "Medições e Observações", "content": ""}
    ]},
    {"id": "sec-4", "title": "Encerramento", "blocks": [{"id": "blk-10", "type": "SignatureSection"}]}
  ]
}'::jsonb
where technical_model_id = (select id from public.technical_models where slug = 'electrical-installation-inspection')
  and version_number = 1;
