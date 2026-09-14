-- Task 08 — seeds the official Phase 1 catalog (exactly 14 models, see
-- docs/product/technical-models/PHASE1_CATALOG.md). Idempotent: every
-- INSERT uses `on conflict ... do update set <col> = <same value>` (a
-- no-op update) purely so `returning id` reliably yields the row's id
-- whether it was just inserted or already existed -- re-running this
-- migration never actually changes a previously-seeded row's content
-- (and never would touch a *published* version's content in the first
-- place, matching the immutability rule).
--
-- research_status is 'DRAFT' for all 14 -- this is a v1 reference library,
-- not yet professionally verified (see Section 11 of the task spec and
-- docs/product/technical-models/RESEARCH_PROTOCOL.md). Deep normative
-- research (specific ABNT/NBR citations, professional-attribution
-- specifics per jurisdiction) is Task 34's job, not this one --
-- technical_basis is deliberately left as an empty array rather than
-- guessing at citations. Editorial status is 'published' (version_number
-- 1) so the catalog is actually live and queryable -- editorial
-- publication and research maturity are independent, see
-- docs/domain/TEMPLATES.md.

-- 1. Vistoria Cautelar de Vizinhança
with model as (
  insert into public.technical_models (
    slug, name, short_name, category, description, objective, when_to_use,
    typical_object_type, usage_profile, tags, jurisdiction_scope
  )
  values (
    'neighborhood-preconstruction-survey',
    'Vistoria Cautelar de Vizinhança',
    'Vistoria Cautelar',
    'building_engineering',
    'Registro preventivo das condições físicas aparentes dos imóveis e áreas na área de influência de uma obra.',
    'Documentar o estado prévio de imóveis vizinhos antes do início de uma obra, servindo de referência técnica futura.',
    'Antes do início de uma obra com potencial de impacto em edificações vizinhas (escavação, demolição, fundação, cargas dinâmicas).',
    'imóvel vizinho à obra',
    '{"usesPhotos": true, "usesTables": false, "usesAttachments": true, "supportsComparative": false, "involvesTechnicalResponsibility": true}'::jsonb,
    array['vistoria cautelar', 'vizinhança', 'pré-obra', 'engenharia diagnóstica'],
    'BR'
  )
  on conflict (slug) do update set updated_at = public.technical_models.updated_at
  returning id
)
insert into public.technical_model_versions (
  technical_model_id, version_number, status, research_status, title, description,
  technical_basis, professional_scope, published_at
)
select
  model.id, 1, 'published', 'DRAFT',
  'Vistoria Cautelar de Vizinhança v1',
  'Estrutura de referência inicial (Cover, TOC, TechnicalInformation, Text, PhotoSection, Findings, DocumentAttachment, SignatureSection). Pesquisa normativa aprofundada pendente -- ver Task 34.',
  '[]'::jsonb,
  '{"restrictions": "Elaboração/assinatura por profissional habilitado (Engenheiro/Arquiteto) -- atribuições específicas a confirmar em revisão técnica futura."}'::jsonb,
  now()
from model
on conflict (technical_model_id, version_number) do update set version_number = excluded.version_number;

-- 2. Inspeção Predial
with model as (
  insert into public.technical_models (
    slug, name, short_name, category, description, objective, when_to_use,
    typical_object_type, usage_profile, tags, jurisdiction_scope
  )
  values (
    'building-inspection',
    'Inspeção Predial',
    'Inspeção Predial',
    'building_engineering',
    'Avaliação sistêmica da edificação, apontando manutenção necessária e prioridades.',
    'Avaliar sistemicamente as condições de uso, manutenção e segurança de uma edificação.',
    'Periodicamente, conforme normas municipais/estaduais de inspeção predial, ou por demanda do condomínio/proprietário.',
    'edificação',
    '{"usesPhotos": true, "usesTables": true, "usesAttachments": false, "supportsComparative": false, "involvesTechnicalResponsibility": true}'::jsonb,
    array['inspeção predial', 'manutenção predial', 'edificação', 'laudo técnico'],
    'BR'
  )
  on conflict (slug) do update set updated_at = public.technical_models.updated_at
  returning id
)
insert into public.technical_model_versions (
  technical_model_id, version_number, status, research_status, title, description,
  technical_basis, professional_scope, published_at
)
select
  model.id, 1, 'published', 'DRAFT',
  'Inspeção Predial v1',
  'Estrutura de referência inicial (Cover, TOC, TechnicalInformation, Table, PhotoSection, Findings, Text, SignatureSection). Pesquisa normativa aprofundada (leis municipais de inspeção predial variam por cidade) pendente -- ver Task 34.',
  '[]'::jsonb,
  '{"restrictions": "Elaboração/assinatura por profissional habilitado (Engenheiro/Arquiteto) -- exigências variam por município."}'::jsonb,
  now()
from model
on conflict (technical_model_id, version_number) do update set version_number = excluded.version_number;

-- 3. Laudo de Manifestações Patológicas
with model as (
  insert into public.technical_models (
    slug, name, short_name, category, description, objective, when_to_use,
    typical_object_type, usage_profile, tags, jurisdiction_scope
  )
  values (
    'pathology-report',
    'Laudo de Manifestações Patológicas',
    'Manifestações Patológicas',
    'specialized_engineering',
    'Investigação técnica de manifestações patológicas, seus mecanismos e recomendações de correção.',
    'Diagnosticar a origem e o mecanismo de uma manifestação patológica na edificação e recomendar correção.',
    'Quando surgem sinais de deterioração (fissuras, umidade, corrosão, desagregação) que exigem diagnóstico especializado.',
    'edificação / elemento construtivo',
    '{"usesPhotos": true, "usesTables": true, "usesAttachments": true, "supportsComparative": false, "involvesTechnicalResponsibility": true}'::jsonb,
    array['patologia das construções', 'manifestação patológica', 'diagnóstico', 'laudo técnico'],
    'BR'
  )
  on conflict (slug) do update set updated_at = public.technical_models.updated_at
  returning id
)
insert into public.technical_model_versions (
  technical_model_id, version_number, status, research_status, title, description,
  technical_basis, professional_scope, published_at
)
select
  model.id, 1, 'published', 'DRAFT',
  'Laudo de Manifestações Patológicas v1',
  'Estrutura de referência inicial (Cover, TOC, Text, TechnicalInformation, Findings, Table, PhotoSection, DocumentAttachment, SignatureSection). Pesquisa normativa aprofundada pendente -- ver Task 34.',
  '[]'::jsonb,
  '{"restrictions": "Elaboração/assinatura por profissional habilitado (Engenheiro/Arquiteto) com competência em patologia das construções."}'::jsonb,
  now()
from model
on conflict (technical_model_id, version_number) do update set version_number = excluded.version_number;

-- 4. Laudo Estrutural
with model as (
  insert into public.technical_models (
    slug, name, short_name, category, description, objective, when_to_use,
    typical_object_type, usage_profile, tags, jurisdiction_scope
  )
  values (
    'structural-report',
    'Laudo Estrutural',
    'Laudo Estrutural',
    'specialized_engineering',
    'Inspeção, ensaios, análise e parecer sobre a segurança/desempenho estrutural.',
    'Emitir parecer técnico sobre a segurança e o desempenho de um sistema estrutural.',
    'Quando há dúvida ou necessidade de avaliação formal da capacidade/segurança estrutural de uma edificação ou elemento.',
    'elemento/sistema estrutural',
    '{"usesPhotos": true, "usesTables": true, "usesAttachments": true, "supportsComparative": false, "involvesTechnicalResponsibility": true}'::jsonb,
    array['laudo estrutural', 'segurança estrutural', 'engenharia diagnóstica'],
    'BR'
  )
  on conflict (slug) do update set updated_at = public.technical_models.updated_at
  returning id
)
insert into public.technical_model_versions (
  technical_model_id, version_number, status, research_status, title, description,
  technical_basis, professional_scope, published_at
)
select
  model.id, 1, 'published', 'DRAFT',
  'Laudo Estrutural v1',
  'Estrutura de referência inicial (Cover, TOC, TechnicalInformation, Findings, Table, PhotoSection, ImportedTable, DocumentAttachment, Text, SignatureSection). Pesquisa normativa aprofundada (ex.: normas ABNT de projeto/avaliação estrutural aplicáveis) pendente -- ver Task 34.',
  '[]'::jsonb,
  '{"restrictions": "Elaboração/assinatura por Engenheiro Civil/Estrutural habilitado."}'::jsonb,
  now()
from model
on conflict (technical_model_id, version_number) do update set version_number = excluded.version_number;

-- 5. Vistoria de Fachadas
with model as (
  insert into public.technical_models (
    slug, name, short_name, category, description, objective, when_to_use,
    typical_object_type, usage_profile, tags, jurisdiction_scope
  )
  values (
    'facade-inspection',
    'Vistoria de Fachadas',
    'Vistoria de Fachadas',
    'building_engineering',
    'Inspeção especializada de revestimentos, elementos externos e risco de desprendimento.',
    'Avaliar o estado de conservação da fachada e identificar risco de desprendimento de elementos.',
    'Periodicamente (muitas cidades exigem laudo de fachada por lei) ou após sinais de deterioração/desprendimento.',
    'fachada / revestimento externo',
    '{"usesPhotos": true, "usesTables": true, "usesAttachments": true, "supportsComparative": false, "involvesTechnicalResponsibility": true}'::jsonb,
    array['vistoria de fachada', 'revestimento', 'risco de queda', 'laudo técnico'],
    'BR'
  )
  on conflict (slug) do update set updated_at = public.technical_models.updated_at
  returning id
)
insert into public.technical_model_versions (
  technical_model_id, version_number, status, research_status, title, description,
  technical_basis, professional_scope, published_at
)
select
  model.id, 1, 'published', 'DRAFT',
  'Vistoria de Fachadas v1',
  'Estrutura de referência inicial (Cover, TOC, TechnicalInformation, Findings, Table, PhotoSection, DocumentAttachment, Text, SignatureSection). Pesquisa normativa aprofundada (leis municipais de fachada variam por cidade) pendente -- ver Task 34.',
  '[]'::jsonb,
  '{"restrictions": "Elaboração/assinatura por profissional habilitado (Engenheiro/Arquiteto) -- exigências variam por município."}'::jsonb,
  now()
from model
on conflict (technical_model_id, version_number) do update set version_number = excluded.version_number;

-- 6. Vistoria de Entrega de Obra
with model as (
  insert into public.technical_models (
    slug, name, short_name, category, description, objective, when_to_use,
    typical_object_type, usage_profile, tags, jurisdiction_scope
  )
  values (
    'construction-handover',
    'Vistoria de Entrega de Obra',
    'Entrega de Obra',
    'building_engineering',
    'Verificação técnica do produto entregue, sistemas, acabamentos e documentação.',
    'Verificar se a obra entregue atende ao especificado antes da entrega formal.',
    'Ao final de uma obra, antes da entrega formal ao contratante/incorporadora.',
    'obra / empreendimento',
    '{"usesPhotos": true, "usesTables": true, "usesAttachments": true, "supportsComparative": false, "involvesTechnicalResponsibility": true}'::jsonb,
    array['entrega de obra', 'recebimento técnico', 'construção civil'],
    'BR'
  )
  on conflict (slug) do update set updated_at = public.technical_models.updated_at
  returning id
)
insert into public.technical_model_versions (
  technical_model_id, version_number, status, research_status, title, description,
  technical_basis, professional_scope, published_at
)
select
  model.id, 1, 'published', 'DRAFT',
  'Vistoria de Entrega de Obra v1',
  'Estrutura de referência inicial (Cover, TOC, TechnicalInformation, Table, Findings, PhotoSection, DocumentAttachment, SignatureSection). Pesquisa normativa aprofundada pendente -- ver Task 34.',
  '[]'::jsonb,
  '{"restrictions": "Elaboração/assinatura por profissional habilitado (Engenheiro/Arquiteto)."}'::jsonb,
  now()
from model
on conflict (technical_model_id, version_number) do update set version_number = excluded.version_number;

-- 7. Recebimento de Obra / Punch List
with model as (
  insert into public.technical_models (
    slug, name, short_name, category, description, objective, when_to_use,
    typical_object_type, usage_profile, tags, jurisdiction_scope
  )
  values (
    'construction-punch-list',
    'Recebimento de Obra / Punch List',
    'Punch List',
    'building_engineering',
    'Pendências, reinspeção e aceite provisório/definitivo.',
    'Registrar pendências construtivas e acompanhar sua correção até o aceite.',
    'Durante o processo de recebimento de uma obra, com possíveis reinspeções até o aceite definitivo.',
    'obra / unidade',
    '{"usesPhotos": true, "usesTables": true, "usesAttachments": true, "supportsComparative": false, "involvesTechnicalResponsibility": true}'::jsonb,
    array['punch list', 'recebimento de obra', 'pendências construtivas'],
    'BR'
  )
  on conflict (slug) do update set updated_at = public.technical_models.updated_at
  returning id
)
insert into public.technical_model_versions (
  technical_model_id, version_number, status, research_status, title, description,
  technical_basis, professional_scope, published_at
)
select
  model.id, 1, 'published', 'DRAFT',
  'Recebimento de Obra / Punch List v1',
  'Estrutura de referência inicial (Cover, TOC, TechnicalInformation, Table, Findings, PhotoSection, DocumentAttachment, SignatureSection). Pesquisa normativa aprofundada pendente -- ver Task 34.',
  '[]'::jsonb,
  '{"restrictions": "Elaboração/assinatura por profissional habilitado (Engenheiro/Arquiteto)."}'::jsonb,
  now()
from model
on conflict (technical_model_id, version_number) do update set version_number = excluded.version_number;

-- 8. Vistoria de Apartamento Novo / Assistência na Entrega
with model as (
  insert into public.technical_models (
    slug, name, short_name, category, description, objective, when_to_use,
    typical_object_type, usage_profile, tags, jurisdiction_scope
  )
  values (
    'new-apartment-handover',
    'Vistoria de Apartamento Novo / Assistência na Entrega',
    'Assistência na Entrega',
    'property_inspection',
    'Conferência técnica da unidade antes do recebimento das chaves.',
    'Auxiliar o comprador a identificar não conformidades na unidade antes de aceitar as chaves.',
    'No ato de entrega de um imóvel novo, antes do comprador assinar o termo de recebimento.',
    'unidade residencial nova',
    '{"usesPhotos": true, "usesTables": true, "usesAttachments": false, "supportsComparative": false, "involvesTechnicalResponsibility": true}'::jsonb,
    array['assistência técnica', 'entrega de chaves', 'apartamento novo', 'vistoria imobiliária'],
    'BR'
  )
  on conflict (slug) do update set updated_at = public.technical_models.updated_at
  returning id
)
insert into public.technical_model_versions (
  technical_model_id, version_number, status, research_status, title, description,
  technical_basis, professional_scope, published_at
)
select
  model.id, 1, 'published', 'DRAFT',
  'Vistoria de Apartamento Novo / Assistência na Entrega v1',
  'Estrutura de referência inicial (Cover, TOC, TechnicalInformation, Table, Findings, PhotoSection, SignatureSection). Pesquisa normativa aprofundada pendente -- ver Task 34.',
  '[]'::jsonb,
  '{"restrictions": "Elaboração/assinatura por profissional habilitado (Engenheiro/Arquiteto)."}'::jsonb,
  now()
from model
on conflict (technical_model_id, version_number) do update set version_number = excluded.version_number;

-- 9. Vistoria Imobiliária de Entrada
with model as (
  insert into public.technical_models (
    slug, name, short_name, category, description, objective, when_to_use,
    typical_object_type, usage_profile, tags, jurisdiction_scope
  )
  values (
    'rental-entry-inspection',
    'Vistoria Imobiliária de Entrada',
    'Vistoria de Entrada',
    'property_inspection',
    'Estado do imóvel no início da locação, ambiente por ambiente.',
    'Registrar o estado do imóvel no início de uma locação, como baseline para a vistoria de saída.',
    'No início de um contrato de locação, antes da entrega das chaves ao locatário.',
    'imóvel de locação',
    '{"usesPhotos": true, "usesTables": true, "usesAttachments": false, "supportsComparative": false, "involvesTechnicalResponsibility": true}'::jsonb,
    array['vistoria de entrada', 'locação', 'vistoria imobiliária'],
    'BR'
  )
  on conflict (slug) do update set updated_at = public.technical_models.updated_at
  returning id
)
insert into public.technical_model_versions (
  technical_model_id, version_number, status, research_status, title, description,
  technical_basis, professional_scope, published_at
)
select
  model.id, 1, 'published', 'DRAFT',
  'Vistoria Imobiliária de Entrada v1',
  'Estrutura de referência inicial (Cover, TOC, TechnicalInformation, Table, PhotoSection, Text, SignatureSection). Pesquisa normativa aprofundada (Lei do Inquilinato e correlatas) pendente -- ver Task 34.',
  '[]'::jsonb,
  '{"restrictions": "Elaboração geralmente por vistoriador/corretor ou profissional habilitado, conforme prática do mercado local."}'::jsonb,
  now()
from model
on conflict (technical_model_id, version_number) do update set version_number = excluded.version_number;

-- 10. Vistoria Imobiliária de Saída e Comparativo
with model as (
  insert into public.technical_models (
    slug, name, short_name, category, description, objective, when_to_use,
    typical_object_type, usage_profile, tags, jurisdiction_scope
  )
  values (
    'rental-exit-comparison',
    'Vistoria Imobiliária de Saída e Comparativo',
    'Vistoria de Saída',
    'property_inspection',
    'Comparação rastreável entre o baseline de entrada e a devolução do imóvel.',
    'Comparar o estado de devolução do imóvel contra a vistoria de entrada, de forma rastreável.',
    'No fim de um contrato de locação, na devolução do imóvel pelo locatário.',
    'imóvel de locação',
    '{"usesPhotos": true, "usesTables": true, "usesAttachments": false, "supportsComparative": true, "involvesTechnicalResponsibility": true}'::jsonb,
    array['vistoria de saída', 'comparativo', 'locação', 'vistoria imobiliária'],
    'BR'
  )
  on conflict (slug) do update set updated_at = public.technical_models.updated_at
  returning id
)
insert into public.technical_model_versions (
  technical_model_id, version_number, status, research_status, title, description,
  technical_basis, professional_scope, published_at
)
select
  model.id, 1, 'published', 'DRAFT',
  'Vistoria Imobiliária de Saída e Comparativo v1',
  'Estrutura de referência inicial (Cover, TOC, TechnicalInformation, Table, PhotoSection, Text, SignatureSection). Itens da entrada não podem ser apagados na saída (ver PHASE1_CATALOG.md). Pesquisa normativa aprofundada pendente -- ver Task 34.',
  '[]'::jsonb,
  '{"restrictions": "Elaboração geralmente por vistoriador/corretor ou profissional habilitado, conforme prática do mercado local."}'::jsonb,
  now()
from model
on conflict (technical_model_id, version_number) do update set version_number = excluded.version_number;

-- 11. Avaliação de Imóvel Urbano
with model as (
  insert into public.technical_models (
    slug, name, short_name, category, description, objective, when_to_use,
    typical_object_type, usage_profile, tags, jurisdiction_scope
  )
  values (
    'urban-property-valuation',
    'Avaliação de Imóvel Urbano',
    'Avaliação de Imóvel',
    'real_estate',
    'Pesquisa, metodologia, memória de cálculo e valor de referência.',
    'Estimar o valor de mercado ou referência de um imóvel urbano com metodologia documentada.',
    'Para fins de venda, financiamento, garantia, partilha ou outra necessidade de valor de referência.',
    'imóvel urbano',
    '{"usesPhotos": true, "usesTables": true, "usesAttachments": true, "supportsComparative": false, "involvesTechnicalResponsibility": true}'::jsonb,
    array['avaliação imobiliária', 'valor de mercado', 'engenharia de avaliações'],
    'BR'
  )
  on conflict (slug) do update set updated_at = public.technical_models.updated_at
  returning id
)
insert into public.technical_model_versions (
  technical_model_id, version_number, status, research_status, title, description,
  technical_basis, professional_scope, published_at
)
select
  model.id, 1, 'published', 'DRAFT',
  'Avaliação de Imóvel Urbano v1',
  'Estrutura de referência inicial (Cover, TOC, TechnicalInformation, ImportedTable, Table, PhotoSection, Text, DocumentAttachment, SignatureSection). Pesquisa normativa aprofundada (ex.: NBR de avaliação de imóveis) pendente -- ver Task 34.',
  '[]'::jsonb,
  '{"restrictions": "Elaboração/assinatura por Engenheiro de Avaliações ou profissional habilitado com competência em avaliação imobiliária."}'::jsonb,
  now()
from model
on conflict (technical_model_id, version_number) do update set version_number = excluded.version_number;

-- 12. Laudo de Sinistro / Danos em Edificação
with model as (
  insert into public.technical_models (
    slug, name, short_name, category, description, objective, when_to_use,
    typical_object_type, usage_profile, tags, jurisdiction_scope
  )
  values (
    'building-damage-report',
    'Laudo de Sinistro / Danos em Edificação',
    'Laudo de Sinistro',
    'specialized_engineering',
    'Caracterização do evento, extensão dos danos, segurança e recomendações.',
    'Caracterizar tecnicamente um evento danoso (sinistro) e a extensão dos danos causados.',
    'Após um evento como incêndio, desabamento parcial, inundação ou outro sinistro em edificação.',
    'edificação',
    '{"usesPhotos": true, "usesTables": true, "usesAttachments": true, "supportsComparative": false, "involvesTechnicalResponsibility": true}'::jsonb,
    array['laudo de sinistro', 'danos em edificação', 'perícia técnica'],
    'BR'
  )
  on conflict (slug) do update set updated_at = public.technical_models.updated_at
  returning id
)
insert into public.technical_model_versions (
  technical_model_id, version_number, status, research_status, title, description,
  technical_basis, professional_scope, published_at
)
select
  model.id, 1, 'published', 'DRAFT',
  'Laudo de Sinistro / Danos em Edificação v1',
  'Estrutura de referência inicial (Cover, TOC, TechnicalInformation, Findings, Table, PhotoSection, DocumentAttachment, Text, SignatureSection). Pesquisa normativa aprofundada pendente -- ver Task 34.',
  '[]'::jsonb,
  '{"restrictions": "Elaboração/assinatura por profissional habilitado (Engenheiro/Arquiteto) com competência pericial."}'::jsonb,
  now()
from model
on conflict (technical_model_id, version_number) do update set version_number = excluded.version_number;

-- 13. Laudo de Infiltrações e Impermeabilização
with model as (
  insert into public.technical_models (
    slug, name, short_name, category, description, objective, when_to_use,
    typical_object_type, usage_profile, tags, jurisdiction_scope
  )
  values (
    'waterproofing-infiltration-report',
    'Laudo de Infiltrações e Impermeabilização',
    'Infiltrações',
    'specialized_engineering',
    'Mapeamento da umidade, investigação de origem e recomendações de correção.',
    'Investigar a origem de infiltrações/umidade e recomendar solução de impermeabilização.',
    'Quando há sinais de umidade/infiltração e é necessário diagnosticar a origem antes de intervir.',
    'edificação / vedação',
    '{"usesPhotos": true, "usesTables": true, "usesAttachments": true, "supportsComparative": false, "involvesTechnicalResponsibility": true}'::jsonb,
    array['infiltração', 'impermeabilização', 'umidade', 'patologia das construções'],
    'BR'
  )
  on conflict (slug) do update set updated_at = public.technical_models.updated_at
  returning id
)
insert into public.technical_model_versions (
  technical_model_id, version_number, status, research_status, title, description,
  technical_basis, professional_scope, published_at
)
select
  model.id, 1, 'published', 'DRAFT',
  'Laudo de Infiltrações e Impermeabilização v1',
  'Estrutura de referência inicial (Cover, TOC, TechnicalInformation, Findings, Table, PhotoSection, DocumentAttachment, Text, SignatureSection). Pesquisa normativa aprofundada (ex.: NBR de impermeabilização) pendente -- ver Task 34.',
  '[]'::jsonb,
  '{"restrictions": "Elaboração/assinatura por profissional habilitado (Engenheiro/Arquiteto)."}'::jsonb,
  now()
from model
on conflict (technical_model_id, version_number) do update set version_number = excluded.version_number;

-- 14. Inspeção de Instalações Elétricas
with model as (
  insert into public.technical_models (
    slug, name, short_name, category, description, objective, when_to_use,
    typical_object_type, usage_profile, tags, jurisdiction_scope
  )
  values (
    'electrical-installation-inspection',
    'Inspeção de Instalações Elétricas',
    'Inspeção Elétrica',
    'electrical',
    'Condição de segurança, documentação, quadros, circuitos e medições.',
    'Avaliar a condição de segurança de uma instalação elétrica predial.',
    'Periodicamente, na compra/locação de um imóvel, ou após identificação de risco elétrico.',
    'instalação elétrica predial',
    '{"usesPhotos": true, "usesTables": true, "usesAttachments": true, "supportsComparative": false, "involvesTechnicalResponsibility": true}'::jsonb,
    array['instalação elétrica', 'segurança elétrica', 'inspeção elétrica'],
    'BR'
  )
  on conflict (slug) do update set updated_at = public.technical_models.updated_at
  returning id
)
insert into public.technical_model_versions (
  technical_model_id, version_number, status, research_status, title, description,
  technical_basis, professional_scope, published_at
)
select
  model.id, 1, 'published', 'DRAFT',
  'Inspeção de Instalações Elétricas v1',
  'Estrutura de referência inicial (Cover, TOC, TechnicalInformation, Table, ImportedTable, Findings, PhotoSection, DocumentAttachment, Text, SignatureSection). Mudança de norma aplicável deve gerar nova versão, nunca editar esta (ver PHASE1_CATALOG.md). Pesquisa normativa aprofundada (ex.: NBR 5410) pendente -- ver Task 34.',
  '[]'::jsonb,
  '{"restrictions": "Elaboração/assinatura por Engenheiro Eletricista ou profissional habilitado em instalações elétricas."}'::jsonb,
  now()
from model
on conflict (technical_model_id, version_number) do update set version_number = excluded.version_number;

-- Point every model at its (only, so far) published version. Idempotent
-- and safe to re-run: always recomputes from the actual max published
-- version_number per model.
update public.technical_models tm
set current_published_version_id = latest.id
from (
  select distinct on (technical_model_id) technical_model_id, id
  from public.technical_model_versions
  where status = 'published'
  order by technical_model_id, version_number desc
) as latest
where latest.technical_model_id = tm.id;
