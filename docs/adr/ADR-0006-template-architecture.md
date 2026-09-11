# ADR-0006 — Template architecture

**Status:** Accepted for v1  
**Date:** 2026-09-11

## Context

O projeto precisa de uma decisão explícita e estável para template architecture.

## Decision

Separate InspectionTemplate from immutable InspectionTemplateVersion, with data schema, UI schema and declarative rules.

## Rationale

A mutable template would invalidate historical interpretation.

## Alternatives considered

- solução mais simples, porém com menor garantia arquitetural;
- solução mais complexa/distribuída, postergada até haver necessidade mensurável;
- acoplamento direto a fornecedor, rejeitado quando compromete substituição futura.

## Consequences

Published versions are immutable; field identities cannot depend on labels.

## Security implications

A implementação deve preservar isolamento de tenant, menor privilégio, validação explícita e auditabilidade onde aplicável.

## Privacy implications

Qualquer novo dado pessoal, retenção, região ou suboperador exige atualização da documentação de privacidade correspondente.
