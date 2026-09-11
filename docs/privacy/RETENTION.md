# Retention Policy v1

Valores definitivos dependem de requisitos contratuais/jurídicos. O produto deve suportar classes de retenção.

## Classes

- contas/memberships;
- inspections drafts;
- approved inspections;
- issued reports;
- evidence;
- audit events;
- application logs;
- billing/fiscal;
- backups.

## Princípios

- não reter “para sempre por garantia”;
- retenção de report/evidence pode ser diferente de logs;
- deleção deve respeitar hold jurídico/contratual quando aplicável;
- backups exigem política própria de expiração;
- emitted report pode exigir preservação/audit em vez de delete físico imediato.

## Implementação

Jobs de retention devem ser idempotentes, auditados e ter dry-run/report antes de destruição em massa.
