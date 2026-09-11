# Row Level Security Strategy

## Objetivo

RLS é uma segunda linha de defesa contra vazamento cross-tenant, não substituto da autorização de aplicação.

## Regra

Toda tabela tenant-owned contém `organization_id` e policy baseada na membership autenticada.

## Helpers sugeridos

Funções SQL podem expor conceitos como:

- `auth_user_id()`
- `is_org_member(org_id)`
- `has_org_capability(org_id, capability)` — somente se a modelagem for segura e performática

Evitar helpers que dependam de dados manipuláveis pelo cliente.

## Service role

Roles que bypassam RLS são privilegiadas. Seu uso deve ser restrito a rotas/workers explicitamente documentados.

## Test matrix obrigatória

Para cada tabela tenant-owned com mutações:

| Caso | Esperado |
|---|---|
| User A SELECT row A | allow |
| User A SELECT row B | deny/no row |
| User A INSERT org A com permission | allow |
| User A INSERT org B | deny |
| User A UPDATE row B | deny |
| User A DELETE row B | deny |

## Política de desenvolvimento

Nunca “corrigir” RLS tornando policy permissiva. Investigar membership, claims, policy, query e índices.
