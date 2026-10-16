# Direção visual — "Rio Rural"

**Pedido do usuário (16/10/2026):** a estética do mapa deve remeter ao **aspecto rural, não sci-fi**. Referência: [referencia-visual.webp](referencia-visual.webp) — "Passaporte Rural do Rio" (mapa ilustrado dobrável + passaporte com carimbos). Inspiração conceitual (proposta do usuário): "Mapa dos Sabores e Vivências do Rio", título "Rio Rural: sabores, histórias e caminhos", frase de campanha "O Rio tem muitos sabores. Descubra onde eles nascem."

## O que a referência mostra (e o telão deve ecoar)
- Fundo de **papel creme**; mapa **ilustrado**: serras em verde-mata escuro com textura de copa, campos verde-claro/amarelados, **rios e litoral em azul-turquesa** com espuma branca, contorno **tracejado** claro ao redor do estado.
- **Alfinetes em gota** (terracota, ocre, verde, vinho) com ícone no miolo (xícara de café, mel, queijo, flor), rotas tracejadas.
- **Rosa dos ventos**, sol, ilustrações (casas, cafezal, vaca, cachoeira).
- **Título em sans geométrica pesada**, caixa-alta, em 3 cores: "PASSAPORTE" verde-escuro, "RURAL" terracota, "RIO" mostarda; linha de pico de montanha; frase curta ("Natureza · Produção · Cultura · Encontros reais").
- **Carimbos de passaporte**: moldura retangular de borda dupla/tracejada, cada um numa cor (café vinho-vermelho, colheita verde, fazenda ocre, sabores roxo), com ícone, nome e **QR code**; selo levemente rotacionado, textura de tinta.

## O que sai (marcas de sci-fi do projeto-base)
Fundo preto/azul-petróleo; nuvem de pontos com brilho aditivo; pós-processamento de brilho; "mesa holográfica" (anéis e raios); cortina luminosa no contorno do selecionado; cantoneiras de HUD nos painéis; fonte monoespaçada nos números; caixa-alta espaçada tipo telemetria; painel "Azimute / Inclinação / Relevo exagerado"; texto de legenda técnico ("pé tracejado: posição aproximada…").

## Tokens sugeridos (ajustar olhando as capturas; garantir contraste ≥ 4,5:1 do texto sobre o papel)
| Papel | Cor |
|---|---|
| papel (cartões) | `#fbf5e6` · fundo/bordas `#f1e6c8` / `#e4d3a8` |
| tinta | `#3a2a1a` (secundária `#6b5440`) |
| verde-mata (títulos, relevo) | `#1f4d36` · relevo `#2e6b3b` |
| terracota (destaques) | `#b4532a` |
| mostarda | `#d9a21b` |
| campo/pasto | `#b9c872` → `#a7bf5b` · lavoura `#d9bf63` |
| água/mar | interior `#5aa7c2` · raso `#7cc4cf` → fundo `#3d8fa8` · espuma `#ffffff` |
| terra fora do RJ | papel esmaecido `#e9dcbc` (some no fundo) |

As 9 rotas têm cores em `dados-fonte/gera_telao.py` (`ROTA`, campo `cor_luz` = cor para texto/alfinete **sobre fundo**): hoje são claras para fundo escuro — **escurecer** para o papel e conferir o contraste.

## Tipografia
Montserrat (OFL) embutida em `telao/vendor/fonts/` (offline; CSP já permite `'self'`): 800 para título/números grandes (caixa-alta no título), 600 para rótulos, 500 para texto. Sem monoespaçada.

## Componentes
- **Cartões:** papel `#fbf5e6` (~95%), borda 2 px marrom/verde, raio ~.6 rem, sombra quente suave, títulos de seção em terracota. Sem cantoneiras.
- **Alfinetes (alvos):** gota com contorno branco e ícone da rota no miolo, 34–46 px em 1080p, sombra no chão, ponta na coordenada. Estados: normal, aceso (item/rota selecionada) e esmaecido.
- **Ladrilhos/etiquetas de município:** pílulas/cartões de papel; números em Montserrat 800.
- **Relevo:** superfície sólida sombreada (luz de noroeste), cores do cobertura.json; mar raso→fundo; contorno tracejado do estado; limites municipais finos e discretos.
- **Ficha = página de passaporte:** carimbo na cor da rota (ícone + nome da rota) ao lado do QR; dados em lista limpa; selos Wi‑Fi/agendar/pet como etiquetas.
- **Bússola:** rosa dos ventos simples (botão "voltar ao norte" continua).
- **Brilhos permitidos:** nenhum aditivo; destaque por saturação, contorno e sombra.

## Restrições (não regredir)
Offline (CSP `'self'`, sem CDN); legibilidade a 3–4 m (ficha ≥ 20 px, QR ≥ 200 px em 1080p); tudo clicável; `__telao.projetar/ficha/abrir` e `__telaoDepuracao` usados pelas provas; `?q=` e `?ocio=`; regra de que ponto "só município" nunca é desenhado.

## Aceitação
1. `node verificar.mjs` verde (atualizar seletores das provas se o DOM mudar, sem afrouxar nada).
2. Provas novas: luminância média da captura 1080p alta (fundo claro); contraste dos textos/cores de rota sobre o papel ≥ 4,5:1; nenhuma cor de fundo escura de HUD.
3. Capturas 1080p/4K (estado, município, ficha) aprovadas pelo usuário ao lado da referência.
