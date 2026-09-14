# PDF Output Design Spec

> Contrato visual do documento emitido. Complementa `docs/domain/TEMPLATES.md`
> (controlled block DSL) e `docs/domain/REPORTS.md` (emissão). Requisitos
> aqui são registrados agora; implementação acontece nas Tasks correspondentes
> (Renderer v1 = Task 25) — ver `docs/product/ROADMAP_TASKS_V2.md`.

## Princípio central

**O PDF não é uma captura da interface do SaaS.** O painel web pode ter
aparência moderna de aplicativo; o documento emitido precisa parecer um
laudo técnico profissional — o `PdfRenderer` é um produto editorial
independente da UI (ver ADR-0010).

## Linguagem visual

- muito espaço em branco;
- A4;
- aparência técnica e sóbria;
- hierarquia tipográfica forte;
- cabeçalhos e rodapés discretos;
- cores da empresa usadas com moderação (branding — ver Task 26);
- tabelas limpas, editoriais;
- fotografias grandes;
- nada de aparência de dashboard, cards coloridos em excesso, gradientes decorativos ou "visual de relatório gerado por aplicativo".

## Capa

Deve suportar: logo da empresa, fotografia principal opcional, título do
laudo, subtítulo/tipo, volume, cliente/solicitante, empreendimento/imóvel,
endereço, data, responsável técnico, código/número do documento, observação
legal configurável, QR Code/validação opcional. Minimalista — não lotada.

## Sumário

Gerado automaticamente a partir da árvore final do documento (seções e
blocos habilitados na `OrganizationModelVersion`), precisa suportar
documentos muito grandes (1 a 500+ páginas). Numeração de página nunca é
digitada pelo usuário.

Exemplo conceitual:

```text
I. INFORMAÇÕES GERAIS
  1. Introdução
  2. Objeto
  3. Objetivo
II. CARACTERÍSTICAS DO IMÓVEL
  1. Fachada
  2. Sala
  3. Cozinha
III. CONCLUSÃO
IV. RESPONSABILIDADE TÉCNICA
V. ANEXOS
```

## Página de texto

Margens amplas, largura de leitura confortável, títulos bem definidos,
subtítulos discretos, parágrafos com espaçamento consistente, listas/notas
técnicas sem poluição visual. Dados estruturados (bloco `TechnicalInformation`)
podem usar layout `label/value`, mas nunca devem parecer cards de aplicativo.

## Página fotográfica (bloco `PhotoSection`)

O renderer precisa de variantes profissionais, no mínimo:

- 1 foto grande;
- 2 fotos grandes;
- 4 fotos;
- 6 fotos em grade 2×3 (referência para laudos com centenas/milhares de fotos);
- foto + descrição técnica;
- comparativo antes/depois;
- comparativo cautelar/revistoria;
- foto em destaque + fotos auxiliares.

Cada foto pode exibir: número/ID, ambiente/local, legenda, constatação
relacionada (opcional). Não tornar metadata excessiva obrigatória
visualmente.

**Seção de ambiente** — ordem editorial preferencial: nome do ambiente →
informações/caracterização → descrição técnica → constatações → registro
fotográfico. Nunca despejar dezenas de fotos sem contexto.

## Comparativos

O engine deve suportar nativamente: condição anterior, condição atual,
avaliação comparativa, fotos lado a lado, tabela síntese. Necessário para
revistoria de vizinhança, vistoria imobiliária de saída, reinspeções e
acompanhamento de patologias (ver Tasks 09/18).

## Tabelas (bloco `Table`/`ImportedTable`)

Editoriais, não tabelas HTML genéricas. Requisitos futuros do renderer:
cabeçalho repetido em nova página, controle de largura de colunas, quebra de
texto, alinhamento por tipo, sem linha partida de forma ilegível, evitar
linhas órfãs, estilos configurados pelo tema, suporte a tabelas longas,
importação de Excel/CSV sem carregar a formatação ruim do arquivo original.

## Conclusão

Seção própria e visualmente importante — nunca espremida após uma galeria de
fotos.

## Assinatura (bloco `SignatureSection`)

Seção/página limpa com: nome, profissão, registro profissional, empresa,
método de assinatura, data, QR/hash/validação quando aplicável (ver Task 28
— Signature Abstraction).

## Rodapé

Pode conter: nome da empresa, documento, versão, página X de Y, QR Code
pequeno, identificador/hash resumido. A implementação deve impedir
duplicação de paginação/cabeçalho/rodapé.

## Branding controlado (Task 26)

A organização poderá configurar: logo, razão social, nome fantasia, CNPJ,
contatos, endereço, website, cores, responsáveis técnicos, registros
profissionais, textos legais, cabeçalho, rodapé, capa padrão.

**Nunca** permitir CSS arbitrário, HTML arbitrário ou liberdade total de
design (ver AGENTS.md — proibição de código arbitrário de tenant). O
objetivo é garantir que qualquer empresa gere um documento bonito dentro de
um sistema de temas controlado.

Famílias de tema planejadas para o futuro (não implementar antes da task
correspondente): `technical_classic`, `technical_minimal`, `corporate`.

## Requisitos não funcionais do futuro Report Renderer

Registrados agora, implementados apenas nas Tasks correspondentes (Task 25 —
Report Renderer v1):

- documentos de 1 a 500+ páginas;
- centenas/milhares de fotos;
- A4;
- paginação determinística;
- índice automático;
- repetição de cabeçalho de tabela;
- controle de órfã/viúva (orphan/widow);
- page breaks explícitos;
- evitar corte ruim de imagem/título/tabela;
- imagens com qualidade adequada sem PDF gigantesco (compressão configurável);
- renderer versionado, snapshots imutáveis;
- PDF reproduzível a partir do mesmo snapshot + renderer version;
- geração server-side, não dependente do browser do usuário;
- golden PDF tests;
- hash SHA-256 da versão emitida;
- armazenamento privado;
- suporte a PDF/A apenas se houver necessidade real/contratual futura.

## Proveniência

Requisitos derivados de: (a) os 14 PDFs de referência estrutural em
`docs/product/technical-models/PHASE1_CATALOG.md`; (b) análise do acabamento
editorial de laudos reais do LVL Pro (capa, sumário, hierarquia de títulos,
páginas fotográficas, tabelas, conclusões, assinaturas, paginação) —
**usados somente como referência visual**, sem copiar código, infraestrutura,
banco ou dado de cliente do LVL Pro para este projeto.
