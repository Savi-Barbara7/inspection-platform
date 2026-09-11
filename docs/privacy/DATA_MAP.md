# Data Map v1

Preencher e revisar com jurídico/DPO antes do beta real.

| Processo | Dados | Titular | Finalidade | Papel da plataforma | Base legal do controlador | Storage/região | Retenção | Suboperadores |
|---|---|---|---|---|---|---|---|---|
| Conta SaaS | nome, email, auth metadata | usuário | acesso ao sistema | controlador para conta própria | definir | Supabase | definir | Supabase |
| Membership | usuário, organização, role | usuário | autorização | controlador/operador conforme relação | definir | Postgres | definir | Supabase |
| Inspeção | respostas, observações | pessoas envolvidas/cliente | execução contratada | geralmente operador | definida pelo cliente | Postgres | por política | Supabase |
| Evidências | fotos, documentos, possível localização | possíveis titulares incidentais | comprovação técnica | geralmente operador | definida pelo cliente | Object storage | por política | storage provider |
| Billing | dados de assinatura/fatura | cliente/contato | cobrança | controlador | definir | billing provider | fiscal/contratual | provider |
| Logs | IDs técnicos, IP quando aplicável | usuário | segurança/operação | controlador | definir | observability | curta | provider |

## Regras

- não usar consentimento como resposta automática para todo tratamento;
- finalidade e retenção devem ser específicas;
- geolocalização é opt-in por template/finalidade;
- analytics não deve receber conteúdo de laudos/evidências sem necessidade explícita.
