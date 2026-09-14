# Authorization Model

> Implementação (Task 05): `packages/domain/src/authorization` (registry +
> `authorize()`, sem I/O) e `apps/api/src/middleware/authorization.ts`
> (`requireCapability`, adapter Supabase via `apps/api/src/authorization/`).

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

## Matriz role → capability (v1)

Fonte da verdade: `ROLE_CAPABILITIES` em `packages/domain/src/authorization/index.ts`
(testado exaustivamente em `packages/domain/test/authorization.test.ts`).
Nunca decidir autorização por nome de role fora desse registro.

| Capability | owner | admin | template_manager | coordinator | inspector | reviewer | technical_responsible | billing_admin | viewer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| organization.members.manage | ✓ | ✓ | | | | | | | |
| technical_model.read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ |
| organization_model.create | ✓ | ✓ | ✓ | | | | | | |
| organization_model.customize | ✓ | ✓ | ✓ | | | | | | |
| organization_model.publish | ✓ | ✓ | ✓ | | | | | | |
| job.create | ✓ | ✓ | | ✓ | | | | | |
| job.assign | ✓ | ✓ | | ✓ | | | | | |
| job.edit | ✓ | ✓ | | ✓ | ✓ | | | | |
| job.review | ✓ | ✓ | | ✓ | | ✓ | | | |
| job.approve | ✓ | ✓ | | | | | ✓ | | |
| evidence.upload | ✓ | ✓ | | ✓ | ✓ | | | | |
| evidence.organize | ✓ | ✓ | | ✓ | ✓ | | | | |
| evidence.delete | ✓ | ✓ | | | | | | | |
| report.render | ✓ | ✓ | | ✓ | | ✓ | ✓ | | |
| report.issue | ✓ | ✓ | | | | | ✓ | | |
| report.supersede | ✓ | ✓ | | | | | ✓ | | |
| signature.request | ✓ | ✓ | | | | | ✓ | | |
| billing.manage | ✓ | | | | | | | ✓ | |

Racional: `owner`/`admin` cobrem operação completa (billing fica só com
`owner` + `billing_admin`, nunca `admin`, para separar "roda a operação" de
"mexe em pagamento"). `template_manager` é dono do ciclo de vida do
Organization Model. `coordinator` distribui e revisa trabalho; `inspector`
executa e coleta evidência do seu próprio job; `reviewer` só revisa;
`technical_responsible` é quem assina e emite/supersede — a pessoa
legalmente responsável pelo documento. `viewer` é somente leitura. Esta
matriz é o ponto de partida (Task 05) e pode ser refinada quando tarefas
futuras (07+) exigirem granularidade maior — sempre via este registro, nunca
via checagem de role solta em rota ou UI.
