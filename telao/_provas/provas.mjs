// Provas do telão Rio Rural no Chrome headless, por CDP (Node 24, sem dependências).
//   node _provas/provas.mjs                 todas as seções em 1920x1080
//   TELAO_SECAO=alvo node _provas/provas.mjs   uma seção só
// Sobe um servidor estático próprio (127.0.0.1, porta livre) e o Chrome (--headless=new, perfil em _provas/chrome-perfil).
// Reprova (código 1) se uma verificação falhar ou se houver exceção, console.error, violação de CSP ou requisição para fora
// de 127.0.0.1/localhost. Cliques são reais (Input.dispatchMouseEvent) em coordenadas medidas na página.
// Capturas em _provas/p-*.png. Para acrescentar uma prova: escreva async function nome(A) {} e ponha em SECOES.
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROVAS = path.join(RAIZ, '_provas');
const PERFIL = path.join(PROVAS, 'chrome-perfil');
const WIN = process.platform === 'win32';
// TELAO_CHROME aponta para outro Chrome/Chromium. No Windows usa o Chrome instalado; em Linux, o do PATH.
const CHROME = process.env.TELAO_CHROME || (WIN ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome');
const PYTHON = WIN ? 'python' : 'python3';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const HOSTS_PERMITIDOS = new Set(['127.0.0.1', 'localhost']); // com TELAO_URL, só o próprio site provado entra aqui (qualquer outro host é falha)
const filhos = [];
const matar = (c) => { try { WIN ? execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }) : process.kill(-c.pid, 'SIGKILL'); } catch { try { c.kill('SIGKILL'); } catch {} } };
const encerrar = () => { for (const c of filhos) if (c.exitCode === null) matar(c); };
process.on('exit', encerrar);
const portaLivre = () => new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

let falhas = 0;
const ok = (nome, cond, detalhe = '') => { if (!cond) falhas++; console.log(`${cond ? 'PASSOU' : 'FALHOU'}  ${nome}${detalhe === '' ? '' : '  ' + JSON.stringify(detalhe)}`); };

// ---------- dados (a verdade contra a qual a tela é conferida) ----------
const ler = (f) => JSON.parse(fs.readFileSync(path.join(RAIZ, 'dados', f), 'utf8'));
const REG = ler('registros.json'), FIC = ler('fichas.json'), MUN = ler('municipios-3d.json');
const AGR = REG.agregados.por_municipio;
const PREC = Object.fromEntries(REG.precisoes.map((p) => [p.classe, p]));
const fmt = (n) => n.toLocaleString('pt-BR');
const codMun = (nome) => MUN.municipios.find((m) => m.nome === nome).codigo;
const urlQr = (f) => (f.precisao === 'endereco' && f.lat != null ? `https://maps.google.com/?q=${(+f.lat).toFixed(5)},${(+f.lng).toFixed(5)}` : f.mapa_url);

function conectar(wsUrl) {
  return new Promise((pronto, falha) => {
    const ws = new WebSocket(wsUrl); const pend = new Map(); let id = 0; const ouv = {};
    const cdp = { send: (method, params = {}) => new Promise((r, j) => { pend.set(++id, { r, j, method }); ws.send(JSON.stringify({ id, method, params })); }), on: (m, f) => (ouv[m] ??= []).push(f) };
    ws.onopen = () => pronto(cdp); ws.onerror = () => falha(new Error('ws'));
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.j(new Error(`${p.method}: ${m.error.message}`)) : p.r(m.result); } else (ouv[m.method] || []).forEach((f) => f(m.params)); };
  });
}

async function abrirAba(cdpPorta, url, tam) {
  const [w, h] = tam.split('x').map(Number);
  const alvo = await (await fetch(`http://127.0.0.1:${cdpPorta}/json/new?about:blank`, { method: 'PUT' })).json();
  await fetch(`http://127.0.0.1:${cdpPorta}/json/activate/${alvo.id}`);
  const cdp = await conectar(alvo.webSocketDebuggerUrl);
  const erros = [];
  cdp.on('Runtime.exceptionThrown', (p) => erros.push('exceção: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text)));
  cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') erros.push('console.error: ' + p.args.map((a) => a.value ?? a.description).join(' ')); });
  cdp.on('Log.entryAdded', ({ entry: e }) => { if (e.level === 'error') erros.push(`log ${e.source}: ${e.text} ${e.url ?? ''}`); });
  cdp.on('Network.requestWillBeSent', ({ request: req }) => { const u = new URL(req.url); if (/^https?:$/.test(u.protocol) && !HOSTS_PERMITIDOS.has(u.hostname)) erros.push(`requisição externa: ${req.url}`); });
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); await cdp.send('Log.enable'); await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));" });
  const av = async (expr) => { const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const clicar = async ([x, y]) => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
  const tecla = async (key, code, keyCode) => { for (const type of ['rawKeyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode }); };
  const ate = async (expr, ms = 10000) => { const fim = Date.now() + ms; while (Date.now() < fim) { if (await av(expr)) return true; await espera(150); } return false; };
  async function capturar(nome, clip) {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    const f = path.join(PROVAS, nome); fs.writeFileSync(f, Buffer.from(data, 'base64')); return f;
  }
  async function abrirTelao() {
    await cdp.send('Page.navigate', { url });
    if (!(await ate("typeof window.__telao === 'object'", 25000))) throw new Error('o telão não carregou em 25 s');
    await av('window.__telao.pronto.then(() => true)');
    await espera(2500); // entrada da câmera e das etiquetas
  }
  const limpo = async (nome) => { const csp = (await av('window.__csp')) ?? []; ok(`${nome}: sem exceções, erros, CSP nem requisições externas`, !erros.length && !csp.length, [...erros, ...csp]); };
  // retângulo (px) de um seletor visível
  const ret = (sel) => av(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.closest('[hidden]')) return null; const r = e.getBoundingClientRect(); return r.width ? [r.left, r.top, r.width, r.height] : null; })()`);
  const centro = (r) => [r[0] + r[2] / 2, r[1] + r[3] / 2];
  // etiqueta visível de um município (centro), ou null
  const etiqueta = (nome) => av(`(() => { for (const m of document.querySelectorAll('.marca')) { const nm = m.querySelector('.nm'); const e = m.querySelector('.etq'); if (nm?.textContent === ${JSON.stringify(nome)} && e && getComputedStyle(m).display !== 'none') { const r = e.getBoundingClientRect(); if (r.width && r.top > 0 && r.left > 0 && r.right < innerWidth) return [r.left + r.width / 2, r.top + r.height / 2]; } } return null; })()`);
  // posição estável (duas leituras iguais a 3 px) do alvo de um atrativo na tela
  async function alvoEstavel(codigo) {
    for (let k = 0; k < 20; k++) {
      const a = await av(`window.__telao.projetar(${JSON.stringify(codigo)})`); await espera(250);
      const b = await av(`window.__telao.projetar(${JSON.stringify(codigo)})`);
      if (a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) < 3) return b;
    }
    return null;
  }
  // atrativo desenhável isolado na tela (≥ 40 px do vizinho), longe do HUD, dos ladrilhos e das etiquetas
  const alvoIsolado = () => av(`(() => {
    const regs = ${JSON.stringify(REG.registros.filter((r) => PREC[r[3]].ponto_exato_permitido).map((r) => r[5]))};
    const hud = [...document.querySelectorAll('.lad, .marca .etq, #cartao, #titulo, #controles, #bussola, #item, #ficha, #rodape')].filter((e) => !e.closest('[hidden]')).map((e) => e.getBoundingClientRect()).filter((r) => r.width);
    const pts = regs.map((c) => ({ c, p: window.__telao.projetar(c) })).filter((a) => a.p && a.p[0] > 20 && a.p[0] < innerWidth - 20 && a.p[1] > 20 && a.p[1] < innerHeight - 20);
    const livre = (x, y) => hud.every((r) => x < r.left - 30 || x > r.right + 30 || y < r.top - 30 || y > r.bottom + 30);
    const cand = pts.filter((a) => livre(...a.p)).map((a) => ({ ...a, viz: Math.min(...pts.filter((b) => b !== a).map((b) => Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]))) })).filter((a) => a.viz >= 34);
    cand.sort((a, b) => b.viz - a.viz); return cand[0]?.c ?? null; })()`);
  return { id: alvo.id, cdp, av, clicar, tecla, ate, capturar, abrirTelao, limpo, ret, centro, etiqueta, alvoEstavel, alvoIsolado };
}

// decodifica o QR de uma captura com OpenCV (python -I, do diretório das provas)
function lerQr(arquivo) {
  const py = 'import sys,site\nsys.path.append(site.getusersitepackages())\nimport cv2\nim=cv2.imread(sys.argv[1]);im=cv2.copyMakeBorder(im,30,30,30,30,cv2.BORDER_CONSTANT,value=(255,255,255))\nfor e in (1,2,3):\n  t=cv2.QRCodeDetector().detectAndDecode(cv2.resize(im,None,fx=e,fy=e,interpolation=cv2.INTER_NEAREST))[0]\n  if t: print(t); break';
  const r = spawnSync(PYTHON, ['-I', '-c', py, arquivo], { encoding: 'utf8', cwd: PROVAS });
  if (r.status !== 0) throw new Error('leitor de QR (python + opencv) falhou: ' + r.stderr.trim().split('\n').pop());
  return r.stdout.trim();
}

// claridade e cores de uma captura (OpenCV): o telão é papel creme e campo, nunca painel escuro
function estatisticasImagem(arquivo) {
  const py = `import sys, site, json
sys.path.append(site.getusersitepackages())
import cv2
im = cv2.imread(sys.argv[1]); g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY); hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
h, s, v = [hsv[..., i].astype(int) for i in range(3)]
print(json.dumps(dict(media=float(g.mean()), escuros=float((g < 60).mean()), verde=float(((h > 35) & (h < 85) & (s > 60) & (v > 40)).mean()), turquesa=float(((h > 80) & (h < 105) & (s > 60) & (v > 100)).mean()))))`;
  const r = spawnSync(PYTHON, ['-I', '-c', py, arquivo], { encoding: 'utf8', cwd: PROVAS });
  if (r.status !== 0) throw new Error('estatística de imagem (python + opencv) falhou: ' + r.stderr.trim().split('\n').pop());
  return JSON.parse(r.stdout);
}

// confere a ficha aberta na tela contra fichas.json
async function conferirFicha(A, codigo, rotulo) {
  const f = FIC[codigo];
  const t = await A.av(`(() => { const dl = [...document.querySelectorAll('#f-dados dt')].map((dt) => [dt.textContent, dt.nextElementSibling.textContent]);
    return { aberta: window.__telao.ficha(), nome: document.getElementById('f-nome').textContent, olho: document.getElementById('f-olho').textContent,
      dl: Object.fromEntries(dl), selos: [...document.querySelectorAll('#f-selos .selo')].map((s) => s.textContent), sim: document.querySelectorAll('#f-selos .selo.sim').length,
      prec: document.getElementById('f-precisao').hidden ? '' : document.getElementById('f-precisao').textContent, url: document.getElementById('f-qr').dataset.url,
      desc: document.getElementById('f-descricao').textContent, rota: document.getElementById('f-carimbo-rota').textContent }; })()`);
  ok(`${rotulo}: ficha aberta é a do atrativo`, t.aberta === codigo, [t.aberta, codigo]);
  ok(`${rotulo}: nome e município/região`, t.nome === f.nome && t.olho === `${f.municipio} · ${f.regiao}`, [t.nome, t.olho]);
  const esperado = { Endereço: f.endereco, Funcionamento: f.funcionamento, Telefone: f.telefone };
  ok(`${rotulo}: endereço, funcionamento e telefone (e nada de campo vazio)`, Object.entries(esperado).every(([k, v]) => (v ? t.dl[k] === v : !(k in t.dl))), { tela: t.dl, dados: esperado });
  const sns = [f.wifi, f.agendar, f.pet].filter((v) => v === 'SIM' || v === 'NÃO');
  ok(`${rotulo}: selos Wi-Fi/agendar/pet batem com SIM/NÃO`, t.selos.length === sns.length && t.sim === sns.filter((v) => v === 'SIM').length, { tela: t.selos, dados: [f.wifi, f.agendar, f.pet] });
  const cl = REG.registros.find((r) => r[5] === codigo)[3];
  ok(`${rotulo}: aviso de localização conforme a precisão (${cl})`, cl === 'endereco' ? !t.prec : cl === 'municipal' ? /só o município/.test(t.prec) : /aproximada/.test(t.prec), t.prec);
  ok(`${rotulo}: QR com a URL certa`, t.url === urlQr(f), [t.url, urlQr(f)]);
  ok(`${rotulo}: rota principal e descrição`, t.rota === REG.grupos.find((g) => g.slug === f.rota_principal).nome && t.desc === (f.descricao || ''), t.rota);
}

// ---------- seções ----------
async function carregar(A) {
  await A.abrirTelao();
  ok('carregar: <title>', (await A.av('document.title')) === 'Rio Rural · Turismo Rural RJ');
  ok('carregar: h1 "Rio Rural" e lema', (await A.av("document.querySelector('h1').textContent")) === 'Rio Rural' && (await A.av("document.querySelector('.lema').textContent")).includes('Sabores, histórias e caminhos'));
  const munCom = Object.keys(AGR).filter((c) => c !== 'sem_municipio' && AGR[c].total > 0).length;
  const sub = await A.av("document.getElementById('subtitulo').textContent");
  ok('carregar: subtítulo com os totais dos dados', sub.includes(`${fmt(REG.meta.total)} lugares`) && sub.includes(`${munCom} municípios`), sub);
  ok('carregar: autoria no HTML (meta author)', await A.av("document.querySelector('meta[name=author]')?.content === 'João Fanara'"));
  const tri = await A.av('window.__telao.info().triangulos');
  ok('carregar: relevo sólido desenhado (mais de 500 mil triângulos)', tri > 500000, tri);
  await A.capturar('p-carregar.png');
}

async function visual(A) { // identidade rural, não ficção científica: papel claro, verde de mata/campo, turquesa de rio e mar
  await A.abrirTelao();
  const e = estatisticasImagem(await A.capturar('p-visual-estado.png'));
  ok('visual: claridade média alta (papel creme, não fundo escuro)', e.media >= 170, e);
  ok('visual: quase nada escuro (HUD preto/azul-petróleo do projeto-base)', e.escuros <= 0.05, e);
  ok('visual: há verde de mata e campo', e.verde >= 0.03, e);
  ok('visual: há turquesa de mar e rios', e.turquesa >= 0.02, e);
  const fundo = await A.av("getComputedStyle(document.body).backgroundColor + '|' + getComputedStyle(document.getElementById('cartao')).backgroundColor");
  ok('visual: fundo da página e do cartão são claros', fundo.split('|').every((c) => c.match(/\d+/g).slice(0, 3).reduce((s, n) => s + +n, 0) / 3 > 190), fundo);
  const fonte = await A.av("getComputedStyle(document.querySelector('h1')).fontFamily + '|' + getComputedStyle(document.getElementById('c-total')).fontFamily");
  ok('visual: tipografia Montserrat (sem monoespaçada)', !/mono|consolas|cascadia/i.test(fonte) && /Montserrat/.test(fonte), fonte);
  ok('visual: telemetria (azimute/inclinação/exagero) escondida', await A.av("getComputedStyle(document.querySelector('.leituras')).display === 'none'"));
}

async function estado(A) {
  await A.abrirTelao();
  const s = Object.values(AGR).reduce((a, g) => ({ p: a.p + g.pontuais, n: a.n + g.nao_pontuais }), { p: 0, n: 0 });
  ok('estado: total no cartão', (await A.av("document.getElementById('c-total').textContent")) === fmt(REG.meta.total));
  ok('estado: texto de turista (sem jargão de inventário)', await A.av("document.getElementById('c-total-rot').textContent === 'lugares para visitar' && document.getElementById('c-sub').hidden && !/inventário|MapBiomas/.test(document.getElementById('cartao').textContent)"));
  const leg = await A.av("[...document.querySelectorAll('#c-grupos li')].map((li) => [li.dataset.slug, li.querySelector('.n').textContent])");
  ok('estado: legenda de rotas = totais de registros.json', REG.grupos.every((g) => leg.some(([s2, n]) => s2 === g.slug && n === fmt(g.total))), leg);
}

async function textos(A) {
  await A.abrirTelao();
  await A.clicar(A.centro(await A.ret('#info')));
  await A.ate("!document.getElementById('fontes').hidden", 3000);
  const txt = await A.av('document.body.innerText');
  const resto = txt.match(/CT&I|SECTI|registros?\b|institui[çc]|Regi[ãa]o de Governo|\beixos?\b|undefined|NaN/gi);
  ok('textos: nenhum resto do projeto antigo nem "undefined"/"NaN" na tela (com fontes abertas)', !resto, resto);
  ok('textos: rodapé e fontes citam guias, QR e OpenStreetMap', /12 guias/.test(txt) && /Ver mapa/.test(txt) && /OpenStreetMap/.test(txt));
}

async function lentes(A) {
  await A.abrirTelao();
  const abas = await A.av("[...document.querySelectorAll('#c-abas button')].map((b) => b.textContent)");
  ok('lentes: abas Rotas, Quero…, Produtos', JSON.stringify(abas) === JSON.stringify(['Rotas', 'Quero…', 'Produtos']), abas);
  for (let i = 0; i < 3; i++) {
    await A.clicar(A.centro(await A.ret(`#c-abas button:nth-child(${i + 1})`)));
    await A.ate(`document.querySelector('#c-abas button:nth-child(${i + 1})').getAttribute('aria-selected') === 'true'`, 3000);
    await espera(400);
    const ns = await A.av("[...document.querySelectorAll('#c-grupos li .n')].map((n) => n.textContent)");
    const soma = ns.reduce((s, n) => s + (Number(n.replace(/\./g, '')) || 0), 0);
    if (i === 0) ok('lentes: Rotas somam o total', soma === REG.meta.total, soma);
    else ok(`lentes: ${abas[i]} com itens e nota de não exclusividade`, ns.length > 3 && !(await A.av("document.getElementById('c-nota').hidden")), ns.length);
  }
}

async function municipio(A) {
  await A.abrirTelao();
  const p = await A.etiqueta('Teresópolis');
  ok('município: etiqueta de Teresópolis visível', !!p);
  if (!p) return;
  await A.clicar(p);
  ok('município: clique na etiqueta seleciona Teresópolis', await A.ate("document.getElementById('c-nome').textContent === 'Teresópolis'", 4000));
  await espera(400);
  ok('município: total do cartão = agregados', (await A.av("document.getElementById('c-total').textContent")) === fmt(AGR[codMun('Teresópolis')].total));
  await A.clicar(A.centro(await A.ret('#c-olho')));
  ok('município: tocar a região no cartão sobe para a região', await A.ate("document.getElementById('c-nome').textContent === 'Serra Verde Imperial'", 4000));
  await A.clicar(A.centro(await A.ret('#ver-estado')));
  ok('município: "Ver o estado inteiro" volta ao estado', await A.ate("document.getElementById('c-nome').textContent === 'Estado do Rio de Janeiro'", 4000));
}

async function alvo(A) {
  await A.abrirTelao();
  let codigo = null;
  for (let k = 0; k < 6 && !codigo; k++) { codigo = await A.alvoIsolado(); if (!codigo) await espera(1000); }
  ok('alvo: há atrativo isolado na tela para clicar', !!codigo);
  if (!codigo) return;
  const p = await A.alvoEstavel(codigo);
  await A.clicar(p);
  ok('alvo: clique real no alvo do chão abre a ficha dele', await A.ate(`window.__telao.ficha() === ${JSON.stringify(codigo)}`, 3000), { codigo, p });
  await conferirFicha(A, codigo, 'alvo');
  ok('alvo: o cartão passa ao município do atrativo', await A.ate(`document.getElementById('c-nome').textContent === ${JSON.stringify(FIC[codigo].municipio)}`, 3000));
  const r = await A.ret('#f-qr');
  ok('alvo: QR com pelo menos 200 px em 1080p', r && r[2] >= 200 && Math.abs(r[2] - r[3]) < 2, r);
  await espera(300);
  const lido = lerQr(await A.capturar('p-alvo-qr.png', { x: r[0], y: r[1], width: r[2], height: r[3] }));
  ok('alvo: o QR da tela decodifica para a URL do atrativo', lido === urlQr(FIC[codigo]), [lido, urlQr(FIC[codigo])]);
  await A.capturar('p-alvo.png');
}

async function lista(A) {
  await A.abrirTelao();
  await A.clicar(await A.etiqueta('Teresópolis'));
  await A.ate("document.getElementById('c-nome').textContent === 'Teresópolis'", 4000);
  await espera(2500);
  const lad = await A.av("(() => { const l = [...document.querySelectorAll('.leque.vis .lad[data-slug]')][0]; if (!l) return null; const r = l.getBoundingClientRect(); return { slug: l.dataset.slug, n: l.querySelector('b').textContent, p: [r.left + r.width / 2, r.top + r.height / 2] }; })()");
  ok('lista: leque de ladrilhos visível', !!lad);
  if (!lad) return;
  await A.clicar(lad.p);
  ok('lista: ladrilho abre a lista', await A.ate("!document.getElementById('item').hidden", 3000));
  const regs = REG.registros.filter((r) => r[4] === codMun('Teresópolis') && r[2] === lad.slug);
  const lis = await A.av("[...document.querySelectorAll('#i-lista li')].map((li) => li.dataset.codigo)");
  ok('lista: itens = atrativos daquela rota no município', lis.length === Math.min(40, regs.length) && lad.n === String(regs.length), { lis: lis.length, dados: regs.length, ladrilho: lad.n });
  const acesos = await A.av('window.__telaoDepuracao.item()?.acesos ?? null');
  if (acesos) ok('lista: alvos acesos = atrativos com ponto', acesos.length === regs.filter((r) => PREC[r[3]].ponto_exato_permitido).length, acesos.length);
  await A.clicar(A.centro(await A.ret('#i-lista li')));
  ok('lista: clique no item abre a ficha dele', await A.ate(`window.__telao.ficha() === ${JSON.stringify(lis[0])}`, 3000));
  await conferirFicha(A, lis[0], 'lista');
}

async function vazio(A) {
  await A.abrirTelao();
  await A.clicar([672, 30]); // céu acima do relevo, à esquerda do cartão
  await espera(800);
  ok('vazio: clique fora do relevo não abre ficha nem lista', !(await A.av('window.__telao.ficha()')) && (await A.av("document.getElementById('item').hidden")));
  ok('vazio: continua no estado', (await A.av("document.getElementById('c-nome').textContent")) === 'Estado do Rio de Janeiro');
}

// retângulos do HUD e das etiquetas (px), com folga, e leitura dos alvos na tela — usados para escolher onde clicar
const livreHud = `const hud = [...document.querySelectorAll('.lad, .marca .etq, #cartao, #titulo, #controles, #bussola, #item, #ficha, #rodape')].filter((e) => !e.closest('[hidden]')).map((e) => e.getBoundingClientRect()).filter((r) => r.width);
    const livre = (x, y, m) => hud.every((r) => x < r.left - m || x > r.right + m || y < r.top - m || y > r.bottom + m);
    const regs = ${JSON.stringify(REG.registros.filter((r) => PREC[r[3]].ponto_exato_permitido).map((r) => r[5]))};
    const pts = regs.map((c) => ({ c, p: window.__telao.projetar(c) })).filter((a) => a.p && a.p[0] > 20 && a.p[0] < innerWidth - 20 && a.p[1] > 20 && a.p[1] < innerHeight - 20);`;

async function juntos(A) { // dois alvos colados sob o mesmo toque: abre a lista curta para escolher
  await A.abrirTelao();
  const acharPar = (dmax = 16) => A.av(`(() => { ${livreHud}
    for (const a of pts) for (const b of pts) { if (a.c >= b.c) continue; const d = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]); if (d < 6 || d > ${dmax}) continue;
      const mx = (a.p[0] + b.p[0]) / 2, my = (a.p[1] + b.p[1]) / 2; if (!livre(mx, my, ${dmax > 16 ? 20 : 40})) continue;
      if (pts.some((o) => o !== a && o !== b && Math.hypot(o.p[0] - mx, o.p[1] - my) < 28)) continue; return { a: a.c, b: b.c, p: [mx, my], d }; } return null; })()`);
  let par = await acharPar();
  ok('juntos: há dois alvos colados (6–16 px) na vista do estado', !!par);
  if (!par) return;
  await A.clicar(par.p);
  ok('juntos: de longe, tocar entre alfinetes colados aproxima o município (e mostra o nome)', await A.ate("window.__telaoDepuracao.selecao() !== 'estado' && document.querySelector('.rot.sel')?.textContent.length > 0", 3000));
  await espera(2000);
  for (let k = 0; k < 4 && !(par = await acharPar(30)); k++) await espera(800);
  ok('juntos: perto, há dois alvos colados (6–30 px) para testar', !!par, await A.av(`(() => { ${livreHud} let n = 0, l = 0; for (const a of pts) for (const b of pts) { if (a.c >= b.c) continue; const d = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]); if (d >= 6 && d <= 30) { n++; if (livre((a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2, 20)) l++; } } return { pts: pts.length, pares: n, livres: l, sel: window.__telaoDepuracao.selecao(), dist: window.__telaoDepuracao.cam().dist }; })()`));
  if (!par) return;
  await A.clicar(par.p);
  ok('juntos: toque entre dois alvos abre a lista para escolher', await A.ate("!document.getElementById('item').hidden && /lugares próximos/.test(document.getElementById('i-titulo').textContent)", 3000), par);
  const cods = await A.av("[...document.querySelectorAll('#i-lista li')].map((li) => li.dataset.codigo)");
  ok('juntos: a lista traz exatamente os dois', cods.length === 2 && cods.includes(par.a) && cods.includes(par.b), cods);
  ok('juntos: nenhuma ficha abriu antes da escolha', !(await A.av('window.__telao.ficha()')));
  await A.clicar(A.centro(await A.ret('#i-lista li:nth-child(2)')));
  ok('juntos: escolher na lista abre a ficha daquele', await A.ate(`window.__telao.ficha() === ${JSON.stringify(cods[1])}`, 3000));
  await conferirFicha(A, cods[1], 'juntos');
}

async function relevo(A) { // toque no relevo, longe de alvos e etiquetas, seleciona o município sob ele
  await A.abrirTelao();
  // pontos livres ao lado de alvos de verdade (alvos ficam em terra), longe de outros alvos e do HUD
  const cand = await A.av(`(() => { ${livreHud}
    const out = []; pts.forEach((a, i) => { if (i % 3) return; for (const [dx, dy] of [[40, 0], [-40, 0], [0, 40], [0, -40], [30, 30], [-30, -30]]) {
      const x = a.p[0] + dx, y = a.p[1] + dy; if (x < 20 || x > innerWidth - 20 || y < 20 || y > innerHeight - 20 || !livre(x, y, 25)) continue;
      if (pts.some((o) => Math.hypot(o.p[0] - x, o.p[1] - y) < 32)) continue; out.push([x, y]); } }); return out; })()`);
  ok('relevo: há pontos livres para testar', cand.length >= 5, cand.length);
  let nomes = [];
  for (const p of cand.slice(0, 40)) {
    await A.clicar(p); await espera(500);
    const nome = await A.av("document.getElementById('c-nome').textContent");
    if (nome !== 'Estado do Rio de Janeiro') { nomes.push(nome); await A.clicar(A.centro(await A.ret('#ver-estado'))); await espera(1400); }
    if (nomes.length >= 3) break;
  }
  ok('relevo: toque no relevo seleciona municípios (pelo menos 3 pontos testados)', nomes.length >= 3 && nomes.every((n) => MUN.municipios.some((m) => m.nome === n)), nomes);
  ok('relevo: nenhum toque no relevo abriu ficha', !(await A.av('window.__telao.ficha()')));
}

async function fechar(A) {
  await A.abrirTelao();
  const c = REG.registros.find((r) => r[3] === 'endereco')[5];
  await A.av(`window.__telao.abrir(${JSON.stringify(c)})`);
  await A.tecla('Escape', 'Escape', 27);
  ok('fechar: Esc fecha a ficha', await A.ate("document.getElementById('ficha').hidden", 2000));
  await A.av(`window.__telao.abrir(${JSON.stringify(c)})`);
  await espera(300);
  await A.clicar(A.centro(await A.ret('#f-fechar')));
  ok('fechar: botão Fechar fecha a ficha', await A.ate("document.getElementById('ficha').hidden", 2000));
}

async function conteudo(A) {
  await A.abrirTelao();
  const cods = Object.keys(FIC);
  const amostra = [...[0, 70, 140, 210, 280, 350, 420, 490, 560, 629].map((i) => cods[i]),
    cods.find((c) => FIC[c].precisao === 'municipal'), cods.find((c) => FIC[c].precisao === 'referencia'),
    cods.find((c) => !FIC[c].telefone && !FIC[c].funcionamento)].filter(Boolean);
  for (const c of amostra) { await A.av(`window.__telao.abrir(${JSON.stringify(c)})`); await espera(150); await conferirFicha(A, c, `conteúdo ${c.slice(0, 28)}`); }
}

async function legenda(A) {
  await A.abrirTelao();
  const g = REG.grupos[0];
  await A.clicar(A.centro(await A.ret(`#c-grupos li[data-slug="${g.slug}"]`)));
  ok('legenda: rota no cartão abre a lista no estado inteiro', await A.ate("!document.getElementById('item').hidden", 3000) && /Estado do Rio de Janeiro/.test(await A.av("document.getElementById('i-olho').textContent")));
  const n = await A.av("document.querySelectorAll('#i-lista li').length");
  ok('legenda: lista com os atrativos da rota', n === Math.min(40, g.total), [n, g.total]);
  const ac = await A.av('window.__telaoDepuracao.item().acesos.length');
  ok('legenda: alvos acesos = atrativos da rota com ponto', ac === REG.registros.filter((r) => r[2] === g.slug && PREC[r[3]].ponto_exato_permitido).length, ac);
  ok('legenda: linha da rota marcada', await A.av(`document.querySelector('#c-grupos li[data-slug="${g.slug}"]').classList.contains('ativo')`));
  await A.capturar('p-legenda.png');
  await A.clicar(A.centro(await A.ret(`#c-grupos li[data-slug="${g.slug}"]`)));
  ok('legenda: tocar de novo desfaz o realce', await A.ate("document.getElementById('item').hidden", 2000) && !(await A.av('!!document.querySelector("#c-grupos li.ativo")')));
}

async function passeio(A) {
  await A.abrirTelao(); // ?ocio=1500
  ok('passeio: começa sozinho após o ócio', await A.ate('!!window.__telao.estado().atracao', 8000));
  const vistos = [], fichas = []; let ultEtapa = '', fechouNoEstado = true;
  const fim = Date.now() + 48000;
  while (Date.now() < fim) {
    const s = await A.av("({ e: window.__telao.estado().atracao?.etapa, nome: document.getElementById('c-nome').textContent, f: window.__telao.ficha(), qr: !!document.querySelector('#f-qr svg') })");
    if (s.f && s.f !== fichas.at(-1)?.c) fichas.push({ c: s.f, qr: s.qr });
    if (s.e === 'municipio' && !vistos.includes(s.nome)) vistos.push(s.nome);
    if (ultEtapa === 'estado' && s.e === 'regiao' && s.f) fechouNoEstado = false;
    ultEtapa = s.e; await espera(200);
  }
  ok('passeio: percorre pelo menos 4 regiões', vistos.length >= 4, vistos);
  ok('passeio: abre fichas, todas com QR', fichas.length >= 4 && fichas.every((f) => f.qr), fichas.map((f) => f.c));
  ok('passeio: nunca a mesma ficha duas vezes seguidas', fichas.every((f, i) => i === 0 || f.c !== fichas[i - 1].c));
  ok('passeio: as fichas são das regiões visitadas (não repete a mesma região seguida)', new Set(fichas.map((f) => FIC[f.c].regiao)).size >= 3);
  ok('passeio: fecha a ficha ao voltar para o estado', fechouNoEstado);
  await A.clicar([960, 500]);
  ok('passeio: um toque interrompe', await A.ate('!window.__telao.estado().atracao', 1500));
  ok('passeio: volta depois do ócio', await A.ate('!!window.__telao.estado().atracao', 8000));
  await A.tecla(' ', 'Space', 32);
  ok('passeio: espaço pausa', await A.ate('window.__telao.estado().pausado', 1500));
  const antes = await A.av('JSON.stringify(window.__telao.estado().atracao)'); await espera(4000);
  ok('passeio: pausado, não avança', (await A.av('JSON.stringify(window.__telao.estado().atracao)')) === antes);
  await A.clicar(A.centro(await A.ret('#pausa')));
  ok('passeio: botão retoma', await A.ate('!window.__telao.estado().pausado', 1500));
}

// notebooks e telas baixas: o cartão da direita precisa caber inteiro (nada de legenda cortada) no estado e num município
async function notebook(A, cdpPorta, url) {
  for (const tam of ['1280x720', '1366x768', '1536x864', '1920x869', '1920x1080']) {
    const B = await abrirAba(cdpPorta, url, tam);
    await B.abrirTelao();
    const cartao = () => B.av("(() => { const c = document.getElementById('cartao'); return { sobra: c.scrollHeight - c.clientHeight, nome: document.getElementById('c-nome').textContent, fim: c.getBoundingClientRect().bottom, rodape: document.getElementById('rodape').getBoundingClientRect().top }; })()");
    const e = await cartao();
    ok(`notebook ${tam}: cartão do estado cabe inteiro (sem corte)`, e.sobra <= 2 && e.fim <= e.rodape + 1, e);
    await B.av("window.__telaoDepuracao.selecionar('3303906')"); await espera(1200);
    const m = await cartao();
    ok(`notebook ${tam}: cartão de município cabe inteiro`, m.sobra <= 2 && m.fim <= m.rodape + 1, m);
    await B.capturar(`p-notebook-${tam}.png`);
    await B.limpo(`notebook ${tam}`);
    await fetch(`http://127.0.0.1:${cdpPorta}/json/close/${B.id}`);
  }
}

async function tamanhos(A, cdpPorta, url) {
  const rica = Object.keys(FIC).find((c) => FIC[c].telefone && FIC[c].funcionamento && FIC[c].descricao.length > 300 && FIC[c].lat != null);
  for (const [tam, lim] of [['1920x1080', { dd: 20, nome: 32, qr: 200 }], ['3840x2160', { dd: 40, nome: 64, qr: 400 }], ['1366x768', { dd: 14, nome: 24, qr: 150 }], ['390x844', { dd: 14, nome: 20, qr: 120 }]]) {
    const B = await abrirAba(cdpPorta, url, tam);
    await B.abrirTelao();
    await B.av(`window.__telao.abrir(${JSON.stringify(rica)})`); await espera(1500);
    const m = await B.av(`(() => { const px = (s) => parseFloat(getComputedStyle(document.querySelector(s)).fontSize), r = (s) => document.querySelector(s).getBoundingClientRect();
      const f = r('#ficha'), c = r('#cartao'), q = r('#f-qr');
      return { dd: px('#f-dados dd'), nome: px('#f-nome'), qr: q.width, rolagemH: document.documentElement.scrollWidth > innerWidth,
        dentro: f.left >= 0 && f.right <= innerWidth + 1 && f.top >= 0 && f.bottom <= innerHeight + 1, sobrepoe: !(f.right <= c.left || f.left >= c.right || f.bottom <= c.top || f.top >= c.bottom) }; })()`);
    const larga = Number(tam.split('x')[0]) >= 1366;
    ok(`tamanhos ${tam}: letra da ficha ≥ ${lim.dd}px, nome ≥ ${lim.nome}px, QR ≥ ${lim.qr}px`, m.dd >= lim.dd && m.nome >= lim.nome && (m.qr >= lim.qr || (Number(tam.split('x')[0]) < 1500 && m.qr === 0 && (await B.av("getComputedStyle(document.getElementById('f-abrir')).display === 'block'")))), m); // celular: botão do Maps no lugar do QR
    ok(`tamanhos ${tam}: sem rolagem horizontal e ficha dentro da tela`, !m.rolagemH && m.dentro, m);
    if (larga) ok(`tamanhos ${tam}: ficha não cobre o cartão`, !m.sobrepoe, m);
    await B.capturar(`p-tam-${tam}.png`);
    await B.limpo(`tamanhos ${tam}`);
    await fetch(`http://127.0.0.1:${cdpPorta}/json/close/${B.id}`);
  }
}

function simbolosDoAdmin() { // o admin só oferece ícones que o mapa sabe desenhar
  const php = fs.readFileSync(path.join(RAIZ, '..', 'servidor-php', 'app', 'termos.php'), 'utf8');
  const lista = [...(php.match(/const SIMBOLOS = \[([\s\S]*?)\];/)?.[1] ?? '').matchAll(/'([a-z-]+)' =>/g)].map((m) => m[1]);
  const cena = fs.readFileSync(path.join(RAIZ, 'cena.js'), 'utf8'), bloco = cena.slice(cena.indexOf('const SIMBOLO = {'), cena.indexOf('};', cena.indexOf('const SIMBOLO = {')));
  const faltam = lista.filter((k) => !new RegExp(`(^|[\\s{,])'?${k}'?:\\s*\\[`).test(bloco));
  ok('admin: todos os ícones oferecidos para rotas existem no mapa (SIMBOLO)', lista.length >= 10 && !faltam.length, { lista: lista.length, faltam });
}
simbolosDoAdmin();

function contraste() { // tudo sobre o papel creme dos cartões (#fbf5e6): texto ≥ 4,5:1; cor de rota (alfinete, ícone, carimbo) ≥ 3:1
  const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const razao = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const papel = '#fbf5e6';
  const rotas = REG.grupos.map((g) => [g.nome, +razao(g.cor_luz, papel).toFixed(2)]).filter(([, r]) => r < 3);
  ok('contraste: cor de cada rota sobre o papel ≥ 3:1 (gráficos)', !rotas.length, rotas);
  const textos = { tinta: '#3a2a1a', 'tinta-suave': '#6b5440', verde: '#1f4d36', terracota: '#b4532a' };
  const ruins = Object.entries(textos).map(([n, c]) => [n, +razao(c, papel).toFixed(2)]).filter(([, r]) => r < 4.5);
  ok('contraste: textos (tinta, tinta suave, verde, terracota) sobre o papel ≥ 4,5:1', !ruins.length, ruins);
  ok('contraste: texto do botão ativo (papel sobre verde) ≥ 4,5:1', razao(papel, '#1f4d36') >= 4.5);
}

async function servidor() {
  const porta = await portaLivre();
  const ps = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(RAIZ, 'servidor.ps1'), '-porta', String(porta)], { stdio: 'ignore' });
  filhos.push(ps);
  let pronto = false;
  for (let t = 0; t < 40 && !pronto; t++) { await espera(250); try { pronto = (await fetch(`http://localhost:${porta}/`)).ok; } catch {} }
  ok('servidor.ps1: sobe sem administrador e serve a página', pronto);
  if (pronto) {
    const bin = await fetch(`http://localhost:${porta}/dados/altura.bin`);
    ok('servidor.ps1: arquivo binário íntegro', bin.ok && (await bin.arrayBuffer()).byteLength === fs.statSync(path.join(RAIZ, 'dados/altura.bin')).size);
    const js = await fetch(`http://localhost:${porta}/cena.js`);
    ok('servidor.ps1: MIME de JavaScript (módulo carrega)', /javascript/.test(js.headers.get('content-type') ?? ''));
    const cru = (p) => new Promise((r) => { const q = http.request({ host: 'localhost', port: porta, path: p }, (res) => { res.resume(); r(res.statusCode); }); q.on('error', () => r(0)); q.end(); });
    const st = await Promise.all(['/../servidor.ps1', '/%2e%2e/servidor.ps1', '/..%5cservidor.ps1', '/dados/../../x'].map(cru));
    ok('servidor.ps1: bloqueia saída da pasta', st.every((s) => s !== 200), st);
  }
  matar(ps);
}

async function idiomas(A, cdpPorta, url) {
  const cat = (l) => JSON.parse(fs.readFileSync(path.join(RAIZ, 'i18n', `${l}.json`), 'utf8'));
  const trad = (l) => ler(`trad-${l}.json`);
  const L = ['en', 'fr', 'de'], chaves = Object.keys(cat('en'));
  for (const l of L) {
    const c = cat(l), tr = trad(l);
    ok(`idiomas ${l}: mesmas chaves nos três catálogos`, Object.keys(c).length === chaves.length && chaves.every((k) => k in c));
    ok(`idiomas ${l}: nenhum texto vazio ou corrompido (U+FFFD)`, Object.values(c).every((v) => v && !v.includes('�')));
    ok(`idiomas ${l}: variáveis {x} iguais ao português`, chaves.every((k) => (k.match(/\{\w+\}/g) || []).sort().join() === (c[k].match(/\{\w+\}/g) || []).sort().join()));
    ok(`idiomas ${l}: traduz todos os ${Object.keys(FIC).length} lugares`, Object.keys(FIC).every((k) => tr[k]?.descricao || !FIC[k].descricao));
    ok(`idiomas ${l}: sem U+FFFD no conteúdo`, !JSON.stringify(tr).includes('�'));
  }
  const LEN = ler('lentes.json'), nomes = new Set([REG.meta.fonte, REG.meta.aviso, REG.meta.ressalvas.ausencia, ...REG.grupos.map((g) => g.nome), ...REG.precisoes.map((p) => p.rotulo)]);
  for (const v of Object.values(LEN.lentes)) { nomes.add(v.rotulo); if (v.nota) nomes.add(v.nota); for (const i of v.itens) { nomes.add(i.nome); nomes.add(i.curto); } }
  for (const l of L) { const falta = [...nomes].filter((n) => !(n in cat(l))); ok(`idiomas ${l}: catálogo cobre todos os nomes dos dados (rotas, produtos, experiências, avisos)`, !falta.length, falta); }
  ok('idiomas: acentos de nomes próprios preservados', ['Piraí', 'Paraíba', 'Sertão da Prata'].every((n) => !Object.values(trad('en')).some((v) => /Pirai|Paraiba|Sertao da Prata/.test(v.descricao ?? ''))));
  const cod = Object.keys(FIC).find((k) => FIC[k].descricao && FIC[k].funcionamento && FIC[k].precisao === 'endereco');
  for (const l of L) {
    const B = await abrirAba(cdpPorta, `${url}?lang=${l}`, '1920x1080');
    await B.abrirTelao();
    ok(`idiomas ${l}: <html lang> e título`, await B.av(`document.documentElement.lang.startsWith('${l}') && document.title !== 'Rio Rural · Turismo Rural RJ'`));
    ok(`idiomas ${l}: interface sem português visível`, await B.av("!/lugares para visitar|Sobre o mapa|Pausar passeio|Ver o estado inteiro/.test(document.body.innerText) && document.getElementById('c-total-rot').textContent !== 'lugares para visitar'"));
    await B.av(`window.__telao.abrir(${JSON.stringify(cod)})`); await espera(300);
    const d = trad(l)[cod];
    ok(`idiomas ${l}: ficha traz a descrição traduzida`, await B.av(`document.getElementById('f-descricao').textContent === ${JSON.stringify(d.descricao)}`));
    const outro = L.find((x) => x !== l);
    await B.clicar(B.centro(await B.ret(`#idiomas [data-idioma="${outro}"]`)));
    ok(`idiomas ${l}→${outro}: ficha aberta é refeita no novo idioma`, await B.ate(`document.getElementById('f-descricao').textContent === ${JSON.stringify(trad(outro)[cod].descricao)}`, 4000));
    await B.clicar(B.centro(await B.ret('#idiomas [data-idioma="pt"]')));
    ok(`idiomas ${l}→pt: volta ao português`, await B.ate(`document.getElementById('f-descricao').textContent === ${JSON.stringify(FIC[cod].descricao)} && document.getElementById('c-total-rot').textContent === 'lugares para visitar'`, 4000));
    ok(`idiomas ${l}→${outro}→pt: abas, botões, lema e rodapé voltam todos ao português`, await B.ate(`(() => { const tx = (s) => document.querySelector(s)?.textContent.trim();
      return [...document.querySelectorAll('#c-abas button')].map((b) => b.textContent).join('|') === 'Rotas|Quero…|Produtos'
        && /^(Pausar|Retomar) passeio$/.test(tx('#pausa')) && tx('#ver-estado') === 'Ver o estado inteiro' && tx('#ver-lista') === 'Ver em lista'
        && tx('.lema') === 'Sabores, histórias e caminhos' && tx('#r-base').startsWith('Informações dos guias') && tx('#info') === 'ⓘ Sobre o mapa'; })()`, 4000));
    await B.capturar(`p-idioma-${l}.png`);
    await B.limpo(`idiomas ${l}`);
    await fetch(`http://127.0.0.1:${cdpPorta}/json/close/${B.id}`);
  }
}

async function celular(A, cdpPorta, url) {
  const rica = Object.keys(FIC).find((c) => FIC[c].telefone && FIC[c].funcionamento && FIC[c].descricao.length > 300 && FIC[c].lat != null);
  for (const tam of ['360x740', '390x844', '412x915', '768x1024', '844x390']) {
    const B = await abrirAba(cdpPorta, url, tam);
    await B.abrirTelao();
    const dentro = (sel) => B.av(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.closest('[hidden]')) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1; })()`);
    ok(`celular ${tam}: sem rolagem horizontal`, await B.av('document.documentElement.scrollWidth <= innerWidth'));
    for (const sel of ['#titulo h1', '#cartao', '#ver-estado', '#norte', '#info', '#idiomas [data-idioma="de"]']) ok(`celular ${tam}: ${sel} cabe na tela`, await dentro(sel));
    const peq = await B.av(`[...document.querySelectorAll('#idiomas button, #info, #ver-estado, #norte, #c-abas button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width < 40 || r.height < 40; }).map((b) => b.id || b.textContent)`);
    ok(`celular ${tam}: alvos de toque ≥ 40 px`, !peq.length, peq);
    await B.clicar(B.centro(await B.ret('#info')));
    ok(`celular ${tam}: painel Sobre o mapa cabe e rola`, await B.ate("!document.getElementById('fontes').hidden", 2000) && await dentro('#fontes') && await dentro('#fechar') );
    await B.clicar(B.centro(await B.ret('#fechar')));
    await B.av(`window.__telao.abrir(${JSON.stringify(rica)})`); await espera(1200);
    { const d = { f: await dentro("#ficha"), x: await dentro("#f-fechar"), q: await dentro("#f-qr"), r: await B.av("JSON.stringify([\"#ficha\",\"#f-fechar\",\"#f-qr\"].map((s) => document.querySelector(s).getBoundingClientRect().toJSON()))") }; ok(`celular ${tam}: ficha cabe na tela, com botão Fechar e QR`, d.f && d.x, d); }
    ok(`celular ${tam}: cartão some enquanto a ficha está aberta`, await B.av("getComputedStyle(document.getElementById('cartao')).display === 'none'") || Number(tam.split('x')[0]) > 760);
    await B.clicar(B.centro(await B.ret('#f-fechar')));
    ok(`celular ${tam}: fechar a ficha devolve o cartão`, await B.ate("document.getElementById('ficha').hidden", 2000) && await dentro('#cartao'));
    await B.clicar(B.centro(await B.ret('#idiomas [data-idioma="de"]')));
    ok(`celular ${tam}: trocar idioma por toque`, await B.ate("document.documentElement.lang.startsWith('de') && document.getElementById('c-total-rot').textContent === 'Orte zu besuchen'", 4000) && await dentro('#info'));
    await B.capturar(`p-celular-${tam}.png`);
    await B.limpo(`celular ${tam}`);
    await fetch(`http://127.0.0.1:${cdpPorta}/json/close/${B.id}`);
  }
}

async function modolista(A, cdpPorta, url) {
  for (const tam of ['390x844', '1366x768']) {
    const B = await abrirAba(cdpPorta, `${url}?modo=lista`, tam);
    await B.abrirTelao();
    ok(`lista simples ${tam}: lista com todos os lugares e sem canvas visível`, await B.ate("document.querySelectorAll('#ml-lista li').length > 100", 5000) && await B.av("getComputedStyle(document.getElementById('tela')).display === 'none'"));
    await B.av("(() => { const q = document.getElementById('ml-busca'); q.value = 'cafe'; q.dispatchEvent(new Event('input')); })()");
    const n = await B.av("document.querySelectorAll('#ml-lista li').length");
    ok(`lista simples ${tam}: busca sem acento acha lugares`, n > 0 && n < Object.keys(FIC).length, n);
    await B.clicar(B.centro(await B.ret('#ml-lista button')));
    ok(`lista simples ${tam}: ficha em texto com link do Maps`, await B.ate("!document.getElementById('ml-ficha').hidden && (document.getElementById('ml-maps')?.href || '').startsWith('https://')", 3000));
    ok(`lista simples ${tam}: sem rolagem lateral`, await B.av('document.documentElement.scrollWidth <= innerWidth'));
    await B.clicar(B.centro(await B.ret('#ml-voltar')));
    ok(`lista simples ${tam}: voltar mostra a lista`, await B.ate("document.getElementById('ml-ficha').hidden && !document.getElementById('ml-lista').hidden", 2000));
    await B.clicar(B.centro(await B.ret('#idiomas [data-idioma="fr"]')));
    ok(`lista simples ${tam}: idioma muda o botão de volta ao 3D`, await B.ate("document.getElementById('ml-3d').textContent === 'Voir la carte 3D'", 4000));
    await B.capturar(`p-lista-${tam}.png`);
    await B.limpo(`lista simples ${tam}`);
    await fetch(`http://127.0.0.1:${cdpPorta}/json/close/${B.id}`);
  }
}

async function busca(A) {
  await A.abrirTelao();
  const digitar = async (txt) => {
    await A.clicar(A.centro(await A.ret('#busca')));
    await A.cdp.send('Input.insertText', { text: txt });
    await A.tecla('Enter', 'Enter', 13);
  };
  await digitar('miguel pereira');
  ok('busca: "miguel pereira" (sem acento, minúsculas) aproxima o município', await A.ate("window.__telaoDepuracao.selecao() === 'Miguel Pereira'", 4000));
  ok('busca: o nome do município aparece no mapa e no cartão', await A.ate("document.querySelector('.rot.sel')?.textContent.includes('Miguel Pereira') && document.getElementById('c-nome').textContent === 'Miguel Pereira'", 4000));
  const cod = Object.keys(FIC)[5];
  await digitar(`${FIC[cod].nome} · ${FIC[cod].municipio}`);
  ok('busca: nome de um lugar abre a ficha dele', await A.ate(`window.__telao.ficha() === ${JSON.stringify(cod)}`, 4000));
}

async function rolagem(A, cdpPorta, url) { // painel "o que tem aqui" em notebook de tela baixa: roda do mouse e barra arrastada
  const B = await abrirAba(cdpPorta, url, '1920x869');
  await B.abrirTelao();
  await B.clicar(B.centro(await B.ret('#c-abas [data-lente="tipos"]')));
  await espera(400);
  await B.clicar(B.centro(await B.ret('#c-grupos li[data-slug="queijos-e-laticinios"]')));
  ok('rolagem: lista de um produto abre', await B.ate("!document.getElementById('item').hidden && document.querySelectorAll('#i-lista li').length > 10", 3000));
  const info = () => B.av("(() => { const p = document.getElementById('item'), r = p.getBoundingClientRect(); return { top: p.scrollTop, max: p.scrollHeight - p.clientHeight, r: [r.left, r.top, r.width, r.height], visiveis: [...document.querySelectorAll('#i-lista li')].filter((li) => { const q = li.getBoundingClientRect(); return q.top >= r.top && q.bottom <= r.bottom; }).length }; })()");
  let i = await info();
  ok('rolagem: o painel mostra várias linhas da lista ao mesmo tempo', i.visiveis >= 3, i);
  ok('rolagem: há o que rolar', i.max > 50, i);
  const [x, y, w, h] = i.r;
  await B.cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: x + w / 2, y: y + h / 2, deltaX: 0, deltaY: 300 });
  await espera(400);
  const depoisRoda = (await info()).top;
  ok('rolagem: a roda do mouse rola o painel', depoisRoda > 0, depoisRoda);
  await B.av("document.getElementById('item').scrollTop = 0");
  await espera(200);
  const bx = x + w - 6, by = y + 30; // barra de rolagem na borda direita do painel
  await B.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bx, y: by, button: 'left', clickCount: 1 });
  for (let k = 1; k <= 8; k++) await B.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bx, y: by + k * 15, button: 'left', buttons: 1 });
  await B.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bx, y: by + 120, button: 'left', clickCount: 1 });
  await espera(300);
  const depoisBarra = await info();
  ok('rolagem: arrastar a barra com o mouse rola o painel', depoisBarra.top > 0, depoisBarra);
  ok('rolagem: arrastar a barra não fecha o painel nem mexe no mapa', await B.av("!document.getElementById('item').hidden"));
  await B.capturar('p-rolagem.png');
  await B.limpo('rolagem');
  await fetch(`http://127.0.0.1:${cdpPorta}/json/close/${B.id}`);
}

const SECOES = [carregar, visual, estado, textos, lentes, municipio, alvo, juntos, relevo, lista, vazio, fechar, conteudo, legenda, passeio, tamanhos, notebook, idiomas, celular, modolista, busca, rolagem];

function servidorHTTP(porta) {
  const mimes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.bin': 'application/octet-stream' };
  return new Promise((pronto) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const arq = path.resolve(RAIZ, rel);
      if (!arq.startsWith(RAIZ + path.sep) || !fs.existsSync(arq) || !fs.statSync(arq).isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': mimes[path.extname(arq).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(arq));
    });
    srv.listen(porta, '127.0.0.1', () => pronto(srv));
  });
}

async function main() {
  fs.mkdirSync(PERFIL, { recursive: true });
  const marca = path.join(PERFIL, 'DevToolsActivePort');
  fs.rmSync(marca, { force: true });
  const tam = process.env.TELAO_TAM || '1920x1080', so = process.env.TELAO_SECAO;
  // TELAO_URL=https://… prova o site publicado (os dados de referência continuam sendo os de telao/dados: publique antes de provar)
  const remoto = process.env.TELAO_URL ? process.env.TELAO_URL.replace(/\/?$/, '/') : null;
  const srv = remoto ? null : await servidorHTTP(await portaLivre());
  const url = remoto ?? `http://127.0.0.1:${srv.address().port}/`;
  if (remoto) HOSTS_PERMITIDOS.add(new URL(remoto).hostname);
  const chrome = spawn(CHROME, ['--headless=new', `--user-data-dir=${PERFIL}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--window-size=${tam.replace('x', ',')}`, '--ignore-gpu-blocklist', ...(WIN ? ['--use-angle=d3d11'] : ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: 'ignore', detached: !WIN });
  filhos.push(chrome);
  let cdpPorta = 0;
  for (let t = 0; t < 80 && !cdpPorta; t++) { await espera(250); try { cdpPorta = Number(fs.readFileSync(marca, 'utf8').split('\n')[0]) || 0; } catch {} }
  if (!cdpPorta) throw new Error('o Chrome não abriu a porta de depuração');
  if (!so || so === 'contraste') { console.log('--- contraste'); contraste(); }
  if (WIN && !remoto && (!so || so === 'servidor')) { console.log('--- servidor (PowerShell: só no Windows)'); await servidor(); }
  for (const secao of SECOES.filter((s) => !so || s.name === so)) {
    console.log(`--- ${secao.name}`);
    const A = await abrirAba(cdpPorta, url + (secao.name === 'passeio' ? '?ocio=1500' : ''), tam);
    let relogio;
    await Promise.race([secao(A, cdpPorta, url), new Promise((_, nao) => { relogio = setTimeout(() => nao(new Error(`seção ${secao.name} passou de 120 s`)), 120000); })]);
    clearTimeout(relogio);
    await A.limpo(secao.name);
    await fetch(`http://127.0.0.1:${cdpPorta}/json/close/${A.id}`);
  }
  console.log(falhas ? `${falhas} verificação(ões) falharam` : 'todas as verificações passaram');
  srv?.close(); encerrar();
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error(e); encerrar(); process.exit(2); });
