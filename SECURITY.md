# Política de Segurança do Projeto

## Objetivo

O projeto visa controles compatíveis com uma aplicação SaaS B2B que processa documentos, fotografias, endereços e evidências técnicas. A referência de engenharia de segurança adotada é OWASP ASVS Level 2 como baseline interno.

## Áreas críticas

- isolamento cross-tenant;
- autenticação e sessão;
- autorização por recurso;
- uploads;
- storage privado;
- emissão documental;
- integridade de templates e snapshots;
- webhooks;
- billing;
- credenciais privilegiadas;
- dados offline no dispositivo.

## Vulnerabilidades

Vulnerabilidades devem ser tratadas como issues privadas de segurança. Nunca publicar segredos, exploit funcional contra produção ou dados reais em issue pública.

## Segredos

Segredos não pertencem ao Git. Usar secret manager / environment secrets. `.env.example` contém apenas nomes e valores fictícios.

## Service role

Credenciais que ignoram RLS são de alta criticidade. Devem existir somente em componentes server-side explicitamente autorizados.
