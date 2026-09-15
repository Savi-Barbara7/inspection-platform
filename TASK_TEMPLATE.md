# Task Specification Template

## TASK

Nome curto da tarefa.

## CONTEXT

Links/arquivos relevantes.

## GOAL

Resultado objetivo esperado.

## OUT OF SCOPE

O que explicitamente não será feito.

## INVARIANTS

- tenant isolation;
- versioning;
- security/privacy;
- compatibility;
- demais invariantes específicos.

## AUTHORIZATION

Quem pode executar e em qual estado do recurso.

## DATA / MIGRATIONS

Mudanças necessárias e estratégia.

## API CONTRACT

Endpoints/commands/events afetados.

## ACCEPTANCE CRITERIA

- [ ] ...

## TESTS REQUIRED

- [ ] unit
- [ ] integration
- [ ] RLS/cross-tenant
- [ ] E2E
- [ ] migration
- [ ] security negative cases

## DOCUMENTATION TO UPDATE

- [ ] ADR
- [ ] domain docs
- [ ] OpenAPI
- [ ] runbook
- [ ] privacy/security docs

## FILES / MODULES ALLOWED TO CHANGE

Liste quando a tarefa precisar de contenção forte.

## CURRENT STATE

O que já existe hoje no código/schema real (não a documentação) relevante para esta task — inspecionado antes de codar, não assumido a partir de docs antigos.

## DOMAIN DECISIONS

Decisões de modelagem tomadas nesta task e por quê (o "porquê" que uma revisão futura vai precisar para não reabrir a discussão à toa).

## CONCURRENCY / IDEMPOTENCY

Como uma escrita concorrente/duplicada/repetida (retry, duplo clique, requisição repetida) é tratada. Se não for tratada, declarar isso explicitamente como risco aceito, não deixar implícito.

## FAILURE MODES

Estados de falha esperados e como cada um se manifesta (código HTTP, código de erro Postgres, mensagem) — nunca um 500 genérico para um caso prevísivel.

## OBSERVABILITY

O que fica logável/auditável desta mudança (nunca dado sensível/valor real capturado) e o que ainda não tem cobertura de observability (aceito explicitamente, não esquecido).

## ROLLBACK / RECOVERY

Como reverter esta mudança com segurança se algo der errado em staging/produção (nova migration, não editar a aplicada; como recuperar dado se uma escrita saiu errada).

## PERFORMANCE ENVELOPE

Comportamento esperado em escala (documento grande, muitos itens de RepeatableGroup, muitas fotos) — mesmo quando a task não otimiza para isso ainda, declarar o que é conhecido e o que não foi testado.

## DEBT CREATED

Todo atalho/limitação aceito nesta task, com motivo e (quando souber) em qual task futura isso deveria ser fechado. Nenhuma dívida deve ficar apenas implícita no código ou só mencionada em chat.

## VERIFICATION EVIDENCE

Como esta task foi verificada de fato: comandos rodados (lint/typecheck/test/build/pgTAP), resultado, e evidência de teste ponta a ponta real (`wrangler dev` + Supabase local, nunca só mocks) antes de declarar a task concluída.
