# Organizations Domain

## Invariants

- Organization é o tenant.
- User pode pertencer a várias Organizations.
- Membership é a relação autorizadora.
- Customer não é Organization.
- Organization suspensa não deve continuar criando novas operações de negócio, mas dados não são apagados automaticamente.

## Entidades

### Organization
`id`, `slug`, `legal_name`, `display_name`, `status`, `settings`, timestamps.

### Membership
`id`, `organization_id`, `user_id`, `role`, `status`, `invited_by`, timestamps.

## Roles iniciais
owner, admin, template_manager, coordinator, inspector, reviewer, technical_responsible, billing_admin, viewer.

## Regra de autorização

Nenhuma operação deve aceitar `organization_id` do cliente como única prova de escopo. O tenant efetivo deve ser validado pela membership autenticada.
