# Mapa do Turismo Rural RJ — "Rio Rural"

Mapa 3D offline com os 630 atrativos dos 12 guias Turismo Rural RJ (TurisRio/Setur-RJ), para TV grande e notebook, com ficha e QR por atrativo.

- `telao/` — o app (abra com `telao/abrir-telao.bat` ou `python -m http.server 8797 --directory telao`). Instruções: [telao/COMO-USAR.md](telao/COMO-USAR.md)
- `turismo_rural_rj.xlsx` — todos os atrativos em planilha
- `dados-fonte/` — pipeline de dados e testes · `docs/` — direção visual e referência
- [REQUIREMENTS.md](REQUIREMENTS.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [STEPS.md](STEPS.md) (**próxima fase: identidade visual rural**)

Qualidade: `node verificar.mjs` (completo) ou `node verificar.mjs rapido`. Todo código novo vem com teste; bug novo vira teste de regressão; nada de credencial no repositório.
