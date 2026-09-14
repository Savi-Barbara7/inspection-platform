# Glossary

> Revisado na Task 03.5 — ver `docs/adr/ADR-0017-technical-model-domain.md`.

**Organization / Tenant** — empresa que assina e utiliza a plataforma.

**Customer** — cliente da Organization.

**Site** — local físico/operacional associado a trabalhos técnicos.

**Asset** — objeto inspecionável com histórico próprio.

**Technical Model** — modelo técnico mantido pela plataforma (ex.: "Inspeção NR-13 — Caldeira"), com pesquisa e fonte de origem por trás. Substitui o antigo *Inspection Template*.

**Technical Model Version** — snapshot imutável publicado de um Technical Model: seções, blocos controlados e requirements.

**Organization Model** — derivação de um Technical Model Version personalizada por uma organização (textos, branding, seções). Nunca altera o modelo original.

**Organization Model Version** — snapshot imutável publicado de um Organization Model.

**Provenance** — referência sempre mantida de qual Technical Model Version deu origem a um Organization Model, e de qual Organization Model Version um Technical Job utilizou.

**Requirement** — item de um Technical Model Version com nível `required`/`recommended`/`optional`, fonte de origem e efeito de compatibilidade quando removido/sobrescrito.

**Controlled Block** — unidade de conteúdo dentro de uma seção (Cover, Text, TechnicalInformation, Table, ImportedTable, PhotoSection, DocumentAttachment, Findings, SignatureSection, Header, Footer, PageBreak, TableOfContents). Carrega dado e apresentação juntos; nunca código arbitrário do tenant.

**Technical Job** — execução concreta de uma Organization Model Version. Substitui o antigo *Inspection* como nome geral do trabalho.

**Evidence** — foto, documento, assinatura, medição ou outro artefato comprobatório.

**Finding** — constatação/não conformidade.

**Report** — documento em elaboração a partir de um Technical Job.

**Report Version** — versão imutável de documento emitido, com snapshot e hash. Não existe mais um *Report Template* separado — a apresentação já está definida na Organization Model Version.

**Capability** — permissão granular.

**Audit Event** — registro de negócio append-only.

**Entitlement** — recurso/limite habilitado por assinatura.
