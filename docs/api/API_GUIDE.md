# API Guide v1

## Base

`/api/v1`

## Padrões

- JSON UTF-8;
- Zod no boundary;
- OpenAPI 3.1;
- UUIDs;
- timestamps ISO-8601 UTC;
- errors consistentes;
- paginação cursor-based quando coleções crescerem;
- filtros allowlisted.

## Erro

```json
{
  "type": "validation_error",
  "title": "Invalid request",
  "status": 422,
  "requestId": "...",
  "errors": []
}
```

## Idempotência

Usar `Idempotency-Key` em comandos sensíveis a retry.

## Não expor

- stack trace;
- SQL error;
- nomes internos de bucket;
- secrets;
- service credentials;
- informações de outro tenant em mensagens de erro.

## Operações privilegiadas

Publish template, submit/approve inspection, issue report, role changes, billing webhook, API credential management e privacy export passam pelo backend.
