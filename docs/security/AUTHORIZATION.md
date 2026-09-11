# Authorization Model

## Princípio

Autorização é determinada por:

```text
identity + membership + organization + capability + resource state
```

## Exemplo

`report.issue` pode exigir:

- usuário autenticado;
- membership ativa na organization do report;
- capability `report.issue`;
- inspection aprovada;
- report ainda não emitido naquela versão;
- eventualmente autenticação forte.

## Browser input

`organization_id`, `role`, `user_id` e `status` enviados pelo browser nunca são suficientes para conceder permissão.

## API tokens futuros

Devem possuir escopos explícitos e estar vinculados a organization, com rotação/revogação/audit.
