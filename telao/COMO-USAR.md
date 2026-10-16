# Rio Rural — telão 3D do Turismo Rural RJ (protótipo)

Mapa 3D do Estado do Rio de Janeiro com os **630 atrativos** dos 12 guias "Turismo Rural RJ" (TurisRio/Setur-RJ), em 9 rotas temáticas. Funciona **offline**: nada é buscado na internet.

## Na TV (ou no notebook)

1. Copie esta pasta inteira para o computador ligado à TV.
2. Dê dois cliques em **`abrir-telao.bat`**.
   Ele sobe um servidor local (só neste computador, sem administrador) e abre o Edge em tela cheia (modo quiosque). Sem o Edge, tenta o Chrome; sem os dois, abre o navegador padrão.
3. Para sair do quiosque: `Alt + F4`. Para encerrar o servidor: feche a janela minimizada "Servidor do telao".

Porta ocupada? `abrir-telao.bat 9000`.

> Por que não abrir o `index.html` direto? Os navegadores bloqueiam módulos e arquivos de dados em `file://`. O servidor local resolve isso.

Precisa de um navegador com WebGL e de uma placa de vídeo razoável (a cena desenha ~250 mil pontos). Em máquinas fracas, abra com `?q=media` ou `?q=baixa` no endereço.

## Como usar

- **Tocar/clicar**: etiqueta de município → município; alvo colorido no chão → ficha do atrativo (vários colados abrem uma lista curta); ladrilho → lista do que há ali; item da lista → ficha.
- **Cartão à direita**: abas **Rotas / Quero… / Produtos** (teclas `1`, `2`, `3`); tocar numa linha da legenda realça aquela rota (ou experiência, ou produto) no recorte atual; tocar de novo desfaz. Tocar na região, no topo do cartão de um município, sobe para a região.
- **Ficha**: dados do guia e um **QR code** que abre o local no Google Maps no celular. A localização exata vem do QR "Ver mapa" impresso no guia; "aproximada" é o bairro apontado pelo QR ou o endereço geocodificado (o QR da ficha busca pelo nome); "só no município" quando o guia não traz coordenada.
- **Passeio automático**: começa após 30 s sem toque, percorre as 12 regiões turísticas e abre fichas de alguns atrativos. Qualquer toque interrompe. `Espaço` pausa/retoma.
- Outras teclas: `Esc` fecha painéis · `N` volta ao norte · `F` tela cheia.
- Durante o passeio, a descrição de uma ficha longa rola sozinha.
- Para testar o passeio rápido: `?ocio=3000` (começa após 3 s).

## Publicar online depois

Copie a pasta (menos `_provas/`) para qualquer hospedagem estática (Netlify, GitHub Pages, Apache…). Não há build nem servidor de aplicação. O `.htaccess` já está incluído para Apache.

## Atualizar os dados

Os dados ficam em `dados/` (`registros.json`, `lentes.json`, `fichas.json`, `municipios-3d.json`) e são gerados por scripts Python a partir da extração dos PDFs; a planilha `turismo_rural_rj.xlsx` traz os mesmos atrativos. O relevo, a cobertura do solo e a malha municipal (`altura.*`, `cobertura.*`, `municipios-3d.json`) valem para o estado inteiro e não mudam.

## Provas automáticas (para quem for mexer no código)

`node _provas/provas.mjs` (Node 24 + Chrome, sem dependências) roda cliques reais, confere cada ficha contra os dados, lê o QR da tela com OpenCV, testa o passeio, o servidor PowerShell e quatro tamanhos de tela (1080p, 4K, notebook, celular). `TELAO_SECAO=alvo` roda uma seção só.

## Limites conhecidos

- Pensado para **TV e notebook**. No celular a página abre e a ficha funciona, mas o layout não foi desenhado para telas pequenas (para o celular, o ideal é uma versão 2D à parte).
- Os dados vêm de PDFs (muitos só em imagem): a leitura foi conferida contra as páginas, mas ainda pode haver erros. Horários, telefones e agendamento mudam: confirme antes de divulgar.
- 161 dos 630 atrativos não têm coordenada utilizável no guia e só aparecem na contagem do município e nas listas; outros 51 têm ponto aproximado (bairro ou endereço).
- As rotas temáticas são sugestões de promoção, atribuídas por palavras-chave; não são rotas oficiais.
- Relevo: Terrain Tiles (AWS/Mapzen). Cobertura do solo: MapBiomas. Malha municipal: IBGE. Veja ⓘ Info na tela.
