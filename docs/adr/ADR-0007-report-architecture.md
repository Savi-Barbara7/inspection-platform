# ADR-0007 — Report architecture

**Status:** Superseded by ADR-0017 (2026-09-14)
**Date:** 2026-09-11

> Kept as historical record. The separate report-layout-vs-collection-schema
> split described below was replaced by controlled blocks that carry both
> data and presentation together, under OrganizationModelVersion, in ADR-0017.
> `Report`/`ReportVersion` and the immutability guarantee remain accurate.

## Context

O projeto precisa de uma decisão explícita e estável para report architecture.

## Decision

Separate report layout from inspection collection schema and generate documents from a controlled report DSL/render plan.

## Rationale

Collection and presentation evolve independently.

## Alternatives considered

- solução mais simples, porém com menor garantia arquitetural;
- solução mais complexa/distribuída, postergada até haver necessidade mensurável;
- acoplamento direto a fornecedor, rejeitado quando compromete substituição futura.

## Consequences

Arbitrary tenant HTML/code is prohibited.

## Security implications

A implementação deve preservar isolamento de tenant, menor privilégio, validação explícita e auditabilidade onde aplicável.

## Privacy implications

Qualquer novo dado pessoal, retenção, região ou suboperador exige atualização da documentação de privacidade correspondente.
