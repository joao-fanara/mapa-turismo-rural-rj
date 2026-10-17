# Registro de bugs

Cada entrada: sintoma, como reproduzir, causa, correção, prova que impede a volta. Mais recente primeiro.

## B6 — Dica "Toque num município…" ficava grande sobre a animação o tempo todo (17/10/2026)

- **Sintoma (relatado pelo usuário, com captura):** a faixa com a dica de uso, grande, ficava sobre o mapa durante todo o passeio automático.
- **Correção:** dica menor, que aparece 6 s quando o passeio começa e some sozinha (com esmaecimento).
- **Também corrigido (harness):** o idioma escolhido numa seção das provas ficava salvo no perfil do Chrome e fazia as seções seguintes abrirem em outro idioma (a prova `links` falhava só na execução completa). Toda aba de prova agora começa em português (`?lang=pt`).

## B5 — Barra de rolagem da lista "o que tem aqui" não funcionava (16/10/2026)

- **Sintoma (relatado pelo usuário, com captura):** num notebook de tela baixa (1920×869), ao tocar um produto na legenda, o painel da esquerda mostrava só uma linha da lista ("Café Monthal") e a barra de rolagem não respondia.
- **Causa:** a rolagem estava na lista interna (`#i-lista`, `flex: 0 1 auto; min-height: 0`) dentro de um painel de altura limitada; com os textos de cima ocupando o painel, a lista encolhia para uma linha e a barra ficava minúscula, difícil de pegar.
- **Correção:** o painel inteiro rola (uma barra só, grossa, na borda do painel); a lista deixou de ter rolagem própria; ao abrir, a rolagem do painel volta ao topo.
- **Prova:** seção `rolagem` (1920×869: painel mostra várias linhas, roda do mouse rola, **arrastar a barra com o mouse rola**, o painel não fecha). Conferido que falha na versão anterior.

## B4 — Trocar de idioma e voltar deixava textos presos no idioma anterior (16/10/2026)

- **Sintoma (relatado pelo usuário, com captura):** depois de escolher alemão e voltar ao português, as abas (Routen / Ich möchte… / Produkte), os botões (Rundgang anhalten / Als Liste ansehen / Ganzen Bundesstaat ansehen), o lema e o rodapé continuavam em alemão; os ladrilhos do mapa podiam ficar no idioma escolhido antes (ex.: "Guided visit" em português).
- **Reproduzir:** abrir o site, tocar DE, depois PT (ou EN → FR → PT).
- **Causa:** em `telao/i18n.js`, o motor guarda o texto original (português) de cada nó para poder voltar. Ao traduzir, ele próprio altera o nó; o `MutationObserver` recebe essa alteração depois (de forma assíncrona, quando a trava `ocupado` já tinha sido liberada) e a registrava como se fosse um texto novo da página — o "original" passava a ser a tradução. Na volta ao português, o motor restaurava esse falso original.
- **Correção:** o motor guarda o último texto que ele mesmo escreveu em cada nó (`escritos`) e ignora as mutações causadas por ele; a restauração só escreve quando o texto difere do original.
- **Prova:** seção `idiomas` de `telao/_provas/provas.mjs` — "abas, botões, lema e rodapé voltam todos ao português" (EN→FR→PT, FR→EN→PT, DE→EN→PT). Conferido que a prova **falha** com o motor antigo e passa com o novo.
- **Publicado:** commit f3f7da0, produção conferida com `TELAO_URL=https://turismo.fanara.com.br/`.

## B3 — De longe, tocar num município não aproximava nem mostrava o nome (16/10/2026)

- **Sintoma:** na vista do estado, tocar num município sem etiqueta abria uma ficha ou a lista de alfinetes próximos, porque de longe os alfinetes cobrem quase todo o mapa. Não havia como chegar a Miguel Pereira, por exemplo.
- **Correção:** de longe (estado ou região), o toque seleciona o município sob o dedo (aproxima e mostra o nome); só um toque em cima de um alfinete isolado abre a ficha direto. Nova **busca** de município ou lugar no cartão.
- **Prova:** seções `juntos` (de longe aproxima; de perto abre a lista) e `busca` ("miguel pereira" sem acento aproxima e mostra o nome; nome de lugar abre a ficha).

## B2 — Cartão cortado no celular real (16/10/2026)

- **Sintoma:** em aparelho real o cartão era cortado embaixo e o "↑ ver a região" saía da tela; rótulos de município saíam pela esquerda.
- **Causa:** cartão alto demais para a folha, unidade `vh` (não desconta as barras do navegador) e zona dos rótulos calculada como se o cartão estivesse à direita.
- **Correção:** cartão compacto no celular, `dvh`, zona dos rótulos entre o título e a folha.
- **Prova:** seção `celular` (5 tamanhos, inclusive deitado).

## B1 — Cartão cortado em notebook de tela baixa (16/10/2026)

- **Sintoma:** em 1366×768 e 1920×869 o fim do cartão sumia.
- **Correção:** cobertura do solo saiu do cartão (foi para "Sobre o mapa").
- **Prova:** seção `notebook` (cartão cabe inteiro de 1280×720 a 1920×1080).
