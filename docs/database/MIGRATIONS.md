# Migration Policy

## Regras

- migration criada via fluxo versionado;
- migration mergeada/aplicada é imutável;
- staging executa migrations antes de produção;
- toda migration deve funcionar em banco vazio;
- upgrade a partir do schema anterior deve ser testado;
- alteração destrutiva usa expand → migrate → contract;
- backfills grandes devem ser jobs/migrations operacionais controlados;
- rollback físico não é obrigatório para todo caso, mas forward-fix precisa ser conhecido.

## Exemplo expand/migrate/contract

1. adicionar nova coluna nullable;
2. deploy que escreve nas duas estruturas;
3. backfill;
4. validar integridade;
5. trocar leitura;
6. tornar constraints mais fortes;
7. remover estrutura antiga em release posterior.
