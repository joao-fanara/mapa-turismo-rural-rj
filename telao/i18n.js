// Idiomas do telão (pt, en, fr, de). A chave do catálogo é o próprio texto em português, com {variáveis};
// o português não tem catálogo (a chave é o texto). Nomes próprios (municípios, regiões, lugares) não entram.
// HTML estático é traduzido por esta página (nós de texto e aria-label/title); textos montados em cena.js usam t().
export const IDIOMAS = { pt: 'pt-BR', en: 'en-GB', fr: 'fr-FR', de: 'de-DE' };
let idioma = 'pt', cat = {}, trad = {};
const originais = new WeakMap(), atributos = new WeakMap(), nos = new Set(), elementos = new Set();
const escritos = new WeakMap(); // último texto que este módulo escreveu em cada nó: a mutação que ele mesmo causa não vira "original"
const escrever = (n, x) => { escritos.set(n, x); n.data = x; };
let ocupado = false;

export const idiomaAtual = () => idioma;
export const localeAtual = () => IDIOMAS[idioma];
export const t = (s, v) => {
  const r = cat[s] ?? s;
  return v ? r.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '') : r;
};
// "Café, Queijos e latícinios": só traduz quando todos os pedaços são termos conhecidos (nunca mexe em nomes próprios)
export const tLista = (s, sep = ', ') => {
  if (!s || idioma === 'pt') return s;
  const partes = s.split(sep);
  return partes.every((p) => p in cat) ? partes.map((p) => cat[p]).join(sep) : s;
};
export const traducaoDe = (codigo) => trad[codigo]; // {descricao, funcionamento} no idioma atual, ou undefined (cai no português)

function traduzirTexto(s) {
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return m[2] in cat ? m[1] + cat[m[2]] + m[3] : s;
}
function arvore(raiz) {
  ocupado = true;
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const n = w.currentNode;
    if (!originais.has(n)) { originais.set(n, n.data); nos.add(n); }
    const x = traduzirTexto(originais.get(n));
    if (n.data !== x) escrever(n, x);
  }
  ocupado = false;
}
function attrs(raiz) {
  const lista = [...(raiz.nodeType === 1 ? [raiz] : []), ...raiz.querySelectorAll('[aria-label],[title]')];
  for (const e of lista) {
    let o = atributos.get(e);
    if (!o) { o = {}; atributos.set(e, o); elementos.add(e); }
    for (const a of ['aria-label', 'title']) {
      if (!e.hasAttribute(a)) continue;
      if (!(a in o)) o[a] = e.getAttribute(a);
      const x = traduzirTexto(o[a]);
      if (e.getAttribute(a) !== x) e.setAttribute(a, x);
    }
  }
}

async function carregar(novo) {
  idioma = novo in IDIOMAS ? novo : 'pt';
  cat = {}; trad = {};
  if (idioma === 'pt') return;
  const [c, d] = await Promise.all([`i18n/${idioma}.json`, `dados/trad-${idioma}.json`].map((u) => fetch(u).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))));
  cat = c; trad = d;
}

export async function aplicarIdioma(novo, persistir = true) {
  await carregar(novo);
  document.documentElement.lang = IDIOMAS[idioma];
  for (const b of document.querySelectorAll('#idiomas [data-idioma]')) {
    const ativo = b.dataset.idioma === idioma;
    b.setAttribute('aria-pressed', String(ativo)); b.tabIndex = ativo ? 0 : -1;
  }
  for (const n of nos) if (n.isConnected && n.data !== originais.get(n)) escrever(n, originais.get(n)); // volta ao português antes de aplicar o novo catálogo
  for (const e of elementos) if (e.isConnected) for (const [a, v] of Object.entries(atributos.get(e))) e.setAttribute(a, v);
  arvore(document.body); attrs(document.body);
  document.title = t('Rio Rural · Turismo Rural RJ');
  if (persistir) {
    try { localStorage.setItem('turismo-idioma', idioma); } catch { /* navegação privada */ }
    const q = new URLSearchParams(location.search); q.set('lang', idioma);
    history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
  }
  window.dispatchEvent(new CustomEvent('telao:idioma', { detail: { idioma, locale: IDIOMAS[idioma] } }));
}

export async function iniciarIdiomas() {
  let salvo = null;
  try { salvo = localStorage.getItem('turismo-idioma'); } catch { /* sem armazenamento */ }
  const q = new URLSearchParams(location.search).get('lang');
  const inicial = q in IDIOMAS ? q : salvo in IDIOMAS ? salvo : 'pt';
  const nav = document.getElementById('idiomas');
  for (const b of nav.querySelectorAll('[data-idioma]')) b.addEventListener('click', () => aplicarIdioma(b.dataset.idioma));
  nav.addEventListener('keydown', (e) => {
    const ids = [...nav.querySelectorAll('[data-idioma]')].map((b) => b.dataset.idioma), d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (d) { e.preventDefault(); aplicarIdioma(ids[(ids.indexOf(idioma) + d + ids.length) % ids.length]).then(() => nav.querySelector(`[data-idioma="${idioma}"]`).focus()); }
  });
  await aplicarIdioma(inicial, false);
  new MutationObserver((ms) => {
    if (ocupado || idioma === 'pt') return;
    for (const m of ms) {
      if (m.type === 'attributes') { attrs(m.target); continue; }
      if (m.type === 'characterData') {
        const n = m.target;
        if (escritos.get(n) === n.data) continue; // fui eu que escrevi
        originais.set(n, n.data); nos.add(n);
        const x = traduzirTexto(n.data); if (n.data !== x) escrever(n, x);
        continue;
      }
      for (const a of m.addedNodes) {
        if (a.nodeType === 1) { arvore(a); attrs(a); }
        else if (a.nodeType === 3) { originais.set(a, a.data); nos.add(a); const x = traduzirTexto(a.data); if (a.data !== x) escrever(a, x); }
      }
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'title'] });
}
