# File & Evidence Security

## Upload policy

Cada classe de arquivo deve definir:

- extensões permitidas;
- MIME permitido;
- magic bytes esperado;
- limite de tamanho;
- necessidade de malware scan;
- necessidade de transcodificação;
- retenção;
- metadata permitida.

## Storage keys

Chaves são geradas pelo servidor e não usam filename do usuário como caminho confiável.

Exemplo conceitual:

`org/{orgId}/inspection/{inspectionId}/evidence/{evidenceId}/original`

A presença do `orgId` no caminho não substitui autorização.

## Downloads

Buckets privados. Download por API autenticada ou URL assinada de curta duração após autorização.

## Imagens

Preservar original, criar derivados seguros e remover metadata desnecessária nos derivados.
