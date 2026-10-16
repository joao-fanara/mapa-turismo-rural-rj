# STEPS — fases e estado (16/10/2026)

| Fase | Estado |
|---|---|
| F1 Extração dos 12 guias (PDF → dados) | **concluída** — 630 atrativos, auditados |
| F2 Localização (QR → Google Maps, endereço, município) | **concluída** — 418 exatos · 51 aproximados · 161 só município; bugs de coordenada corrigidos com testes |
| F3 Telão 3D funcional offline (fork do "Mapa de CT&I em 3D") | **concluída** — clique em tudo, ficha com QR, passeio, TV/4K, servidor PowerShell |
| **F4 Identidade visual rural** | **v1 implementada (16/10/2026) — aguarda aprovação do usuário lado a lado com a referência.** Papel creme, relevo sólido pintado, alfinetes com ícone, ficha-passaporte com carimbo, Montserrat; 8 provas objetivas (claridade, cores, fonte, contraste) |
| F5 Qualidade/CI | gate local pronto (`node verificar.mjs`); workflow GitHub Actions criado, **ainda não executado** |
| F6 Publicação online | pendente |

## F4 — pedido do usuário: "a estética deve remeter ao aspecto rural e não sci-fi" (referência `docs/referencia-visual.webp`; "não precisa ser exatamente igual, mas parecida é excelente")

Briefing em [docs/direcao-visual.md](docs/direcao-visual.md).

**Feito na v1:** (1) tokens, papel, Montserrat embutida e cartões de papel em `estilo.css`; telemetria escondida · (2) 9 ícones SVG rurais, uma fonte única (`SIMBOLO` em `cena.js`) para legenda, ladrilhos, carimbo e alfinetes · (3) alfinetes em gota com ícone (atlas em canvas + `THREE.Points`, `alphaToCoverage`) · (4) relevo sólido: malha de ~1 milhão de triângulos + shader que pinta pela cobertura do solo (mistura entre células com borda entortada por ruído, copas de mata, lavoura em faixas, mar raso→fundo com espuma, esmaece no papel), limites municipais em fio claro, contorno do estado tracejado; sem nuvem de pontos, sem brilho aditivo, sem pós-processamento, sem "mesa holográfica" · (5) ficha como página de passaporte: carimbo da rota (borda dupla, inclinado) + QR sem rolar · (6) provas: seção `visual` (claridade média ≥170, ≤5% de pixels escuros, verde ≥3%, turquesa ≥2%, fundos claros, sem monoespaçada) e contraste sobre o papel · (7) documentos.

**Ideias para a v2 (não feitas; só com aprovação):** ilustrações pontuais (casas de fazenda, cafezal, vaca) e rosa dos ventos desenhada; textura de papel e vinheta; controles fora da área do mapa; alfinetes agrupados em zoom longe; ajustar as cores depois de ver na TV real.

**Critério de conclusão da F4:** o usuário aprovar as capturas 1080p/4K (estado, município, ficha) ao lado da referência.

## Como rodar
`node verificar.mjs` (completo, ~3 min, precisa de Chrome/Chromium; em Linux usa SwiftShader — pode ser mais lento) · `node verificar.mjs rapido` (sintaxe + dados). Pré-requisitos: Node 22+, Python 3.10+ com `openpyxl` e `opencv-python-headless`.
Servir o telão: `python -m http.server 8797 --directory telao`.
Regerar dados: `python dados-fonte/merge.py && python dados-fonte/gera_telao.py` (usa o cache de geocodificação; sem rede).

## Riscos
- `cena.js` é monolítico (~1,7 mil linhas, uma função com closures); a troca do relevo mexe no coração dele. Fazer incrementalmente e rodar o gate a cada passo.
- Em máquina sem GPU a malha densa pode pesar: manter `?q=media|baixa`.
