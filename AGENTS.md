# AGENTS.md — Constituição para agentes de IA

Este documento é normativo para qualquer agente de IA que altere este repositório.

## 1. Antes de implementar

O agente DEVE:

1. Ler `docs/TECHNICAL_SPEC_V1.md`.
2. Ler os ADRs relacionados à tarefa.
3. Ler a documentação do domínio afetado.
4. Identificar invariantes de tenant, segurança, privacidade e versionamento.
5. Declarar a estratégia de teste antes de alterar código.

## 2. Proibições absolutas

O agente NÃO PODE:

- desabilitar RLS para “resolver” um problema;
- expor `service_role` em frontend, PWA ou bundle público;
- confiar em `organization_id` enviado pelo cliente como prova de autorização;
- editar template publicado;
- editar relatório emitido;
- executar JavaScript, SQL, `eval`, `Function` ou HTML arbitrário vindo de template do tenant;
- criar migration manual fora do fluxo versionado;
- editar migration já aplicada/mergeada;
- registrar senha, token, cookie, JWT, chave de API, conteúdo integral de laudo ou evidência em logs;
- usar `any`/`@ts-ignore` para mascarar problema de modelagem sem justificativa formal;
- remover, pular ou enfraquecer teste para “fechar” tarefa;
- introduzir dependência sem checar licença, manutenção e risco;
- acoplar domínio diretamente a Supabase, AWS, billing provider ou framework UI;
- criar exceções por vertical no core quando a necessidade puder ser expressa por schema/plugin controlado;
- alterar arquitetura relevante sem ADR.

## 3. Regras para toda tabela tenant-owned

Toda tabela pertencente a uma organização DEVE possuir:

- `organization_id UUID NOT NULL`;
- foreign key coerente;
- RLS habilitado;
- política explícita;
- teste cross-tenant de SELECT, INSERT, UPDATE e DELETE quando aplicável;
- índices compatíveis com as políticas e queries esperadas.

## 4. Regras para endpoints

Todo endpoint novo DEVE definir:

- autenticação;
- autorização;
- tenant derivado da sessão/membership;
- validação de entrada;
- tratamento de erro padronizado;
- necessidade de rate limit;
- necessidade de idempotência;
- necessidade de auditoria;
- implicações LGPD;
- contrato OpenAPI;
- testes positivos, negativos e cross-tenant.

## 5. Regras para uploads

Todo fluxo de upload novo DEVE definir:

- tipos permitidos;
- tamanho máximo;
- validação de magic bytes/MIME;
- autorização;
- nome/chave gerado pelo servidor;
- quarentena quando necessário;
- scanning quando aplicável;
- hash;
- retenção;
- política de metadata/EXIF;
- teste de arquivo malicioso/inválido.

## 6. Regras para documentos

- PDF oficial deve ser gerado server-side.
- Emissão cria snapshot e `ReportVersion` imutável.
- A versão do renderer deve ser registrada.
- Assets usados devem ser identificáveis por hash/manifest.
- Correção gera nova versão, nunca sobrescrita silenciosa.

## 7. Regras para templates

- Draft pode mudar.
- Published é imutável.
- Nova alteração gera nova versão.
- IDs de campo são estáveis e independentes de labels.
- Regras são declarativas e avaliadas por engine controlada.

## 8. Regras para dependências

Antes de adicionar dependência:

1. explicar o problema que resolve;
2. verificar se já existe solução interna;
3. verificar licença;
4. verificar atividade/manutenção;
5. avaliar impacto de bundle/runtime;
6. avaliar segurança;
7. registrar em `LICENSES.md` quando necessário.

## 9. Definition of Done do agente

Uma tarefa só está pronta quando:

- comportamento implementado;
- tipos corretos;
- validação concluída;
- autorização verificada;
- isolamento de tenant comprovado;
- testes necessários adicionados;
- migration testada quando houver banco;
- documentação atualizada;
- audit/privacy/security avaliados;
- lint, typecheck e testes verdes;
- sem regressão de contratos existentes.

## 10. Se encontrar conflito arquitetural

NÃO improvisar.

Fluxo:

1. registrar problema;
2. propor ADR;
3. listar alternativas;
4. avaliar impacto em segurança, dados, compatibilidade e operação;
5. somente então implementar a decisão aprovada.

## Autonomous infrastructure operations

The agent may provision/configure GitHub, Cloudflare and Supabase resources when actions are reversible and do not create new paid commitments.

The agent must not offload routine setup to the owner. It must execute it directly using the authenticated browser/CLI/API available.

Human intervention is reserved for: payment/upgrade, legal acceptance, domain purchase/transfer, personal MFA/recovery material, or destructive mutation of an unknown pre-existing resource.

Never echo credentials. Never capture/store owner MFA recovery codes. Prefer native Git integrations and managed secret stores over long-lived deploy tokens.

Maintain `docs/infra/PROVISIONING_STATE.md` after infrastructure changes, without secret values.
