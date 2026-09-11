# ADR-0004 — Authorization and RLS

**Status:** Accepted for v1  
**Date:** 2026-09-11

## Context

O projeto precisa de uma decisão explícita e estável para authorization and rls.

## Decision

Use capabilities at application layer and RLS at data layer. Authorization must evaluate user, membership, tenant, permission and resource.

## Rationale

Role-only checks and client-provided tenant IDs are insufficient.

## Alternatives considered

- solução mais simples, porém com menor garantia arquitetural;
- solução mais complexa/distribuída, postergada até haver necessidade mensurável;
- acoplamento direto a fornecedor, rejeitado quando compromete substituição futura.

## Consequences

Every tenant-owned table requires policy and cross-tenant tests.

## Security implications

A implementação deve preservar isolamento de tenant, menor privilégio, validação explícita e auditabilidade onde aplicável.

## Privacy implications

Qualquer novo dado pessoal, retenção, região ou suboperador exige atualização da documentação de privacidade correspondente.
