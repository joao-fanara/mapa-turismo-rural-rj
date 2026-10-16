// Gate de qualidade do projeto: roda tudo na ordem e para na primeira etapa que falhar.
//   node verificar.mjs           pipeline completo
//   node verificar.mjs rapido    só sintaxe e dados (segundos, sem navegador)
// Pré-requisitos: Node 22+, Python 3.10+ com openpyxl (e opencv-python-headless para ler o QR da tela), Chrome/Chromium (ou TELAO_CHROME).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const rapido = process.argv[2] === 'rapido';
const etapas = [
  ['sintaxe do telão (cena.js)', 'node', ['--check', 'telao/cena.js']],
  ['sintaxe das provas', 'node', ['--check', 'telao/_provas/provas.mjs']],
  ['sintaxe do gate', 'node', ['--check', 'verificar.mjs']],
  ['dados: invariantes e regressões', PYTHON, ['-m', 'unittest', 'dados-fonte/test_dados.py']],
  ...(rapido ? [] : [['interface no navegador: cliques reais, fichas, QR, passeio, servidor, tamanhos', 'node', ['telao/_provas/provas.mjs']]]),
];
const resumo = [];
for (const [nome, cmd, args] of etapas) {
  console.log(`\n=== ${nome}`);
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: RAIZ, stdio: 'inherit', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  const ok = r.status === 0;
  resumo.push(`${ok ? 'PASSOU ' : 'FALHOU '} ${nome} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (!ok) break;
}
console.log('\n--- resumo\n' + resumo.join('\n'));
process.exit(resumo.every((l) => l.startsWith('PASSOU')) && resumo.length === etapas.length ? 0 : 1);
