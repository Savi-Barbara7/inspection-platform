# Threat Model v1

## Ativos principais

- contas e sessões;
- dados de tenants;
- fotografias/evidências;
- templates;
- relatórios emitidos;
- assinaturas;
- billing/subscriptions;
- secrets;
- dados offline em dispositivos.

## Ameaças prioritárias

### T1 — Cross-tenant leakage
Atacante autenticado tenta acessar recurso de outra organização por UUID, filtros, export, storage ou sync.

**Controles:** app authorization + RLS + storage authorization + cross-tenant CI tests.

### T2 — BOLA/IDOR
Alteração de identificador permite ler/editar objeto alheio.

**Controles:** resource authorization server-side; não confiar em obscuridade de UUID.

### T3 — Privilege escalation
Inspector tenta executar ação de owner/reviewer.

**Controles:** capabilities; backend privileged commands; audit.

### T4 — Account takeover
Credential stuffing, sessão roubada ou reset inseguro.

**Controles:** provider auth, MFA, rate limits, secure session handling.

### T5 — Malicious upload
Arquivo disfarçado, polyglot, malware ou payload que explora parser.

**Controles:** size/type/magic bytes, quarantine, scanning, image/document processing isolado.

### T6 — Signed URL leakage
URL temporária é compartilhada/logada.

**Controles:** validade curta, objeto específico, HTTPS, não logar URL completa quando sensível.

### T7 — XSS/rich text/template injection
Conteúdo salvo executa código em admin/PWA/PDF renderer.

**Controles:** sanitizer, CSP, DSL controlada, sem tenant HTML arbitrário.

### T8 — SSRF
Renderer ou integração busca URL controlada pelo usuário.

**Controles:** egress allowlist, não buscar assets arbitrários durante render, resolver storage internamente.

### T9 — Webhook forgery/replay
Evento externo falso altera billing ou assinatura.

**Controles:** assinatura, timestamp, idempotency/event id, raw-body verification.

### T10 — Service role exposure
Segredo privilegiado chega ao frontend/log.

**Controles:** separação de build, secret scanning, adapter server-only, review.

### T11 — Report tampering
Documento emitido é alterado/regerado com dados atuais.

**Controles:** snapshots, hash, versioning, immutable storage semantics, audit.

### T12 — Offline device loss
Dispositivo perdido contém inspeções/fotos.

**Controles:** minimizar dados locais, session expiration, logout wipe, device policy futura, não sincronizar organização inteira.

## Revisão

Atualizar este threat model ao adicionar: SSO, public links, e-signature, AI, native apps, complex exports ou novas integrações.
