# ADR-0001 — Multi-tenancy strategy

**Status:** Accepted for v1  
**Date:** 2026-09-11

## Context

O projeto precisa de uma decisão explícita e estável para multi-tenancy strategy.

## Decision

Shared PostgreSQL database and shared schema with mandatory `organization_id` on tenant-owned rows, application authorization and PostgreSQL RLS.

## Rationale

Database-per-tenant and schema-per-tenant increase operational complexity prematurely.

## Alternatives considered

- solução mais simples, porém com menor garantia arquitetural;
- solução mais complexa/distribuída, postergada até haver necessidade mensurável;
- acoplamento direto a fornecedor, rejeitado quando compromete substituição futura.

## Consequences

Cross-tenant leakage becomes a critical test target; service roles must be tightly controlled.

## Security implications

A implementação deve preservar isolamento de tenant, menor privilégio, validação explícita e auditabilidade onde aplicável.

## Privacy implications

Qualquer novo dado pessoal, retenção, região ou suboperador exige atualização da documentação de privacidade correspondente.
