# STEPS — fases e estado (16/10/2026)

| Fase | Estado |
|---|---|
| F1 Extração dos 12 guias (PDF → dados) | **concluída** — 630 atrativos, auditados |
| F2 Localização (QR → Google Maps, endereço, município) | **concluída** — 418 exatos · 51 aproximados · 161 só município; bugs de coordenada corrigidos com testes |
| F3 Telão 3D funcional offline (fork do "Mapa de CT&I em 3D") | **concluída** — clique em tudo, ficha com QR, passeio, TV/4K, servidor PowerShell |
| **F4 Identidade visual rural** | **v1 implementada (16/10/2026) — aguarda aprovação do usuário lado a lado com a referência.** Papel creme, relevo sólido pintado, alfinetes com ícone, ficha-passaporte com carimbo, Montserrat; 8 provas objetivas (claridade, cores, fonte, contraste) |
| F5 Qualidade/CI | gate local pronto (`node verificar.mjs`); workflow GitHub Actions criado, **ainda não executado** |
| F6 Publicação online | pendente — destino: subdomínio do usuário (D4); depende de F7–F9 |
| **F7 Banco e API** (MySQL + PHP, mesmo formato de JSON do telão) | **planejada** — aguarda D7–D10 |
| **F8 Área administrativa** (login, CRUD, auditoria, importar/exportar, publicar) | **planejada** |
| **F9 Idiomas PT/EN/FR/DE** (interface + conteúdo + seletor) | **planejada** |
| F10 Instalação no subdomínio (`docs/instalacao.md`, deploy, backup) | **planejada** |

## F4 — pedido do usuário: "a estética deve remeter ao aspecto rural e não sci-fi" (referência `docs/referencia-visual.webp`; "não precisa ser exatamente igual, mas parecida é excelente")

Briefing em [docs/direcao-visual.md](docs/direcao-visual.md).

**Feito na v1:** (1) tokens, papel, Montserrat embutida e cartões de papel em `estilo.css`; telemetria escondida · (2) 9 ícones SVG rurais, uma fonte única (`SIMBOLO` em `cena.js`) para legenda, ladrilhos, carimbo e alfinetes · (3) alfinetes em gota com ícone (atlas em canvas + `THREE.Points`, `alphaToCoverage`) · (4) relevo sólido: malha de ~1 milhão de triângulos + shader que pinta pela cobertura do solo (mistura entre células com borda entortada por ruído, copas de mata, lavoura em faixas, mar raso→fundo com espuma, esmaece no papel), limites municipais em fio claro, contorno do estado tracejado; sem nuvem de pontos, sem brilho aditivo, sem pós-processamento, sem "mesa holográfica" · (5) ficha como página de passaporte: carimbo da rota (borda dupla, inclinado) + QR sem rolar · (6) provas: seção `visual` (claridade média ≥170, ≤5% de pixels escuros, verde ≥3%, turquesa ≥2%, fundos claros, sem monoespaçada) e contraste sobre o papel · (7) documentos.

**Ideias para a v2 (não feitas; só com aprovação):** ilustrações pontuais (casas de fazenda, cafezal, vaca) e rosa dos ventos desenhada; textura de papel e vinheta; controles fora da área do mapa; alfinetes agrupados em zoom longe; ajustar as cores depois de ver na TV real.

**Critério de conclusão da F4:** o usuário aprovar as capturas 1080p/4K (estado, município, ficha) ao lado da referência.

## F7–F10 — plano (16/10/2026; só começa após validação das dúvidas D7–D12 em `REQUIREMENTS.md`)

**Ordem recomendada:** F7 → F8 → F9 → F10. A F9 (interface) pode andar em paralelo à F8, mas o conteúdo traduzido depende do esquema da F7.

**F7 Banco e API.** Entregas: `database/schema.sql` + `database/migracoes/`; tabelas `atrativos` (todos os campos do `fichas.json` + `excluido_em`), `atrativo_traducoes` (idioma, descrição, funcionamento, status automática/revisada), `rotas`, `categorias`, `experiencias` (+ traduções) e as ligações N:N, `municipios`/`regioes`, `usuarios`, `auditoria`; `app/` PSR-4 (`Mapa\`), `Db` (PDO, utf8mb4), repositórios; `database/seed/` gerado de `dados-fonte/atrativos.json`; `api/dados.php?lang=` devolvendo os mesmos 4 JSON do telão a partir do banco (com ETag e cache em arquivo); telão com `?fonte=api|estatico`. **Critério:** a API gerada do seed produz JSON idêntico (semântico) ao `telao/dados/*` atual; testes de integração com MySQL de verdade (Docker); PHPStan e PHPUnit verdes.

**F8 Admin.** Entregas: `admin/` fora do caminho público do telão; login, papéis (D9), CSRF, limite de tentativas, troca de senha obrigatória, `bin/criar-usuario` (sem senha padrão); lista com busca/filtros/paginação; formulário com validações (regras de coordenada de `test_dados.py` portadas para PHP, com os mesmos testes); abas de tradução por idioma; excluir/restaurar (D11); auditoria; importar do JSON; exportar CSV/XLSX; botão Publicar (regera cache e pacote estático). **Critério:** testes de unidade e integração dos repositórios e das validações, teste de sistema (login → criar → editar → excluir → publicar → aparece na API), testes de segurança (CSRF, XSS no escape, SQL injection nos filtros, acesso sem login), PHPStan nível alto.

**F9 Idiomas.** Entregas: `telao/i18n/{pt,en,fr,de}.json`; função `t()` e `data-i18n`; todos os textos fixos de `index.html`/`cena.js` extraídos; seletor PT·EN·FR·DE + `?lang=` + `localStorage`; formatação de números/datas por idioma; traduções de rotas/categorias/experiências; descrições e horários traduzidos (D7); `Accept-Language` como padrão na primeira visita. **Critério:** teste automático de paridade de chaves (nenhuma faltando nem sobrando), provas do harness em cada idioma (ficha, legenda, passeio) e capturas de PT/EN/FR/DE conferidas; sem estouro de layout com os textos mais longos (alemão).

**F10 Instalação.** `docs/instalacao.md` (criar banco/usuário MySQL, `config/config.php`, `composer install --no-dev`, permissões, `bin/criar-usuario`, importar seed, cron de backup), checklist de publicação, rollback; sem credenciais no repositório. **Critério:** instalação do zero num ambiente limpo (Docker) seguindo só o documento.

**Riscos:** (1) tradução automática de ~630 descrições × 3 idiomas exige revisão humana antes de divulgar; (2) hospedagem compartilhada pode limitar versão do PHP, `exec`, cron e tamanho do `max_execution_time` na exportação; (3) o telão é pesado (1 milhão de triângulos, ~5 MB de dados): servir com compressão e cabeçalhos de cache; (4) admin público exige HTTPS e atenção a senhas fracas.

## Como rodar
`node verificar.mjs` (completo, ~3 min, precisa de Chrome/Chromium; em Linux usa SwiftShader — pode ser mais lento) · `node verificar.mjs rapido` (sintaxe + dados). Pré-requisitos: Node 22+, Python 3.10+ com `openpyxl` e `opencv-python-headless`.
Servir o telão: `python -m http.server 8797 --directory telao`.
Regerar dados: `python dados-fonte/merge.py && python dados-fonte/gera_telao.py` (usa o cache de geocodificação; sem rede).

## Riscos
- `cena.js` é monolítico (~1,7 mil linhas, uma função com closures); a troca do relevo mexe no coração dele. Fazer incrementalmente e rodar o gate a cada passo.
- Em máquina sem GPU a malha densa pode pesar: manter `?q=media|baixa`.


## Pedido de 16/10/2026 — reutilização (RF13)
Antes da F7, separar o que é do tema (marca, textos, rotas, paleta, região/malha, fontes) do motor genérico: arquivo de configuração do tema + dicionários i18n; banco com `tema`/`mapa` como entidade, para hospedar vários mapas. Critério: criar um segundo mapa de exemplo só com configuração e dados.

## Preparar para RF14 (cadastro via gov.br)
Na modelagem da F7–F8: atrativo com `status` (`rascunho`/`pendente`/`publicado`/`recusado`), `origem` (admin/cidadão), `enviado_por` (identificador gov.br, só o necessário — LGPD) e motivo da recusa; fila de moderação no admin e papel `moderador`. Login gov.br = OAuth2/OpenID (login único gov.br, exige credenciamento do órgão) — decisão D13. Nada disso é construído agora.

## F8 inclui RF15 (CSV em lote)
Tela: modelo CSV → upload → pré-visualização (válidas/com aviso/rejeitadas, mesmas regras do formulário) → confirmar → importar em transação com relatório e desfazer pelo log. Testes: BOM, `;`/`,`, acentos, linha inválida, duplicada, arquivo grande, injeção de fórmula.

## Reordenação (16/10/2026): site primeiro
Ordem nova: (1) idiomas (em andamento, vale para o site) → (2) **site responsivo/celular + alternativa sem WebGL + acessibilidade** → (3) desacoplar tema (RF13) → (4) F7 banco/API → (5) F8 admin (CRUD, CSV, moderação) → (6) telão como modo opcional (já existe; manter testes). Assumido D14 = 3D com alternativa leve.

## F9 Idiomas — situação (16/10/2026)
Feito: `telao/i18n.js` (motor: catálogo por texto em português, `t()`, `tLista()`, seletor PT·EN·FR·DE, `?lang=`, lembrado no navegador, refaz ficha/lista/painel ao trocar), catálogos `telao/i18n/{en,fr,de}.json` (gerados por `dados-fonte/traducoes/catalogo_ui.py`), 629 descrições/horários traduzidos em `telao/dados/trad-*.json` (status: **automática**, revisão humana pendente), números e datas pelo idioma. Provas: seção `idiomas` (paridade de chaves e variáveis, sem U+FFFD, cobertura dos 630 lugares, troca com ficha aberta, volta ao português). Falta: edição das traduções no admin (F8), telas conferidas por captura em 4K, exportar o catálogo para o banco.
