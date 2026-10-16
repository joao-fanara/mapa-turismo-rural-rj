# REQUIREMENTS — Mapa do Turismo Rural RJ ("Rio Rural")

Estado em 16/10/2026. Cada item tem **status** (implementado · parcial · pendente · fora de escopo) e **prioridade** (alta · média · baixa).

## 1. Objetivo

Plotar, em um mapa que abre **offline no navegador** (protótipo; depois online), os atrativos dos 12 guias "Turismo Rural RJ" da TurisRio/Setur-RJ (https://www.rj.gov.br/turisrio/node/132), para exibição em **TV grande** (centros de atendimento ao turista, feiras, estandes) e uso em notebook. A identidade visual deve **remeter ao campo, não à ficção científica** (referência: [docs/referencia-visual.webp](docs/referencia-visual.webp), o "Passaporte Rural do Rio").

Público: visitantes e turistas (leitura a 3–4 m, toque ou mouse), equipe da Setur/TurisRio (operação e atualização dos dados).

## 2. Requisitos funcionais

| # | Requisito | Status | Prior. |
|---|---|---|---|
| RF1 | Extrair os atrativos dos 12 PDFs (muitos só imagem): nome, município, endereço, descrição, horário, telefone, redes, Wi‑Fi, agendamento, pet | **implementado** — 630 atrativos, conferidos página a página (auditoria com verificador independente; 18 correções, 4 duplicatas removidas) | alta |
| RF2 | Localizar cada atrativo: coordenada do QR "Ver mapa" do guia → Google Maps; senão endereço (OpenStreetMap/Nominatim); senão só o município | **implementado** — 418 pontos exatos, 51 aproximados (bairro ou endereço), 161 só no município | alta |
| RF3 | Planilha Excel com todos os atrativos, resumo por região × rota e legenda | **implementado** — `turismo_rural_rj.xlsx` | alta |
| RF4 | Telão 3D offline: relevo, etiquetas por município (total), cartão à direita com as lentes **Rotas / Quero… / Produtos**, ladrilhos por rota, **ficha do atrativo com QR** para o celular, passeio automático pelas 12 regiões, **tudo clicável** | **implementado** (funcionalmente; visual ainda no estilo antigo — ver RF5) | alta |
| RF5 | **Identidade visual rural** conforme a referência: papel creme, relevo sólido pintado (mata, campos, rios, litoral), alfinetes em gota com ícones por rota, ficha como página de passaporte com carimbo, tipografia calorosa, sem brilho/HUD/telemetria | **implementado (v1, 16/10/2026) — aguarda aprovação do usuário** (briefing em [docs/direcao-visual.md](docs/direcao-visual.md)) | **alta** |
| RF6 | Servidor local sem instalação e abertura em tela cheia na TV (`abrir-telao.bat`) | **implementado** (Windows/Edge) | média |
| RF7 | Publicação online (hospedagem estática) | pendente | média |
| RF8 | Passaporte digital com carimbos por visita | **fora de escopo** (inspira o visual da ficha) | futuro |
| RF9 | Versão 2D leve para celular | **fora de escopo** (o telão é para TV/notebook) | futuro |

## 3. Regras de negócio

1. **Ponto no mapa só com localização real.** Classes: *exato* (QR do guia com a coordenada na própria URL e a menos de 12 km do município declarado), *aproximado* (QR que aponta só o bairro — mesma coordenada em 3+ atrativos — ou endereço geocodificado), *só município* (nunca desenhado como ponto; conta no município e aparece nas listas).
2. **Nenhuma coordenada inventada:** o centro do município nunca vira ponto nem entra na ficha; o QR da ficha de um atrativo sem ponto exato busca **pelo nome** no Google Maps.
3. QR que cai na vista padrão do Google (Rio/Niterói), que aponta só para a cidade ou que cai >12 km fora do município é descartado (bugs reais já encontrados — têm teste de regressão).
4. **Rotas temáticas** (9) são sugestões de promoção, atribuídas por palavras-chave do nome e da descrição (a primeira que casa é a principal); não são rotas oficiais. **Categorias** e **experiências** idem.
5. **Regiões** = as 12 regiões turísticas, com a composição lida nas capas dos guias; municípios sem guia ficam em "Outros municípios" (fora do passeio).
6. Dados dos guias podem estar desatualizados: a interface e a planilha avisam para confirmar horários e agendamento.

## 4. Requisitos não funcionais

- **Offline:** nenhuma requisição externa em tempo de execução; CSP `default-src 'self'`.
- **TV:** legível a 3–4 m em 1080p e 4K (ficha ≥ 20 px de corpo, nome ≥ 32 px, QR ≥ 200 px em 1080p; escala proporcional em 4K); contraste ≥ 4,5:1.
- **Desempenho:** 60 fps alvo com WebGL em GPU comum; parâmetro `?q=media|baixa` para máquinas fracas.
- **Operação:** sem build; basta servir a pasta `telao/` (servidor PowerShell incluído, só localhost, sem administrador).
- **Segurança:** textos dos guias entram na tela por `textContent` (sem HTML injetado); servidor bloqueia saída da pasta; nenhuma credencial no repositório.
- **Acessibilidade básica:** foco visível, Esc fecha painéis, alvos de toque ≥ 44 px, `aria-*` nos painéis.

## 5. Dados

Entrada: 12 PDFs (links em [dados-fonte/FONTES.md](dados-fonte/FONTES.md)). Saída: `telao/dados/{registros,lentes,fichas,municipios-3d}.json`, `dados-fonte/atrativos.json` e a planilha. Relevo (Terrain Tiles/AWS), cobertura do solo (MapBiomas Col. 11) e malha municipal (IBGE) vêm do projeto-base "Mapa de CT&I em 3D" do autor e valem para o estado inteiro.

## 6. Critérios de aceitação

- `node verificar.mjs` verde (sintaxe + 15 testes de dados + provas no navegador: clique real em município, alvo, alvos colados, relevo, lista, legenda; ficha conferida contra os dados e **QR da tela decodificado**; passeio; servidor; 4 tamanhos de tela).
- RF5: o usuário aprova a captura 1080p lado a lado com a referência.

## 7. Fora do escopo atual

Cadastro/edição de produtores, passaporte digital, versão mobile, calendário de colheitas/festas, áudio/narração (removido do projeto-base).

## 8. Dúvidas e decisões pendentes

| # | Dúvida | Alternativas |
|---|---|---|
| D1 | O repositório é **público** e traz telefones/redes dos empreendimentos (vindos dos guias públicos). Pode? | manter público · tornar privado · remover contatos da versão pública |
| D2 | Direitos de uso das descrições e do conteúdo dos guias em site próprio | pedir autorização à TurisRio · resumir as descrições |
| D3 | As 9 rotas implementadas × as 6 do briefing (Café, Queijos, Frutas/Flores, Cachaças, Mata, Litoral caiçara) | adotar as 9 · reduzir às 3–6 prioritárias · validar nomes com a Setur |
| D4 | Hospedagem online e domínio | subdomínio de `fanara.com.br` · GitHub Pages · outro |
| D5 | 161 atrativos só no município: completar coordenadas com a TurisRio? | pedir planilha de coordenadas · aceitar |
| D6 | Fonte da identidade visual (Montserrat, licença OFL, será embutida) | Montserrat · outra fonte da marca do estado |
