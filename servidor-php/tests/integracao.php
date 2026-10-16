<?php
// Testes de integração do lado servidor. Rodam SÓ contra o banco de teste (TURISMO_BANCO) e uma cópia da pasta pública
// (TURISMO_PUBLICO); recriam o banco a partir das migrações e da carga inicial. Uso:
//   TURISMO_BANCO=fanara87_tteste TURISMO_PUBLICO=/tmp/pub php tests/integracao.php <pasta com 001-esquema.sql, dados-iniciais.sql, 002-compoe.sql>
declare(strict_types=1);

$banco = getenv('TURISMO_BANCO');
if (!$banco || !str_contains($banco, 'teste')) {
    fwrite(STDERR, "Recusado: TURISMO_BANCO precisa apontar para um banco de TESTE.\n");
    exit(2);
}
require __DIR__ . '/../app/bootstrap.php';
require __DIR__ . '/../app/atrativos.php';
require __DIR__ . '/../app/publicar.php';
require __DIR__ . '/../app/csv.php';

$falhas = 0;
function ok(string $nome, bool $cond, mixed $det = null): void
{
    global $falhas;
    echo ($cond ? 'PASSOU  ' : 'FALHOU  ') . $nome . ($cond || $det === null ? '' : '  ' . json_encode($det, JSON_UNESCAPED_UNICODE)) . "\n";
    $falhas += $cond ? 0 : 1;
}

// --- banco limpo: esquema + carga inicial + migrações
$sqlDir = $argv[1] ?? __DIR__ . '/../../database';
$pdo = db();
$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $t) {
    $pdo->exec("DROP TABLE `$t`");
}
$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
foreach (['001-esquema.sql', 'dados-iniciais.sql', '002-compoe.sql', '003-telefone-e-modo-estrito.sql'] as $f) {
    $sql = file_get_contents("$sqlDir/$f");
    foreach (preg_split('/;\s*\n/', $sql) as $cmd) {
        $cmd = trim(preg_replace('/^--.*$/m', '', $cmd));
        if ($cmd !== '' && !preg_match('/^(START TRANSACTION|COMMIT)$/i', $cmd)) {
            $pdo->exec($cmd);
        }
    }
}
ok('banco: 630 lugares carregados', (int) $pdo->query('SELECT COUNT(*) FROM atrativos')->fetchColumn() === 630);

// --- usuário de teste
$pdo->prepare("INSERT INTO usuarios (email, nome, senha_hash, papel, trocar_senha) VALUES ('teste@exemplo.org', 'Teste', ?, 'administrador', 0)")
    ->execute([password_hash('senha-de-teste-123', PASSWORD_DEFAULT)]);
$_SESSION['uid'] = (int) $pdo->lastInsertId();

// --- Publicar reproduz os arquivos atuais (gerados pelo pipeline Python)
$dir = pasta_publica() . '/dados';
$antes = [];
foreach (ARQUIVOS_PUBLICADOS as $f) {
    $antes[$f] = json_decode(file_get_contents("$dir/$f"), true);
}
$novo = json_decode(json_encode(montar_publicacao(), JSON_UNESCAPED_UNICODE), true);
$A = $antes['registros.json'];
$N = $novo['registros.json'];
ok('publicar: mesmo total de registros', count($N['registros']) === count($A['registros']), [count($N['registros']), count($A['registros'])]);
$idx = array_column($A['registros'], null, 5);
$dif = [];
foreach ($N['registros'] as $r) {
    $o = $idx[$r[5]] ?? null;
    if (!$o || $o[2] !== $r[2] || $o[3] !== $r[3] || $o[4] !== $r[4] || $o[6] !== $r[6] || ($r[3] !== 'municipal' && (abs($o[0] - $r[0]) > 0.002 || abs($o[1] - $r[1]) > 0.002))) {
        $dif[] = [$r, $o];
    }
}
ok('publicar: registros iguais (rota, precisão, município, nome; posição ±2 m)', !$dif, array_slice($dif, 0, 2));
ok('publicar: grupos iguais', array_map(fn ($g) => [$g['slug'], $g['total'], $g['cor_luz']], $N['grupos']) === array_map(fn ($g) => [$g['slug'], $g['total'], $g['cor_luz']], $A['grupos']));
ok('publicar: totais por precisão iguais', array_column($N['precisoes'], 'total', 'classe') === array_column($A['precisoes'], 'total', 'classe'));
$normAg = static function (array $ag): array {
    ksort($ag);
    foreach ($ag as &$v) {
        ksort($v['grupos']);
        ksort($v);
    }
    return $ag;
};
ok('publicar: agregados por município iguais', $normAg($N['agregados']['por_municipio']) === $normAg($A['agregados']['por_municipio']));
$ordena = static function (array $x): array {
    sort($x);
    return $x;
};
$difL = [];
foreach ($antes['lentes.json']['por_registro'] as $c => $v) {
    $n = $novo['lentes.json']['por_registro'][$c] ?? null;
    if (!$n || $ordena($n['eixos']) !== $ordena($v['eixos']) || $ordena($n['tipos']) !== $ordena($v['tipos'])) {
        $difL[] = [$c, $v, $n];
    }
}
ok('publicar: experiências e produtos de cada lugar iguais', !$difL, array_slice($difL, 0, 2));
foreach (['camadas', 'eixos', 'tipos'] as $l) {
    $s = fn ($x) => array_map(fn ($i) => [$i['slug'], $i['nome'], $i['curto'], $i['simbolo'], $i['cor'], $i['compoe']], $x['lentes'][$l]['itens']);
    ok("publicar: lente $l igual", $s($novo['lentes.json']) === $s($antes['lentes.json']));
}
$difF = [];
$lista = static fn ($s) => $ordena(array_filter(explode('; ', (string) $s)));
foreach ($antes['fichas.json'] as $c => $f) {
    $n = $novo['fichas.json'][$c] ?? null;
    foreach ($f as $k => $v) {
        $nv = $n !== null && array_key_exists($k, $n) ? $n[$k] : '__falta__';
        $igual = in_array($k, ['rotas', 'categorias', 'experiencias'], true) ? $lista($v) === $lista($nv)
            : (in_array($k, ['lat', 'lng'], true) ? ($v === null ? $nv === null : abs($v - $nv) < 1e-6) : ($k === 'agendar' && $v === 'NÃO INF.' ? $nv === '' : $v === $nv)); // "NÃO INF." = não informado
        if (!$igual) {
            $difF[] = [$c, $k, $v, $nv];
        }
    }
}
ok('publicar: fichas iguais campo a campo', !$difF, array_slice($difF, 0, 3));
foreach (IDIOMAS as $l) {
    ok("publicar: trad-$l igual", $novo["trad-$l.json"] == $antes["trad-$l.json"]);
}

// --- validação
[$d, $err] = validar_atrativo(['nome' => '', 'municipio' => 'Atlantis', 'rotas' => 'Rota Inexistente', 'lat' => '-22.5', 'lng' => '', 'site' => 'javascript:alert(1)', 'wifi' => 'talvez']);
ok('validar: recusa nome vazio, município fora do RJ, rota desconhecida, coordenada incompleta, site perigoso e SIM/NÃO inválido',
    isset($err['nome'], $err['municipio'], $err['rotas'], $err['lat'], $err['site'], $err['wifi']), $err);
[$d, $err] = validar_atrativo(['nome' => 'Sítio Teste', 'municipio' => 'miguel pereira', 'rota_principal' => 'cafe', 'lat' => '-22.2', 'lng' => '-41.0']);
ok('validar: coordenada a mais de 12 km do município é recusada', isset($err['lat']), $err);
[$d, $err] = validar_atrativo(['nome' => 'Sítio Teste', 'municipio' => 'Miguel Pereira', 'rota_principal' => 'Café e Fazendas Históricas', 'produtos' => 'Café; Mel e abelhas', 'experiencias' => 'Degustação', 'lat' => '-22,4540', 'lng' => '-43,4690', 'wifi' => 's', 'site' => 'www.sitioteste.com.br']);
ok('validar: aceita dados bons (vírgula decimal, nome do município sem acento, S → SIM)', !$err && $d['municipio_codigo'] === '3302908' && $d['wifi'] === 'SIM' && $d['precisao'] === 'endereco', $err ?: $d);

// --- criar, editar, excluir, restaurar (com auditoria) e publicar
$id = salvar_atrativo($d, null, ['en' => ['descricao' => ['Test farm.', 'revisada']]]);
$a = carregar_atrativo($id);
ok('criar: grava lugar, termos e tradução revisada', $a['codigo'] === 'sitio-teste' && count($a['termos']) === 4 && $a['traducoes']['en']['descricao']['status'] === 'revisada', $a['termos']);
[$d2, $err2] = validar_atrativo(['nome' => 'Sítio Teste', 'municipio' => '3302908', 'rota_principal' => 'cafe']);
ok('validar: duplicado (mesmo nome no mesmo município) é recusado', isset($err2['nome']));
$d['descricao'] = 'Nova descrição em português.';
salvar_atrativo($d, $id);
$a = carregar_atrativo($id);
ok('editar: mudar o português devolve a tradução revisada a "automatica"', $a['descricao'] === 'Nova descrição em português.' && $a['traducoes']['en']['descricao']['status'] === 'automatica');
ok('excluir: exclusão lógica', excluir_atrativo($id) && carregar_atrativo($id)['excluido_em'] !== null);
$pub = montar_publicacao();
ok('publicar: lugar excluído não sai no site', !isset($pub['fichas.json']['sitio-teste']));
ok('restaurar: volta a ficar ativo', restaurar_atrativo($id) && carregar_atrativo($id)['excluido_em'] === null);
$pub = montar_publicacao();
ok('publicar: lugar novo sai com alfinete, rota e tradução', isset($pub['fichas.json']['sitio-teste']) && $pub['fichas.json']['sitio-teste']['rota_principal'] === 'cafe'
    && ($pub['trad-en.json']->{'sitio-teste'}['descricao'] ?? '') === 'Test farm.');
$aud = $pdo->query("SELECT acao FROM auditoria WHERE entidade = 'atrativo' AND entidade_id = '$id' ORDER BY id")->fetchAll(PDO::FETCH_COLUMN);
ok('auditoria: criar, editar, excluir, restaurar registrados', $aud === ['criar', 'editar', 'excluir', 'restaurar'], $aud);

// --- CSV em lote
$csv = "\xEF\xBB\xBFnome;municipio;rota_principal;produtos;lat;lng;wifi;site\n"
    . "Queijaria do Teste;Nova Friburgo;queijos;Queijos e laticínios;;;SIM;\n"
    . "=HYPERLINK(\"x\");Nova Friburgo;queijos;;;;;\n"
    . "Lugar Sem Município;;cafe;;;;;\n"
    . "Sítio Teste;Miguel Pereira;cafe;;;;;\n";
$prev = ler_csv($csv);
ok('csv: lê BOM e ponto-e-vírgula', $prev['colunas'][0] === 'nome' && count($prev['linhas']) === 4, $prev['colunas']);
$v = previa_csv($prev);
ok('csv: prévia separa válidas e com erro', $v['validas'] === 2 && $v['com_erro'] === 2, array_map(fn ($l) => $l['erros'], $v['linhas']));
ok('csv: "Sítio Teste" já existe → vira atualização', ($v['linhas'][3]['acao'] ?? '') === 'atualizar' || ($v['linhas'][3]['erros'] ?? []) !== [], $v['linhas'][3]);
$r = importar_csv($v);
ok('csv: importa só as válidas, em transação', $r['inseridos'] + $r['atualizados'] === 2 && (int) $pdo->query("SELECT COUNT(*) FROM atrativos WHERE nome = 'Queijaria do Teste'")->fetchColumn() === 1, $r);
$exp = exportar_csv();
ok('csv: exportação neutraliza fórmulas (=, +, -, @), sem estragar números negativos', !preg_match('/(^|;)"?([=+@]|-[^\d])/m', substr($exp, strpos($exp, "\n") + 1)) && str_contains($exp, ';-22.'));
ok('csv: exportação tem cabeçalho e todos os lugares ativos', str_starts_with(ltrim($exp, "\xEF\xBB\xBF"), 'codigo;nome;municipio') && substr_count($exp, "\n") >= 632);

// --- senha
ok('senha: fraca é recusada, forte aceita', senha_forte('curta') !== null && senha_forte('somenteletras') !== null && senha_forte('boa-senha-2026') === null);
ok('login: senha certa entra, errada não', is_array(autenticar('teste@exemplo.org', 'senha-de-teste-123')) && is_string(autenticar('teste@exemplo.org', 'errada')));
for ($i = 0; $i < 5; $i++) {
    autenticar('teste@exemplo.org', 'errada');
}
ok('login: bloqueia após 5 erros, mesmo com a senha certa', is_string(autenticar('teste@exemplo.org', 'senha-de-teste-123')));

echo $falhas ? "$falhas verificação(ões) falharam\n" : "todas as verificações passaram\n";
exit($falhas ? 1 : 0);
