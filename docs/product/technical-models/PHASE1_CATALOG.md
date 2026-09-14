# Catálogo Oficial — Fase 1 (14 modelos)

> Fonte: pacote "INSPECTION_PLATFORM_PACOTE_COMPLETO_PARA_CLAUDE_APOS_TASK04"
> (14 PDFs de referência estrutural + especificação técnica), recebido após a
> Task 04. Substitui a priorização anterior de `CATALOG_V1.md` como escopo do
> MVP — ver nota no topo daquele arquivo.
>
> **Implementado na Task 08** (`technical_models`/`technical_model_versions`,
> ver `supabase/migrations/20260914210000_technical_model_catalog.sql` e
> `20260914220000_seed_technical_model_catalog_phase1.sql`). Os 14 slugs
> estáveis usados no seed: `neighborhood-preconstruction-survey`,
> `building-inspection`, `pathology-report`, `structural-report`,
> `facade-inspection`, `construction-handover`, `construction-punch-list`,
> `new-apartment-handover`, `rental-entry-inspection`,
> `rental-exit-comparison`, `urban-property-valuation`,
> `building-damage-report`, `waterproofing-infiltration-report`,
> `electrical-installation-inspection` (mesma ordem da tabela abaixo).
> Categorias mapeadas: `building_engineering` (#1, #2, #5, #6, #7),
> `specialized_engineering` (#3, #4, #12, #13), `property_inspection`
> (#8, #9, #10), `real_estate` (#11), `electrical` (#14). Todos com
> `researchStatus: DRAFT`, editorialmente `published` (ver
> docs/domain/TEMPLATES.md "Research status × editorial status").

## Princípio do produto

A empresa parte de um modelo técnico já estruturado, cria uma versão própria
e pode reordenar, ocultar ou adicionar seções e blocos. Requisitos técnicos
ficam separados do layout: retirar um requisito obrigatório gera override
rastreável e pode retirar o status de compatibilidade com o modelo-base (ver
`docs/domain/TEMPLATES.md` e ADR-0017).

Os PDFs individuais em `14_TEMPLATES_FASE1/` (mantidos fora do repositório —
ver nota de proveniência abaixo) são **referência estrutural/funcional**, não
o design visual final — esse é o papel do `PDF_OUTPUT_DESIGN_SPEC.md`.

## Os 14 modelos

| #   | Código | Modelo                                                | Foco                                                                                  | Blocos-chave                                                                                                               |
| --- | ------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | TPL-01 | Vistoria Cautelar de Vizinhança                       | Estado prévio de imóveis e áreas na influência da obra                                | Cover, TOC, TechnicalInformation, Text, PhotoSection, Findings, DocumentAttachment, SignatureSection                       |
| 2   | TPL-02 | Inspeção Predial                                      | Avaliação sistêmica da edificação, manutenção e prioridades                           | Cover, TOC, TechnicalInformation, Table, PhotoSection, Findings, Text, SignatureSection                                    |
| 3   | TPL-03 | Laudo de Manifestações Patológicas                    | Investigação técnica de manifestações, mecanismos e recomendações                     | Cover, TOC, Text, TechnicalInformation, Findings, Table, PhotoSection, DocumentAttachment, SignatureSection                |
| 4   | TPL-04 | Laudo Estrutural                                      | Inspeção, ensaios, análise e parecer sobre segurança/desempenho estrutural            | Cover, TOC, TechnicalInformation, Findings, Table, PhotoSection, ImportedTable, DocumentAttachment, Text, SignatureSection |
| 5   | TPL-05 | Vistoria de Fachadas                                  | Inspeção especializada de revestimentos, elementos externos e risco de desprendimento | Cover, TOC, TechnicalInformation, Findings, Table, PhotoSection, DocumentAttachment, Text, SignatureSection                |
| 6   | TPL-06 | Vistoria de Entrega de Obra                           | Verificação técnica do produto entregue, sistemas, acabamentos e documentação         | Cover, TOC, TechnicalInformation, Table, Findings, PhotoSection, DocumentAttachment, SignatureSection                      |
| 7   | TPL-07 | Recebimento de Obra / Punch List                      | Pendências, reinspeção e aceite provisório/definitivo                                 | Cover, TOC, TechnicalInformation, Table, Findings, PhotoSection, DocumentAttachment, SignatureSection                      |
| 8   | TPL-08 | Vistoria de Apartamento Novo / Assistência na Entrega | Conferência técnica da unidade antes do recebimento das chaves                        | Cover, TOC, TechnicalInformation, Table, Findings, PhotoSection, SignatureSection                                          |
| 9   | TPL-09 | Vistoria Imobiliária de Entrada                       | Estado do imóvel no início da locação, ambiente por ambiente                          | Cover, TOC, TechnicalInformation, Table, PhotoSection, Text, SignatureSection                                              |
| 10  | TPL-10 | Vistoria Imobiliária de Saída e Comparativo           | Comparação rastreável entre o baseline de entrada e a devolução                       | Cover, TOC, TechnicalInformation, Table, PhotoSection, Text, SignatureSection                                              |
| 11  | TPL-11 | Avaliação de Imóvel Urbano                            | Pesquisa, metodologia, memória de cálculo e valor de referência                       | Cover, TOC, TechnicalInformation, ImportedTable, Table, PhotoSection, Text, DocumentAttachment, SignatureSection           |
| 12  | TPL-12 | Laudo de Sinistro / Danos em Edificação               | Caracterização do evento, extensão dos danos, segurança e recomendações               | Cover, TOC, TechnicalInformation, Findings, Table, PhotoSection, DocumentAttachment, Text, SignatureSection                |
| 13  | TPL-13 | Laudo de Infiltrações e Impermeabilização             | Mapeamento da umidade, investigação de origem e recomendações de correção             | Cover, TOC, TechnicalInformation, Findings, Table, PhotoSection, DocumentAttachment, Text, SignatureSection                |
| 14  | TPL-14 | Inspeção de Instalações Elétricas                     | Condição de segurança, documentação, quadros, circuitos e medições                    | Cover, TOC, TechnicalInformation, Table, ImportedTable, Findings, PhotoSection, DocumentAttachment, Text, SignatureSection |

Todos os 14 usam exclusivamente o controlled block DSL já definido em
`docs/domain/TEMPLATES.md` — nenhum bloco específico de vertical
(`CautelarBlock`, `InspecaoPredialBlock` etc.) foi ou deve ser criado. A
diferença entre modelos está em schema/configuração, nunca em código.

## Regras condicionais representativas (validam o engine, não são exaustivas)

- Vistoria Cautelar: acesso parcial/não realizado exige justificativa; exclusão de intervalo de fotos deve ser reversível antes da emissão; versão emitida congela fotos/legendas/estrutura.
- Inspeção Predial: finding crítico exige recomendação; recomendação especializada pode criar referência para novo `TechnicalJob`.
- Laudo Estrutural: achado crítico aciona alerta destacado; interdição/escoramento gera audit event próprio; arquivo de cálculo usado no parecer entra no asset manifest.
- Avaliação de Imóvel Urbano: importar Excel exige mapear colunas e confirmar preview; resultado sempre aponta ao dataset/memória de cálculo da versão; alterar amostras após emissão exige nova versão.
- Vistoria Imobiliária de Saída: itens da entrada não podem ser apagados na saída; mudança não gera cobrança automática (decisão de negócio permanece humana).
- Inspeção Elétrica: mudança de norma aplicável cria nova `TechnicalModelVersion` (não edita a existente).

## Status de validação

Cada um dos 14 modelos está em **DRAFT** com nota explícita: antes de marcar
como `VERIFIED_REFERENCE_MODEL` (ver `docs/product/technical-models/RESEARCH_PROTOCOL.md`),
é necessário revisar a edição normativa efetivamente aplicável, atribuições
profissionais, requisitos locais/contratuais e pelo menos um caso real
anonimizado. Nenhum modelo deve ser comercializado como "conforme NBR X" sem
essa revisão.

## Proveniência dos PDFs de referência

Os 14 PDFs individuais, a especificação técnica consolidada e a coleção
visual **não foram versionados neste repositório** (são material de
pesquisa/briefing, não artefato de produto — evitar inflar o repositório com
binários). Ficam disponíveis com a proprietária do produto; este documento é
o resumo estruturado do conteúdo deles.
