# ADR-0017 — Technical Model domain realignment

**Status:** Accepted for v1
**Date:** 2026-09-14
**Supersedes:** ADR-0006 (template architecture), ADR-0007 (report architecture)

## Context

ADR-0006 and ADR-0007 modeled a generic `InspectionTemplate` (collection schema) separate from a `ReportTemplate` (presentation). That shape was written before any real research into the documents this platform actually needs to produce — laudos, vistorias and inspections that in practice follow known professional structures (NR-13, PGR, AET, inspeção predial, vistoria cautelar, and others), often anchored in specific legislation or technical standards.

Research into ~20 of these document types (see `docs/product/technical-models/CATALOG_V1.md`) showed that real technical models do not cleanly separate "what to collect" from "how to present it": a section like *Registro Fotográfico* or *Constatações* is simultaneously the data and its presentation. A blank, general-purpose Template Builder also does not match how professionals actually start a job — they start from a known document type (an NR-13 boiler inspection, a neighborhood cautelar survey), not from an empty schema.

## Decision

Replace the two-entity model (`InspectionTemplate` / `ReportTemplate`) with a three-tier hierarchy:

```text
TechnicalModel (platform-maintained, backed by research/provenance)
  -> TechnicalModelVersion (published, immutable)
    -> OrganizationModel (the tenant's customization of a TechnicalModel)
      -> OrganizationModelVersion (published, immutable)
        -> TechnicalJob (a concrete execution)
          -> Report -> ReportVersion (issued, immutable, hashed)
```

A model version is a single ordered tree of **sections**, each containing one or more **controlled blocks** (`Cover`, `TableOfContents`, `Text`, `TechnicalInformation`, `Table`, `ImportedTable`, `PhotoSection`, `DocumentAttachment`, `Findings`, `SignatureSection`, `Header`, `Footer`, `PageBreak`). A block carries both the data contract and its presentation — there is no separate report-layout schema to keep in sync.

An organization never edits the platform's `TechnicalModel` directly. It derives an `OrganizationModel`, which may: override text/titles, apply branding, hide/add/reorder sections and blocks (drag-and-drop), add free blocks, import tables, and configure layout. The originating `TechnicalModelVersion` is always retained (provenance), so we always know which platform model and version an `OrganizationModel` was derived from.

Every requirement inside a `TechnicalModelVersion` carries a level — `required`, `recommended` or `optional` — plus a `source_reference`. An organization may override a requirement, but removing a `required` one must be recorded with a reason and can revoke the model's "compatible with base" status. No requirement is presented as normatively compliant (e.g. "conforme a NBR X") without a verified, legitimately-sourced reference — see `docs/product/technical-models/RESEARCH_PROTOCOL.md`.

Evidence organization (ordering, folder import, batch operations on photos) stays entirely human-driven and deterministic in the core: no AI may move, delete, rename or auto-classify evidence. A future assistive feature may only *suggest*, gated behind explicit human confirmation, and is out of scope for the core through Task 32.

The full revised task sequence (Task 03.5 through Task 37) implementing this lives in `docs/product/ROADMAP_TASKS_V2.md`.

## Rationale

- Matches how professionals actually work: pick a known document type, then adapt it — not assemble one from a blank canvas.
- Removes duplicate schema maintenance between "what's collected" and "how it's shown."
- Provenance (which `TechnicalModelVersion` an `OrganizationModel` derives from, and which version a `TechnicalJob` used) is required for defensible, reproducible technical documents — the entire point of ADR-0009's immutability guarantee.
- Keeping evidence organization human-only and auditable protects the platform's core promise: the evidence behind a technical report must never be silently altered.

## Alternatives considered

- Keep the generic two-entity model and add verticals as configuration on top — rejected: research showed the split itself doesn't match real documents, not just their field lists.
- Let AI auto-organize/auto-classify evidence from the start — rejected: unacceptable risk of silently altering or losing evidence that may carry legal/professional weight; revisit only as an opt-in, human-confirmed suggestion after the deterministic core (Task 18) ships.
- Treat each researched document type (NR-13, PGR, cautelar, ...) as its own core table/vertical — rejected per AGENTS.md: verticals must be expressible as data (models/schemas) on the shared engine, never as core code branches.

## Consequences

- `docs/domain/TEMPLATES.md`, `docs/domain/REPORTS.md` and `docs/domain/EVIDENCE.md` are rewritten around this model.
- `docs/TECHNICAL_SPEC_V1.md` §5, §8, §9 and §13–14 and `docs/product/GLOSSARY.md` are updated; `docs/product/ROADMAP.md` points to `ROADMAP_TASKS_V2.md`.
- `packages/domain/src/templates` and `packages/domain/src/reports` will implement `TechnicalModel`/`OrganizationModel`/`TechnicalJob` types starting at Task 08 — no code changes in this task (Task 03.5 is documentation/architecture only).
- Tasks 00–04 already executed are unaffected: the revised Task 04 (Organizations & Memberships) asked for exactly what was already built.
- Any technical model claiming normative compliance (ABNT/NBR, or similar paid/copyrighted standards) must reach `VERIFIED_REFERENCE_MODEL` status per the research protocol before being marketed as compliant; public-source drafts stay labeled `DRAFT` until reviewed by a licensed professional with legitimate access to the standard.

## Security implications

A implementação deve preservar isolamento de tenant, menor privilégio, validação explícita e auditabilidade onde aplicável. Controlled blocks continue to forbid arbitrary tenant JavaScript/SQL/HTML, per AGENTS.md.

## Privacy implications

Qualquer novo dado pessoal, retenção, região ou suboperador exige atualização da documentação de privacidade correspondente. Evidence metadata expansion (relative_path, capture_time, folder/environment) is operational/technical metadata, not new categories of personal data, but should be reviewed against `docs/privacy/DATA_MAP.md` when Task 15/16 implement it.
