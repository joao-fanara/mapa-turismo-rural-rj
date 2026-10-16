<?php
// API pública de leitura: lugares publicados do mapa, no idioma pedido (?lang=pt|en|fr|de, cai no português se não houver tradução).
// Filtros: q (nome, município, produto), rota (slug), municipio (código IBGE), limite (≤ 200), deslocamento.
// Config fora da pasta pública: ~/apps/turismo-rural/config/config.php (nunca versionado).
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: public, max-age=300');

function falha(int $codigo, string $msg): never
{
    http_response_code($codigo);
    echo json_encode(['erro' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    falha(405, 'Somente GET.');
}
$lang = $_GET['lang'] ?? 'pt';
if (!in_array($lang, ['pt', 'en', 'fr', 'de'], true)) {
    falha(400, 'Idioma inválido.');
}
$limite = min(200, max(1, (int) ($_GET['limite'] ?? 50)));
$deslocamento = max(0, (int) ($_GET['deslocamento'] ?? 0));
$q = trim((string) ($_GET['q'] ?? ''));
$rota = (string) ($_GET['rota'] ?? '');
$municipio = (string) ($_GET['municipio'] ?? '');
if ($municipio !== '' && !preg_match('/^\d{7}$/', $municipio)) {
    falha(400, 'Município inválido.');
}
if ($rota !== '' && !preg_match('/^[a-z0-9-]{1,80}$/', $rota)) {
    falha(400, 'Rota inválida.');
}

$cfg = require dirname(__DIR__, 2) . '/apps/turismo-rural/config/config.php';
$b = $cfg['banco'];
try {
    $pdo = new PDO(
        "mysql:host={$b['host']};port={$b['porta']};dbname={$b['nome']};charset={$b['charset']}",
        $b['usuario'],
        $b['senha'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]
    );
} catch (PDOException) {
    falha(503, 'Banco indisponível.');
}

$onde = "a.mapa_id = 1 AND a.status = 'publicado' AND a.excluido_em IS NULL";
$par = [];
if ($municipio !== '') {
    $onde .= ' AND a.municipio_codigo = :mun';
    $par['mun'] = $municipio;
}
if ($rota !== '') {
    $onde .= " AND EXISTS (SELECT 1 FROM atrativo_termos x JOIN termos t ON t.id = x.termo_id WHERE x.atrativo_id = a.id AND t.tipo = 'rota' AND t.slug = :rota)";
    $par['rota'] = $rota;
}
if ($q !== '') {
    $onde .= " AND (a.nome LIKE :q1 OR m.nome LIKE :q2 OR EXISTS (SELECT 1 FROM atrativo_termos x JOIN termos t ON t.id = x.termo_id WHERE x.atrativo_id = a.id AND t.nome LIKE :q3))";
    $like = '%' . addcslashes($q, '%_\\') . '%';
    $par += ['q1' => $like, 'q2' => $like, 'q3' => $like];
}

$de = 'FROM atrativos a JOIN municipios m ON m.codigo = a.municipio_codigo';
$c = $pdo->prepare("SELECT COUNT(*) $de WHERE $onde");
$c->execute($par);
$total = (int) $c->fetchColumn();

$sql = "SELECT a.codigo, a.nome, m.nome AS municipio, a.endereco, a.funcionamento, a.telefone, a.instagram, a.site, a.wifi, a.agendar, a.pet,
        a.lat, a.lng, a.precisao, a.mapa_url, a.descricao, a.id,
        (SELECT t.slug FROM termos t WHERE t.id = a.rota_principal_id) AS rota_principal
        $de WHERE $onde ORDER BY a.nome LIMIT $limite OFFSET $deslocamento";
$s = $pdo->prepare($sql);
$s->execute($par);
$itens = $s->fetchAll();

if ($lang !== 'pt' && $itens) {
    $ids = array_column($itens, 'id');
    $marca = implode(',', array_fill(0, count($ids), '?'));
    $t = $pdo->prepare("SELECT entidade_id, campo, texto, status FROM traducoes WHERE entidade = 'atrativo' AND idioma = ? AND entidade_id IN ($marca)");
    $t->execute([$lang, ...$ids]);
    $tr = [];
    foreach ($t as $linha) {
        $tr[$linha['entidade_id']][$linha['campo']] = $linha;
    }
    foreach ($itens as &$i) {
        foreach (['descricao', 'funcionamento'] as $campo) {
            if (isset($tr[$i['id']][$campo])) {
                $i[$campo] = $tr[$i['id']][$campo]['texto'];
                $i['traducao_' . $campo] = $tr[$i['id']][$campo]['status'];
            }
        }
    }
    unset($i);
}
foreach ($itens as &$i) {
    unset($i['id']);
    $i['lat'] = $i['lat'] === null ? null : (float) $i['lat'];
    $i['lng'] = $i['lng'] === null ? null : (float) $i['lng'];
}
unset($i);

echo json_encode(['idioma' => $lang, 'total' => $total, 'limite' => $limite, 'deslocamento' => $deslocamento, 'itens' => $itens], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
