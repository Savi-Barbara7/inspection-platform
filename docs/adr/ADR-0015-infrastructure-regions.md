# ADR-0015 — Infrastructure regions

**Status:** Accepted for v1  
**Date:** 2026-09-11

## Context

O projeto precisa de uma decisão explícita e estável para infrastructure regions.

## Decision

Use Supabase specific region `sa-east-1` (São Paulo) for staging/production database, Auth and initial Storage. Cloudflare Workers remains globally distributed compute; any Cloudflare service that persists customer data must be separately evaluated/documented before use.

## Rationale

Latency, contractual transparency and data governance benefit from explicit region choices.

## Alternatives considered

- solução mais simples, porém com menor garantia arquitetural;
- solução mais complexa/distribuída, postergada até haver necessidade mensurável;
- acoplamento direto a fornecedor, rejeitado quando compromete substituição futura.

## Consequences

Region choice alone does not establish LGPD compliance.

## Security implications

A implementação deve preservar isolamento de tenant, menor privilégio, validação explícita e auditabilidade onde aplicável.

## Privacy implications

Qualquer novo dado pessoal, retenção, região ou suboperador exige atualização da documentação de privacidade correspondente.
