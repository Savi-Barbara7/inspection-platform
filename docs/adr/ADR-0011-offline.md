# ADR-0011 — Offline strategy

**Status:** Accepted for v1  
**Date:** 2026-09-11

## Context

O projeto precisa de uma decisão explícita e estável para offline strategy.

## Decision

Use PWA + IndexedDB/Dexie, operation outbox, idempotency and optimistic revisions.

## Rationale

Field work may happen without reliable connectivity.

## Alternatives considered

- solução mais simples, porém com menor garantia arquitetural;
- solução mais complexa/distribuída, postergada até haver necessidade mensurável;
- acoplamento direto a fornecedor, rejeitado quando compromete substituição futura.

## Consequences

Critical commands remain server-authoritative; no CRDT in MVP.

## Security implications

A implementação deve preservar isolamento de tenant, menor privilégio, validação explícita e auditabilidade onde aplicável.

## Privacy implications

Qualquer novo dado pessoal, retenção, região ou suboperador exige atualização da documentação de privacidade correspondente.
