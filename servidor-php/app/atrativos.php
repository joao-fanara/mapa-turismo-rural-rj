<?php
// Regras de negócio dos lugares (atrativos): validação, gravação com auditoria, exclusão lógica e restauração.
// Usado pelo formulário do admin e pela importação em lote (CSV): as duas entradas passam pelas mesmas regras.
declare(strict_types=1);

const CAMPOS_TEXTO = ['nome' => 200, 'endereco' => 300, 'funcionamento' => 400, 'telefone' => 255, 'instagram' => 160, 'site' => 255, 'descricao' => 6000];
const RJ_CAIXA = [-23.40, -45.00, -20.70, -40.90]; // lat_min, lng_min, lat_max, lng_max (estado + folga)
const PLANO = ['lon0' => -42.925, 'lat0' => -22.05, 'ky' => 110.574]; // mesmo plano local do telão (gera_telao.py); kx = 111,320 · cos(lat0)

function municipios_ref(): array
{
    static $m = null;
    if ($m === null) {
        $m = [];
        foreach (db()->query('SELECT codigo, nome FROM municipios') as $r) {
            $m[$r['codigo']] = $r['nome'];
        }
    }
    return $m;
}

/** Caixa (km, plano do telão) de cada município, lida da malha publicada: valida "a menos de 12 km do município". */
function caixas_municipios(): array
{
    static $c = null;
    if ($c === null) {
        $c = [];
        $j = json_decode((string) @file_get_contents(pasta_publica() . '/dados/municipios-3d.json'), true);
        foreach ($j['municipios'] ?? [] as $m) {
            $bb = [INF, INF, -INF, -INF];
            foreach ($m['aneis'] as $poli) {
                foreach ($poli as $anel) {
                    foreach ($anel as [$x, $y]) {
                        $bb = [min($bb[0], $x), min($bb[1], $y), max($bb[2], $x), max($bb[3], $y)];
                    }
                }
            }
            $c[$m['codigo']] = ['bb' => $bb, 'rotulo' => $m['rotulo']];
        }
    }
    return $c;
}

function km(float $lat, float $lng): array
{
    $kx = 111.320 * cos(deg2rad(PLANO['lat0']));
    return [round(($lng - PLANO['lon0']) * $kx, 3), round(($lat - PLANO['lat0']) * PLANO['ky'], 3)];
}

function termos(?string $tipo = null): array
{
    $s = db()->prepare('SELECT * FROM termos WHERE mapa_id = 1' . ($tipo ? ' AND tipo = ?' : '') . ' ORDER BY tipo, ordem');
    $s->execute($tipo ? [$tipo] : []);
    return $s->fetchAll();
}

/** Acha um município pelo código IBGE ou pelo nome (sem diferença de acento e maiúscula). */
function achar_municipio(string $v): ?string
{
    $v = trim($v);
    $ref = municipios_ref();
    if (isset($ref[$v])) {
        return $v;
    }
    foreach ($ref as $c => $n) {
        if (slug($n) === slug($v)) {
            return (string) $c; // chave numérica de array vira int no PHP
        }
    }
    return null;
}

/** Acha termos (rota/experiência/produto) por slug ou nome; devolve [ids, desconhecidos]. */
function achar_termos(string $tipo, array $valores): array
{
    $ids = [];
    $faltam = [];
    $todos = termos($tipo);
    foreach ($valores as $v) {
        $v = trim((string) $v);
        if ($v === '') {
            continue;
        }
        $t = array_values(array_filter($todos, fn ($t) => $t['slug'] === $v || slug($t['nome']) === slug($v) || slug($t['curto']) === slug($v)));
        $t ? $ids[] = (int) $t[0]['id'] : $faltam[] = $v;
    }
    return [array_values(array_unique($ids)), $faltam];
}

/**
 * Normaliza e valida os dados de um lugar. Entrada: campos do formulário/CSV (textos).
 * Devolve [dados_normalizados, erros(campo => mensagem)].
 */
function validar_atrativo(array $in, ?int $id = null): array
{
    $err = [];
    $d = [];
    foreach (CAMPOS_TEXTO as $c => $max) {
        $v = trim(str_replace("\r\n", "\n", (string) ($in[$c] ?? '')));
        if (!mb_check_encoding($v, 'UTF-8')) {
            $err[$c] = 'Texto com codificação inválida.';
            $v = '';
        }
        if (mb_strlen($v) > $max) {
            $err[$c] = "No máximo $max caracteres.";
        }
        $d[$c] = $v;
    }
    if ($d['nome'] === '') {
        $err['nome'] = 'Informe o nome do lugar.';
    }
    $d['municipio_codigo'] = achar_municipio((string) ($in['municipio'] ?? $in['municipio_codigo'] ?? ''));
    if (!$d['municipio_codigo']) {
        $err['municipio'] = 'Escolha um município do Estado do Rio de Janeiro.';
    }
    if ($d['site'] !== '') {
        $site = preg_match('~^https?://~i', $d['site']) ? $d['site'] : 'https://' . $d['site'];
        $p = parse_url($site);
        if (!$p || !in_array(strtolower($p['scheme'] ?? ''), ['http', 'https'], true) || !preg_match('/^[a-z0-9.-]+\.[a-z]{2,}$/i', $p['host'] ?? '')) {
            $err['site'] = 'Endereço de site inválido (ex.: www.exemplo.com.br).';
        }
    }
    if ($d['telefone'] !== '' && !preg_match('/\d{4}/', $d['telefone'])) {
        $err['telefone'] = 'Telefone sem número.';
    }
    foreach (['wifi', 'agendar', 'pet'] as $c) {
        $v = mb_strtoupper(trim((string) ($in[$c] ?? '')));
        $v = ['S' => 'SIM', 'N' => 'NÃO', 'NAO' => 'NÃO', 'NÃO INF.' => '', 'NAO INF.' => '', 'NÃO INFORMADO' => ''][$v] ?? $v; // "não informado" = em branco
        if (!in_array($v, SIM_NAO, true)) {
            $err[$c] = 'Use SIM, NÃO ou deixe em branco.';
            $v = '';
        }
        $d[$c] = $v;
    }
    // coordenada: as duas ou nenhuma; dentro do estado e a menos de 12 km do município
    $lat = trim(str_replace(',', '.', (string) ($in['lat'] ?? '')));
    $lng = trim(str_replace(',', '.', (string) ($in['lng'] ?? '')));
    $d['lat'] = $d['lng'] = null;
    if ($lat !== '' || $lng !== '') {
        if (!is_numeric($lat) || !is_numeric($lng)) {
            $err['lat'] = 'Latitude e longitude precisam ser números (ex.: -22.45, -43.47).';
        } elseif ($lat < RJ_CAIXA[0] || $lat > RJ_CAIXA[2] || $lng < RJ_CAIXA[1] || $lng > RJ_CAIXA[3]) {
            $err['lat'] = 'A coordenada está fora do Estado do Rio de Janeiro (confira se não trocou latitude e longitude).';
        } else {
            $d['lat'] = round((float) $lat, 6);
            $d['lng'] = round((float) $lng, 6);
            $cx = caixas_municipios()[$d['municipio_codigo'] ?? ''] ?? null;
            if ($cx) {
                [$x, $y] = km($d['lat'], $d['lng']);
                [$x0, $y0, $x1, $y1] = $cx['bb'];
                $dx = max($x0 - $x, 0, $x - $x1);
                $dy = max($y0 - $y, 0, $y - $y1);
                if (hypot($dx, $dy) > 12) {
                    $err['lat'] = 'A coordenada fica a mais de 12 km do município escolhido.';
                }
            }
        }
    }
    $prec = (string) ($in['precisao'] ?? '');
    $d['precisao'] = $d['lat'] === null ? 'municipal' : ($prec === 'referencia' ? 'referencia' : 'endereco');
    // rotas, experiências e produtos escolhidos (não mais por palavra-chave)
    $lista = static fn ($v) => is_array($v) ? $v : preg_split('/\s*;\s*/', (string) $v, -1, PREG_SPLIT_NO_EMPTY);
    $d['termos'] = [];
    foreach (['rota' => 'rotas', 'experiencia' => 'experiencias', 'produto' => 'produtos'] as $tipo => $campo) {
        [$ids, $faltam] = achar_termos($tipo, $lista($in[$campo] ?? []));
        if ($faltam) {
            $err[$campo] = 'Não reconhecido: ' . implode(', ', $faltam) . '.';
        }
        $d['termos'] = array_merge($d['termos'], $ids);
    }
    [$rp] = achar_termos('rota', [(string) ($in['rota_principal'] ?? '')]);
    $rotas = achar_termos('rota', $lista($in['rotas'] ?? []))[0];
    $d['rota_principal_id'] = $rp[0] ?? $rotas[0] ?? null;
    if (!$d['rota_principal_id']) {
        $err['rota_principal'] = 'Escolha a rota principal (define a cor e o ícone do alfinete).';
    } elseif (!in_array($d['rota_principal_id'], $d['termos'], true)) {
        $d['termos'][] = $d['rota_principal_id'];
    }
    // duplicado: mesmo nome no mesmo município
    if (!isset($err['nome']) && $d['municipio_codigo']) {
        $s = db()->prepare('SELECT id FROM atrativos WHERE mapa_id = 1 AND nome = ? AND municipio_codigo = ? AND excluido_em IS NULL AND id <> ?');
        $s->execute([$d['nome'], $d['municipio_codigo'], $id ?? 0]);
        if ($s->fetch()) {
            $err['nome'] = 'Já existe um lugar com este nome neste município.';
        }
    }
    return [$d, $err];
}

function carregar_atrativo(int $id): ?array
{
    $s = db()->prepare('SELECT * FROM atrativos WHERE id = ? AND mapa_id = 1');
    $s->execute([$id]);
    $a = $s->fetch();
    if (!$a) {
        return null;
    }
    $t = db()->prepare('SELECT termo_id FROM atrativo_termos WHERE atrativo_id = ?');
    $t->execute([$id]);
    $a['termos'] = array_map('intval', $t->fetchAll(PDO::FETCH_COLUMN));
    $tr = db()->prepare("SELECT idioma, campo, texto, status FROM traducoes WHERE entidade = 'atrativo' AND entidade_id = ?");
    $tr->execute([$id]);
    $a['traducoes'] = [];
    foreach ($tr as $r) {
        $a['traducoes'][$r['idioma']][$r['campo']] = $r;
    }
    return $a;
}

function codigo_livre(string $nome): string
{
    $base = substr(slug($nome) ?: 'lugar', 0, 50);
    $c = $base;
    $s = db()->prepare('SELECT 1 FROM atrativos WHERE mapa_id = 1 AND codigo = ?');
    for ($n = 2; $s->execute([$c]) && $s->fetch(); $n++) {
        $c = "$base-$n";
    }
    return $c;
}

/**
 * Grava (insere ou atualiza) um lugar já validado, com termos e traduções, e registra na auditoria.
 * $trad: [idioma => [campo => [texto, status]]]. Quando o português muda e a tradução não foi editada junto,
 * a tradução antiga vira "automatica" de novo (precisa de revisão).
 */
function salvar_atrativo(array $d, ?int $id = null, array $trad = [], string $origem = 'admin', string $status = 'publicado'): int
{
    $pdo = db();
    $antes = $id ? carregar_atrativo($id) : null;
    $cols = ['nome', 'municipio_codigo', 'endereco', 'descricao', 'funcionamento', 'telefone', 'instagram', 'site', 'wifi', 'agendar', 'pet', 'lat', 'lng', 'precisao', 'rota_principal_id'];
    $vals = array_map(fn ($c) => $d[$c], $cols);
    if ($d['precisao'] === 'municipal') { // sem ponto: o QR busca pelo nome (nunca o centro do município)
        $d['mapa_url'] = 'https://www.google.com/maps/search/?api=1&query=' . rawurlencode($d['nome'] . ', ' . municipios_ref()[$d['municipio_codigo']] . ', RJ');
    } else {
        $d['mapa_url'] = sprintf('https://maps.google.com/?q=%.6f,%.6f', $d['lat'], $d['lng']);
    }
    $cols[] = 'mapa_url';
    $vals[] = $d['mapa_url'];
    $propria = !$pdo->inTransaction(); // a importação em lote abre uma transação só para o arquivo inteiro
    if ($propria) {
        $pdo->beginTransaction();
    }
    try {
        if ($id) {
            $pdo->prepare('UPDATE atrativos SET ' . implode(', ', array_map(fn ($c) => "$c = ?", $cols)) . ' WHERE id = ? AND mapa_id = 1')->execute([...$vals, $id]);
            $pdo->prepare('DELETE FROM atrativo_termos WHERE atrativo_id = ?')->execute([$id]);
        } else {
            $cols = [...$cols, 'mapa_id', 'codigo', 'origem', 'status'];
            $vals = [...$vals, 1, codigo_livre($d['nome']), $origem, $status];
            $pdo->prepare('INSERT INTO atrativos (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')')->execute($vals);
            $id = (int) $pdo->lastInsertId();
        }
        $it = $pdo->prepare('INSERT INTO atrativo_termos (atrativo_id, termo_id) VALUES (?, ?)');
        foreach (array_unique($d['termos']) as $t) {
            $it->execute([$id, $t]);
        }
        $up = $pdo->prepare("INSERT INTO traducoes (entidade, entidade_id, idioma, campo, texto, status, revisado_por) VALUES ('atrativo', ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE texto = VALUES(texto), status = VALUES(status), revisado_por = VALUES(revisado_por)");
        $del = $pdo->prepare("DELETE FROM traducoes WHERE entidade = 'atrativo' AND entidade_id = ? AND idioma = ? AND campo = ?");
        foreach (IDIOMAS as $l) {
            foreach (['descricao', 'funcionamento'] as $c) {
                $novo = $trad[$l][$c] ?? null;
                $velho = $antes['traducoes'][$l][$c] ?? null;
                if ($novo !== null && trim($novo[0]) === '') {
                    $del->execute([$id, $l, $c]);
                } elseif ($novo !== null && ($velho === null || $novo[0] !== $velho['texto'] || $novo[1] !== $velho['status'])) {
                    $up->execute([$id, $l, $c, trim($novo[0]), $novo[1] === 'revisada' ? 'revisada' : 'automatica', $novo[1] === 'revisada' ? (usuario()['id'] ?? null) : null]);
                } elseif ($velho && $antes && $antes[$c] !== $d[$c] && $velho['status'] === 'revisada') {
                    $pdo->prepare("UPDATE traducoes SET status = 'automatica' WHERE entidade = 'atrativo' AND entidade_id = ? AND idioma = ? AND campo = ?")->execute([$id, $l, $c]);
                }
            }
        }
        auditar($antes ? 'editar' : 'criar', 'atrativo', (string) $id, $antes ? array_diff_key($antes, ['traducoes' => 1]) : null, array_diff_key($d, ['termos' => 0]) + ['termos' => $d['termos']]);
        if ($propria) {
            $pdo->commit();
        }
    } catch (Throwable $ex) {
        if ($propria) {
            $pdo->rollBack();
        }
        throw $ex;
    }
    return $id;
}

function excluir_atrativo(int $id): bool
{
    $s = db()->prepare('UPDATE atrativos SET excluido_em = NOW(), excluido_por = ? WHERE id = ? AND mapa_id = 1 AND excluido_em IS NULL');
    $s->execute([usuario()['id'] ?? null, $id]);
    if ($s->rowCount()) {
        auditar('excluir', 'atrativo', (string) $id, null, null);
    }
    return $s->rowCount() > 0;
}

function restaurar_atrativo(int $id): bool
{
    $a = carregar_atrativo($id);
    if (!$a || !$a['excluido_em']) {
        return false;
    }
    $s = db()->prepare('SELECT 1 FROM atrativos WHERE mapa_id = 1 AND nome = ? AND municipio_codigo = ? AND excluido_em IS NULL AND id <> ?');
    $s->execute([$a['nome'], $a['municipio_codigo'], $id]);
    if ($s->fetch()) {
        return false; // já existe outro ativo com o mesmo nome no município
    }
    db()->prepare('UPDATE atrativos SET excluido_em = NULL, excluido_por = NULL WHERE id = ?')->execute([$id]);
    auditar('restaurar', 'atrativo', (string) $id, null, null);
    return true;
}
