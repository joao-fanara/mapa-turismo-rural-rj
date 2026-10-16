# Gera database/dados-iniciais.sql (carga inicial do mapa "turismo-rural-rj") a partir dos dados já auditados.
# Importação única: depois dela o banco é a fonte da verdade (o admin edita; este script não roda de novo em produção).
import json
import os
import sys

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ler = lambda *p: json.load(open(os.path.join(RAIZ, *p), encoding='utf-8'))
sys.stdout.reconfigure(encoding='utf-8')


def q(v):
    if v is None or v == '':
        return "''" if v == '' else 'NULL'
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace('\\', '\\\\').replace("'", "''").replace('\x00', '') + "'"


A = ler('dados-fonte', 'atrativos.json')
F = ler('telao', 'dados', 'fichas.json')
M = ler('telao', 'dados', 'municipios-3d.json')
L = ler('telao', 'dados', 'lentes.json')['lentes']
codigos = list(F.keys())
assert len(A) == len(codigos) == 630, (len(A), len(codigos))
for a, c in zip(A, codigos):
    assert a['nome'] == F[c]['nome'], (a['nome'], F[c]['nome'])  # mesma ordem: o código vem da ficha

out = ['SET NAMES utf8mb4;', 'START TRANSACTION;',
       "INSERT INTO mapas (id, slug, nome) VALUES (1, 'turismo-rural-rj', 'Rio Rural · Turismo Rural RJ');"]
reg_id = {}
for i, r in enumerate(M['regioes'], 1):
    reg_id[r['id']] = i
    out.append(f"INSERT INTO regioes (id, mapa_id, slug, nome) VALUES ({i}, 1, {q(r['id'])}, {q(r['nome'])});")
for m in M['municipios']:
    out.append(f"INSERT INTO municipios (codigo, nome, regiao_id) VALUES ({q(m['codigo'])}, {q(m['nome'])}, {reg_id.get(m['regiao_id'], 'NULL')});")
# termos: lentes.json (camadas = rota, eixos = experiência, tipos = produto)
tipo = {'camadas': 'rota', 'eixos': 'experiencia', 'tipos': 'produto'}
termo_id, nid = {}, 0
for lente, t in tipo.items():
    for ordem, it in enumerate(L[lente]['itens']):
        nid += 1
        termo_id[(t, it['nome'])] = nid
        out.append(f"INSERT INTO termos (id, mapa_id, tipo, slug, nome, curto, cor, simbolo, ordem) VALUES ({nid}, 1, {q(t)}, {q(it['slug'])}, {q(it['nome'])}, {q(it['curto'])}, {q(it.get('cor'))}, {q(it.get('simbolo'))}, {ordem});")
mun = {m['nome']: m['codigo'] for m in M['municipios']}
sn = lambda v: '' if v not in ('SIM', 'NÃO') else v  # "NÃO INF." (não informado) = em branco
vistos_termo = set()
for n, (a, c) in enumerate(zip(A, codigos), 1):
    f = F[c]
    codmun = mun.get(a['municipio']) or next((m['codigo'] for m in M['municipios'] if m['nome'] == f['municipio']), None)
    assert codmun, a['municipio']
    rota = termo_id.get(('rota', a['rota_principal']))
    out.append(
        'INSERT INTO atrativos (id, mapa_id, codigo, nome, municipio_codigo, endereco, descricao, funcionamento, telefone, instagram, site, wifi, agendar, pet, lat, lng, precisao, mapa_url, rota_principal_id, status, origem, fonte_guia) VALUES '
        f"({n}, 1, {q(c)}, {q(a['nome'])}, {q(codmun)}, {q(a['endereco'])}, {q(a['descricao'])}, {q(a['funcionamento'])}, {q(a['telefone'])}, {q(a['instagram'])}, {q(a['site'])}, {q(sn(a['wifi']))}, {q(sn(a['agendar']))}, {q(sn(a['pet']))}, "
        f"{q(f['lat'])}, {q(f['lng'])}, {q(f['precisao'])}, {q(a['mapa_url'])}, {rota or 'NULL'}, 'publicado', 'guia', {q(f'{a['regiao']} · pdf {a['pdf']} p.{a['page']}')});")
    for t, campo in (('rota', 'rotas'), ('produto', 'categorias'), ('experiencia', 'experiencias')):
        for nome in dict.fromkeys(x.strip() for x in (a.get(campo) or '').split(';') if x.strip()):
            tid = termo_id.get((t, nome))
            if tid and (n, tid) not in vistos_termo:
                vistos_termo.add((n, tid))
                out.append(f'INSERT INTO atrativo_termos (atrativo_id, termo_id) VALUES ({n}, {tid});')
# traduções automáticas (status 'automatica'): descrição e funcionamento dos lugares; nomes e nomes curtos dos termos
n_trad = 0
for idioma in ('en', 'fr', 'de'):
    tr = ler('telao', 'dados', f'trad-{idioma}.json')
    cat = ler('telao', 'i18n', f'{idioma}.json')
    for n, c in enumerate(codigos, 1):
        for campo, texto in tr.get(c, {}).items():
            out.append(f"INSERT INTO traducoes (entidade, entidade_id, idioma, campo, texto) VALUES ('atrativo', {n}, {q(idioma)}, {q(campo)}, {q(texto)});")
            n_trad += 1
    for (t, nome), tid in termo_id.items():
        it = next(i for l in L.values() for i in l['itens'] if i['nome'] == nome)
        for campo, pt in (('nome', nome), ('curto', it['curto'])):
            if pt in cat:
                out.append(f"INSERT INTO traducoes (entidade, entidade_id, idioma, campo, texto) VALUES ('termo', {tid}, {q(idioma)}, {q(campo)}, {q(cat[pt])});")
out += ["INSERT INTO migracoes (nome) VALUES ('001-esquema'), ('dados-iniciais');", 'COMMIT;']
dest = os.path.join(RAIZ, 'database', 'dados-iniciais.sql')
open(dest, 'w', encoding='utf-8', newline='\n').write('\n'.join(out) + '\n')
print(f'{len(out)} comandos; {len(A)} atrativos; {n_trad} traduções de lugares; {os.path.getsize(dest) // 1024} KB')
