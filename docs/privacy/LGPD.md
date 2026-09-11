# LGPD — Engineering Notes

Este documento é técnico e não substitui aconselhamento jurídico.

## Papéis

Em muitos fluxos de inspeção, a empresa cliente decide finalidade e meios essenciais e tende a atuar como controladora, enquanto a plataforma processa em nome dela. Para conta SaaS, billing e segurança própria, a plataforma pode atuar como controladora.

## Produto deve suportar

- inventário/data map;
- minimização;
- acesso e correção quando aplicável;
- export/localização de dados;
- retenção e descarte;
- registro de incidentes;
- lista de suboperadores;
- regiões/transferências;
- trilha de auditoria.

## Não fazer

- coletar GPS por padrão;
- manter EXIF indiscriminadamente;
- mandar conteúdo de laudos a analytics;
- assumir que checkbox de termos é base legal para tudo;
- usar produção em ambientes de teste.
