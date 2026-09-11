# ADR-0016 — Autonomous provisioning

**Status:** Accepted for v1  
**Date:** 2026-09-11

## Context

A proprietária quer que o agente de desenvolvimento configure a infraestrutura necessária sem depender de tarefas técnicas manuais. O agente possui acesso autenticado a GitHub, Cloudflare, Supabase e navegador.

## Decision

Permitir provisioning autônomo de recursos reversíveis e sem custo novo, sob políticas de least privilege, infraestrutura como configuração versionada e documentação automática do estado.

O agente só solicita intervenção humana para pagamento/upgrade, termos jurídicos, compra/transferência de domínio, MFA pessoal ou ação destrutiva sobre recurso preexistente não classificado.

## Consequences

- Task 00 passa a preceder Repository Foundation.
- O agente deve manter `docs/infra/PROVISIONING_STATE.md`.
- Secrets nunca são retornados ao usuário ou registrados em documentação.
- Recursos devem usar nomes provisórios renomeáveis enquanto a marca não estiver definida.

## Security implications

Autonomia não concede autorização para divulgar credenciais, reduzir controles, reutilizar secrets entre ambientes ou desativar proteção para acelerar desenvolvimento.

## Privacy implications

Novos providers, regiões ou recursos que tratem dados pessoais exigem atualização de Data Map/Subprocessors.
