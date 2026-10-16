# Converte atrativos.json no formato de dados do telão (registros.json, lentes.json, fichas.json, municipios-3d.json com regiões turísticas)
import json, math, re, unicodedata, urllib.parse
from collections import defaultdict, Counter
import sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
BASE = Path(__file__).resolve().parent   # dados-fonte/
W = str(BASE) + '/'                      # atrativos.json (saída do merge.py) e regioes_capas.json
D = str(BASE.parent / 'telao' / 'dados') + '/'   # saída: o que o telão lê
# malha dos municípios com as regiões de governo originais (entrada); a saída, com as regiões turísticas, vai para o telão
MUN3D_ORIGINAL = str(BASE / 'base' / 'municipios-3d.original.json')

def norm(s): return unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower().strip()
def slug(s): return re.sub(r'[^a-z0-9]+', '-', norm(s)).strip('-')

A = [a for a in json.load(open(W + 'atrativos.json', encoding='utf-8')) if a['lat']]
mun3d = json.load(open(MUN3D_ORIGINAL, encoding='utf-8'))
cod = {norm(m['nome']): m['codigo'] for m in mun3d['municipios']}

LON0, LAT0 = -42.925, -22.05
KX = 111.320 * math.cos(math.radians(LAT0)); KY = 110.574

# rotas temáticas -> grupos (cor do dado + cor clara p/ fundo escuro de TV)
ROTA = [('Café e Fazendas Históricas', 'cafe', '#8a5a2b', '#e8b070', 'circulo'),
        ('Queijos e Sabores da Montanha', 'queijos', '#c9a227', '#ffe07a', 'quadrado'),
        ('Cachaças, Cervejas e Doces', 'bebidas-doces', '#a8452f', '#ff9a7a', 'losango'),
        ('Frutas, Flores e Colheitas', 'colheitas', '#d9658b', '#ffa6c4', 'estrela'),
        ('Águas e Pesca', 'pesca', '#1f8fa0', '#6fe3f0', 'anel'),
        ('Mata Atlântica e Natureza', 'natureza', '#2f8a4f', '#7ee8a2', 'triangulo'),
        ('Mesa e Pouso Rural', 'mesa-pouso', '#b5562a', '#ffb38a', 'pentagono'),
        ('Cultura, Artesanato e Festas', 'cultura', '#7b4fa0', '#c9a6ff', 'hexagono'),
        ('Vivências no Campo', 'campo', '#7a7468', '#d6d0c4', 'gota')]
RSLUG = {r[0]: r[1] for r in ROTA}
CAT = ['Café', 'Cachaça e bebidas', 'Queijos e laticínios', 'Doces e compotas', 'Mel e abelhas', 'Frutas', 'Flores e plantas',
       'Hortaliças e orgânicos', 'Gastronomia', 'Hospedagem', 'Natureza e aventura', 'Fazenda histórica', 'Artesanato', 'Pesca e criação']
EXP = ['Degustação', 'Colheita', 'Trilha / natureza', 'Visita guiada', 'Compra direta', 'Com crianças', 'Cavalgada']
REG = ['Vale do Café', 'Costa do Sol', 'Agulhas Negras', 'Serra Verde Imperial', 'Região Metropolitana', 'Costa Verde', 'Costa Doce',
       'Caminhos Coloniais', 'Caminhos da Serra', 'Caminhos da Mata', 'Baixada Verde', 'Águas do Noroeste']
PREC = {'qr (google maps)': 'endereco', 'qr (localidade)': 'referencia', 'endereco (aproximado)': 'referencia', 'centro do municipio': 'municipal'}

reg, fichas, por_reg, agreg = [], {}, {}, defaultdict(lambda: {'total': 0, 'pontuais': 0, 'nao_pontuais': 0, 'grupos': Counter()})
vistos = Counter()
for a in A:
    c = cod.get(norm(a['municipio']), 'sem_municipio')
    s = slug(a['nome'])[:50]; vistos[s] += 1
    if vistos[s] > 1: s += f'-{vistos[s]}'
    g = RSLUG[a['rota_principal']]; p = PREC[norm(a['precisao'])]
    reg.append([round((a['lng'] - LON0) * KX, 3), round((a['lat'] - LAT0) * KY, 3), g, p, c, s, a['nome']])
    ag = agreg[c]; ag['total'] += 1; ag['grupos'][g] += 1; ag['pontuais' if p != 'municipal' else 'nao_pontuais'] += 1
    por_reg[s] = {'eixos': [slug(e) for e in a['experiencias'].split('; ') if e], 'tipos': [slug(c) for c in a['categorias'].split('; ') if c != 'Outros']}
    fichas[s] = {k: a[k] for k in ('nome', 'municipio', 'regiao', 'endereco', 'rotas', 'categorias', 'experiencias', 'funcionamento',
                                   'telefone', 'instagram', 'site', 'wifi', 'agendar', 'pet', 'mapa_url', 'descricao', 'lat', 'lng')}
    fichas[s]['rota_principal'] = g
    fichas[s]['precisao'] = p
    if p == 'municipal':  # sem coordenada real: nada de centroide na ficha; o QR busca pelo nome no mapa
        f = fichas[s]; f['lat'] = f['lng'] = None
        if not f['mapa_url'].startswith('http'):
            f['mapa_url'] = 'https://www.google.com/maps/search/?api=1&query=' + urllib.parse.quote(f"{a['nome']}, {a['municipio']}, RJ")
for ag in agreg.values(): ag['grupos'] = dict(ag['grupos']); ag['grupos_presentes'] = len(ag['grupos'])

tot = Counter(r[2] for r in reg)
grupos = [{'slug': s, 'nome': n, 'ordem': i + 1, 'cor_dado': cd, 'cor_token': cd, 'cor_luz': cl, 'total': tot[s]} for i, (n, s, cd, cl, _) in enumerate(ROTA) if tot[s]]
precisoes = [{'classe': 'endereco', 'rotulo': 'Ponto exato (QR do guia)', 'leitura': 'Coordenada do QR "Ver mapa" do guia oficial.', 'cautela': False, 'ponto_exato_permitido': True},
             {'classe': 'referencia', 'rotulo': 'Ponto aproximado (bairro ou endereço)', 'leitura': 'Coordenada aproximada: a localidade apontada pelo QR do guia ou o endereço geocodificado (OpenStreetMap).', 'cautela': False, 'ponto_exato_permitido': True},
             {'classe': 'municipal', 'rotulo': 'Só no município (sem ponto no guia)', 'leitura': 'Sem coordenada no guia: o ponto indica só o município.', 'cautela': True, 'ponto_exato_permitido': False}]
for p in precisoes: p['total'] = sum(r[3] == p['classe'] for r in reg)

meta = {'fonte': 'Guias Turismo Rural RJ (TurisRio / Setur-RJ), 12 regiões turísticas', 'versao_base': 'prototipo-0.1', 'data_corte': '2026-10-15',
        'provisorio': True, 'total': len(reg), 'campos': ['x_km', 'y_km', 'grupo', 'precisao_classe', 'municipio_codigo', 'codigo', 'nome'],
        'plano_local': {'lon0': LON0, 'lat0': LAT0, 'km_por_grau_lon': KX, 'km_por_grau_lat': KY},
        'aviso': 'Protótipo: dados extraídos automaticamente dos guias em PDF; podem conter erros de transcrição e de localização.',
        'ressalvas': {'geral': 'Dados extraídos dos guias Turismo Rural RJ; confira horários e agendamento direto com o empreendimento.',
                      'ausencia': 'A ausência de pontos não significa ausência de turismo rural no município: o mapa mostra só o que está nos 12 guias.'}}
json.dump({'meta': meta, 'grupos': grupos, 'precisoes': precisoes, 'registros': reg, 'linhas': {}, 'agregados': {'por_municipio': agreg}},
          open(D + 'registros.json', 'w', encoding='utf-8'), ensure_ascii=False)

def itens(nomes, simb='circulo'):
    return [{'slug': slug(n), 'nome': n, 'curto': n, 'simbolo': simb, 'cor': '#e3b23c', 'compoe': []} for n in nomes]
COMPOE = {'cafe': ['produção e degustação de café', 'fazendas históricas'], 'queijos': ['queijos e laticínios', 'doce de leite'],
          'bebidas-doces': ['cachaças e alambiques', 'cervejas e vinhos artesanais', 'doces, geleias e mel'],
          'colheitas': ['frutas e pomares', 'flores e plantas', 'hortas e orgânicos'], 'pesca': ['pesque-pague', 'pesca e cultura caiçara'],
          'natureza': ['trilhas e cachoeiras', 'Mata Atlântica e observação de aves'], 'mesa-pouso': ['restaurantes rurais', 'pousadas e hospedagem'],
          'cultura': ['artesanato', 'festas tradicionais', 'museus e igrejas'], 'campo': ['cavalgadas e haras', 'sítios de lazer e fazendinhas', 'outras vivências']}
cam = [{'slug': s, 'nome': n, 'curto': n.split(',')[0].split(' e ')[0], 'simbolo': sb, 'cor': cl, 'compoe': COMPOE.get(s, [])} for n, s, cd, cl, sb in ROTA if tot[s]]
lentes = {'camadas': {'rotulo': 'Rotas', 'unidade': 'atrativos', 'itens': cam},
          'eixos': {'rotulo': 'Quero…', 'unidade': 'atrativos', 'itens': itens(EXP, 'estrela'),
                    'nota': 'Um atrativo pode oferecer mais de uma experiência: as contagens não somam.'},
          'tipos': {'rotulo': 'Produtos', 'unidade': 'atrativos', 'itens': itens(CAT, 'anel'),
                    'nota': 'Um atrativo pode ter mais de um produto: as contagens não somam.'}}
json.dump({'versao_base': meta['versao_base'], 'data_corte': meta['data_corte'], 'fonte': meta['fonte'], 'lentes': lentes, 'por_registro': por_reg},
          open(D + 'lentes.json', 'w', encoding='utf-8'), ensure_ascii=False)
json.dump(fichas, open(D + 'fichas.json', 'w', encoding='utf-8'), ensure_ascii=False)

# regiões turísticas no lugar das regiões de governo; municípios fora dos guias ficam em "Outros municípios"
mreg = {cod.get(norm(a['municipio'])): a['regiao'] for a in A}
try:  # composição oficial listada nas capas dos guias (regioes_capas.json: {regiao: [municipios]}) completa quem não tem atrativo
    for r, ms in json.load(open(W + 'regioes_capas.json', encoding='utf-8')).items():
        for n in ms:
            n = {'levy gasparian': 'comendador levy gasparian'}.get(norm(n), norm(n))  # capa omite o "Comendador"
            if cod.get(n) and cod[n] not in mreg: mreg[cod[n]] = r
except FileNotFoundError: pass
for m in mun3d['municipios']:
    r = mreg.get(m['codigo'], 'Outros municípios'); m['regiao'] = r; m['regiao_id'] = slug(r)
regioes = []
for r in REG + ['Outros municípios']:
    ms = [m for m in mun3d['municipios'] if m['regiao'] == r]
    if not ms: continue
    rx = [sum(x) / len(ms) for x in zip(*[m['rotulo'] for m in ms])]
    regioes.append({'id': slug(r), 'nome': r, 'nome_curto': r, 'rotulo': [round(v, 3) for v in rx], 'municipios': [m['codigo'] for m in ms]})
mun3d['regioes'] = regioes
# divisas: arestas compartilhadas por dois municípios de regiões diferentes (os polígonos vizinhos têm vértices idênticos)
dono = defaultdict(set); mreg_cod = {m['codigo']: m['regiao'] for m in mun3d['municipios']}
for m in mun3d['municipios']:
    for poly in m['aneis']:
        for ring in poly:
            for p, q in zip(ring, ring[1:]):
                dono[tuple(sorted((tuple(p), tuple(q))))].add(m['codigo'])
mun3d['divisas_regioes'] = [[list(p), list(q)] for (p, q), cs in dono.items()
                            if len(cs) == 2 and len({mreg_cod[c] for c in cs}) == 2]
json.dump(mun3d, open(D + 'municipios-3d.json', 'w', encoding='utf-8'), ensure_ascii=False)
print(len(reg), 'registros;', Counter(r[3] for r in reg), '; regiões', [(r['nome'], len(r['municipios'])) for r in regioes])
