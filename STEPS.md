# STEPS — fases e estado (16/10/2026)

| Fase | Estado |
|---|---|
| F1 Extração dos 12 guias (PDF → dados) | **concluída** — 630 atrativos, auditados |
| F2 Localização (QR → Google Maps, endereço, município) | **concluída** — 418 exatos · 51 aproximados · 161 só município; bugs de coordenada corrigidos com testes |
| F3 Telão 3D funcional offline (fork do "Mapa de CT&I em 3D") | **concluída** — clique em tudo, ficha com QR, passeio, TV/4K, servidor PowerShell |
| **F4 Identidade visual rural** | **PRÓXIMA — não iniciada** (o visual atual ainda é o de painel futurista herdado: nuvem de pontos com brilho, fundo preto, HUD) |
| F5 Qualidade/CI | gate local pronto (`node verificar.mjs`); workflow GitHub Actions criado, **ainda não executado** |
| F6 Publicação online | pendente |

## F4 — o que fazer (pedido explícito do usuário: "a estética deve remeter ao aspecto rural e não sci-fi", com a referência `docs/referencia-visual.webp`)

Briefing completo em [docs/direcao-visual.md](docs/direcao-visual.md). Ordem sugerida, cada passo verificável por captura de tela + `node verificar.mjs`:

1. Tokens de cor, papel creme, fonte Montserrat embutida (OFL, offline) e cartões "de papel" no `estilo.css`; remover cantoneiras, monoespaçada, telemetria (azimute/inclinação/exagero).
2. Ícones SVG por rota (café, queijo, garrafa/pote, flor/cesta, peixe/onda, folha, garfo/casa, artesanato, chapéu/campo) — fonte única usada na legenda, ladrilhos, alfinetes e ficha.
3. Alfinetes em gota com ícone no lugar do "alvo" do shader (atlas em canvas + `THREE.Points`; ponta ancorada no ponto).
4. Relevo sólido pintado no lugar da nuvem de pontos: malha a partir de `dados/altura.bin` + cobertura (`cobertura.png`), sombreamento de relevo, mar turquesa raso→fundo, fundo creme; remover mesa holográfica, cortina de brilho (virar contorno tracejado), pós-processamento de brilho. Manter `chaoY`/raycast/`projetar`.
5. Ficha como página de passaporte: carimbo na cor da rota (borda tracejada/dupla, ícone, nome) + QR.
6. Ajustar `_provas/provas.mjs` (nomes de classe/DOM podem mudar; **não enfraquecer** as provas) e acrescentar provas visuais (luminância média da captura alta, contraste sobre o papel, 1080p e 4K).
7. Atualizar estes documentos.

**Critério de conclusão da F4:** `node verificar.mjs` verde + capturas 1080p/4K do estado, de um município e de uma ficha, para o usuário aprovar lado a lado com a referência.

## Como rodar
`node verificar.mjs` (completo, ~3 min, precisa de Chrome/Chromium; em Linux usa SwiftShader — pode ser mais lento) · `node verificar.mjs rapido` (sintaxe + dados). Pré-requisitos: Node 22+, Python 3.10+ com `openpyxl` e `opencv-python-headless`.
Servir o telão: `python -m http.server 8797 --directory telao`.
Regerar dados: `python dados-fonte/merge.py && python dados-fonte/gera_telao.py` (usa o cache de geocodificação; sem rede).

## Riscos
- `cena.js` é monolítico (~1,7 mil linhas, uma função com closures); a troca do relevo mexe no coração dele. Fazer incrementalmente e rodar o gate a cada passo.
- Em máquina sem GPU a malha densa pode pesar: manter `?q=media|baixa`.
