# ADR-0002 — PostgreSQL and Supabase platform

**Status:** Accepted for v1  
**Date:** 2026-09-11

## Context

O projeto precisa de uma decisão explícita e estável para postgresql and supabase platform.

## Decision

Use PostgreSQL as system of record and Supabase initially for managed Postgres/Auth capabilities.

## Rationale

It preserves SQL/RLS strength and avoids inventing auth/storage infrastructure.

## Alternatives considered

- solução mais simples, porém com menor garantia arquitetural;
- solução mais complexa/distribuída, postergada até haver necessidade mensurável;
- acoplamento direto a fornecedor, rejeitado quando compromete substituição futura.

## Consequences

Provider-specific calls must stay behind adapters where they would otherwise pollute domain code.

## Security implications

A implementação deve preservar isolamento de tenant, menor privilégio, validação explícita e auditabilidade onde aplicável.

## Privacy implications

Qualquer novo dado pessoal, retenção, região ou suboperador exige atualização da documentação de privacidade correspondente.
