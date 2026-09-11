# O que você precisa configurar antes de começar a codar

Este é o checklist operacional para a proprietária do projeto.

## 1. Contas e acesso

Crie uma conta de email exclusiva para administração técnica da empresa/produto e use um gerenciador de senhas. Ative MFA em GitHub, Supabase, cloud/storage, domínio/DNS e billing.

Evite concentrar recovery codes somente no mesmo dispositivo usado diariamente.

## 2. GitHub

- criar Organization;
- criar repositório privado;
- proteger `main`;
- exigir PR;
- habilitar secret scanning e dependency alerts;
- criar environments staging/production;
- produção com aprovação manual;
- salvar secrets por environment.

## 3. Desenvolvimento local

Instalar/fixar:

- Node LTS;
- pnpm;
- Docker Desktop/Engine;
- Git;
- Supabase CLI;
- editor/IDE;
- CLI da cloud apenas quando necessário.

Não começar com dezenas de extensões/agentes alterando o mesmo repositório sem coordenação.

## 4. Supabase

Criar primeiro **staging**. Não usar produção para desenvolvimento.

Definir:

- região;
- Auth settings;
- URLs permitidas;
- políticas de email/reset;
- backups compatíveis com o estágio;
- branch/local workflow.

Production deve ser projeto separado com credenciais próprias.

## 5. Object storage

Criar staging separado de production. Buckets privados. Definir CORS somente para origens necessárias e limitar URLs assinadas.

Não expor arquivos técnicos em bucket público.

## 6. Domínio e DNS

Reservar domínio quando marca estiver definida. Enquanto isso, usar codinome e subdomínio de staging.

Planejar pelo menos:

- `app.<dominio>`
- `api.<dominio>`
- `status.<dominio>` opcional

## 7. Email transacional

Escolher um provider quando convites/reset/notificações deixarem de ser apenas testes. Separar emails transacionais de marketing.

Configurar SPF/DKIM/DMARC antes de produção.

## 8. Observabilidade

Criar projeto staging e production separados. Garantir redaction de dados pessoais/tokens. Começar com erros, traces essenciais e métricas de jobs.

## 9. Jurídico/privacidade

Antes de beta com dados reais:

- empresa/CNPJ e contratos adequados;
- Termos de Uso;
- Política de Privacidade;
- DPA/contrato de operador quando aplicável;
- lista de suboperadores;
- política de retenção;
- processo de incidente;
- processo de direitos dos titulares;
- revisão das transferências internacionais;
- revisão específica de assinatura eletrônica quando introduzida.

## 10. Desenvolvimento com IA

Dar à IA acesso somente ao repositório e ambientes necessários. Não colar secrets nos prompts. Manter tarefas pequenas. Exigir testes, documentação e diff revisável. Usar `PROMPT_MESTRE_IA.md` + `TASK_TEMPLATE.md`.

## 11. Não comprar/contratar cedo demais

Pode esperar até necessidade real:

- Kubernetes;
- dedicated database por tenant;
- SSO enterprise;
- e-sign provider definitivo;
- data warehouse;
- SIEM enterprise;
- native mobile infrastructure;
- AI provider em produção.
