# Foundation v1.1 — Autonomous Setup

Changes from v1:

- owner no longer performs routine Phase 0 setup;
- agent receives explicit permission/guardrails for GitHub, Cloudflare and Supabase provisioning;
- new Task 00 autonomous bootstrap;
- Cloudflare Workers selected for new web/API deployments;
- Hono selected as Worker API adapter while domain remains provider-independent;
- Supabase Storage selected as first `StorageProvider` implementation in the São Paulo project;
- Workers Builds/GitHub integration preferred for deployments/previews;
- secrets handling and human-only blockers formalized;
- production resource creation is attempted only within the existing plan, never by silently purchasing an upgrade.
