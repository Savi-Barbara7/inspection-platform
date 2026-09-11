# Contribuindo

## Fluxo

1. Abra uma issue/tarefa com escopo e critérios de aceite.
2. Crie branch curta: `feat/*`, `fix/*`, `refactor/*`, `security/*`, `docs/*`.
3. Faça mudanças pequenas e revisáveis.
4. Atualize documentação no mesmo PR.
5. Execute lint, typecheck e testes localmente.
6. Abra PR usando o template do repositório.
7. Não faça merge com CI vermelho.

## Commits

Usar Conventional Commits:

- `feat:`
- `fix:`
- `refactor:`
- `docs:`
- `test:`
- `security:`
- `chore:`

Exemplo: `feat(templates): add immutable template versions`.

## Banco

- toda mudança de schema exige migration;
- migrations mergeadas são imutáveis;
- não usar dashboard de produção como fonte primária de mudanças;
- migrations devem funcionar em banco vazio e em upgrade;
- mudanças incompatíveis devem usar expand → migrate → contract.

## Segurança

Qualquer mudança relacionada a auth, RLS, roles, upload, tokens, assinatura, billing, storage ou emissão exige revisão específica de segurança.
