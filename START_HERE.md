# START HERE — Modo Autônomo

Este projeto foi preparado para ser provisionado e desenvolvido por um agente de IA com acesso autenticado a **GitHub, Cloudflare, Supabase e navegador**.

## O que a pessoa proprietária precisa fazer

Em condições normais: **nada de configuração técnica manual**.

Entregue ao agente este repositório/pacote e mande executar `PROMPT_MESTRE_IA.md` do início ao fim, começando pela **Task 00 — Autonomous Provisioning**.

O agente é responsável por:

- inspecionar as contas disponíveis;
- criar/configurar o repositório privado;
- configurar branch protection/rulesets disponíveis no plano;
- configurar CI;
- criar staging e production no Supabase quando o plano permitir;
- selecionar `sa-east-1` (São Paulo) para os projetos Supabase;
- configurar Auth, banco, Storage privado, migrations e RLS;
- criar/configurar Cloudflare Workers;
- conectar GitHub ↔ Cloudflare Workers Builds;
- configurar previews de PR e deploy de staging;
- configurar secrets sem imprimi-los no chat/logs;
- criar ambientes, variáveis e documentação;
- executar testes e comprovar os gates antes de avançar.

## Únicas situações em que o agente deve pedir intervenção humana

O agente **não deve pedir ajuda para tarefas técnicas rotineiras**. Só deve parar quando uma destas condições for verdadeira:

1. a plataforma exigir autenticação humana não delegável, como confirmação de MFA/passkey;
2. for necessário aceitar contrato, termo jurídico ou DPA em nome da proprietária;
3. a ação exigir compra, upgrade pago, cartão ou aumento de limite com custo;
4. for necessário comprar/transferir domínio;
5. houver risco de apagar ou alterar recurso existente que o agente não criou e cuja finalidade não esteja comprovada;
6. houver escolha de negócio realmente irreversível não coberta pelos ADRs.

Nesses casos, o agente deve apresentar **uma única solicitação objetiva**, explicar por que não pode prosseguir sozinho e continuar automaticamente assim que a autorização estiver resolvida.

## Defaults para evitar perguntas desnecessárias

Enquanto a marca não estiver definida:

- codinome interno: `inspection-platform`;
- repositório: `inspection-platform` ou variante disponível;
- ambientes: `local`, `staging`, `production`;
- região Supabase: `sa-east-1`;
- URLs iniciais: subdomínios gerados pelo Cloudflare/Supabase;
- domínio próprio: adiado;
- recursos pagos: não contratar automaticamente;
- storage inicial: Supabase Storage privado através de `StorageProvider`;
- deploy web/API: Cloudflare Workers;
- framework API: Hono + TypeScript;
- frontend: React + Vite;
- secrets: Cloudflare Secrets/Secrets Store e secrets de ambiente apropriados; nunca plaintext em Git.

## Gate de início

O agente não deve começar Template Engine antes de provar automaticamente:

- Organization A e B independentes;
- User A e B autenticados;
- memberships corretas;
- User A não consegue SELECT/INSERT/UPDATE/DELETE em recursos de B;
- APIs validam capabilities;
- CI executa os testes cross-tenant;
- staging está deployado e saudável.

## LVL Pro

O LVL Pro permanece um projeto independente. Não modificar, importar banco, migrations ou infraestrutura dele. Ideias/componentes só podem ser reimplementados conscientemente quando forem genéricos e adequados à nova arquitetura.
