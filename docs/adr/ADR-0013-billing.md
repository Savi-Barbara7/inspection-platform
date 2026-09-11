# ADR-0013 — Billing abstraction

**Status:** Accepted for v1  
**Date:** 2026-09-11

## Context

O projeto precisa de uma decisão explícita e estável para billing abstraction.

## Decision

Use BillingProvider plus Plan/Subscription/Entitlement/Usage abstractions.

## Rationale

The domain must not be coupled to a payment vendor or hardcoded plan names.

## Alternatives considered

- solução mais simples, porém com menor garantia arquitetural;
- solução mais complexa/distribuída, postergada até haver necessidade mensurável;
- acoplamento direto a fornecedor, rejeitado quando compromete substituição futura.

## Consequences

Billing webhooks require signature validation and idempotency.

## Security implications

A implementação deve preservar isolamento de tenant, menor privilégio, validação explícita e auditabilidade onde aplicável.

## Privacy implications

Qualquer novo dado pessoal, retenção, região ou suboperador exige atualização da documentação de privacidade correspondente.
