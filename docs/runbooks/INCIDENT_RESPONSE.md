# Incident Response Runbook

## 1. Detectar

Registrar horário, origem, escopo aparente e sistemas envolvidos.

## 2. Classificar

- disponibilidade;
- integridade;
- confidencialidade;
- possível vazamento cross-tenant;
- presença de dados pessoais;
- criticidade operacional.

## 3. Conter

Exemplos: revogar chave, bloquear endpoint, suspender token, isolar worker, desabilitar integração, colocar recurso em read-only.

## 4. Preservar evidência

Manter logs/audit relevantes sem alterar cadeia necessária para investigação.

## 5. Avaliar LGPD/contratos

Acionar responsável jurídico/privacy para determinar obrigações e prazos aplicáveis.

## 6. Erradicar e recuperar

Corrigir causa, restaurar serviço, validar tenant isolation e integridade.

## 7. Comunicar

Seguir plano jurídico/contratual. Não improvisar comunicação técnica externa.

## 8. Postmortem

Sem caça a culpados. Registrar causa raiz, impacto, timeline, detecção, controles ausentes e ações com owner/prazo.
