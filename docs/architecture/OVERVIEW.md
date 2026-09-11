# Architecture Overview

## Estilo

Modular monolith com workers assíncronos.

```text
Admin Web ───────┐
                 ├── HTTPS ── API ── PostgreSQL
Field PWA ───────┘              │
                                ├── Object Storage
                                ├── Job Queue
                                └── Outbox
                                      │
                     ┌────────────────┼───────────────┐
                     ▼                ▼               ▼
                  PDF Worker      Media Worker    Webhook Worker
```

## Razões

- um único modelo transacional é mais simples para o estágio inicial;
- evita complexidade distribuída prematura;
- permite boundaries claras sem custo operacional de microserviços;
- workers isolam cargas pesadas e assíncronas.

## Regra de extração futura

Um módulo só deve virar serviço independente por necessidade mensurável de escala, isolamento operacional, compliance ou ownership de equipe — nunca por estética arquitetural.
