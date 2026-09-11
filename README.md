# SaaS Multi-Tenant de Inspeções, Evidências e Documentos Técnicos

> **Status:** Fundação arquitetural v1 — pré-implementação.

Este repositório é destinado ao novo produto SaaS multi-tenant. Ele **não é uma evolução do LVL Pro** e não deve importar o LVL Pro como dependência. O projeto nasce com banco, infraestrutura, repositório e identidade próprios.

O sistema será uma plataforma horizontal para criação de templates de inspeção, execução de vistorias, coleta de evidências, gestão de constatações, revisão, aprovação e emissão versionada de documentos técnicos.

## Ordem obrigatória de leitura

1. `docs/TECHNICAL_SPEC_V1.md`
2. `AGENTS.md`
3. `docs/FOUNDATION_CHECKLIST.md`
4. `docs/architecture/OVERVIEW.md`
5. ADRs relevantes em `docs/adr/`
6. Documentação do módulo a ser alterado

## Princípios centrais

- isolamento multi-tenant em profundidade;
- PostgreSQL + RLS;
- documentos emitidos imutáveis;
- templates publicados imutáveis e versionados;
- PDF é uma representação, não a fonte da verdade;
- domínio independente de React, Supabase, AWS e provedores de billing;
- nenhuma execução arbitrária de código em templates;
- segurança e privacidade desde a fundação;
- modular monolith antes de microserviços;
- decisões arquiteturais relevantes exigem ADR;
- IA implementa dentro dos contratos do projeto, não reinventa a arquitetura silenciosamente.

## Milestones

1. Secure Multi-Tenant Foundation
2. Generic Template Engine
3. Complete Inspection Lifecycle
4. Reproducible Technical Documents
5. Field PWA / Offline Sync
6. Billing & Entitlements
7. Public API & Webhooks
8. Enterprise Capabilities

## Estado atual

Nenhuma feature de negócio deve ser iniciada antes de concluir o checklist da Phase 0.

## Autonomous setup mode

This repository assumes an authorized development agent can configure GitHub, Cloudflare and Supabase. Start with `START_HERE.md`, then `PROMPT_MESTRE_IA.md` and `docs/infra/AUTONOMOUS_BOOTSTRAP.md`. The owner should not be asked to perform routine technical setup.
