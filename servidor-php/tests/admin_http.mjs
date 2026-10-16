// Provas de segurança do admin publicado (sem credenciais): proteção das páginas, CSRF, cabeçalhos, arquivos bloqueados,
// API de leitura com entrada inválida. Uso: node servidor-php/tests/admin_http.mjs [https://turismo.fanara.com.br]
const BASE = (process.argv[2] || 'https://turismo.fanara.com.br').replace(/\/$/, '');
let falhas = 0;
const ok = (nome, cond, det) => { console.log(`${cond ? 'PASSOU' : 'FALHOU'}  ${nome}${cond || det === undefined ? '' : '  ' + JSON.stringify(det)}`); if (!cond) falhas++; };
const ir = (u, o = {}) => fetch(BASE + u, { redirect: 'manual', ...o });
const cookie = (r) => (r.headers.get('set-cookie') || '').split(';')[0];

for (const p of ['/admin/', '/admin/?p=lista', '/admin/?p=novo', '/admin/?p=csv&baixar=todos', '/admin/?p=publicar', '/admin/?p=usuarios', '/admin/?p=auditoria']) {
  const r = await ir(p);
  ok(`sem login, ${p} manda para o login`, r.status === 303 && /p=entrar$/.test(r.headers.get('location') || ''), r.status);
}
const e = await ir('/admin/?p=entrar');
const html = await e.text();
ok('login: página abre', e.status === 200 && /name="senha"/.test(html));
ok('login: cabeçalhos de segurança (CSP, frame, nosniff, no-store, HSTS)', ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'strict-transport-security'].every((h) => e.headers.get(h)) && /no-store/.test(e.headers.get('cache-control')));
ok('login: cookie de sessão Secure, HttpOnly, SameSite=Strict, só em /admin/', /secure/i.test(e.headers.get('set-cookie')) && /httponly/i.test(e.headers.get('set-cookie')) && /samesite=strict/i.test(e.headers.get('set-cookie')) && /path=\/admin\//i.test(e.headers.get('set-cookie')));
ok('login: não indexável', /noindex/.test(html) && /noindex/.test(e.headers.get('x-robots-tag') || ''));
const csrf = (html.match(/name="csrf" value="([0-9a-f]{64})"/) || [])[1];
ok('login: formulário traz token CSRF', !!csrf);
const sem = await ir('/admin/?p=entrar', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookie(e) }, body: 'email=a%40b.org&senha=x' });
ok('POST sem token CSRF é recusado', sem.status === 400, sem.status);
const errado = await ir('/admin/?p=entrar', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookie(e) }, body: `csrf=${csrf}&email=ninguem%40exemplo.org&senha=errada` });
const t = await errado.text();
ok('login errado: mensagem genérica (não revela se o e-mail existe)', errado.status === 200 && /E-mail ou senha incorretos/.test(t));
ok('login errado: e-mail digitado é escapado (sem HTML injetado)', !/<script>/i.test(t));
const inj = await ir('/admin/?p=entrar', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookie(e) }, body: `csrf=${csrf}&email=${encodeURIComponent("' OR 1=1 -- ")}&senha=${encodeURIComponent("' OR '1'='1")}` });
ok('login com SQL injetado não entra (ou o firewall da hospedagem barra com 406)', inj.status === 406 || (inj.status === 200 && /incorretos/.test(await inj.text())), inj.status);
for (const p of ['/admin/.htaccess', '/admin/index.php.bak', '/admin/x.php']) {
  const r = await ir(p);
  ok(`arquivo bloqueado: ${p}`, r.status === 403 || r.status === 404, r.status);
}
for (const p of ['/apps/turismo-rural/config/config.php', '/../apps/turismo-rural/config/config.php']) {
  const r = await ir(p);
  ok(`configuração fora do alcance: ${p}`, r.status === 404 || r.status === 400 || r.status === 403, r.status);
}
const api = await ir('/api/atrativos.php?lang=de&limite=1');
const j = await api.json();
ok('API: responde JSON com 630+ lugares', api.status === 200 && j.total >= 630 && j.itens.length === 1);
for (const q of ['lang=xx', 'municipio=1%27%20OR%201=1', 'rota=a%27b', 'limite=-5']) {
  const r = await ir(`/api/atrativos.php?${q}`);
  ok(`API: entrada inválida (${q}) não quebra nem vaza erro`, [200, 400, 406].includes(r.status) && !/(PDOException|Stack trace|SQLSTATE)/.test(await r.text()), r.status);
}
console.log(falhas ? `${falhas} verificação(ões) falharam` : 'todas as verificações passaram');
process.exit(falhas ? 1 : 0);
