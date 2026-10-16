<?php
// "Publicar": gera, a partir do banco, os arquivos que o site e o telão leem (registros, lentes, fichas e traduções),
// no mesmo formato do gera_telao.py. Guarda cópia dos arquivos anteriores e troca cada arquivo de forma atômica.
// O site continua estático (abre offline na TV); o banco só é lido aqui.
declare(strict_types=1);

const ARQUIVOS_PUBLICADOS = ['registros.json', 'lentes.json', 'fichas.json', 'trad-en.json', 'trad-fr.json', 'trad-de.json', 'termos-en.json', 'termos-fr.json', 'termos-de.json'];

/** Monta os arquivos em memória: [nome => dados]. */
function montar_publicacao(): array
{
    $pdo = db();
    $dir = pasta_publica() . '/dados';
    $regAnt = json_decode((string) file_get_contents("$dir/registros.json"), true);
    $lenAnt = json_decode((string) file_get_contents("$dir/lentes.json"), true);
    $mun = json_decode((string) file_get_contents("$dir/municipios-3d.json"), true);
    $rotulo = array_column($mun['municipios'], 'rotulo', 'codigo');

    $termos = [];
    foreach (termos() as $t) {
        $termos[(int) $t['id']] = $t;
    }
    $porAtr = [];
    foreach ($pdo->query('SELECT x.atrativo_id, x.termo_id FROM atrativo_termos x JOIN termos t ON t.id = x.termo_id ORDER BY t.tipo, t.ordem') as $r) {
        $porAtr[(int) $r['atrativo_id']][] = $termos[(int) $r['termo_id']];
    }
    $atrs = $pdo->query("SELECT a.*, m.nome AS municipio, COALESCE(g.nome, 'Outros municípios') AS regiao
        FROM atrativos a JOIN municipios m ON m.codigo = a.municipio_codigo LEFT JOIN regioes g ON g.id = m.regiao_id
        WHERE a.mapa_id = 1 AND a.status = 'publicado' AND a.excluido_em IS NULL ORDER BY a.id")->fetchAll();

    $reg = $fichas = $porReg = $agreg = [];
    $ids = [];
    foreach ($atrs as $a) {
        $id = (int) $a['id'];
        $ids[$id] = $a['codigo'];
        $ts = $porAtr[$id] ?? [];
        $nomes = static fn ($tipo) => array_values(array_map(fn ($t) => $t['nome'], array_filter($ts, fn ($t) => $t['tipo'] === $tipo)));
        $slugs = static fn ($tipo) => array_values(array_map(fn ($t) => $t['slug'], array_filter($ts, fn ($t) => $t['tipo'] === $tipo)));
        $g = $termos[(int) $a['rota_principal_id']]['slug'] ?? 'campo';
        $p = $a['precisao'];
        // sem ponto: posição de rótulo do município (o telão nunca desenha esse ponto; conta só no município)
        [$x, $y] = $a['lat'] !== null ? km((float) $a['lat'], (float) $a['lng']) : array_map(fn ($v) => round((float) $v, 3), $rotulo[$a['municipio_codigo']] ?? [0, 0]);
        $reg[] = [$x, $y, $g, $p, $a['municipio_codigo'], $a['codigo'], $a['nome']];
        $ag = &$agreg[$a['municipio_codigo']];
        $ag ??= ['total' => 0, 'pontuais' => 0, 'nao_pontuais' => 0, 'grupos' => []];
        $ag['total']++;
        $ag['grupos'][$g] = ($ag['grupos'][$g] ?? 0) + 1;
        $ag[$p === 'municipal' ? 'nao_pontuais' : 'pontuais']++;
        unset($ag);
        $porReg[$a['codigo']] = ['eixos' => $slugs('experiencia'), 'tipos' => $slugs('produto')];
        $cats = $nomes('produto');
        $fichas[$a['codigo']] = [
            'nome' => $a['nome'], 'municipio' => $a['municipio'], 'regiao' => $a['regiao'], 'endereco' => $a['endereco'],
            'rotas' => implode('; ', $nomes('rota')), 'categorias' => $cats ? implode('; ', $cats) : 'Outros', 'experiencias' => implode('; ', $nomes('experiencia')),
            'funcionamento' => $a['funcionamento'], 'telefone' => $a['telefone'], 'instagram' => $a['instagram'], 'site' => $a['site'],
            'wifi' => $a['wifi'], 'agendar' => $a['agendar'], 'pet' => $a['pet'], 'mapa_url' => $a['mapa_url'], 'descricao' => (string) $a['descricao'],
            'lat' => $p === 'municipal' || $a['lat'] === null ? null : (float) $a['lat'], 'lng' => $p === 'municipal' || $a['lng'] === null ? null : (float) $a['lng'],
            'rota_principal' => $g, 'precisao' => $p,
        ];
    }
    foreach ($agreg as &$ag) {
        $ag['grupos_presentes'] = count($ag['grupos']);
    }
    unset($ag);

    $tot = array_count_values(array_column($reg, 2));
    $grupos = [];
    $i = 0;
    foreach (termos('rota') as $t) {
        $i++;
        if (!empty($tot[$t['slug']])) {
            $grupos[] = ['slug' => $t['slug'], 'nome' => $t['nome'], 'ordem' => $i, 'cor_dado' => $t['cor'], 'cor_token' => $t['cor'], 'cor_luz' => $t['cor'], 'total' => $tot[$t['slug']]];
        }
    }
    $precisoes = $regAnt['precisoes'];
    foreach ($precisoes as &$pr) {
        $pr['total'] = count(array_filter($reg, fn ($r) => $r[3] === $pr['classe']));
    }
    unset($pr);
    $meta = $regAnt['meta'];
    $meta['versao_base'] = 'banco-' . date('Ymd-Hi');
    $meta['data_corte'] = date('Y-m-d');
    $meta['total'] = count($reg);

    $itens = static function (string $tipo) use ($tot): array {
        $out = [];
        foreach (termos($tipo) as $t) {
            if ($tipo === 'rota' && empty($tot[$t['slug']])) {
                continue;
            }
            $out[] = ['slug' => $t['slug'], 'nome' => $t['nome'], 'curto' => $t['curto'], 'simbolo' => $t['simbolo'], 'cor' => $t['cor'],
                'compoe' => $t['compoe'] ? preg_split('/\s*;\s*/', $t['compoe']) : []];
        }
        return $out;
    };
    $lentes = $lenAnt['lentes'];
    $lentes['camadas']['itens'] = $itens('rota');
    $lentes['eixos']['itens'] = $itens('experiencia');
    $lentes['tipos']['itens'] = $itens('produto');

    $out = [
        'registros.json' => ['meta' => $meta, 'grupos' => $grupos, 'precisoes' => $precisoes, 'registros' => $reg, 'linhas' => (object) [], 'agregados' => ['por_municipio' => $agreg]],
        'lentes.json' => ['versao_base' => $meta['versao_base'], 'data_corte' => $meta['data_corte'], 'fonte' => $meta['fonte'], 'lentes' => $lentes, 'por_registro' => $porReg],
        'fichas.json' => $fichas,
    ];
    foreach (IDIOMAS as $l) {
        $tr = [];
        $s = $pdo->prepare("SELECT entidade_id, campo, texto FROM traducoes WHERE entidade = 'atrativo' AND idioma = ? AND texto <> '' ORDER BY entidade_id, campo");
        $s->execute([$l]);
        foreach ($s as $r) {
            if (isset($ids[(int) $r['entidade_id']])) {
                $tr[$ids[(int) $r['entidade_id']]][$r['campo']] = $r['texto'];
            }
        }
        $out["trad-$l.json"] = (object) $tr;
    }
    foreach (traducoes_termos() as $l => $nomes) {
        ksort($nomes, SORT_STRING);
        $out["termos-$l.json"] = (object) $nomes;
    }
    return $out;
}

/** Grava os arquivos (cópia de segurança antes, troca atômica). Devolve um resumo. */
function publicar(?string $pastaCopia = null): array
{
    $arquivos = montar_publicacao();
    $dir = pasta_publica() . '/dados';
    $copia = $pastaCopia ?? dirname(__DIR__) . '/backups/dados-' . date('Ymd-His');
    if (!is_dir($copia) && !mkdir($copia, 0700, true)) {
        throw new RuntimeException('Não foi possível criar a pasta de cópia.');
    }
    foreach (ARQUIVOS_PUBLICADOS as $f) {
        if (is_file("$dir/$f")) {
            copy("$dir/$f", "$copia/$f");
        }
    }
    foreach ($arquivos as $f => $dados) {
        $json = json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION);
        $tmp = "$dir/.$f." . bin2hex(random_bytes(4));
        file_put_contents($tmp, $json, LOCK_EX);
        chmod($tmp, 0644);
        rename($tmp, "$dir/$f");
    }
    $r = ['lugares' => count($arquivos['fichas.json']), 'versao' => $arquivos['registros.json']['meta']['versao_base'], 'copia' => $copia];
    auditar('publicar', 'site', null, null, $r);
    return $r;
}
