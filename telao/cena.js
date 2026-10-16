// Telão 3D de Turismo Rural RJ, direção "mapa ilustrado em papel": relevo sólido pintado pela cobertura do solo,
// atrativos como alfinetes em gota com o ícone da rota; municípios e ladrilhos como marcações em DOM sobre o relevo.
// Sem addons do three (importam o especificador nu 'three', vetado pela CSP sem importmap):
// controles, raycast no relevo e pós-processamento são próprios.
import * as THREE from './vendor/three/three.module.js';
import { iniciarIdiomas, localeAtual, t, tLista, traducaoDe } from './i18n.js';

THREE.ColorManagement.enabled = false; // cores dos shaders são valores de tela (sRGB), sem conversão

const DADOS = './dados/';
const EXAG = 6;   // exagero vertical do relevo (mostrado no HUD)
const FOV = 24;   // graus, vertical
const OCIOSO_MS = parseInt(new URL(window.location).searchParams.get('ocio') || '30000', 10); // parâmetro ?ocio para teste
const QUALIDADES = {
  // dpr: teto de devicePixelRatio; altMax: altura máxima do buffer de desenho (o HUD é DOM e fica nítido); malha: células entre vértices do relevo
  alta: { dpr: 2, altMax: 2160, malha: 2 },
  media: { dpr: 1.5, altMax: 1080, malha: 2 },
  baixa: { dpr: 1, altMax: 1080, malha: 3 },
};
const qPedida = new URLSearchParams(location.search).get('q');
const qualidade = Object.hasOwn(QUALIDADES, qPedida) ? qPedida : 'alta';
const CFG = QUALIDADES[qualidade];

// Paleta do relevo pintado, por código de cobertura (cobertura.json): [cor]. A legenda do cartão usa as mesmas cores.
const COR_CLASSE = {
  0: ['#d5d6a4'], // terra fora do RJ (esmaece no papel)
  1: ['#7cc4cf'], // mar (o shader modula pela profundidade)
  2: ['#5aa7c2'], // água interior e áreas alagadas
  3: ['#d9b79a'], // área urbanizada (telhado/terra batida)
  4: ['#2f6b3b'], // mata
  5: ['#b8c870'], // campo e pasto
  6: ['#d6bc63'], // lavoura e silvicultura
  7: ['#6aa88d'], // mangue e restinga
  8: ['#cdbf94'], // outros usos
};
// Símbolo de cada item das lentes (campo `simbolo` de lentes.json; redundância da cor), em viewBox 24x24.
const SIMBOLO = {
  circulo: ['circle', { cx: 12, cy: 12, r: 8.5 }], quadrado: ['rect', { x: 4.5, y: 4.5, width: 15, height: 15 }],
  losango: ['polygon', { points: '12,2 22,12 12,22 2,12' }], triangulo: ['polygon', { points: '12,3 21.5,19.5 2.5,19.5' }],
  'triangulo-invertido': ['polygon', { points: '2.5,4.5 21.5,4.5 12,21' }], hexagono: ['polygon', { points: '7,3.3 17,3.3 22,12 17,20.7 7,20.7 2,12' }],
  cruz: ['polygon', { points: '9,2 15,2 15,9 22,9 22,15 15,15 15,22 9,22 9,15 2,15 2,9 9,9' }],
  anel: ['circle', { cx: 12, cy: 12, r: 7.5, fill: 'none', 'stroke-width': 3.6 }],
  xis: ['polygon', { points: '5,2.2 12,9.2 19,2.2 21.8,5 14.8,12 21.8,19 19,21.8 12,14.8 5,21.8 2.2,19 9.2,12 2.2,5' }],
  estrela: ['polygon', { points: '12,1.5 14.6,8.9 22.5,9.1 16.2,13.9 18.5,21.5 12,17 5.5,21.5 7.8,13.9 1.5,9.1 9.4,8.9' }],
  trapezio: ['polygon', { points: '7,4.5 17,4.5 22,19.5 2,19.5' }], ampulheta: ['polygon', { points: '4,3 20,3 12,12 20,21 4,21 12,12' }],
  gota: ['path', { d: 'M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13z' }],
  pentagono: ['polygon', { points: '12,2.5 21.5,9.4 17.9,20.6 6.1,20.6 2.5,9.4' }],
  octogono: ['polygon', { points: '8,2.5 16,2.5 21.5,8 21.5,16 16,21.5 8,21.5 2.5,16 2.5,8' }],
  'meia-lua': ['path', { d: 'M2.5 16.5a9.5 9.5 0 0 1 19 0z' }], barra: ['rect', { x: 2.5, y: 8.5, width: 19, height: 7 }],
  // ícones rurais das rotas (silhuetas de um traçado só; furos = subtraçado em sentido anti-horário)
  cafe: ['path', { d: 'M7 3h1.8v5H7zM11 3h1.8v5H11zM3.5 11h13v3.2a5.8 5.8 0 0 1-5.8 5.8H9.3a5.8 5.8 0 0 1-5.8-5.8zM16.5 12.2h1.2a3 3 0 0 1 0 6h-1.8v-1.7h1.8a1.3 1.3 0 0 0 0-2.6h-1.2zM2 21h16v1.6H2z' }],
  queijo: ['path', { d: 'M2 18.5V12L21.5 6.5v12zM9.2 14.2a1.4 1.4 0 1 0-2.8 0 1.4 1.4 0 1 0 2.8 0zM14.7 12.4a1.1 1.1 0 1 0-2.2 0 1.1 1.1 0 1 0 2.2 0zM18.2 15.2a1.2 1.2 0 1 0-2.4 0 1.2 1.2 0 1 0 2.4 0zM12.3 16.2a.9.9 0 1 0-1.8 0 .9.9 0 1 0 1.8 0z' }],
  garrafa: ['path', { d: 'M10 2h4v3.2c0 .9.8 1.4 1.6 2.4.7.9 1.4 1.8 1.4 3.2V21a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 7 21v-9.2c0-1.4.7-2.3 1.4-3.2C9.2 6.6 10 6.1 10 5.2zM9 13v5h6v-5z' }],
  flor: ['path', { d: 'M15.8 7.8a3.8 3.8 0 1 1 -7.6 0 3.8 3.8 0 1 1 7.6 0zM19.79 10.7a3.8 3.8 0 1 1 -7.6 0 3.8 3.8 0 1 1 7.6 0zM18.27 15.4a3.8 3.8 0 1 1 -7.6 0 3.8 3.8 0 1 1 7.6 0zM13.33 15.4a3.8 3.8 0 1 1 -7.6 0 3.8 3.8 0 1 1 7.6 0zM11.81 10.7a3.8 3.8 0 1 1 -7.6 0 3.8 3.8 0 1 1 7.6 0zM13.5 12a1.5 1.5 0 1 0 -3 0 1.5 1.5 0 1 0 3 0z' }],
  peixe: ['path', { d: 'M2 12c3-5 8-7 13-4.5l1.5 1.2L22 6v12l-5.5-2.7-1.5 1.2C10 18.5 5 17 2 12zM8.5 11.3a1 1 0 1 0-2 0 1 1 0 1 0 2 0z' }],
  folha: ['path', { d: 'M4 20C4 11 9 5 21 4c0 11-5 17-13 17-1.5 0-3-.3-4-1zM7 18l1.8.7L15.5 8.5z' }],
  mesa: ['path', { d: 'M5 3v6a2.5 2.5 0 0 0 2 2.4V21h1.8V11.4A2.5 2.5 0 0 0 11 9V3H9.6v5H8.4V3H7.2v5H6.4V3zM16 3c-2 1.5-3 4-3 7v3h2.2v8H17V3z' }],
  artesanato: ['path', { d: 'M9 3h6v2.2c0 1 1 1.6 2 3 1.2 1.6 1.8 3.4 1.8 5.3 0 5-2.8 8-6.8 8s-6.8-3-6.8-8c0-1.9.6-3.7 1.8-5.3 1-1.4 2-2 2-3zM7 12.5v1.8h10v-1.8z' }],
  campo: ['path', { d: 'M2.5 11.5L12 3.5l9.5 8h-2.3V20H4.8v-8.5zM10 20h4v-5h-4z' }],
  uva: ['path', { d: 'M11.2 1.5h1.6v4h-1.6zM12.8 3.2c1.8-1.4 4.4-1.3 5.8.2-1.8 1.2-4 1.3-5.8-.2zM11.1 8.6a2.6 2.6 0 1 0-5.2 0 2.6 2.6 0 1 0 5.2 0zM14.6 8.6a2.6 2.6 0 1 0-5.2 0 2.6 2.6 0 1 0 5.2 0zM18.1 8.6a2.6 2.6 0 1 0-5.2 0 2.6 2.6 0 1 0 5.2 0zM12.8 13a2.6 2.6 0 1 0-5.2 0 2.6 2.6 0 1 0 5.2 0zM16.4 13a2.6 2.6 0 1 0-5.2 0 2.6 2.6 0 1 0 5.2 0zM14.6 17.4a2.6 2.6 0 1 0-5.2 0 2.6 2.6 0 1 0 5.2 0z' }],
  azeitona: ['path', { d: 'M3 21.2C7 15 13 9.5 21 3.6l.9 1.2C14.6 10.6 8.8 16 4.6 22.2zM11.4 9.1a3.1 3.1 0 1 0-6.2 0 3.1 3.1 0 1 0 6.2 0zM19.6 14.7a3.1 3.1 0 1 0-6.2 0 3.1 3.1 0 1 0 6.2 0zM15.5 4.6c-2.6.4-4.4 2.2-4.6 4.6 2.6-.3 4.3-2.1 4.6-4.6z' }],
};

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rad = THREE.MathUtils.degToRad;
const fmt = (n) => n.toLocaleString(localeAtual());
const dataBR = (iso) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(localeAtual());
const $ = (id) => document.getElementById(id);

let marcarPronto, falhar;
const pronto = new Promise((ok, erro) => { marcarPronto = ok; falhar = erro; });
const api = { preset: null, girar: null };
let ultimoQuadro = { triangles: 0, calls: 0, points: 0 };
let rendererNome = '';
window.__telao = {
  pronto,
  info: () => ({
    renderer: rendererNome,
    triangulos: ultimoQuadro.triangles,
    drawCalls: ultimoQuadro.calls,
    pontos: ultimoQuadro.points,
    elementosDom: document.getElementsByTagName('*').length,
    qualidade,
  }),
  girar: async (ms) => { await pronto; return api.girar(ms); },
};

function aviso(texto) { $('aviso-texto').textContent = texto; $('aviso').hidden = !texto; }

async function baixar(nome, tipo) {
  const r = await fetch(DADOS + nome);
  if (!r.ok) throw new Error(`${nome}: HTTP ${r.status}`);
  return r[tipo]();
}

await iniciarIdiomas();
const semWebGL = (() => { try { const c = document.createElement('canvas'); return !(c.getContext('webgl2') || c.getContext('webgl')); } catch { return true; } })();
if (semWebGL || new URLSearchParams(location.search).get('modo') === 'lista') (await import('./lista.js')).iniciarLista().then(marcarPronto, falhar); // sem WebGL: lista com busca
else iniciar().catch((e) => { aviso('Não foi possível montar o mapa: ' + e.message); console.error(e); falhar(e); });

async function iniciar() {
  const [bin, png, altJ, cobJ, munJ, regJ, lenJ, ficJ] = await Promise.all([
    baixar('altura.bin', 'arrayBuffer'), baixar('cobertura.png', 'blob'), baixar('altura.json', 'json'),
    baixar('cobertura.json', 'json'), baixar('municipios-3d.json', 'json'), baixar('registros.json', 'json'), baixar('lentes.json', 'json'), baixar('fichas.json', 'json'),
  ]);

  // ---------- grade ----------
  const W = altJ.largura, H = altJ.altura;
  const G = { x0: altJ.bbox_km[0], y1: altJ.bbox_km[3], dx: altJ.passo_km[0], dy: altJ.passo_km[1] };
  const A = new Int16Array(bin); // little-endian, igual à plataforma
  const bmp = await createImageBitmap(png, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const cv = new OffscreenCanvas(W, H);
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(bmp, 0, 0);
  const rgba = cx.getImageData(0, 0, W, H).data;
  const C = new Uint8Array(W * H);
  const contagem = new Array(9).fill(0);
  for (let k = 0; k < C.length; k++) { C[k] = rgba[k * 4]; contagem[C[k]]++; }
  for (const c of cobJ.classes) {
    if (contagem[c.codigo] !== c.celulas) console.error(`cobertura.png: classe ${c.codigo} com ${contagem[c.codigo]} células, esperado ${c.celulas}`);
  }

  const xDe = (j) => G.x0 + (j + 0.5) * G.dx;
  const yDe = (i) => G.y1 - (i + 0.5) * G.dy;
  const yMundo = (m) => (m / 1000) * EXAG;
  function alturaM(x, y) {
    const fj = clamp((x - G.x0) / G.dx - 0.5, 0, W - 1.001), fi = clamp((G.y1 - y) / G.dy - 0.5, 0, H - 1.001);
    const j = fj | 0, i = fi | 0, a = fj - j, b = fi - i, k = i * W + j;
    return (A[k] * (1 - a) + A[k + 1] * a) * (1 - b) + (A[k + W] * (1 - a) + A[k + W + 1] * a) * b;
  }
  const chaoY = (x, y) => yMundo(Math.max(alturaM(x, y), 0));

  // ---------- municípios, regiões, registros ----------
  const municipios = munJ.municipios;
  const porCodigo = new Map(municipios.map((m, k) => [m.codigo, k + 1])); // id 1..92 (0 = nenhum)
  for (const m of municipios) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const pol of m.aneis) for (const anel of pol) for (const [x, y] of anel) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    m.bb = [x0, y0, x1, y1];
  }
  const regioes = munJ.regioes;
  const regiaoDe = new Map(regioes.map((r) => [r.id, r]));
  const meta = regJ.meta, grupos = [...regJ.grupos].sort((a, b) => a.ordem - b.ordem);
  const agregados = regJ.agregados.por_municipio;
  const classeNome = Object.fromEntries(cobJ.classes.map((c) => [c.codigo, c.nome]));
  const soma = Object.values(agregados).reduce((s, a) => s + a.total, 0);
  if (soma !== meta.total) console.error(`agregados somam ${soma}, meta.total = ${meta.total}`);
  // Lentes do cartão e dos ladrilhos (lentes.json): Rotas (o grupo do registro), Quero… (eixos de experiência) e Produtos (categorias).
  // Contagem por município juntando registros.json e lentes.por_registro pelo código; eixos e tipos não são exclusivos.
  const LENTES = lenJ.lentes, NOMES_LENTE = Object.keys(LENTES);
  if (lenJ.versao_base !== meta.versao_base) console.error(`lentes.json da base ${lenJ.versao_base}, registros.json da ${meta.versao_base}`);
  const contas = {}; // código do município (ou 'sem_municipio', como em agregados) -> { camadas: {slug: n}, eixos, tipos, sem_tipo }
  for (const r of regJ.registros) {
    const c = (contas[r[4] ?? 'sem_municipio'] ??= { camadas: {}, eixos: {}, tipos: {}, sem_tipo: 0 });
    const p = lenJ.por_registro[r[5]] ?? (console.error(`lentes.json sem o registro ${r[5]}`), { eixos: [], tipos: [] });
    c.camadas[r[2]] = (c.camadas[r[2]] || 0) + 1;
    for (const e of p.eixos) c.eixos[e] = (c.eixos[e] || 0) + 1;
    for (const t of p.tipos) c.tipos[t] = (c.tipos[t] || 0) + 1;
    if (!p.tipos.length) c.sem_tipo++;
  }
  let lente = 'camadas'; // aba de abertura e do passeio
  const painelI = $('item'); // painel "o que tem aqui" (abrirItem)
  const TITULO_LENTE = { camadas: 'Lugares por rota', eixos: 'O que fazer', tipos: 'Produtos' };

  // id do município por célula (varredura por linhas, par-ímpar: trata buracos e multipolígonos)
  const M = new Uint8Array(W * H);
  const xs = [];
  municipios.forEach((m, k) => {
    const ar = [];
    for (const pol of m.aneis) for (const anel of pol) for (let a = 0; a < anel.length; a++) {
      const p = anel[a], q = anel[(a + 1) % anel.length];
      if (p[1] !== q[1]) ar.push(p[0], p[1], q[0], q[1]);
    }
    const iA = Math.max(0, Math.floor((G.y1 - m.bb[3]) / G.dy - 0.5)), iB = Math.min(H - 1, Math.ceil((G.y1 - m.bb[1]) / G.dy - 0.5));
    for (let i = iA; i <= iB; i++) {
      const yc = yDe(i);
      xs.length = 0;
      for (let e = 0; e < ar.length; e += 4) {
        const ay = ar[e + 1], by = ar[e + 3];
        if ((ay > yc) !== (by > yc)) xs.push(ar[e] + ((yc - ay) * (ar[e + 2] - ar[e])) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let s = 0; s + 1 < xs.length; s += 2) {
        const jA = Math.max(0, Math.ceil((xs[s] - G.x0) / G.dx - 0.5)), jB = Math.min(W - 1, Math.floor((xs[s + 1] - G.x0) / G.dx - 0.5));
        for (let j = jA; j <= jB; j++) M[i * W + j] = k + 1;
      }
    }
  });

  function dentro(m, x, y) { // ponto-em-polígono (par-ímpar) nos anéis em km
    if (x < m.bb[0] || x > m.bb[2] || y < m.bb[1] || y > m.bb[3]) return false;
    let c = false;
    for (const pol of m.aneis) for (const anel of pol) {
      for (let a = 0, b = anel.length - 1; a < anel.length; b = a++) {
        const [xa, ya] = anel[a], [xb, yb] = anel[b];
        if ((ya > y) !== (yb > y) && x < xa + ((y - ya) * (xb - xa)) / (yb - ya)) c = !c;
      }
    }
    return c;
  }

    const exato = new Set(regJ.precisoes.filter((p) => p.ponto_exato_permitido).map((p) => p.classe));
  // âncora = ponto de rótulo da malha: o agregado do município (inclusive os registros sem ponto exato) fica ali, como posição aproximada
  for (const m of municipios) m.ancora = m.rotulo;
  // distância (km) ao RJ em grade grossa (chanfro 2 passadas): vizinhos e mar somem com a distância
  const F = 4, wF = Math.ceil(W / F), hF = Math.ceil(H / F), DR = new Float32Array(wF * hF).fill(1e9);
  for (let i = 0; i < H; i++) for (let j = 0; j < W; j++) if (C[i * W + j] >= 2) DR[((i / F) | 0) * wF + ((j / F) | 0)] = 0;
  for (let p = 0; p < 2; p++) {
    const ini = p ? hF - 1 : 0, fim = p ? -1 : hF, s = p ? -1 : 1;
    for (let i = ini; i !== fim; i += s) for (let jj = 0; jj < wF; jj++) {
      const j = p ? wF - 1 - jj : jj, k = i * wF + j;
      let v = DR[k];
      if (j - s >= 0 && j - s < wF) v = Math.min(v, DR[k - s] + 1);
      if (i - s >= 0 && i - s < hF) {
        v = Math.min(v, DR[k - s * wF] + 1);
        if (j - 1 >= 0) v = Math.min(v, DR[k - s * wF - 1] + 1.414);
        if (j + 1 < wF) v = Math.min(v, DR[k - s * wF + 1] + 1.414);
      }
      DR[k] = v;
    }
  }
  const distRJ = (i, j) => DR[((i / F) | 0) * wF + ((j / F) | 0)] * F * G.dx;

  // ---------- relevo sólido pintado ----------
  // Malha regular sobre a grade de altura (1 vértice a cada PASSO células). A cor vem da cobertura do solo (textura, com mistura suave
  // entre células), relevo sombreado com luz de noroeste, mata com textura de copa, mar raso → fundo com espuma na costa,
  // tudo esmaecendo no papel creme longe do estado (como no mapa ilustrado de referência).
  const PASSO = CFG.malha, dxm = G.dx * 1000, dym = G.dy * 1000;
  const nxv = Math.floor((W - 1) / PASSO) + 1, nyv = Math.floor((H - 1) / PASSO) + 1;
  const vPos = new Float32Array(nxv * nyv * 3), vInfo = new Float32Array(nxv * nyv * 4); // vInfo: sombra, profundidade (mar), distância ao RJ (km), altitude 0..1
  const Luz = [-Math.SQRT1_2 * Math.cos(rad(40)), Math.SQRT1_2 * Math.cos(rad(40)), Math.sin(rad(40))];
  for (let b = 0; b < nyv; b++) {
    const i = Math.min(H - 1, b * PASSO);
    for (let a = 0; a < nxv; a++) {
      const j = Math.min(W - 1, a * PASSO), k = i * W + j, h = A[k], mar = C[k] === 1, v = b * nxv + a;
      vPos[v * 3] = xDe(j); vPos[v * 3 + 1] = yMundo(Math.max(h, 0)); vPos[v * 3 + 2] = -yDe(i);
      const zx = (A[i * W + Math.min(W - 1, j + PASSO)] - A[i * W + Math.max(0, j - PASSO)]) / (2 * PASSO * dxm);
      const zy = (A[Math.max(0, i - PASSO) * W + j] - A[Math.min(H - 1, i + PASSO) * W + j]) / (2 * PASSO * dym);
      const gx = -zx * 2.5, gy = -zy * 2.5, gn = Math.hypot(gx, gy, 1);
      vInfo[v * 4] = mar ? 0.84 : clamp(0.36 + 0.9 * ((gx * Luz[0] + gy * Luz[1] + Luz[2]) / gn), 0.22, 1.08);
      vInfo[v * 4 + 1] = mar ? clamp(Math.log1p(-Math.min(0, h) / 20) / Math.log1p(2300 / 20), 0, 1) : 0;
      vInfo[v * 4 + 2] = Math.max(distRJ(i, j), (1 - clamp(Math.min(i, j, H - 1 - i, W - 1 - j) / 120, 0, 1)) * 80);
      vInfo[v * 4 + 3] = mar ? 0 : clamp(h / 2400, 0, 1);
    }
  }
  const indT = new Uint32Array((nxv - 1) * (nyv - 1) * 6);
  for (let b = 0, q = 0; b < nyv - 1; b++) for (let a = 0; a < nxv - 1; a++) { const v = b * nxv + a; indT[q++] = v; indT[q++] = v + nxv; indT[q++] = v + 1; indT[q++] = v + 1; indT[q++] = v + nxv; indT[q++] = v + nxv + 1; }
  const geoT = new THREE.BufferGeometry();
  geoT.setAttribute('position', new THREE.BufferAttribute(vPos, 3));
  geoT.setAttribute('aInfo', new THREE.BufferAttribute(vInfo, 4));
  geoT.setIndex(new THREE.BufferAttribute(indT, 1));

  // limites: municipais (arestas compartilhadas) em fio claro; contorno do estado (costa e divisas) tracejado
  const chave = (p, q) => (p[0] < q[0] || (p[0] === q[0] && p[1] < q[1]) ? `${p}|${q}` : `${q}|${p}`);
  const arestasDe = (m) => {
    const out = [];
    for (const pol of m.aneis) for (const anel of pol) for (let a = 0; a + 1 < anel.length; a++) out.push([anel[a], anel[a + 1]]);
    return out;
  };
  const uso = new Map();
  for (const m of municipios) for (const [p, q] of arestasDe(m)) { const kk = chave(p, q); const u = uso.get(kk); u ? u.n++ : uso.set(kk, { p, q, n: 1 }); }
  const segsInt = [], segsExt = [];
  for (const { p, q, n } of uso.values()) {
    const out = n < 2 ? segsExt : segsInt, comp = Math.hypot(q[0] - p[0], q[1] - p[1]), passos = Math.max(1, Math.ceil(comp / 0.28));
    for (let s = 0; s < passos; s++) {
      const xa = lerp(p[0], q[0], s / passos), ya = lerp(p[1], q[1], s / passos), xb = lerp(p[0], q[0], (s + 1) / passos), yb = lerp(p[1], q[1], (s + 1) / passos);
      out.push(xa, chaoY(xa, ya) + 0.2, -ya, xb, chaoY(xb, yb) + 0.2, -yb);
    }
  }

  // textura de classe e de município (uma por célula; leitura no shader), paleta das classes
  const texCelula = (dados) => { const t = new THREE.DataTexture(dados, W, H, THREE.RedFormat, THREE.UnsignedByteType); t.unpackAlignment = 1; t.flipY = false; t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true; return t; };
  const cobTex = texCelula(C), munTex = texCelula(M);
  const palDados = new Uint8Array(9 * 4);
  for (let k = 0; k < 9; k++) { const [r, g, b] = rgb(COR_CLASSE[k][0]); palDados.set([r * 255, g * 255, b * 255, 255], k * 4); }
  const palTex = new THREE.DataTexture(palDados, 9, 1, THREE.RGBAFormat); palTex.magFilter = palTex.minFilter = THREE.NearestFilter; palTex.needsUpdate = true;

  // alfinetes: um por atrativo com ponto (exato ou aproximado); índice da rota e do registro por sprite
  const idxRota = new Map(grupos.map((g, n) => [g.slug, n]));
  const alfPos = [], alfRota = [], alvoReg = [];
  regJ.registros.forEach(([x, y, g, prec], i) => {
    if (!exato.has(prec)) return;
    alfPos.push(x, chaoY(x, y) + 0.12, -y); alfRota.push(idxRota.get(g) ?? 0); alvoReg.push(i);
  });
  // atlas em canvas: uma gota por rota (cor da rota, contorno de papel, ícone no miolo, sombra no chão); ponta na base da célula
  const CEL_W = 192, CEL_H = 240;
  const atlas = document.createElement('canvas'); atlas.width = CEL_W * grupos.length; atlas.height = CEL_H;
  { const ca = atlas.getContext('2d'), iconeDe = Object.fromEntries(LENTES.camadas.itens.map((it) => [it.slug, it.simbolo]));
    grupos.forEach((g, n) => {
      const cor = g.cor_luz;
      ca.save(); ca.translate(n * CEL_W, 0);
      ca.fillStyle = 'rgba(58, 42, 26, .30)'; ca.beginPath(); ca.ellipse(96, 228, 36, 9, 0, 0, Math.PI * 2); ca.fill();
      ca.beginPath(); ca.moveTo(96, 226); ca.bezierCurveTo(52, 172, 16, 142, 16, 96); ca.arc(96, 96, 80, Math.PI, 0); ca.bezierCurveTo(176, 142, 140, 172, 96, 226); ca.closePath();
      ca.fillStyle = cor; ca.fill(); ca.lineWidth = 10; ca.lineJoin = 'round'; ca.strokeStyle = '#fbf5e6'; ca.stroke();
      ca.beginPath(); ca.arc(96, 96, 52, 0, Math.PI * 2); ca.fillStyle = '#fbf5e6'; ca.fill();
      const ic = SIMBOLO[iconeDe[g.slug]];
      ca.translate(96 - 36, 96 - 36); ca.scale(72 / 24, 72 / 24); ca.fillStyle = cor;
      if (ic && ic[0] === 'path') ca.fill(new Path2D(ic[1].d)); else { ca.beginPath(); ca.arc(12, 12, 8, 0, Math.PI * 2); ca.fill(); }
      ca.restore();
    });
  }

  // ---------- renderizador ----------
  const canvas = $('tela');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setClearColor(0xefe3c3, 1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // sem conversão na saída: 'media' (direto na tela) igual a 'alta' (via alvo)
  renderer.info.autoReset = false;
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  rendererNome = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

  const cena = new THREE.Scene();
  cena.background = new THREE.Color(0xefe3c3); // papel creme (o relevo esmaece nele)
  const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 1, 3000);

  const destaqueDados = new Uint8Array(128 * 4);
  const destaqueTex = new THREE.DataTexture(destaqueDados, 128, 1, THREE.RGBAFormat);
  destaqueTex.needsUpdate = true;
  // alvos acesos pelo painel "o que tem aqui": 1 texel por registro (índice em registros.json), 64×64 ≥ registros
  if (regJ.registros.length > 4096) console.error('registros.json passou de 4096: aumente a textura de itemTex');
  const itemDados = new Uint8Array(64 * 64 * 4), itemTex = new THREE.DataTexture(itemDados, 64, 64, THREE.RGBAFormat);
  itemTex.needsUpdate = true;
  const U = {
    uTempo: { value: 0 }, uEscalaPx: { value: 1 }, uPxRef: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) },
    uDestaque: { value: destaqueTex }, uTemDestaque: { value: 0 }, uLonge: { value: 0 }, uItem: { value: itemTex }, uTemItem: { value: 0 },
    uNevoa: { value: new THREE.Vector2(500, 1500) },
  };

  const terreno = new THREE.Mesh(geoT, new THREE.ShaderMaterial({
    uniforms: { uCob: { value: cobTex }, uMun: { value: munTex }, uPal: { value: palTex }, uDestaque: U.uDestaque, uTemDestaque: U.uTemDestaque, uNevoa: U.uNevoa,
      uPapel: { value: new THREE.Vector3(...rgb('#efe3c3')) }, uGrade: { value: new THREE.Vector4(G.x0, G.y1, G.dx * W, G.dy * H) }, uCel: { value: new THREE.Vector2(W, H) } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec4 aInfo; varying vec4 vInfo; varying vec2 vXZ; varying float vDist;
      void main() {
        vInfo = aInfo; vXZ = position.xz;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = -mv.z; gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uCob, uMun, uPal, uDestaque; uniform float uTemDestaque; uniform vec2 uNevoa, uCel; uniform vec3 uPapel; uniform vec4 uGrade;
      varying vec4 vInfo; varying vec2 vXZ; varying float vDist;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float ruido(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
      float classeEm(vec2 t) { return floor(texture2D(uCob, t).r * 255.0 + 0.5); }
      vec3 corDe(float c, float perto) {
        if (c > 0.5 && c < 1.5) { // mar: raso turquesa → fundo azul, espuma na costa
          vec3 m = mix(vec3(0.486, 0.769, 0.812), vec3(0.239, 0.561, 0.659), smoothstep(0.0, 0.7, vInfo.y));
          m = mix(m, vec3(1.0), (1.0 - smoothstep(0.0, 0.08, vInfo.y)) * 0.7);
          return m * (0.97 + 0.06 * ruido(vXZ * 1.6) * perto);
        }
        vec3 k = texture2D(uPal, vec2((c + 0.5) / 9.0, 0.5)).rgb;
        if (c > 3.5 && c < 4.5) k *= mix(1.0, 0.78 + 0.44 * ruido(vXZ * 9.0), perto) * (0.94 + 0.12 * ruido(vXZ * 1.4)); // mata: copas
        else if (c > 4.5 && c < 5.5) k *= mix(1.0, 0.92 + 0.16 * ruido(vXZ * vec2(20.0, 5.0)), perto); // pasto
        else if (c > 5.5 && c < 6.5) k *= mix(1.0, 0.9 + 0.2 * step(0.5, fract(vXZ.x * 6.0 + vXZ.y * 2.0)), perto * 0.7); // lavoura em faixas
        else if (c > 2.5 && c < 3.5) k *= 0.92 + 0.16 * ruido(vXZ * 40.0) * perto; // área urbana
        return k;
      }
      void main() {
        vec2 uv = vec2((vXZ.x - uGrade.x) / uGrade.z, (-vXZ.y - (uGrade.y - uGrade.w)) / uGrade.w);
        vec2 tuv = vec2(uv.x, 1.0 - uv.y);
        float perto = 1.0 - smoothstep(150.0, 450.0, vDist); // o detalhe fino some de longe
        // mistura suave entre as 4 células vizinhas (sem blocos de pixel de perto), com transição mais estreita que a célula
        // a borda entre classes é entortada por ruído: manchas orgânicas em vez de quadradinhos da grade de 280 m
        vec2 warp = vec2(ruido(vXZ * 5.0), ruido(vXZ * 5.0 + 17.3)) - 0.5;
        vec2 cp = tuv * uCel - 0.5 + warp * 1.2 * perto, fr = fract(cp), f = smoothstep(0.1, 0.9, fr), b0 = (floor(cp) + 0.5) / uCel, dt = 1.0 / uCel;
        float c00 = classeEm(b0), c10 = classeEm(b0 + vec2(dt.x, 0.0)), c01 = classeEm(b0 + vec2(0.0, dt.y)), c11 = classeEm(b0 + dt);
        vec3 col = mix(mix(corDe(c00, perto), corDe(c10, perto), f.x), mix(corDe(c01, perto), corDe(c11, perto), f.x), f.y);
        vec2 canto = b0 + dt * step(0.5, fr); // célula dominante (mesma da mistura de cor)
        float c = classeEm(canto);
        float mun = floor(texture2D(uMun, canto).r * 255.0 + 0.5);
        if (!(c > 0.5 && c < 1.5)) { // terra: relevo sombreado e leve frio na altitude
          float s = clamp((vInfo.x - 0.22) / 0.86, 0.0, 1.0);
          col *= 0.55 + 0.5 * s;
          col = mix(col, col * vec3(0.88, 0.94, 1.0), vInfo.w * 0.35);
        }
        if (c < 0.5) col = mix(col, uPapel, smoothstep(5.0, 40.0, vInfo.z));       // terra de fora: some no papel
        else if (c < 1.5) col = mix(col, uPapel, smoothstep(25.0, 85.0, vInfo.z)); // mar: some no papel
        else { // seleção: o resto do estado esmaece, o escolhido ganha cor
          float dest = texture2D(uDestaque, vec2((mun + 0.5) / 128.0, 0.5)).r, dim = uTemDestaque * (1.0 - dest);
          col = mix(col, mix(vec3(dot(col, vec3(0.3, 0.5, 0.2))), uPapel, 0.5), dim * 0.7);
          col *= 1.0 + 0.05 * uTemDestaque * dest;
        }
        col = mix(col, uPapel, smoothstep(uNevoa.x, uNevoa.y, vDist) * 0.5); // bruma: o fundo do mapa clareia na distância
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  terreno.frustumCulled = false;
  cena.add(terreno);
  const linhas = (arr, mat) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const l = new THREE.LineSegments(g, mat); if (mat.isLineDashedMaterial) l.computeLineDistances();
    l.frustumCulled = false; cena.add(l); return l;
  };
  linhas(segsInt, new THREE.LineBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: 0.5 }));
  linhas(segsExt, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.17, gapSize: 0.11, transparent: true, opacity: 0.95 }));

  const atlasTex = new THREE.CanvasTexture(atlas); atlasTex.flipY = false; atlasTex.generateMipmaps = true; atlasTex.minFilter = THREE.LinearMipmapLinearFilter; atlasTex.anisotropy = 4;
  const geoA = new THREE.BufferGeometry();
  geoA.setAttribute('position', new THREE.Float32BufferAttribute(alfPos, 3));
  geoA.setAttribute('aRota', new THREE.Float32BufferAttribute(alfRota, 1));
  geoA.setAttribute('aReg', new THREE.Float32BufferAttribute(alvoReg, 1));
  const alfinetes = new THREE.Points(geoA, new THREE.ShaderMaterial({
    uniforms: { uAtlas: { value: atlasTex }, uN: { value: grupos.length }, uEscalaPx: U.uEscalaPx, uPxRef: U.uPxRef, uRes: U.uRes, uItem: U.uItem, uTemItem: U.uTemItem },
    alphaToCoverage: true,
    vertexShader: /* glsl */`
      attribute float aRota; attribute float aReg;
      uniform float uEscalaPx, uPxRef, uTemItem; uniform vec2 uRes; uniform sampler2D uItem;
      varying float vRota, vLit;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        float item = uTemItem > 0.5 ? texture2D(uItem, vec2((mod(aReg, 64.0) + 0.5) / 64.0, (floor(aReg / 64.0) + 0.5) / 64.0)).r : 1.0;
        float px = clamp(uEscalaPx * 1.9 / dist, 25.0 * uPxRef, 54.0 * uPxRef);
        if (uTemItem > 0.5) px *= mix(0.8, 1.22, item); // painel aberto: só os alfinetes do item crescem
        gl_PointSize = px;
        gl_Position.y += gl_Position.w * 0.88 * px / uRes.y; // a ponta da gota fica no ponto do mapa
        gl_Position.z -= 0.002 * gl_Position.w;
        vRota = aRota; vLit = item;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uAtlas; uniform float uN, uTemItem; varying float vRota, vLit;
      void main() {
        vec4 t = texture2D(uAtlas, vec2((vRota + gl_PointCoord.x) / uN, gl_PointCoord.y));
        if (t.a < 0.02) discard;
        vec3 c = t.rgb;
        if (uTemItem > 0.5) c = mix(vec3(0.93, 0.89, 0.80), c, 0.3 + 0.7 * vLit); // fora do item: gota desbotada
        gl_FragColor = vec4(c, t.a);
      }`,
  }));
  alfinetes.frustumCulled = false;
  cena.add(alfinetes);

  // ---------- cortina holográfica no contorno do selecionado ----------
  const matCortina = new THREE.ShaderMaterial({
    uniforms: { uCor: { value: new THREE.Vector3(...rgb('#b4532a')) }, uForca: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec2 aVS; varying vec2 vVS;
      void main() { vVS = aVS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCor; uniform float uForca; varying vec2 vVS;
      void main() { float v = vVS.x; gl_FragColor = vec4(uCor, (exp(-v * 9.0) * 0.85 + (1.0 - v) * (1.0 - v) * 0.22) * uForca); }`,
  });
  const cortina = new THREE.Mesh(new THREE.BufferGeometry(), matCortina);
  cortina.frustumCulled = false;
  cortina.renderOrder = 1;
  cena.add(cortina);
  function montarCortina(segs, alturaKm) {
    const pos = [], vs = [];
    let s0 = 0;
    for (const [p, q] of segs) {
      const comp = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.max(1, Math.ceil(comp / 0.5));
      for (let k = 0; k < n; k++) {
        const xa = lerp(p[0], q[0], k / n), ya = lerp(p[1], q[1], k / n), xb = lerp(p[0], q[0], (k + 1) / n), yb = lerp(p[1], q[1], (k + 1) / n);
        const ha = chaoY(xa, ya) + 0.05, hb = chaoY(xb, yb) + 0.05, sa = s0 + (comp * k) / n, sb = s0 + (comp * (k + 1)) / n;
        pos.push(xa, ha, -ya, xb, hb, -yb, xb, hb + alturaKm, -yb, xa, ha, -ya, xb, hb + alturaKm, -yb, xa, ha + alturaKm, -ya);
        vs.push(0, sa, 0, sb, 1, sb, 0, sa, 1, sb, 1, sa);
      }
      s0 += comp;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aVS', new THREE.Float32BufferAttribute(vs, 2));
    cortina.geometry.dispose();
    cortina.geometry = g;
  }

  const posp = null; // papel não tem brilho: sem pós-processamento

  // ---------- câmera ----------
  const cam = { tx: 0, tz: 0, dist: 700, az: 0, tilt: 40 };
  let alvoY = 0;
  const livre = { w: 0.7, h: 0.75, cx: 0.35, cy: 0.5 }, desloc = { x: 0, y: 0 }; // área do mapa livre do HUD (frações da tela)
  const ajuste = { x: 0, y: 0 }; // deslize extra da vista (frações da tela) para o leque do selecionado caber na zona livre
  const valido = { tx: 0, tz: 0 };
  const limitar = () => { // limites de zoom e inclinação; o alvo nunca sai para mais de 20 km da terra do RJ
    cam.dist = clamp(cam.dist, 22, 1500); cam.tilt = clamp(cam.tilt, 2, 68);
    const j = Math.floor((cam.tx - G.x0) / G.dx), i = Math.floor((G.y1 + cam.tz) / G.dy);
    if (i >= 0 && i < H && j >= 0 && j < W && distRJ(i, j) <= 20) { valido.tx = cam.tx; valido.tz = cam.tz; }
    else { cam.tx = valido.tx; cam.tz = valido.tz; }
  };
  function aplicarCamera() {
    const a = rad(cam.az), t = rad(cam.tilt);
    camera.position.set(cam.tx + cam.dist * Math.sin(t) * Math.sin(a), alvoY + cam.dist * Math.cos(t), cam.tz + cam.dist * Math.sin(t) * Math.cos(a));
    camera.lookAt(cam.tx, alvoY, cam.tz);
    camera.near = Math.max(0.5, cam.dist * 0.02);
    camera.far = cam.dist * 5 + 900;
    // desloca o centro de projeção para o meio da área livre (o cartão ocupa a direita, o título o alto)
    camera.setViewOffset(innerWidth, innerHeight, desloc.x * innerWidth, desloc.y * innerHeight, innerWidth, innerHeight);
    camera.updateMatrixWorld();
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function raio(sx, sy) { ndc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray; }
  function chao(sx, sy) { // ponto do plano horizontal do alvo sob a posição de tela
    const { origin: o, direction: d } = raio(sx, sy);
    if (d.y > -0.02) return null;
    const t = (alvoY - o.y) / d.y;
    return [o.x + d.x * t, o.z + d.z * t];
  }
  function tocarRelevo(sx, sy) { // raycast no relevo por marcha + bisseção
    const { origin: o, direction: d } = raio(sx, sy);
    if (d.y >= 0) return null;
    const topo = yMundo(2700);
    let t = o.y > topo ? (topo - o.y) / d.y : 0;
    const passo = Math.max(0.1, cam.dist / 3000);
    for (let k = 0; k < 20000; k++, t += passo) {
      const y = o.y + d.y * t, x = o.x + d.x * t, z = o.z + d.z * t;
      if (y <= chaoY(x, -z)) {
        let a = t - passo, b = t;
        for (let s = 0; s < 12; s++) { const m = (a + b) / 2; (o.y + d.y * m <= chaoY(o.x + d.x * m, -(o.z + d.z * m)) ? (b = m) : (a = m)); }
        return [o.x + d.x * b, -(o.z + d.z * b)];
      }
      if (y < -1) return null;
    }
    return null;
  }
  const deslocar = (p0, p1) => { if (p0 && p1) { cam.tx += p0[0] - p1[0]; cam.tz += p0[1] - p1[1]; } };

  let voo = null;
  function voar(dest, ms = 1250) {
    voo?.resolver();
    const de = { ...cam };
    const daz = ((((dest.az - de.az) % 360) + 540) % 360) - 180;
    const viagem = Math.hypot(dest.tx - de.tx, dest.tz - de.tz);
    return new Promise((resolver) => {
      voo = { de, para: { ...dest, az: de.az + daz }, t0: performance.now(), ms, bump: Math.min(0.7, (viagem / (de.dist + dest.dist)) * 1.5), resolver };
    });
  }
  function passoVoo(agora) {
    if (!voo) return;
    const k = clamp((agora - voo.t0) / voo.ms, 0, 1), // agora (início do quadro) pode ser anterior a t0: k < 0 recuava a câmera
      s = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const { de, para } = voo;
    cam.tx = lerp(de.tx, para.tx, s); cam.tz = lerp(de.tz, para.tz, s);
    cam.az = lerp(de.az, para.az, s); cam.tilt = lerp(de.tilt, para.tilt, s);
    cam.dist = Math.exp(lerp(Math.log(de.dist), Math.log(para.dist), s)) * (1 + voo.bump * 4 * s * (1 - s));
    if (k >= 1) { const r = voo.resolver; voo = null; r(); }
  }
  function quadro(bb, az, tilt, folga = 1.06) { // distância que enquadra os 4 cantos do retângulo na área livre
    const a = rad(az), t = rad(tilt);
    const f = [-Math.sin(t) * Math.sin(a), -Math.cos(t), -Math.sin(t) * Math.cos(a)];
    const nr = Math.hypot(f[2], f[0]), r = [-f[2] / nr, 0, f[0] / nr];
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
    const th = Math.tan(rad(FOV / 2)) * camera.aspect * livre.w, tv = Math.tan(rad(FOV / 2)) * livre.h;
    let dist = 1;
    for (const [x, y] of [[bb[0], bb[1]], [bb[2], bb[1]], [bb[0], bb[3]], [bb[2], bb[3]]]) {
      const px = x - cx, pz = -(y - cy);
      const qx = px * r[0] + pz * r[2], qy = px * u[0] + pz * u[2], qf = px * f[0] + pz * f[2];
      dist = Math.max(dist, (Math.abs(qx) * folga) / th - qf, (Math.abs(qy) * folga) / tv - qf);
    }
    return { tx: cx, tz: -cy, dist: clamp(dist, 45, 1500), az, tilt }; // enquadramento automático não desce de 45 km
  }
  const uniaoBB = (ms) => ms.reduce((b, m) => [Math.min(b[0], m.bb[0]), Math.min(b[1], m.bb[1]), Math.max(b[2], m.bb[2]), Math.max(b[3], m.bb[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  const bbEstado = uniaoBB(municipios);

  // ---------- seleção, cartão e rótulos ----------
  let selecao = { tipo: 'estado' }, destaqueAlvo = 0;
  const membrosDe = (r) => r.municipios.map((c) => municipios[porCodigo.get(c) - 1]);
  function somar(ms) {
    const s = { total: 0, pontuais: 0, nao_pontuais: 0, camadas: {}, eixos: {}, tipos: {}, sem_tipo: 0 };
    for (const m of ms) {
      const a = agregados[m.codigo], c = contas[m.codigo];
      if (a) { s.total += a.total; s.pontuais += a.pontuais; s.nao_pontuais += a.nao_pontuais; }
      if (!c) continue;
      for (const l of NOMES_LENTE) for (const [g, n] of Object.entries(c[l])) s[l][g] = (s[l][g] || 0) + n;
      s.sem_tipo += c.sem_tipo;
    }
    return s;
  }
  const NS = 'http://www.w3.org/2000/svg';
  function glifo(simbolo, cor) {
    const s = document.createElementNS(NS, 'svg'), [tag, atr] = SIMBOLO[simbolo];
    s.setAttribute('viewBox', '0 0 24 24');
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(atr)) e.setAttribute(k, v);
    e.setAttribute(atr.fill === 'none' ? 'stroke' : 'fill', cor);
    s.append(e);
    return s;
  }
  function preencherCartao() {
    let olho, nome, ag;
    if (selecao.tipo === 'municipio') {
      const m = selecao.m;
      olho = regiaoDe.get(m.regiao_id)?.nome ?? m.regiao; nome = m.nome; ag = somar([m]);
    } else if (selecao.tipo === 'regiao') {
      const ms = membrosDe(selecao.r);
      olho = t('Região turística · {n} municípios', { n: ms.length }); nome = selecao.r.nome; ag = somar(ms);
    } else {
      olho = 'Todo o estado'; nome = 'Estado do Rio de Janeiro';
      ag = somar(Object.keys(agregados).map((codigo) => ({ codigo }))); // inclui registros sem município
    }
    const h2 = $('c-nome');
    $('c-olho').textContent = olho; h2.textContent = nome; h2.style.fontSize = '';
    $('c-olho').classList.toggle('subir', selecao.tipo === 'municipio' && !!regiaoDe.get(selecao.m.regiao_id)); // município: a região no olho leva à região
    $('c-total').textContent = fmt(ag.total);
    $('c-total-rot').textContent = ag.total === 1 ? 'lugar para visitar' : 'lugares para visitar';
    $('c-sub').hidden = true; // quantos têm ponto exato é assunto de quem mantém o mapa: fica em "Sobre o mapa"
    // lista da lente ativa: todos os itens sempre (o cartão é também a legenda: cor + símbolo + nome)
    const L = LENTES[lente], vals = ag[lente], duas = L.itens.length > 9; // muitos itens: duas colunas, nome curto, sem barra
    $('cartao').classList.toggle('compacto', duas);
    // nome numa linha só: o mais longo (São José do Vale do Rio Preto) encolhe a letra em vez de quebrar e empurrar o cartão
    if (h2.scrollWidth > h2.clientWidth) h2.style.fontSize = `${((parseFloat(getComputedStyle(h2).fontSize) * h2.clientWidth) / h2.scrollWidth / remPx).toFixed(3)}rem`;
    $('c-grupos-titulo').textContent = TITULO_LENTE[lente];
    $('leitura').textContent = 'Toque num município, num alfinete ou numa rota para descobrir o que visitar.';
    $('c-lente').setAttribute('aria-labelledby', `c-aba-${lente}`);
    $('c-nota').textContent = L.nota ?? ''; $('c-nota').hidden = !L.nota; // eixos e tipos não são exclusivos: não somar
    const ul = $('c-grupos'); ul.replaceChildren(); ul.classList.toggle('duas', duas);
    const max = Math.max(1, ...L.itens.map((it) => vals[it.slug] || 0));
    for (const it of L.itens) {
      const v = vals[it.slug] || 0;
      const li = document.createElement('li'), nm = document.createElement('span'), n = document.createElement('span');
      li.dataset.slug = it.slug;
      if (!v) li.className = 'zero';
      else {
        li.style.cursor = 'pointer';
        // item da legenda: realça a rota (ou experiência, ou produto) no recorte selecionado; tocar de novo desfaz
        li.addEventListener('click', () => {
          const chave = recorte(null).chave;
          if (itemAberto && itemAberto.municipio === chave && itemAberto.lente === lente && itemAberto.slugs.length === 1 && itemAberto.slugs[0] === it.slug) fecharItem();
          else { fecharFicha(); abrirItem(null, [it.slug]); }
        });
      }
      nm.className = 'nome'; nm.textContent = it.curto; nm.title = it.nome; n.className = 'n'; n.textContent = v ? fmt(v) : '—';
      li.append(glifo(it.simbolo, it.cor), nm);
      if (!duas) {
        const tr = document.createElement('span'), barra = document.createElement('i');
        tr.className = 'trilho'; barra.style.background = it.cor; barra.style.boxShadow = `0 0 .6rem ${it.cor}`;
        barra.style.width = v ? `${Math.max(2, (100 * v) / max)}%` : '0';
        tr.append(barra); li.append(tr);
      }
      li.append(n); ul.append(li);
    }
    if (itemAberto) marcarLegenda();
    const st = $('c-semtipo'); st.hidden = !L.sem_tipo; // registros sem tipo: leitura de lentes.json e contagem do recorte, em tom neutro
    if (L.sem_tipo) { const t = document.createElement('span'), b = document.createElement('b'); t.textContent = L.sem_tipo.leitura; b.textContent = fmt(ag.sem_tipo); st.replaceChildren(t, b); }
    requestAnimationFrame(medirHud);
  }

  // A lente altera só a classificação do mesmo recorte; o total, a seleção e o passeio permanecem.
  const abas = $('c-abas');
  function trocarLente(alvo, focar = false) {
    if (!LENTES[alvo]) return;
    fecharItem();
    lente = alvo;
    for (const botao of abas.children) {
      const ativo = botao.dataset.lente === alvo;
      botao.setAttribute('aria-selected', String(ativo));
      botao.tabIndex = ativo ? 0 : -1;
      if (ativo && focar) botao.focus();
    }
    preencherCartao();
    medirHud();
  }
  for (const [slug, nome] of [['camadas', 'Rotas'], ['eixos', 'Quero…'], ['tipos', 'Produtos']]) {
    const botao = document.createElement('button');
    botao.id = `c-aba-${slug}`; botao.type = 'button'; botao.dataset.lente = slug;
    botao.textContent = nome; botao.setAttribute('role', 'tab'); botao.setAttribute('aria-controls', 'c-lente');
    botao.setAttribute('aria-selected', String(slug === lente)); botao.tabIndex = slug === lente ? 0 : -1;
    botao.addEventListener('click', () => trocarLente(slug));
    abas.append(botao);
  }
  abas.addEventListener('keydown', (e) => {
    const nomes = ['camadas', 'eixos', 'tipos'], i = nomes.indexOf(lente);
    const alvo = e.key === 'ArrowRight' ? nomes[(i + 1) % nomes.length]
      : e.key === 'ArrowLeft' ? nomes[(i + nomes.length - 1) % nomes.length]
        : e.key === 'Home' ? nomes[0] : e.key === 'End' ? nomes[nomes.length - 1] : null;
    if (alvo) { e.preventDefault(); trocarLente(alvo, true); }
  });

  const camadaRot = $('rotulos');
  const rotulos = municipios.map((m, k) => {
    const el = document.createElement('div');
    el.className = 'rot'; el.textContent = m.nome;
    camadaRot.append(el);
    return { el, m, id: k + 1, p: new THREE.Vector3(m.ancora[0], chaoY(...m.ancora) + 0.4, -m.ancora[1]), w: 0, h: 0, sx: 0, sy: 0, ok: false, prio: 0, vis: false, tx: '', cls: '' };
  });
  const ordemRot = [...rotulos];
  let obstaculos = [], zona = [0, 0, 1, 1], larguraLivre = 60, alturaLivre = 30; // zona: retângulo do mapa livre do HUD (px); larguraLivre e alturaLivre em rem
  function medirHud() {
    for (const r of rotulos) { const k = r.el.classList.contains('sel') ? 1 / 1.27 : 1; r.w = r.el.offsetWidth * k; r.h = r.el.offsetHeight * k; }
    for (const k of marcas) { k.ew = k.etq.offsetWidth; k.eh = k.etq.offsetHeight; }
    remPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const fichaEl = $('ficha'); // por id: medirHud roda antes de o bloco da ficha ser definido
    for (const [painel, larg] of [[painelI, 34], [fichaEl, 40]]) { // painéis da esquerda ("o que tem aqui" e ficha): nunca por cima do cartão
      if (painel.hidden) continue;
      const xl = 2 * remPx;
      painel.style.left = `${xl}px`; painel.style.width = `${Math.min(larg * remPx, $('cartao').getBoundingClientRect().left - 0.8 * remPx - xl)}px`;
    }
    obstaculos = ['titulo', 'cartao', 'bussola', 'rodape', 'convite', 'controles', 'fontes', 'item', 'ficha'].map((id) => $(id)).filter((e) => !e.hidden).map((e) => e.getBoundingClientRect());
    const c = $('cartao').getBoundingClientRect(), t = $('titulo').getBoundingClientRect(), rd = $('rodape').getBoundingClientRect();
    document.documentElement.style.setProperty('--rodape-h', `${rd.height}px`);
    document.documentElement.style.setProperty('--titulo-b', `${t.bottom}px`);
    const x0 = 0; // sem painel de legenda
    const folha = innerWidth <= 900; // celular: cartão, lista e ficha são folhas na base; o mapa fica entre o título e a folha mais alta
    const base = folha ? Math.min(rd.top, ...[$('cartao'), painelI, fichaEl, $('fontes')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect().top)) : rd.top;
    livre.w = folha ? 1 : clamp((c.left - x0) / innerWidth, 0.4, 1); livre.cx = x0 / innerWidth + livre.w / 2;
    livre.h = clamp((base - t.bottom) / innerHeight, folha ? 0.2 : 0.4, 1); livre.cy = (base + t.bottom) / 2 / innerHeight;
    // zona onde o leque do selecionado e o nome dele devem caber (ajuste, em atualizarRotulos): entre a legenda e o cartão, abaixo do título,
    // acima da bússola, dos botões e do convite do passeio
    const mg = 0.6 * remPx, cv = $('convite');
    zona = [Math.max(x0, painelI.hidden ? 0 : painelI.getBoundingClientRect().right, fichaEl.hidden ? 0 : fichaEl.getBoundingClientRect().right) + mg, t.bottom + mg, c.left - mg, Math.min($('bussola').getBoundingClientRect().top, $('controles').getBoundingClientRect().top, cv.hidden ? Infinity : cv.getBoundingClientRect().top) - mg];
    if (folha) zona = [mg, t.bottom + mg, innerWidth - mg, base - mg]; // celular: o mapa livre é a faixa entre o título e a folha mais alta
    larguraLivre = (zona[2] - zona[0]) / remPx; alturaLivre = (zona[3] - zona[1]) / remPx;
  }
  // ---------- marcações (DOM sobreposto: sempre por cima do relevo, nítidas em 4K) ----------
  // Longe: uma etiqueta por município com o total, presa por um fio ao ponto de rótulo.
  // Selecionado ou câmera perto: um ladrilho por grupo (forma e cor da legenda + número), em leque, com fios até o ponto.
  const PERTO_KM = 140; // distância da câmera abaixo da qual os municípios sem seleção também abrem em ladrilhos
  const camadaMarcas = $('marcas');
  const marcas = [];
  const outrosIds = new Set(['3300456', '3302858', '3303203', '3304904', '3305109']); // municípios sem guia rural, excluem das marcas grandes
  municipios.forEach((m, id) => {
    const ag = agregados[m.codigo];
    if (!ag?.total || outrosIds.has(m.codigo)) return;
    const el = document.createElement('div'), etq = document.createElement('b'), n = document.createElement('span'), nm = document.createElement('span');
    el.className = 'marca';
    etq.style.setProperty('--k', (1 + 0.12 * Math.log10(ag.total)).toFixed(3)); // piso legível + leve aumento por log
    etq.className = 'etq'; n.className = 'n'; n.textContent = fmt(ag.total); nm.className = 'nm'; nm.textContent = m.nome;
    etq.append(n, nm); // número e nome na mesma borda: o nome nunca fica solto perto de outro número
    const fio = document.createElement('i'), pe = document.createElement('i');
    fio.className = 'fio'; pe.className = 'pe';
    el.append(fio, pe, etq);
    camadaMarcas.append(el);
    marcas.push({ id, m, ag, el, etq, leque: null, bb: null, p: new THREE.Vector3(m.ancora[0], chaoY(...m.ancora) + 0.4, -m.ancora[1]),
      ew: 0, eh: 0, sx: 0, sy: 0, ok: false, sel: false, fora: false, prio: 0, modo: '', ret: null, pos: -1, txE: '', txL: '', cls: '', lv: false });
  });
  const ordemMarcas = [...marcas];
  const maiores = new Set([...marcas].sort((a, b) => b.ag.total - a.ag.total).slice(0, 8)); // sempre entram na vista sem seleção
  // posições da etiqueta em relação ao pé (rem): [x, y do encaixe, lado (-1 esquerda, 0 centro, 1 direita), -1 acima / 0 meio / 1 abaixo]
  const CAND = [[0, -2.4, 0, -1], [-1.8, -2.8, -1, -1], [1.8, -2.8, 1, -1], [0, 2.4, 0, 1], [-2.4, 0, -1, 0], [2.4, 0, 1, 0], // todos: acima, diagonais, abaixo (mar, baía), lados
    [0, -5.4, 0, -1], [-3.8, -4.8, -1, -1], [3.8, -4.8, 1, -1], [0, 5, 0, 1], [-4.5, 3.8, -1, 1], [4.5, 3.8, 1, 1], [-6, 0, -1, 0], [6, 0, 1, 0],
    [0, 8, 0, 1], [-7, 6.5, -1, 1], [7, 6.5, 1, 1], [0, -8.5, 0, -1], [-9, 0, -1, 0], [9, 0, 1, 0]]; // fio longo: só os maiores; reserva só a caixa (o pé já está reservado)
  const NC_TODOS = 6;
  const ESTILO_CAND = CAND.map(([ax, ay, lado, vy]) => `--ex:calc(${ax}rem + ${lado ? (lado < 0 ? -100 : 0) : -50}%);--ey:calc(${ay}rem + ${vy ? (vy < 0 ? -100 : 0) : -50}%);`
    + `--fl:${Math.hypot(ax, ay).toFixed(2)}rem;--fa:${Math.atan2(ay, ax).toFixed(4)}rad`);
  function retCand(k, c) {
    const [ax, ay, lado, vy] = CAND[c], x0 = k.sx + ax * remPx - (lado ? (lado < 0 ? k.ew : 0) : k.ew / 2), y0 = k.sy + ay * remPx - (vy ? (vy < 0 ? k.eh : 0) : k.eh / 2);
    return [x0, y0, x0 + k.ew, y0 + k.eh];
  }
  let remPx = 19.2;
  // Leque da lente ativa: um ladrilho por item presente no município, do maior para o menor (empate na ordem de lentes.json).
  // Acima do teto, os maiores e um "+N" que soma o resto. ∩ de duas colunas com teto 9 (20 rem de altura: cabe entre o título e a
  // bússola em 1920x1080); se o ∩ não cabe na largura livre (legenda do Ouvir aberta), uma coluna acima do ponto, com o teto
  // que a altura livre comporta (provar-interface.mjs, seção lentes: nenhum ladrilho cruza a legenda nem o HUD).
  const TETO = 9, LH = 3.2, DY = 3.9, DY1 = 3.6, OUTROS = 'outros', COR_RESTO = '#cfe3e6';
  const largMin = {}; // rem: largura do ladrilho com o rótulo e o número mais longos da lente, igual em todo município (o rural com um ladrilho não parece "menor")
  function ladrilho(cor, disco, numero, rotulo) {
    const lad = document.createElement('div'), d = document.createElement('span'), tx = document.createElement('span'), num = document.createElement('b'), nome = document.createElement('small');
    lad.className = 'lad'; lad.style.setProperty('--c', cor);
    d.className = 'disco'; d.append(disco);
    num.textContent = numero; nome.textContent = rotulo;
    tx.append(num, nome); lad.append(d, tx);
    return lad;
  }
  function larguraMin(l) {
    if (largMin[l]) return largMin[l];
    // número mais longo possível: a maior soma da lente num município (cobre qualquer item e qualquer "+N")
    const maior = Math.max(...Object.values(contas).map((c) => Object.values(c[l]).reduce((s, n) => s + n, 0)));
    const sonda = ladrilho('#fff', glifo('circulo', '#fff'), fmt(maior), ''), rot = sonda.querySelector('small');
    sonda.style.visibility = 'hidden'; camadaMarcas.append(sonda);
    let w = 0;
    for (const t of [...LENTES[l].itens.map((it) => it.curto), OUTROS]) { rot.textContent = t; w = Math.max(w, sonda.offsetWidth); }
    sonda.remove();
    return (largMin[l] = w / remPx);
  }
  function descartarLeque(k) { k.leque.remove(); k.leque = null; k.lv = false; k.txL = ''; }
  function criarLeque(k) { // por município, lente e faixa livre, na primeira vez que abre; posições em rem (escala com a tela)
    const L = LENTES[lente], v = contas[k.m.codigo][lente];
    const itens = L.itens.filter((it) => v[it.slug]).sort((a, b) => v[b.slug] - v[a.slug]); // sort estável
    const lw = larguraMin(lente), coluna = 2 * lw + 1.8 > larguraLivre;
    const teto = coluna ? clamp(Math.floor((alturaLivre - 2.8 - LH / 2 - 6) / DY1) + 1, 2, TETO) : TETO; // 6 rem: nome do município, abaixo do ponto
    const vistos = itens.length > teto ? itens.slice(0, teto - 1) : itens, resto = itens.slice(vistos.length);
    const lads = vistos.map((it) => { const l = ladrilho(it.cor, glifo(it.simbolo, it.cor), fmt(v[it.slug]), it.curto); l.dataset.slug = it.slug; return l; });
    if (resto.length) {
      const mais = document.createElement('span');
      mais.textContent = `+${resto.length}`;
      const l = ladrilho(COR_RESTO, mais, fmt(resto.reduce((s, it) => s + v[it.slug], 0)), OUTROS);
      l.classList.add('resto'); l.dataset.resto = resto.map((it) => it.slug).join(' ');
      lads.push(l);
    }
    const el = document.createElement('div');
    el.className = 'leque';
    el.append(...lads);
    camadaMarcas.append(el);
    const n = lads.length, s = Math.floor(n / 2), apice = n % 2 === 1;
    // as linhas de baixo abrem para fora até 1,4 rem por linha; menos se o leque não couber na faixa livre (legenda do Ouvir aberta)
    const ab = s > 1 ? clamp((larguraLivre / 2 - lw - 0.9) / (s - 1), 0, 1.4) : 0;
    const lado = (j) => [lw / 2 + 0.9 + ab * j, -(2.8 + (s - 1 - j) * DY)]; // j = 0 no alto
    const fios = [], bb = [-2, -2, 2, 1.2];
    lads.forEach((lad, i) => { // ao redor do ∩: coluna esquerda de baixo para cima, ápice, coluna direita de cima para baixo
      let x, y;
      if (coluna) [x, y] = [0, -(2.8 + (n - 1 - i) * DY1)]; // coluna: o maior no alto, o "+N" junto do ponto
      else if (i < s) { [x, y] = lado(s - 1 - i); x = -x; }
      else if (apice && i === s) [x, y] = [0, (s ? lado(0)[1] : -0.4) - DY];
      else [x, y] = lado(i - s - (apice ? 1 : 0));
      const fio = document.createElement('i');
      fio.className = 'fio-l';
      fio.style.cssText = `width:${Math.hypot(x, y).toFixed(2)}rem;transform:rotate(${Math.atan2(y, x).toFixed(4)}rad);--c:${lad.style.getPropertyValue('--c')}`;
      lad.style.transform = `translate(calc(${x.toFixed(2)}rem - 50%),calc(${y.toFixed(2)}rem - 50%))`;
      lad.style.minWidth = `${lw.toFixed(2)}rem`;
      fios.push(fio);
      bb[0] = Math.min(bb[0], x - lw / 2); bb[2] = Math.max(bb[2], x + lw / 2); bb[1] = Math.min(bb[1], y - LH / 2); bb[3] = Math.max(bb[3], y + LH / 2);
    });
    const cubo = document.createElement('i');
    cubo.className = 'cubo';
    el.prepend(...fios, cubo);
    k.leque = el; k.bb = bb; k.chave = chaveLeque();
  }
  const chaveLeque = () => `${lente} ${larguraLivre.toFixed(1)} ${alturaLivre.toFixed(1)}`;

  const v3 = new THREE.Vector3(), colocados = [];
  let margem = 0, nObst = 0;
  function cabe(x0, y0, x1, y1, ate = Infinity, ignora = -1) { // ate: testar só as primeiras caixas (nObst = só o HUD); ignora: o próprio pé
    if (x0 < 0 || y0 < 0 || x1 > innerWidth || y1 > innerHeight) return false;
    for (let i = 0, fim = Math.min(ate, colocados.length); i < fim; i += 4) if (i !== ignora) if (x0 - margem < colocados[i + 2] && x1 + margem > colocados[i] && y0 - margem < colocados[i + 3] && y1 + margem > colocados[i + 1]) return false;
    return true;
  }
  const ocupar = (x0, y0, x1, y1) => colocados.push(x0, y0, x1, y1);
  function atualizarMarcas(w, h, regSel, comRotulo) {
    const perto = cam.dist < PERTO_KM, comSel = selecao.tipo === 'municipio';
    for (const k of marcas) {
      v3.copy(k.p).project(camera);
      k.ok = v3.z > -1 && v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1;
      k.sx = ((v3.x + 1) / 2) * w; k.sy = ((1 - v3.y) / 2) * h;
      k.sel = comSel && selecao.m === k.m;
      k.fora = (comSel && !k.sel) || (!!regSel && !regSel.has(k.m.codigo));
      k.prio = (k.sel ? -1e9 : k.fora ? 0 : -1e6) - k.ag.total; // selecionado, depois a região, depois a maior contagem
    }
    ordemMarcas.sort((a, b) => a.prio - b.prio);
    const pe = 0.8 * remPx;
    for (const k of maiores) { // pés dos maiores reservados antes: nenhuma etiqueta cobre o ponto de outro município grande
      k.iPe = k.ok && !(comSel && k.fora) ? colocados.length : -1;
      if (k.iPe >= 0) ocupar(k.sx - pe, k.sy - pe, k.sx + pe, k.sy + pe);
    }
    for (const k of ordemMarcas) {
      let modo = '';
      if (k.ok) {
        if (k.sel || (perto && !comSel)) {
          if (k.leque && k.chave !== chaveLeque()) descartarLeque(k); // outra lente ou outra faixa livre: refaz
          if (!k.leque) criarLeque(k);
          const x0 = k.sx + k.bb[0] * remPx, y0 = k.sy + k.bb[1] * remPx, x1 = k.sx + k.bb[2] * remPx, y1 = k.sy + k.bb[3] * remPx;
          const mg = 1.5 * remPx; // folga em volta do leque: nenhum nome vizinho encosta nos ladrilhos
          if (k.sel || cabe(x0, y0, x1, y1, Infinity, k.iPe ?? -1)) { modo = 'leque'; ocupar(x0 - mg, y0 - mg, x1 + mg, y1 + mg); }
        }
        if (!modo && !(comSel && k.fora)) { // com município aberto, as etiquetas dos outros somem (foco no leque)
          const forcar = maiores.has(k) && !k.fora, nc = maiores.has(k) ? CAND.length : NC_TODOS;
          let u = null;
          for (const ate of forcar ? [Infinity, nObst] : [Infinity]) { // 2ª volta só para os maiores: respeita o HUD, não as menores
            for (let c = 0; c < nc && !u; c++) {
              const q = retCand(k, c), t = c >= NC_TODOS ? q : [Math.min(q[0], k.sx - pe), Math.min(q[1], k.sy - pe), Math.max(q[2], k.sx + pe), Math.max(q[3], k.sy + pe)];
              if (cabe(...t, ate, k.iPe ?? -1)) { u = t; k.ret = q; if (c !== k.pos) { k.el.style.cssText = ESTILO_CAND[c]; k.pos = c; k.txE = ''; } }
            }
            if (u) break;
          }
          if (u) { modo = 'etq'; ocupar(...u); }
        }
      }
      k.modo = modo;
      const pos = `translate3d(${k.sx.toFixed(1)}px,${k.sy.toFixed(1)}px,0)`;
      if (modo === 'etq' && pos !== k.txE) { k.el.style.transform = pos; k.txE = pos; }
      if (modo === 'leque' && pos !== k.txL) { k.leque.style.transform = pos; k.txL = pos; }
      const cls = 'marca' + (modo === 'etq' ? ' vis' : '') + (k.sel ? ' sel' : '') + (k.fora ? ' fora' : '');
      if (cls !== k.cls) { k.el.className = cls; k.cls = cls; }
      if (k.leque && (modo === 'leque') !== k.lv) { k.lv = modo === 'leque'; k.leque.classList.toggle('vis', k.lv); }
      if (k.ok) comRotulo(rotulos[k.id], modo === 'leque'); // leque: nome no ponto de convergência; etiqueta: o nome já está dentro; suprimida: sem nome solto
    }
  }
  function atualizarRotulos() {
    const w = innerWidth, h = innerHeight, fx = w * livre.cx, fy = h * livre.cy;
    margem = w * 0.004;
    const regSel = selecao.tipo === 'regiao' ? new Set(selecao.r.municipios) : null, longe = cam.dist > 320;
    for (const r of rotulos) {
      v3.copy(r.p).project(camera);
      r.ok = v3.z > -1 && v3.z < 1 && Math.abs(v3.x) < 1.02 && Math.abs(v3.y) < 1.02;
      r.sx = ((v3.x + 1) / 2) * w; r.sy = ((1 - v3.y) / 2) * h;
      r.sel = selecao.tipo === 'municipio' && selecao.m === r.m;
      r.reg = !!regSel?.has(r.m.codigo);
      r.prio = (r.sel ? -1e9 : r.reg ? -1e6 : 0) + (longe ? -r.m.area_km2 : Math.hypot(r.sx - fx, r.sy - fy));
    }
    ordemRot.sort((a, b) => a.prio - b.prio);
    colocados.length = 0;
    for (const o of obstaculos) ocupar(o.left, o.top, o.right, o.bottom);
    nObst = colocados.length;
    // abaixo do cubo do leque; o selecionado leva a linha "posição aproximada" (::after) logo abaixo do nome
    const caixa = (r) => { const k = r.sel ? 1.27 : 1, rw = r.w * k, x = r.sx - rw / 2, y = r.sy + 1.3 * remPx; return [x, y, x + rw, y + r.h * k + (r.sel ? 1.7 * remPx : 0)]; };
    // ordem de reserva: rótulo do selecionado, marcações, demais rótulos
    const selR = ordemRot[0].sel && ordemRot[0].ok ? ordemRot[0] : null;
    if (selR) ocupar(...caixa(selR));
    let mostrados = 0;
    const feitos = new Set();
    const comRotulo = (r, pode = true) => { // pode = false: o município já tem nome na etiqueta, ou a marca foi suprimida
      if (feitos.has(r)) return;
      feitos.add(r);
      let vis = false;
      if (pode && r.ok && (r === selR || mostrados < (longe ? 10 : 16))) {
        const q = caixa(r);
        if (r === selR || cabe(...q)) {
          vis = true; mostrados++;
          if (r !== selR) ocupar(...q);
          const tx = `translate3d(${q[0].toFixed(1)}px,${q[1].toFixed(1)}px,0)`;
          if (tx !== r.tx) { r.el.style.transform = tx; r.tx = tx; }
        }
      }
      const cls = 'rot' + (vis ? ' vis' : '') + (r.sel ? ' sel' : '') + (r.reg ? ' reg' : '');
      if (cls !== r.cls) { r.el.className = cls; r.cls = cls; }
    };
    atualizarMarcas(w, h, regSel, comRotulo); // etiqueta e nome do mesmo município entram juntos, na ordem das marcações
    for (const r of ordemRot) comRotulo(r);
    // Leque e nome do selecionado dentro da zona livre (fora da legenda do Ouvir, do cartão, do título e dos botões): a vista
    // desliza o que faltar. setViewOffset só translada a tela, então a conta parte da posição sem ajuste e não realimenta.
    // Com dedo na tela, o ajuste fica como está (não briga com o arrasto).
    if (!ptrs.size) {
      const ks = marcas.find((k) => k.sel && k.modo === 'leque');
      if (ks) {
        const r = rotulos[ks.id], rw = (r.w * 1.27) / 2, bx = ks.sx + (desloc.x - 0.5 + livre.cx) * w, by = ks.sy + (desloc.y - 0.5 + livre.cy) * h;
        const encaixe = (lo, hi) => (lo > hi ? (lo + hi) / 2 : clamp(0, lo, hi)); // px que faltam; maior que a zona: centra
        ajuste.x = encaixe(zona[0] - bx - Math.min(ks.bb[0] * remPx, -rw), zona[2] - bx - Math.max(ks.bb[2] * remPx, rw)) / w;
        ajuste.y = encaixe(zona[1] - by - ks.bb[1] * remPx, zona[3] - by - Math.max(ks.bb[3] * remPx, r.h * 1.27 + 3 * remPx)) / h;
      } else ajuste.x = ajuste.y = 0;
    }
  }

  function aplicarDestaque(ids) {
    destaqueDados.fill(0);
    for (const id of ids) destaqueDados[id * 4] = 255;
    destaqueTex.needsUpdate = true;
  }
  function selecionar(sel, ms = 1250, vista = {}) {
    if (sel.tipo !== 'municipio' || sel.m !== selecao.m) fecharFicha(); // outro município, região ou o estado inteiro
    fecharItem();
    selecao = sel;
    const cartao = $('cartao');
    cartao.classList.add('trocando');
    setTimeout(() => { preencherCartao(); cartao.classList.remove('trocando'); }, 180);
    let bb, tilt, segs;
    if (sel.tipo === 'municipio') {
      aplicarDestaque([porCodigo.get(sel.m.codigo)]);
      segs = arestasDe(sel.m); bb = sel.m.bb; tilt = 52;
      matCortina.uniforms.uCor.value.set(...rgb('#b4532a'));
      montarCortina(segs, 3.2); destaqueAlvo = 1;
    } else if (sel.tipo === 'regiao') {
      const ms = membrosDe(sel.r);
      aplicarDestaque(ms.map((m) => porCodigo.get(m.codigo)));
      const cont = new Map();
      for (const m of ms) for (const [p, q] of arestasDe(m)) { const k = chave(p, q); const c = cont.get(k); c ? c.n++ : cont.set(k, { p, q, n: 1 }); }
      segs = [...cont.values()].filter((c) => c.n === 1).map((c) => [c.p, c.q]);
      bb = uniaoBB(ms); tilt = 46; vista = { folga: 1.14, ...vista };
      matCortina.uniforms.uCor.value.set(...rgb('#d9a21b'));
      montarCortina(segs, 4.5); destaqueAlvo = 1;
    } else {
      aplicarDestaque([]); bb = bbEstado; tilt = 38; destaqueAlvo = 0;
    }
    return voar(quadro(bb, vista.az ?? (sel.tipo === 'estado' ? 0 : cam.az), vista.tilt ?? tilt, vista.folga ?? (sel.tipo === 'estado' ? 1.24 : undefined)), ms);
  }

  // ---------- HUD fixo (tudo lido dos dados) ----------
  const munComAtrativo = Object.keys(agregados).filter((c) => porCodigo.has(c) && agregados[c].total > 0).length;
  const subtitulo = () => { $('subtitulo').textContent = t('{n} lugares do campo para visitar, provar e viver, em {m} municípios fluminenses', { n: fmt(meta.total), m: fmt(munComAtrativo) }); };
  subtitulo();
  $('l-exag').textContent = `${EXAG}×`;
  // rodapé mínimo + painel ⓘ com as fontes completas
  const rb = $('r-base'), precisaoTotal = (cl) => regJ.precisoes.find((p) => p.classe === cl)?.total ?? 0;
  const montarFontes = () => {
    $('f-lista').replaceChildren();
    const nA = precisaoTotal('endereco'), nR = precisaoTotal('referencia'), nM = precisaoTotal('municipal');
    for (const [titulo, texto] of [
      ['Lugares de Turismo Rural', `${t(meta.fonte)}. ${t('Base {v}, corte {d}.', { v: meta.versao_base, d: dataBR(meta.data_corte) })} ${t(meta.aviso)} ${t(meta.ressalvas.ausencia)}`],
      ['Localização', t('Ponto exato: coordenada do QR "Ver mapa" impresso no guia ({a} lugares). Aproximado: o QR do guia aponta só o bairro, ou o endereço do guia foi geocodificado no OpenStreetMap/Nominatim ({b}). Sem ponto: o guia não traz coordenada utilizável e o lugar conta só no município ({c}).', { a: fmt(nA), b: fmt(nR), c: fmt(nM) })],
      ['Rotas', t('Rotas temáticas sugeridas para promoção, atribuídas por palavras-chave do nome e da descrição de cada lugar; não são rotas oficiais.')],
      ['Relevo', `${t(altJ.atribuicao)} ${t('Ano {a}.', { a: altJ.ano })} ${t('Licença: {l}. Extraído em {d}.', { l: altJ.licenca, d: dataBR(altJ.data_extracao) })}`],
      ['Cobertura do solo', `${t(cobJ.atribuicao)} ${t('Licença: {l}. Extraído em {d}.', { l: cobJ.licenca, d: dataBR(cobJ.data_extracao) })}`],
      ['Malha municipal', `${t(munJ.meta.nota_malha)} ${t('Base {v}, corte {d}.', { v: `v${munJ.meta.versao_base_malha}`, d: dataBR(munJ.meta.data_corte_malha) })} ${t('Regiões turísticas: composição listada nas capas dos 12 guias Turismo Rural RJ.')}`],
    ]) linhaFonte(t(titulo), texto);
  };
  function linhaFonte(titulo, texto) {
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = titulo; dd.textContent = texto;
    $('f-lista').append(dt, dd);
  }
  montarFontes();
  // busca: município (aproxima e mostra o nome) ou lugar (abre a ficha); sugestões nativas do navegador
  const busca = $('busca'), semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  $('busca-opcoes').append(...[...municipios.map((m) => m.nome), ...Object.values(ficJ).map((f) => `${f.nome} · ${f.municipio}`)]
    .map((v) => Object.assign(document.createElement('option'), { value: v })));
  const rotularBusca = () => { busca.placeholder = t('Buscar município ou lugar'); busca.setAttribute('aria-label', busca.placeholder); };
  rotularBusca();
  function buscar() {
    const v = semAcento(busca.value);
    if (!v) return;
    const m = municipios.find((x) => semAcento(x.nome) === v) ?? (v.length >= 3 && municipios.find((x) => semAcento(x.nome).startsWith(v)));
    const cod = !m && Object.keys(ficJ).find((c) => semAcento(`${ficJ[c].nome} · ${ficJ[c].municipio}`) === v || semAcento(ficJ[c].nome) === v);
    if (m) { fecharFicha(); fecharItem(); selecionar({ tipo: 'municipio', m }); }
    else if (cod) abrirFicha(cod);
    else return;
    busca.value = ''; busca.blur(); interagiu();
  }
  busca.addEventListener('change', buscar);
  busca.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') buscar(); }); // teclas do mapa (1/2/3, N, F) não valem dentro da busca
  const painelF = $('fontes'), botaoInfo = $('info');
  function mostrarFontes(abrir) {
    if (painelF.hidden === !abrir) return;
    painelF.hidden = !abrir;
    botaoInfo.setAttribute('aria-expanded', String(abrir));
    medirHud(); // o painel aberto entra como obstáculo das marcações
  }
  botaoInfo.addEventListener('click', (e) => { e.currentTarget.blur(); mostrarFontes(painelF.hidden); });
  $('fechar').addEventListener('click', (e) => { e.currentTarget.blur(); mostrarFontes(false); });
  // Tela cheia: o botão só aparece fora dela (e onde o navegador permite); some em tela cheia e volta ao sair. Tecla F.
  const botaoCheia = $('tela-cheia');
  const telaCheia = () => { if (document.fullscreenEnabled && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); };
  const estadoCheia = () => { botaoCheia.hidden = !document.fullscreenEnabled || !!document.fullscreenElement; };
  botaoCheia.addEventListener('click', (e) => { e.currentTarget.blur(); telaCheia(); });
  document.addEventListener('fullscreenchange', () => { estadoCheia(); medirHud(); });
  estadoCheia();

  // ---------- gestos (Pointer Events) ----------
  const ptrs = new Map();
  let gesto2 = null, maxPtrs = 0;
  let ultimoToque = performance.now(), atracao = null, giro = null, pausado = false;
  function interagiu() {
    ultimoToque = performance.now();
    if (atracao) { atracao = null; $('convite').hidden = true; medirHud(); if (voo) { const r = voo.resolver; voo = null; r(); } }
  }
  // Pausa explícita: o passeio não volta sozinho por ociosidade até alguém retomar (botão ou barra de espaço).
  const botaoPausa = $('pausa');
  function alternarPausa() {
    pausado = !pausado;
    botaoPausa.setAttribute('aria-pressed', String(pausado));
    botaoPausa.textContent = pausado ? 'Retomar passeio' : 'Pausar passeio';
    // Não reseta ultimoToque: pausar/retomar não interrompe a contagem de ócio
    // Não limpa atracao: retomada mostra o que estava antes (congelado durante pausa)
  }
  botaoPausa.addEventListener('click', alternarPausa);
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); alternarPausa(); }
    else if (e.key === 'Escape') { mostrarFontes(false); fecharFicha(); fecharItem(); }
    else if (e.code === 'KeyF' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) telaCheia();
    else if (e.code === 'KeyN' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) norte(); // repetição da tecla reiniciaria o voo sem sair do lugar
    else if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
      trocarLente(['camadas', 'eixos', 'tipos'][Number(e.code.slice(-1)) - 1], true);
    }
  });
  // Bússola: tocar no centro (ou N) volta ao norte verdadeiro pelo caminho mais curto (voar), em 0,5 s, sem mexer em
  // inclinação e zoom; no meio de um voo, mantém o destino dele e só troca o azimute. Não trava a rotação.
  function norte() { interagiu(); return voar({ ...(voo?.para ?? cam), az: 0 }, 500); }
  $('norte').addEventListener('click', (e) => { e.currentTarget.blur(); norte(); });
  addEventListener('pointerdown', interagiu, true);
  addEventListener('wheel', interagiu, { capture: true, passive: true });
  addEventListener('keydown', (e) => {
    // Não interrompe passeio para keys que controlam o passeio (espaço, escape, F, N, 1-3)
    if (['Space', 'Escape', 'KeyF', 'KeyN', 'Digit1', 'Digit2', 'Digit3'].includes(e.code)) return;
    interagiu();
  }, true);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const limiarToque = () => innerWidth * 0.006;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    if (voo) { const r = voo.resolver; voo = null; r(); }
    if (ptrs.size === 0) maxPtrs = 0;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), girar: e.pointerType === 'mouse' && (e.button === 2 || e.ctrlKey), moveu: false });
    maxPtrs = Math.max(maxPtrs, ptrs.size);
    gesto2 = null;
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const ax = p.x, ay = p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > limiarToque()) p.moveu = true;
    if (ptrs.size === 1) {
      if (p.girar) { cam.az += ((p.x - ax) / innerWidth) * 200; cam.tilt -= ((p.y - ay) / innerHeight) * 110; }
      else deslocar(chao(ax, ay), chao(p.x, p.y));
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const ant = a === p ? [[ax, ay], [b.x, b.y]] : [[a.x, a.y], [ax, ay]], nov = [[a.x, a.y], [b.x, b.y]];
      if (!gesto2) gesto2 = { modo: null, a0: [a.x, a.y], b0: [b.x, b.y], d0: Math.hypot(a.x - b.x, a.y - b.y) };
      const g = gesto2;
      if (!g.modo) {
        const dya = a.y - g.a0[1], dyb = b.y - g.b0[1], dxa = a.x - g.a0[0], dxb = b.x - g.b0[0];
        const ma = Math.hypot(dxa, dya), mb = Math.hypot(dxb, dyb), lt = limiarToque();
        if ((ma > lt * 0.5 && mb > lt * 0.5 && Math.max(ma, mb) > lt) || Math.max(ma, mb) > lt * 6) { // decide com os dois dedos já em movimento
          const dd = Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - g.d0);
          g.modo = Math.sign(dya) === Math.sign(dyb) && Math.abs(dya) > 1.5 * Math.abs(dxa) && Math.abs(dyb) > 1.5 * Math.abs(dxb) && dd < 0.4 * (Math.abs(dya) + Math.abs(dyb)) / 2 ? 'inclinar' : 'mapa';
        }
      }
      const cA = [(ant[0][0] + ant[1][0]) / 2, (ant[0][1] + ant[1][1]) / 2], cN = [(nov[0][0] + nov[1][0]) / 2, (nov[0][1] + nov[1][1]) / 2];
      if (g.modo === 'inclinar') cam.tilt -= ((cN[1] - cA[1]) / innerHeight) * 110;
      else if (g.modo === 'mapa') {
        deslocar(chao(...cA), chao(...cN));
        limitar(); aplicarCamera();
        const g0 = chao(...cN);
        const dA = Math.hypot(ant[0][0] - ant[1][0], ant[0][1] - ant[1][1]), dN = Math.hypot(nov[0][0] - nov[1][0], nov[0][1] - nov[1][1]);
        if (dN > 1) cam.dist *= dA / dN;
        limitar(); aplicarCamera();
        deslocar(g0, chao(...cN));
        let dAng = Math.atan2(nov[1][1] - nov[0][1], nov[1][0] - nov[0][0]) - Math.atan2(ant[1][1] - ant[0][1], ant[1][0] - ant[0][0]);
        dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng));
        cam.az += THREE.MathUtils.radToDeg(dAng);
      }
    }
    limitar(); aplicarCamera();
  });
  const soltar = (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    ptrs.delete(e.pointerId);
    gesto2 = null;
    if (e.type === 'pointerup' && maxPtrs === 1 && !p.moveu && performance.now() - p.t0 < 450) tocar(e.clientX, e.clientY);
  };
  canvas.addEventListener('pointerup', soltar);
  canvas.addEventListener('pointercancel', soltar);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const g0 = chao(e.clientX, e.clientY);
    cam.dist *= Math.exp(clamp(e.deltaY, -200, 200) * 0.0015);
    limitar(); aplicarCamera();
    deslocar(g0, chao(e.clientX, e.clientY));
    limitar(); aplicarCamera();
  }, { passive: false });
  // alvos de ponto exato sob o toque, medidos na TELA (raio de 26 px = alvo de 52 px, de perto ou de longe), do mais perto ao mais longe
  const vAlvo = new THREE.Vector3();
  function alvosSob(sx, sy, raioPx = 26) {
    const achados = [];
    for (const r of regJ.registros) {
      if (!precisao[r[3]]?.ponto_exato_permitido) continue;
      vAlvo.set(r[0], chaoY(r[0], r[1]) + 0.12, -r[1]).project(camera);
      if (vAlvo.z > 1) continue; // atrás da câmera
      const d = Math.hypot(((vAlvo.x + 1) / 2) * innerWidth - sx, ((1 - vAlvo.y) / 2) * innerHeight - sy);
      if (d <= raioPx) achados.push({ d, r });
    }
    return achados.sort((a, b) => a.d - b.d);
  }

  function tocar(sx, sy) {
    for (const k of marcas) { // ladrilho do leque visível: abre "o que tem aqui" (alvo de pelo menos 48 px)
      if (k.modo !== 'leque' || !k.lv) continue;
      for (const lad of k.leque.querySelectorAll('.lad')) {
        const r = lad.getBoundingClientRect(), fx = Math.max(0, (48 - r.width) / 2), fy = Math.max(0, (48 - r.height) / 2);
        if (sx < r.left - fx || sx > r.right + fx || sy < r.top - fy || sy > r.bottom + fy) continue;
        if (!k.sel) selecionar({ tipo: 'municipio', m: k.m });
        return abrirItem(k.m, lad.dataset.slug ? [lad.dataset.slug] : lad.dataset.resto.split(' '));
      }
    }
    // alvo no chão (atrativo com ponto): um só abre a ficha; vários colados abrem a lista curta para escolher.
    // Em cima do alvo (até 14 px) ele vence a etiqueta do município; perto dela, vale a etiqueta.
    const perto = alvosSob(sx, sy), certeiro = perto.length && perto[0].d <= 14;
    const mk = !certeiro && marcas.find((k) => k.modo === 'etq' && sx >= k.ret[0] && sx <= k.ret[2] && sy >= k.ret[1] && sy <= k.ret[3]);
    if (mk) return selecionar({ tipo: 'municipio', m: mk.m }); // tocar a etiqueta seleciona o município
    // de longe (estado ou região), os alfinetes ficam colados: tocar o mapa aproxima o município e mostra o nome dele;
    // só um toque em cima de um alfinete isolado abre a ficha direto
    if (selecao.tipo !== 'municipio' && cam.dist > PERTO_KM && !(perto.length === 1 && certeiro)) {
      const p0 = tocarRelevo(sx, sy), m0 = p0 && municipios.find((mm) => dentro(mm, p0[0], p0[1]));
      if (m0) return selecionar({ tipo: 'municipio', m: m0 });
    }
    if (perto.length === 1 || (certeiro && perto[1]?.d > 2 * perto[0].d)) return abrirFicha(perto[0].r[5]);
    if (perto.length > 1) return abrirListaPontos(perto.slice(0, 12).map((x) => x.r));
    const p = tocarRelevo(sx, sy);
    const m = p && municipios.find((mm) => dentro(mm, p[0], p[1]));
    if (m) selecionar({ tipo: 'municipio', m });
    else if (selecao.tipo !== 'estado') selecionar({ tipo: 'estado' });
  }

  // lista curta dos alvos colados sob um toque (no painel "o que tem aqui"); cada linha abre a ficha
  function abrirListaPontos(regs) {
    interagiu();
    const lista = $('i-lista');
    lista.replaceChildren();
    $('i-olho').textContent = 'Lugares neste ponto do mapa';
    $('i-glifo').replaceChildren();
    $('i-titulo').textContent = t('{n} lugares próximos', { n: regs.length });
    $('i-conta').textContent = 'Toque num nome para abrir a ficha';
    $('i-def').hidden = true; $('i-pos').hidden = true; $('i-nota').hidden = true; $('i-mais').hidden = true;
    for (const r of regs) {
      const li = document.createElement('li'), b = document.createElement('b'), ps = document.createElement('span');
      b.textContent = r[6]; ps.className = 'pos exato';
      ps.textContent = `${municipios[porCodigo.get(r[4]) - 1]?.nome ?? ''} · ${t(regJ.grupos.find((g) => g.slug === r[2])?.nome ?? '')}`;
      li.append(b, ps); li.dataset.codigo = r[5]; li.style.cursor = 'pointer';
      li.addEventListener('click', () => abrirFicha(r[5]));
      lista.append(li);
    }
    itemDados.fill(0);
    for (const r of regs) itemDados[indiceReg.get(r[5]) * 4] = 255;
    itemTex.needsUpdate = true; U.uTemItem.value = 1;
    itemAberto = { municipio: regs[0][4], lente: 'pontos', slugs: [], codigos: regs.map((r) => r[5]) };
    painelI.hidden = false;
    lista.scrollTop = 0;
    medirHud();
  }

  // ---------- painel "o que tem aqui": os registros de um item da lente ativa no município ----------
  // Topo: o que o ladrilho significa (nome completo, contagem, definição de lentes.json e a nota de não exclusividade).
  // Lista: nome e posição (precisões de registros.json), em ordem de nome,
  // com teto de linhas e "e mais N". No chão, só os alvos de ponto exato do item ficam acesos. "+N": escolha entre os restantes.
  const TETO_LISTA = 40, precisao = Object.fromEntries(regJ.precisoes.map((p) => [p.classe, p]));
  const indiceReg = new Map(regJ.registros.map((r, i) => [r[5], i])), compara = new Intl.Collator('pt-BR').compare;
  const juntar = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')}${t(' e ')}${xs.at(-1)}` : xs[0] ?? '');
  const plural = (n, u) => `${fmt(n)} ${t(n === 1 ? u.replace(/s$/, '') : u)}`;
  let itemAberto = null;
  // recorte do painel: o município do ladrilho, ou (m nulo) o que está selecionado — região ou estado inteiro
  function recorte(m) {
    if (!m && selecao.tipo === 'municipio') m = selecao.m;
    if (m) return { chave: m.codigo, nome: m.nome, onde: 'neste município', cods: new Set([m.codigo]), v: contas[m.codigo]?.[lente] ?? {} };
    if (selecao.tipo === 'regiao') {
      const ms = membrosDe(selecao.r);
      return { chave: selecao.r.id, nome: selecao.r.nome, onde: 'nesta região', cods: new Set(ms.map((x) => x.codigo)), v: somar(ms)[lente] };
    }
    return { chave: 'estado', nome: 'Estado do Rio de Janeiro', onde: 'no estado', cods: null, v: somar(Object.keys(agregados).map((codigo) => ({ codigo })))[lente] };
  }
  function abrirItem(m, slugs) {
    interagiu();
    const esc = recorte(m), L = LENTES[lente], v = esc.v, itens = slugs.map((s) => L.itens.find((it) => it.slug === s));
    const lista = $('i-lista'), um = itens.length === 1, it = itens[0];
    lista.replaceChildren(); $('i-mais').hidden = true;
    $('i-olho').textContent = `${t(L.rotulo)} · ${t(esc.nome)}`;
    let codigos = [];
    if (um) {
      $('i-glifo').replaceChildren(glifo(it.simbolo, it.cor)); $('i-titulo').textContent = it.nome;
      const regs = regJ.registros.filter((r) => (!esc.cods || esc.cods.has(r[4])) && (lente === 'camadas' ? r[2] === it.slug : lenJ.por_registro[r[5]]?.[lente]?.includes(it.slug)));
      regs.sort((a, b) => compara(a[6], b[6]) || compara(a[5], b[5]));
      codigos = regs.map((r) => r[5]);
      const exatos = regs.filter((r) => precisao[r[3]]?.ponto_exato_permitido);
      $('i-conta').textContent = `${plural(regs.length, L.unidade)} ${t(esc.onde)}`;
      $('i-def').textContent = lente === 'camadas' && it.compoe?.length ? t('Reúne {x}.', { x: juntar(it.compoe.map((n) => t(n))) }) : '';
      $('i-def').hidden = !$('i-def').textContent; // Quero… e Produtos: o nome já diz o que é
      $('i-pos').textContent = regs.length > exatos.length ? t('{a} com alfinete no mapa · {b} sem endereço exato (só o município)', { a: fmt(exatos.length), b: fmt(regs.length - exatos.length) }) : t('{a} com alfinete no mapa', { a: fmt(exatos.length) });
      for (const r of regs.slice(0, TETO_LISTA)) {
        const li = document.createElement('li'), b = document.createElement('b'), pr = precisao[r[3]], ps = document.createElement('span');
        b.textContent = r[6]; li.append(b); li.dataset.codigo = r[5];
        ps.className = 'pos' + (pr?.ponto_exato_permitido ? ' exato' : '');
        ps.textContent = pr?.rotulo ?? r[3];
        li.append(ps); li.style.cursor = 'pointer'; li.addEventListener('click', () => abrirFicha(r[5]));
        lista.append(li);
      }
      if (regs.length > TETO_LISTA) { $('i-mais').textContent = t('e mais {n}', { n: fmt(regs.length - TETO_LISTA) }); $('i-mais').hidden = false; }
      itemDados.fill(0);
      for (const r of exatos) itemDados[indiceReg.get(r[5]) * 4] = 255;
      itemTex.needsUpdate = true; U.uTemItem.value = 1;
    } else {
      $('i-glifo').replaceChildren(); $('i-titulo').textContent = t('Outros {n} itens', { n: itens.length });
      $('i-conta').textContent = t('{c}, nos itens com menos lugares', { c: `${plural(itens.reduce((s, x) => s + (v[x.slug] || 0), 0), L.unidade)} ${t(esc.onde)}` });
      $('i-def').textContent = 'Toque num item para ver os lugares dele.'; $('i-def').hidden = false;
      $('i-pos').textContent = '';
      for (const x of itens) {
        const li = document.createElement('li'), bt = document.createElement('button'), nm = document.createElement('span'), n = document.createElement('b');
        bt.type = 'button'; bt.dataset.slug = x.slug; nm.textContent = x.nome; n.textContent = fmt(v[x.slug]);
        bt.append(glifo(x.simbolo, x.cor), nm, n); bt.addEventListener('click', () => abrirItem(m, [x.slug]));
        li.append(bt); lista.append(li);
      }
      U.uTemItem.value = 0;
    }
    $('i-nota').textContent = um ? (L.nota ?? '') : ''; $('i-nota').hidden = !$('i-nota').textContent; // eixos e tipos: um registro pode contar em mais de um item
    $('i-pos').hidden = !$('i-pos').textContent;
    itemAberto = { municipio: esc.chave, lente, slugs: [...slugs], codigos };
    marcarLegenda();
    painelI.hidden = false;
    lista.scrollTop = 0; // depois de mostrar: oculto, o navegador ignora e a lista abriria rolada
    medirHud();
  }
  function fecharItem() {
    if (painelI.hidden) return;
    painelI.hidden = true; itemAberto = null; U.uTemItem.value = 0;
    marcarLegenda();
    medirHud();
  }
  // linha da legenda do cartão acesa enquanto o painel mostra aquele item no recorte selecionado
  function marcarLegenda() {
    const chave = recorte(null).chave;
    for (const li of $('c-grupos').children) {
      li.classList.toggle('ativo', !!itemAberto && itemAberto.lente === lente && itemAberto.municipio === chave && itemAberto.slugs.length === 1 && li.dataset.slug === itemAberto.slugs[0]);
    }
  }
  $('i-fechar').addEventListener('click', (e) => { e.currentTarget.blur(); fecharItem(); });

  // ---------- ficha de atrativo (fichas.json): à esquerda, com QR para o celular; acende o alvo no chão ----------
  // Tudo por textContent (os textos vêm dos guias); o QR é o SVG da biblioteca vendorizada, gerado a partir da URL.
  const painelFicha = $('ficha'), SIM_NAO = { SIM: 'sim', 'NÃO': 'não' };
  let fichaAberta = null, fichaDesde = 0;
  function abrirFicha(codigo) {
    const f = ficJ[codigo], r = regJ.registros[indiceReg.get(codigo)], tr = traducaoDe(codigo);
    if (!f || !r) return;
    const m = municipios[porCodigo.get(r[4]) - 1];
    if (m && (selecao.tipo !== 'municipio' || selecao.m !== m)) selecionar({ tipo: 'municipio', m }); // enquadra o município do atrativo
    fecharItem();
    const g = regJ.grupos.find((x) => x.slug === r[2]), it = LENTES.camadas.itens.find((x) => x.slug === r[2]);
    $('f-olho').textContent = `${f.municipio} · ${f.regiao}`;
    $('f-nome').textContent = f.nome;
    const carimbo = $('f-carimbo');
    carimbo.style.setProperty('--c', g?.cor_luz ?? '#1f4d36');
    $('f-carimbo-icone').replaceChildren(...(it ? [glifo(it.simbolo, g?.cor_luz ?? '#1f4d36')] : []));
    $('f-carimbo-rota').textContent = g?.nome ?? '';
    const dl = $('f-dados');
    dl.replaceChildren();
    const linha = (rot, txt) => {
      if (!txt) return;
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = rot; dd.textContent = txt; dl.append(dt, dd);
    };
    linha('Endereço', f.endereco);
    linha('Funcionamento', tr?.funcionamento ?? f.funcionamento);
    linha('Telefone', f.telefone);
    linha('Redes', [f.instagram && (f.instagram.includes(' ') || f.instagram.startsWith('@') ? f.instagram : `@${f.instagram}`), f.site].filter(Boolean).join(' · '));
    linha('Produtos', f.categorias && f.categorias !== 'Outros' ? tLista(f.categorias.replaceAll('; ', ', ')) : '');
    linha('Experiências', tLista((f.experiencias || '').replaceAll('; ', ', ')));
    linha('Também nas rotas', tLista((f.rotas || '').split('; ').filter((n) => n && n !== g?.nome).join(', ')));
    const selos = $('f-selos');
    selos.replaceChildren();
    for (const [rot, v] of [['Wi‑Fi', f.wifi], ['Precisa agendar', f.agendar], ['Pet friendly', f.pet]]) {
      if (!SIM_NAO[v]) continue; // vazio no guia: não mostra
      const s = document.createElement('span');
      s.className = v === 'SIM' ? 'selo sim' : 'selo';
      s.textContent = `${v === 'SIM' ? '✓' : '✗'} ${t(rot)}: ${t(SIM_NAO[v])}`;
      selos.append(s);
    }
    selos.hidden = !selos.childElementCount;
    const pr = $('f-precisao');
    pr.textContent = r[3] === 'municipal' ? 'Endereço exato não informado: o mapa mostra só o município. O QR procura o lugar pelo nome.'
      : r[3] === 'referencia' ? 'Localização aproximada (bairro ou endereço). O QR procura o lugar pelo nome.' : '';
    pr.hidden = !pr.textContent;
    // ponto exato: link curto com a coordenada (QR com módulos grandes, legível de longe na TV); aproximado ou sem ponto: busca pelo nome
    const url = f.precisao === 'endereco' && f.lat != null ? `https://maps.google.com/?q=${(+f.lat).toFixed(5)},${(+f.lng).toFixed(5)}` : f.mapa_url;
    const qr = $('f-qr');
    qr.replaceChildren(); qr.dataset.url = url;
    if (url && window.qrcode) {
      const q = window.qrcode(0, 'M');
      q.addData(url); q.make();
      qr.innerHTML = q.createSvgTag({ cellSize: 4, margin: 8, scalable: true }); // margem de 2 módulos: zona de silêncio para o leitor do celular
    }
    $('f-qr-bloco').hidden = !qr.childElementCount;
    const ab = $('f-abrir'); ab.href = url || '#'; ab.hidden = !url; // no celular o próprio aparelho abre o mapa: botão no lugar do QR
    $('f-descricao').textContent = tr?.descricao ?? (f.descricao || '');
    itemDados.fill(0); // só o alvo deste atrativo fica aceso no chão (se tiver ponto)
    if (precisao[r[3]]?.ponto_exato_permitido) { itemDados[indiceReg.get(codigo) * 4] = 255; U.uTemItem.value = 1; }
    itemTex.needsUpdate = true;
    fichaAberta = codigo; fichaDesde = performance.now();
    painelFicha.hidden = false;
    painelFicha.scrollTop = 0;
    medirHud();
  }
  function fecharFicha() {
    if (painelFicha.hidden) return;
    painelFicha.hidden = true; fichaAberta = null;
    if (painelI.hidden) U.uTemItem.value = 0;
    medirHud();
  }
  $('f-fechar').addEventListener('click', (e) => { e.currentTarget.blur(); fecharFicha(); });

  // ---------- E4: Passeio (modo TV) - percorre 12 regiões turísticas com fichas de atrativos ----------
  // Constrói sequência de regiões (excluindo "Outros municípios") em ordem geográfica agradável
  const regioesPasseio = regioes.filter((r) => r.id !== 'outros-municipios');

  // Mapeia cada região para seu município com mais atrativos (e os atrativos desenhável daquela região)
  // por região: até 3 municípios com mais atrativos de ponto exato (o passeio alterna entre eles a cada volta)
  const configPasseio = regioesPasseio.map((r) => {
    const opcoes = (r.municipios || []).map((c) => municipios[porCodigo.get(c) - 1]).filter(Boolean)
      .map((m) => ({ municipio: m, atrativos: regJ.registros.filter((reg) => reg[4] === m.codigo && precisao[reg[3]]?.ponto_exato_permitido) }))
      .filter((o) => o.atrativos.length).sort((a, b) => b.atrativos.length - a.atrativos.length).slice(0, 3);
    return { regiao: r, opcoes };
  }).filter((c) => c.opcoes.length);
  const paradaDe = (cfg, volta) => cfg.opcoes[volta % cfg.opcoes.length];
  const FICHAS_POR_PARADA = 2;

  // ponytail: escala tempos do passeio com OCIOSO_MS para testes rápidos (fator 20ms:1s = 1/50)
  const escalaPasseio = Math.min(1, OCIOSO_MS / 30000);
  const temposPasseio = {
    voo: Math.max(800, 2200 * escalaPasseio),
    transicao: Math.max(800, 2500 * escalaPasseio),
    ficha: Math.max(3000, 12000 * escalaPasseio),
    estado: Math.max(800, 3000 * escalaPasseio),
  };

  function passoAtracao(agora, dt) {
    if (pausado) return;
    if (!atracao) {
      if (!voo && !giro && ptrs.size === 0 && agora - ultimoToque > OCIOSO_MS) {
        atracao = {
          etapa: 'regiao', // etapa: 'regiao' -> 'municipio' -> 'ficha' -> 'estado' -> repete
          regiao_i: 0,
          naParada: 0,
          volta: 0,
          proxima: agora,
          ultima_ficha: null  // evita repetir mesma ficha consecutiva
        };
        trocarLente('camadas'); // o passeio é sempre na lente de abertura
        $('convite').hidden = false; mostrarFontes(false); medirHud();
      }
      return;
    }
    if (!voo) cam.az += 4 * dt;
    if (!painelFicha.hidden && agora - fichaDesde > 2500) painelFicha.scrollTop += 24 * dt; // no passeio, a ficha longa rola sozinha (a TV não tem toque)
    if (agora >= atracao.proxima && !voo) {
      const cfg = configPasseio[atracao.regiao_i % configPasseio.length];
      if (atracao.etapa === 'regiao') {
        // Seleciona a região
        selecionar({ tipo: 'regiao', r: cfg.regiao }, temposPasseio.voo, { az: cam.az + 15 });
        atracao.etapa = 'municipio';
        atracao.proxima = agora + temposPasseio.transicao;
      } else if (atracao.etapa === 'municipio') {
        selecionar({ tipo: 'municipio', m: paradaDe(cfg, atracao.volta).municipio }, temposPasseio.voo, { az: cam.az + 15 });
        atracao.etapa = 'ficha'; atracao.naParada = 0;
        atracao.proxima = agora + temposPasseio.transicao;
      } else if (atracao.etapa === 'ficha') {
        // fichas da parada, girando por volta (determinístico) e nunca a mesma em seguida
        const lista = paradaDe(cfg, atracao.volta).atrativos;
        let k = (atracao.volta * FICHAS_POR_PARADA + atracao.naParada) % lista.length;
        if (lista[k][5] === atracao.ultima_ficha && lista.length > 1) k = (k + 1) % lista.length;
        atracao.ultima_ficha = lista[k][5];
        abrirFicha(lista[k][5]);
        atracao.naParada++;
        if (atracao.naParada >= Math.min(FICHAS_POR_PARADA, lista.length)) atracao.etapa = 'estado';
        atracao.proxima = agora + temposPasseio.ficha;
      } else if (atracao.etapa === 'estado') {
        // fecha a ficha, mostra o estado inteiro e segue para a próxima região
        fecharFicha();
        selecionar({ tipo: 'estado' }, 1500, { az: 0, tilt: 38 });
        atracao.regiao_i++;
        if (atracao.regiao_i >= configPasseio.length) {
          // Completou uma volta
          atracao.volta++;
          atracao.regiao_i = 0;
        }
        atracao.etapa = 'regiao';
        atracao.proxima = agora + temposPasseio.estado;
      }
    }
  }

  // ---------- contrato ----------
  $('ver-estado').addEventListener('click', (e) => { e.currentTarget.blur(); selecionar({ tipo: 'estado' }, 1250, { az: 0, tilt: 38 }).catch(() => {}); });
  $('c-olho').addEventListener('click', () => { // estado ← região ← município: tocar a região no olho do cartão sobe um nível
    const r = selecao.tipo === 'municipio' && regiaoDe.get(selecao.m.regiao_id);
    if (r) { interagiu(); selecionar({ tipo: 'regiao', r }); }
  });
  // Remove preset (API simplificada): apenas oferece botão "Ver o estado inteiro"
  api.girar = (ms) => {
    interagiu();
    giro?.resolver();
    return new Promise((resolver) => { giro = { fim: performance.now() + ms, resolver }; });
  };
  // provas: onde o alvo de um atrativo cai na tela (px) e qual ficha está aberta
  window.__telao.projetar = (codigo) => {
    const r = regJ.registros[indiceReg.get(codigo)];
    if (!r) return null;
    vAlvo.set(r[0], chaoY(r[0], r[1]) + 0.12, -r[1]).project(camera);
    return [((vAlvo.x + 1) / 2) * innerWidth, ((1 - vAlvo.y) / 2) * innerHeight];
  };
  window.__telao.ficha = () => fichaAberta;
  window.addEventListener('telao:idioma', () => { // refaz o que cena.js monta com t() e com os dados traduzidos
    subtitulo(); montarFontes(); preencherCartao(); rotularBusca();
    if (fichaAberta) abrirFicha(fichaAberta);
    else if (itemAberto && itemAberto.slugs.length) {
      const { municipio, slugs } = itemAberto, i = porCodigo.get(municipio);
      abrirItem(i ? municipios[i - 1] : null, slugs);
    } else fecharItem();
  });
  window.__telao.abrir = (codigo) => abrirFicha(codigo); // provas de conteúdo por amostragem (a clicabilidade é provada com cliques reais)
  window.__telao.estado = () => ({
    atracao: atracao ? { etapa: atracao.etapa, regiao_i: atracao.regiao_i, volta: atracao.volta } : null,
    pausado,
  });

  // Atualiza info() para incluir estado do passeio (atracao, pausado)
  window.__telao.info = () => {
    const info_base = {
      renderer: rendererNome,
      triangulos: ultimoQuadro.triangles,
      drawCalls: ultimoQuadro.calls,
      pontos: ultimoQuadro.points,
      elementosDom: document.getElementsByTagName('*').length,
      qualidade,
    };
    return {
      ...info_base,
      atracao: atracao ? { etapa: atracao.etapa, regiao_i: atracao.regiao_i, volta: atracao.volta } : null,
      pausado,
    };
  };

  // ---------- perda de contexto ----------
  let perdido = null;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    aviso(t('A placa de vídeo interrompeu o desenho do mapa. Recuperando…'));
    perdido = setTimeout(() => location.reload(), 6000); // sem restauração em 6 s: recarrega (tudo é local)
  });
  canvas.addEventListener('webglcontextrestored', () => {
    clearTimeout(perdido); perdido = null;
    destaqueTex.needsUpdate = true;
    redimensionar();
    aviso('');
  });

  // ---------- tamanho ----------
  const tamBuf = new THREE.Vector2();
  function redimensionar() {
    renderer.setPixelRatio(Math.min(devicePixelRatio, CFG.dpr, CFG.altMax / innerHeight));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    renderer.getDrawingBufferSize(tamBuf);
    U.uRes.value.copy(tamBuf);
    U.uPxRef.value = tamBuf.y / 1080;
    U.uEscalaPx.value = tamBuf.y / (2 * Math.tan(rad(FOV / 2)));
    posp?.tamanho(tamBuf.x, tamBuf.y);
    medirHud();
  }
  addEventListener('resize', redimensionar);
  redimensionar();
  preencherCartao();
  Object.assign(cam, quadro(bbEstado, 0, 38, 1.24));

  // ---------- laço ----------
  let anterior = performance.now(), quadros = 0;
  const agulha = $('agulha'), lAz = $('l-az'), lIncl = $('l-incl');
  let txtAz = '', txtIncl = '';
  renderer.setAnimationLoop((agora) => {
    const dt = Math.min(0.1, (agora - anterior) / 1000);
    anterior = agora;
    U.uTempo.value = agora / 1000;
    passoAtracao(agora, dt);
    passoVoo(agora);
    if (giro) { cam.az += 36 * dt; if (agora >= giro.fim) { const r = giro.resolver; giro = null; r(); } }
    limitar();
    U.uTemDestaque.value += (destaqueAlvo - U.uTemDestaque.value) * Math.min(1, dt * 4);
    matCortina.uniforms.uForca.value = destaqueAlvo * U.uTemDestaque.value;
    cortina.visible = matCortina.uniforms.uForca.value > 0.01;
    desloc.x += (0.5 - livre.cx - ajuste.x - desloc.x) * Math.min(1, dt * 4); desloc.y += (0.5 - livre.cy - ajuste.y - desloc.y) * Math.min(1, dt * 4);
    alvoY += (chaoY(cam.tx, -cam.tz) * 0.6 - alvoY) * Math.min(1, dt * 3);
    aplicarCamera();
    U.uNevoa.value.set(cam.dist * 0.9, cam.dist * 2.6);
    U.uLonge.value = clamp((cam.dist - 260) / 120, 0, 1); // meio do caminho no limiar de 'longe' (320); cheio na vista do estado
    renderer.info.reset();
    if (posp) posp.desenhar(); else { renderer.setRenderTarget(null); renderer.render(cena, camera); }
    ultimoQuadro = { triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, points: renderer.info.render.points };
    atualizarRotulos();
    const az = (((Math.round(cam.az) % 360) + 360) % 360);
    const ta = `${String(az).padStart(3, '0')}°`, ti = `${Math.round(cam.tilt)}°`;
    if (ta !== txtAz) { lAz.textContent = ta; agulha.style.transform = `rotate(${az}deg)`; txtAz = ta; }
    if (ti !== txtIncl) { lIncl.textContent = ti; txtIncl = ti; }
    if (marcarPronto && ++quadros >= 2) { marcarPronto(); marcarPronto = null; }
  });
  // acesso de depuração (fora do contrato): usado por testar-interacao.js
  window.__telaoDepuracao = {
    cam: () => ({ ...cam }),
    selecao: () => (selecao.tipo === 'municipio' ? selecao.m.nome : selecao.tipo === 'regiao' ? selecao.r.nome : 'estado'),
    atracao: () => !!atracao,
    ultimoToque: () => ultimoToque, // performance.now() da última interação (o passeio conta a partir dela)
    vista: () => ({ desloc: { ...desloc }, ajuste: { ...ajuste }, livre: { ...livre }, zona: [...zona], remPx }), // enquadramento e zona livre do leque (px)
    selecionar: (codigo) => selecionar({ tipo: 'municipio', m: municipios[porCodigo.get(codigo) - 1] }), // promessa: fim do voo
    aviso: () => !$('aviso').hidden,
    item: () => itemAberto && { ...itemAberto, acesos: U.uTemItem.value ? regJ.registros.filter((r, i) => itemDados[i * 4]).map((r) => r[5]) : [] }, // painel "o que tem aqui"
    ladrilhos: () => marcas.filter((k) => k.modo === 'leque' && k.lv).flatMap((k) => [...k.leque.querySelectorAll('.lad')].map((l) => {
      const r = l.getBoundingClientRect(); return { municipio: k.m.codigo, slug: l.dataset.slug ?? null, resto: l.dataset.resto ?? null, x: r.x, y: r.y, w: r.width, h: r.height };
    })),
    tela(nome) {
      const m = municipios.find((x) => x.nome === nome);
      const p = new THREE.Vector3(m.ancora[0], chaoY(...m.ancora), -m.ancora[1]).project(camera);
      return [((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight];
    },
  };
  console.info(`[telão] ${alvoReg.length} alfinetes, ${marcas.length} marcações de município, qualidade ${qualidade}`);
}
