// Modo lista: o mesmo conteúdo sem WebGL (aparelho antigo, ?modo=lista). Busca, filtro por rota e município, ficha em texto.
// Usa os mesmos dados e a mesma tradução do mapa 3D; nenhuma dependência de three.js.
import { t, tLista, traducaoDe, localeAtual } from './i18n.js';

const ler = (f) => fetch(`./dados/${f}`).then((r) => r.json());
const el = (tag, props = {}, ...filhos) => { const e = Object.assign(document.createElement(tag), props); e.append(...filhos); return e; };
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function iniciarLista() {
  const [reg, fic] = await Promise.all([ler('registros.json'), ler('fichas.json')]);
  document.body.classList.add('modo-lista');
  const grupos = reg.grupos, nomeRota = (slug) => grupos.find((g) => g.slug === slug)?.nome ?? '';
  const lugares = Object.entries(fic).map(([codigo, f]) => ({ codigo, f, rota: f.rota_principal }))
    .sort((a, b) => a.f.nome.localeCompare(b.f.nome, 'pt-BR'));
  const municipios = [...new Set(lugares.map((l) => l.f.municipio))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const raiz = el('main', { id: 'modo-lista' });
  document.body.append(raiz);
  let aberto = null;
  const q = el('input', { type: 'search', id: 'ml-busca', autocomplete: 'off' });
  const rota = el('select', { id: 'ml-rota' }), mun = el('select', { id: 'ml-mun' });
  const lista = el('ul', { id: 'ml-lista' }), conta = el('p', { id: 'ml-conta', ariaLive: 'polite' });
  const link3d = el('a', { id: 'ml-3d' });
  const filtros = el('div', { id: 'ml-filtros' }, q, rota, mun);
  const topo = el('header', {}, el('h1', {}, el('span', { className: 'rio' }, 'Rio '), el('span', { className: 'rural' }, 'Rural')), link3d);
  const ficha = el('article', { id: 'ml-ficha', hidden: true });
  raiz.append(topo, filtros, conta, lista, ficha);

  function preencherSeletores() {
    q.placeholder = t('Buscar lugar, município ou produto'); q.setAttribute('aria-label', q.placeholder);
    const r0 = rota.value, m0 = mun.value;
    rota.replaceChildren(el('option', { value: '' }, t('Todas as rotas')), ...grupos.map((g) => el('option', { value: g.slug }, t(g.nome))));
    mun.replaceChildren(el('option', { value: '' }, t('Todos os municípios')), ...municipios.map((m) => el('option', { value: m }, m)));
    rota.value = r0; mun.value = m0;
    rota.setAttribute('aria-label', t('Rotas')); mun.setAttribute('aria-label', t('Municípios'));
    const p = new URLSearchParams(location.search); p.delete('modo');
    link3d.href = `?${p}`; link3d.textContent = t('Ver o mapa 3D');
  }
  function desenhar() {
    const b = norm(q.value);
    const achados = lugares.filter((l) => (!rota.value || l.rota === rota.value) && (!mun.value || l.f.municipio === mun.value)
      && (!b || norm(`${l.f.nome} ${l.f.municipio} ${l.f.categorias} ${l.f.experiencias}`).includes(b)));
    conta.textContent = achados.length ? t('{n} lugares', { n: achados.length.toLocaleString(localeAtual()) }) : t('Nenhum lugar encontrado.');
    lista.replaceChildren(...achados.slice(0, 200).map((l) => {
      const bt = el('button', { type: 'button' }, el('b', {}, l.f.nome), el('span', {}, `${l.f.municipio} · ${t(nomeRota(l.rota))}`));
      bt.addEventListener('click', () => abrir(l.codigo));
      return el('li', {}, bt);
    }));
    if (achados.length > 200) lista.append(el('li', { className: 'mais' }, t('e mais {n}', { n: achados.length - 200 })));
  }
  function abrir(codigo) {
    aberto = codigo; const f = fic[codigo], tr = traducaoDe(codigo);
    const dl = el('dl');
    for (const [r, v] of [['Endereço', f.endereco], ['Funcionamento', tr?.funcionamento ?? f.funcionamento], ['Telefone', f.telefone], ['Redes', [f.instagram, f.site].filter(Boolean).join(' · ')],
      ['Produtos', tLista((f.categorias && f.categorias !== 'Outros' ? f.categorias : '').replaceAll('; ', ', '))], ['Experiências', tLista((f.experiencias || '').replaceAll('; ', ', '))]]) if (v) dl.append(el('dt', {}, t(r)), el('dd', {}, v));
    const url = f.precisao === 'endereco' && f.lat != null ? `https://maps.google.com/?q=${(+f.lat).toFixed(5)},${(+f.lng).toFixed(5)}` : f.mapa_url;
    const volta = el('button', { type: 'button', id: 'ml-voltar' }, t('Voltar à lista'));
    volta.addEventListener('click', fechar);
    ficha.replaceChildren(volta, el('h2', {}, f.nome), el('p', { className: 'olho' }, `${f.municipio} · ${f.regiao} · ${t(nomeRota(f.rota_principal))}`), dl,
      ...(url ? [el('a', { id: 'ml-maps', href: url, target: '_blank', rel: 'noopener noreferrer' }, t('Abrir no Google Maps'))] : []),
      el('p', { className: 'descricao' }, tr?.descricao ?? f.descricao ?? ''));
    ficha.hidden = false; lista.hidden = conta.hidden = filtros.hidden = true; scrollTo(0, 0); ficha.querySelector('button').focus();
  }
  function fechar() { aberto = null; ficha.hidden = true; lista.hidden = conta.hidden = filtros.hidden = false; }
  for (const c of [q, rota, mun]) c.addEventListener('input', desenhar);
  window.addEventListener('telao:idioma', () => { preencherSeletores(); desenhar(); if (aberto) abrir(aberto); });
  preencherSeletores(); desenhar();
  window.__telao = { pronto: Promise.resolve(), modo: 'lista' };
}
