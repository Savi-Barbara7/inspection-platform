# ADR-0014 — API architecture

**Status:** Accepted for v1  
**Date:** 2026-09-11

## Context

O projeto precisa de uma decisão explícita e estável para api architecture.

## Decision

Use REST `/api/v1`, OpenAPI 3.1 and typed validation contracts. Deploy the initial API on Cloudflare Workers using Hono; keep domain/application layers runtime-independent.

## Rationale

REST is sufficient for the MVP. Cloudflare Workers is already available to the autonomous agent and Hono is a lightweight Web-Standards framework suitable for Workers, while domain isolation preserves future portability.

## Alternatives considered

- solução mais simples, porém com menor garantia arquitetural;
- solução mais complexa/distribuída, postergada até haver necessidade mensurável;
- acoplamento direto a fornecedor, rejeitado quando compromete substituição futura.

## Consequences

Breaking changes require API versioning/migration strategy.

## Security implications

A implementação deve preservar isolamento de tenant, menor privilégio, validação explícita e auditabilidade onde aplicável.

## Privacy implications

Qualquer novo dado pessoal, retenção, região ou suboperador exige atualização da documentação de privacidade correspondente.
