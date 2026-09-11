# ADR-0008 — Storage architecture

**Status:** Accepted for v1  
**Date:** 2026-09-11

## Context

O projeto precisa de uma decisão explícita e estável para storage architecture.

## Decision

Define a `StorageProvider` interface. Use Supabase Storage as the first provider, private-by-default, inside the Supabase project deployed in `sa-east-1`. Use authorization/RLS or short-lived signed URLs; provider-specific details must not enter the domain.

## Rationale

The agent already has Supabase access, Supabase Storage is S3-compatible, and keeping database/auth/storage in the same project region simplifies the first deployment while preserving provider independence.

## Alternatives considered

- solução mais simples, porém com menor garantia arquitetural;
- solução mais complexa/distribuída, postergada até haver necessidade mensurável;
- acoplamento direto a fornecedor, rejeitado quando compromete substituição futura.

## Consequences

Objects must never be made public merely for convenience.

## Security implications

A implementação deve preservar isolamento de tenant, menor privilégio, validação explícita e auditabilidade onde aplicável.

## Privacy implications

Qualquer novo dado pessoal, retenção, região ou suboperador exige atualização da documentação de privacidade correspondente.
