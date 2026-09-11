# Evidence Domain

## Tipos previstos

photo, document, signature, audio, video, measurement, location.

MVP: photo, document e assinatura simples quando necessária.

## Invariants

- original preservado;
- storage privado;
- acesso sempre autorizado;
- objeto disponível somente após finalize/validation;
- SHA-256 registrado para evidências que compõem documentos emitidos;
- derivados não substituem original;
- metadata/EXIF segue política explícita.

## Status

pending_upload, quarantined, processing, available, rejected, deleted.
