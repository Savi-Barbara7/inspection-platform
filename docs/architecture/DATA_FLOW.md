# Data Flows

## Criar e executar inspeção

```text
TemplateVersion(published)
  ↓
Inspection(created, revision=1)
  ↓
Assignment
  ↓
Responses/autosave
  ↓
Evidence uploads
  ↓
Findings
  ↓
Submit
  ↓
Review
  ↓
Approve
```

## Emitir relatório

```text
Approved Inspection
  ↓
Authorization + validation
  ↓
Snapshot
  ↓
RenderPlan
  ↓
Outbox/Job
  ↓
PDF worker
  ↓
PDF + SHA-256 + Manifest
  ↓
ReportVersion(issued)
  ↓
AuditEvent
```

## Upload

```text
Client → prepare upload → signed URL → object storage
       → finalize → quarantine/validation → process → available
```

## Offline

```text
Server → assigned inspection package → IndexedDB
Local edits → outbox → reconnect → Sync API
          → revision check → apply/reject conflict → ack
```
