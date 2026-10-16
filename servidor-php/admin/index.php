<?php
// Área administrativa (RF10/RF15): login, lista com busca e filtros, cadastro/edição com traduções, excluir/restaurar,
// planilha CSV em lote (modelo, prévia, importar, exportar), publicar no site, usuários e trilha de auditoria.
// Código e configuração ficam fora da pasta pública (~/apps/turismo-rural); aqui só a porta de entrada.
declare(strict_types=1);

$APP = dirname(__DIR__, 2) . '/apps/turismo-rural/app';
require "$APP/bootstrap.php";
require "$APP/atrativos.php";
require "$APP/csv.php";
require "$APP/publicar.php";

cabecalhos_seguranca();
iniciar_sessao();
$p = (string) ($_GET['p'] ?? 'lista');
$post = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
if ($post) {
    exigir_csrf();
}

function ir(string $url, ?string $aviso = null): never
{
    if ($aviso) {
        $_SESSION['aviso'] = $aviso;
    }
    header('Location: ' . $url, true, 303);
    exit;
}

function pagina(string $titulo, string $corpo): never
{
    $u = usuario();
    $aviso = $_SESSION['aviso'] ?? null;
    unset($_SESSION['aviso']);
    $menu = '';
    if ($u && !$u['trocar_senha']) {
        $itens = [['lista', 'Lugares'], ['novo', 'Novo lugar']];
        if (pode('csv')) {
            $itens[] = ['csv', 'Planilha (CSV)'];
        }
        if (pode('publicar')) {
            $itens[] = ['publicar', 'Publicar no site'];
            $itens[] = ['usuarios', 'Usuários'];
        }
        $itens[] = ['auditoria', 'Histórico'];
        foreach ($itens as [$k, $n]) {
            $menu .= '<a href="?p=' . $k . '"' . (($_GET['p'] ?? 'lista') === $k ? ' aria-current="page"' : '') . '>' . e($n) . '</a>';
        }
        $menu .= '<form method="post" action="?p=sair" class="sair">' . csrf_campo() . '<button type="submit">Sair (' . e($u['nome']) . ')</button></form>';
    }
    echo '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<meta name="robots" content="noindex"><meta name="author" content="João Fanara"><title>' . e($titulo) . ' · Admin Rio Rural</title>'
        . '<link rel="stylesheet" href="admin.css"></head><body><header><b class="marca">Rio Rural <small>admin</small></b><nav>' . $menu . '</nav></header><main>'
        . ($aviso ? '<p class="aviso" role="status">' . e($aviso) . '</p>' : '') . '<h1>' . e($titulo) . '</h1>' . $corpo . '</main></body></html>';
    exit;
}

// ---------- entrar / sair / trocar senha ----------
if ($p === 'entrar') {
    $msg = '';
    if ($post) {
        $r = autenticar((string) ($_POST['email'] ?? ''), (string) ($_POST['senha'] ?? ''));
        if (is_array($r)) {
            session_regenerate_id(true);
            $_SESSION = ['uid' => (int) $r['id'], 'csrf' => bin2hex(random_bytes(32)), 'ate' => time() + 7200];
            auditar('login', 'usuario', (string) $r['id'], null, null, (int) $r['id']);
            ir($r['trocar_senha'] ? '?p=senha' : '?p=lista');
        }
        $msg = '<p class="erro" role="alert">' . e($r) . '</p>';
    }
    pagina('Entrar', $msg . '<form method="post" class="cartao estreito">' . csrf_campo()
        . '<label>E-mail <input type="email" name="email" required autocomplete="username" autofocus></label>'
        . '<label>Senha <input type="password" name="senha" required autocomplete="current-password"></label>'
        . '<button type="submit">Entrar</button></form>');
}
if ($p === 'sair' && $post) {
    $_SESSION = [];
    session_regenerate_id(true);
    ir('?p=entrar', 'Você saiu.');
}
$u = usuario();
if (!$u) {
    ir('?p=entrar');
}
if ($p === 'senha' || $u['trocar_senha']) {
    $msg = $u['trocar_senha'] ? '<p class="aviso">Primeiro acesso: escolha uma senha sua.</p>' : '';
    if ($post && $p === 'senha') {
        $s1 = (string) ($_POST['nova'] ?? '');
        $chk = db()->prepare('SELECT senha_hash FROM usuarios WHERE id = ?');
        $chk->execute([$u['id']]);
        $erro = !password_verify((string) ($_POST['atual'] ?? ''), (string) $chk->fetchColumn()) ? 'Senha atual incorreta.'
            : ($s1 !== ($_POST['repetir'] ?? '') ? 'As senhas novas não conferem.' : senha_forte($s1));
        if (!$erro) {
            db()->prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 0 WHERE id = ?')->execute([password_hash($s1, PASSWORD_DEFAULT), $u['id']]);
            auditar('trocar_senha', 'usuario', (string) $u['id'], null, null);
            session_regenerate_id(true);
            ir('?p=lista', 'Senha alterada.');
        }
        $msg .= '<p class="erro" role="alert">' . e($erro) . '</p>';
    }
    pagina('Trocar senha', $msg . '<form method="post" action="?p=senha" class="cartao estreito">' . csrf_campo()
        . '<label>Senha atual <input type="password" name="atual" required autocomplete="current-password"></label>'
        . '<label>Nova senha (10+ caracteres, letras e números) <input type="password" name="nova" required minlength="10" autocomplete="new-password"></label>'
        . '<label>Repita a nova senha <input type="password" name="repetir" required minlength="10" autocomplete="new-password"></label>'
        . '<button type="submit">Salvar</button></form>');
}

// ---------- lista ----------
if ($p === 'lista') {
    $f = ['q' => trim((string) ($_GET['q'] ?? '')), 'municipio' => (string) ($_GET['municipio'] ?? ''), 'rota' => (string) ($_GET['rota'] ?? ''),
        'precisao' => (string) ($_GET['precisao'] ?? ''), 'situacao' => (string) ($_GET['situacao'] ?? 'ativos'), 'sem' => (string) ($_GET['sem'] ?? '')];
    $onde = ['a.mapa_id = 1'];
    $par = [];
    $onde[] = $f['situacao'] === 'excluidos' ? 'a.excluido_em IS NOT NULL' : 'a.excluido_em IS NULL';
    if ($f['situacao'] === 'pendentes') {
        $onde[] = "a.status = 'pendente'";
    }
    if ($f['q'] !== '') {
        $onde[] = '(a.nome LIKE ? OR a.codigo LIKE ?)';
        $par[] = $par[] = '%' . addcslashes($f['q'], '%_\\') . '%';
    }
    if (isset(municipios_ref()[$f['municipio']])) {
        $onde[] = 'a.municipio_codigo = ?';
        $par[] = $f['municipio'];
    }
    if (in_array($f['precisao'], ['endereco', 'referencia', 'municipal'], true)) {
        $onde[] = 'a.precisao = ?';
        $par[] = $f['precisao'];
    }
    if ($f['rota'] !== '' && preg_match('/^[a-z0-9-]+$/', $f['rota'])) {
        $onde[] = "a.rota_principal_id = (SELECT id FROM termos WHERE mapa_id = 1 AND tipo = 'rota' AND slug = ?)";
        $par[] = $f['rota'];
    }
    if (in_array($f['sem'], IDIOMAS, true)) {
        $onde[] = "NOT EXISTS (SELECT 1 FROM traducoes t WHERE t.entidade = 'atrativo' AND t.entidade_id = a.id AND t.idioma = ? AND t.campo = 'descricao')";
        $par[] = $f['sem'];
    } elseif ($f['sem'] === 'revisao') {
        $onde[] = "EXISTS (SELECT 1 FROM traducoes t WHERE t.entidade = 'atrativo' AND t.entidade_id = a.id AND t.status = 'automatica')";
    }
    $w = implode(' AND ', $onde);
    $pag = max(1, (int) ($_GET['pag'] ?? 1));
    $tot = db()->prepare("SELECT COUNT(*) FROM atrativos a WHERE $w");
    $tot->execute($par);
    $total = (int) $tot->fetchColumn();
    $s = db()->prepare("SELECT a.id, a.nome, a.codigo, a.precisao, a.status, a.excluido_em, m.nome AS municipio, t.curto AS rota
        FROM atrativos a JOIN municipios m ON m.codigo = a.municipio_codigo LEFT JOIN termos t ON t.id = a.rota_principal_id
        WHERE $w ORDER BY a.nome LIMIT 50 OFFSET " . (($pag - 1) * 50));
    $s->execute($par);
    $opt = static fn (array $op, string $sel) => implode('', array_map(fn ($k, $v) => '<option value="' . e((string) $k) . '"' . ((string) $k === $sel ? ' selected' : '') . '>' . e($v) . '</option>', array_keys($op), $op));
    $muns = municipios_ref();
    asort($muns);
    $rotas = array_column(termos('rota'), 'nome', 'slug');
    $html = '<form method="get" class="filtros"><input type="hidden" name="p" value="lista">'
        . '<input type="search" name="q" value="' . e($f['q']) . '" placeholder="Nome ou código" aria-label="Buscar">'
        . '<select name="municipio" aria-label="Município"><option value="">Todos os municípios</option>' . $opt($muns, $f['municipio']) . '</select>'
        . '<select name="rota" aria-label="Rota principal"><option value="">Todas as rotas</option>' . $opt($rotas, $f['rota']) . '</select>'
        . '<select name="precisao" aria-label="Localização"><option value="">Qualquer localização</option>' . $opt(['endereco' => 'Exata', 'referencia' => 'Aproximada', 'municipal' => 'Só o município'], $f['precisao']) . '</select>'
        . '<select name="sem" aria-label="Traduções"><option value="">Traduções: todas</option>' . $opt(['revisao' => 'Com tradução a revisar', 'en' => 'Sem inglês', 'fr' => 'Sem francês', 'de' => 'Sem alemão'], $f['sem']) . '</select>'
        . '<select name="situacao" aria-label="Situação">' . $opt(['ativos' => 'Ativos', 'pendentes' => 'Aguardando aprovação', 'excluidos' => 'Excluídos'], $f['situacao']) . '</select>'
        . '<button type="submit">Filtrar</button></form><p class="conta">' . $total . ' lugar(es)</p><table><thead><tr><th>Nome</th><th>Município</th><th>Rota</th><th>Localização</th><th></th></tr></thead><tbody>';
    foreach ($s as $a) {
        $acao = $a['excluido_em']
            ? '<form method="post" action="?p=restaurar">' . csrf_campo() . '<input type="hidden" name="id" value="' . $a['id'] . '"><button type="submit">Restaurar</button></form>'
            : '<a href="?p=editar&amp;id=' . $a['id'] . '">Editar</a>';
        $html .= '<tr><td>' . e($a['nome']) . ($a['status'] !== 'publicado' ? ' <span class="selo">' . e($a['status']) . '</span>' : '') . '</td><td>' . e($a['municipio']) . '</td><td>' . e($a['rota']) . '</td><td>'
            . e(['endereco' => 'Exata', 'referencia' => 'Aproximada', 'municipal' => 'Só o município'][$a['precisao']]) . '</td><td>' . $acao . '</td></tr>';
    }
    $html .= '</tbody></table>';
    $q = $_GET;
    $nav = '';
    if ($pag > 1) {
        $q['pag'] = $pag - 1;
        $nav .= '<a href="?' . e(http_build_query($q)) . '">← Anteriores</a> ';
    }
    if ($pag * 50 < $total) {
        $q['pag'] = $pag + 1;
        $nav .= '<a href="?' . e(http_build_query($q)) . '">Próximos →</a>';
    }
    pagina('Lugares', $html . '<p class="paginas">' . $nav . '</p>');
}

// ---------- novo / editar ----------
if ($p === 'novo' || $p === 'editar') {
    if (!pode('editar')) {
        ir('?p=lista', 'Seu papel não permite editar.');
    }
    $id = $p === 'editar' ? (int) ($_GET['id'] ?? 0) : null;
    $a = $id ? carregar_atrativo($id) : null;
    if ($id && (!$a || $a['excluido_em'])) {
        ir('?p=lista', 'Lugar não encontrado.');
    }
    $todos = termos();
    $err = [];
    $in = $a ? entrada_de($a) : ['wifi' => '', 'agendar' => '', 'pet' => '', 'rotas' => [], 'produtos' => [], 'experiencias' => [], 'precisao' => 'endereco'];
    $trad = [];
    foreach (IDIOMAS as $l) {
        foreach (['descricao', 'funcionamento'] as $c) {
            $trad[$l][$c] = [$a['traducoes'][$l][$c]['texto'] ?? '', $a['traducoes'][$l][$c]['status'] ?? 'automatica'];
        }
    }
    if ($post) {
        $in = $_POST;
        foreach (['rotas', 'produtos', 'experiencias'] as $c) {
            $in[$c] = array_map('strval', (array) ($_POST[$c] ?? []));
        }
        foreach (IDIOMAS as $l) {
            foreach (['descricao', 'funcionamento'] as $c) {
                $trad[$l][$c] = [(string) ($_POST["t_{$l}_$c"] ?? ''), isset($_POST["r_{$l}_$c"]) ? 'revisada' : 'automatica'];
            }
        }
        [$d, $err] = validar_atrativo($in, $id);
        if (!$err) {
            $novoId = salvar_atrativo($d, $id, $trad);
            ir('?p=editar&id=' . $novoId, 'Salvo. Lembre de publicar para o site mostrar a mudança.');
        }
    }
    $v = static fn ($c) => e(is_array($in[$c] ?? '') ? '' : (string) ($in[$c] ?? ''));
    $erro = static fn ($c) => isset($err[$c]) ? '<span class="erro" id="e-' . $c . '">' . e($err[$c]) . '</span>' : '';
    $campo = static fn ($c, $rot, $extra = '') => '<label>' . e($rot) . ' <input name="' . $c . '" value="' . $v($c) . '"' . $extra . (isset($err[$c]) ? ' aria-invalid="true" aria-describedby="e-' . $c . '"' : '') . '>' . $erro($c) . '</label>';
    $muns = municipios_ref();
    asort($muns);
    $selMun = (string) ($in['municipio'] ?? $in['municipio_codigo'] ?? '');
    $sn = static fn ($c, $rot) => '<label>' . e($rot) . ' <select name="' . $c . '">' . implode('', array_map(fn ($o) => '<option value="' . e($o) . '"' . (($in[$c] ?? '') === $o ? ' selected' : '') . '>' . e($o ?: 'não informado') . '</option>', SIM_NAO)) . '</select>' . $erro($c) . '</label>';
    $marcados = static function (string $tipo, string $campo) use ($in, $todos): array {
        $vals = (array) ($in[$campo] ?? []);
        return array_map(fn ($t) => (string) $t['id'], array_filter($todos, fn ($t) => $t['tipo'] === $tipo && (in_array($t['slug'], $vals, true) || in_array((string) $t['id'], $vals, true))));
    };
    $caixas = static function (string $tipo, string $campo, string $rot) use ($todos, $marcados, $erro): string {
        $m = $marcados($tipo, $campo);
        $h = '<fieldset><legend>' . e($rot) . '</legend>';
        foreach (array_filter($todos, fn ($t) => $t['tipo'] === $tipo) as $t) {
            $h .= '<label class="caixa"><input type="checkbox" name="' . $campo . '[]" value="' . e($t['slug']) . '"' . (in_array((string) $t['id'], $m, true) ? ' checked' : '') . '> ' . e($t['nome']) . '</label>';
        }
        return $h . $erro($campo) . '</fieldset>';
    };
    $rotaP = (string) ($in['rota_principal'] ?? '');
    $html = ($err ? '<p class="erro" role="alert">Corrija os campos marcados.</p>' : '')
        . '<form method="post" class="cartao">' . csrf_campo()
        . $campo('nome', 'Nome do lugar *', ' required maxlength="200"')
        . '<label>Município * <select name="municipio" required><option value="">Escolha</option>' . implode('', array_map(fn ($c, $n) => '<option value="' . e((string) $c) . '"' . ((string) $c === $selMun || slug($n) === slug($selMun) ? ' selected' : '') . '>' . e($n) . '</option>', array_keys($muns), $muns)) . '</select>' . $erro('municipio') . '</label>'
        . $campo('endereco', 'Endereço') . $campo('funcionamento', 'Funcionamento (dias e horários)') . $campo('telefone', 'Telefone / WhatsApp')
        . $campo('instagram', 'Instagram') . $campo('site', 'Site')
        . '<div class="linha">' . $sn('wifi', 'Wi‑Fi') . $sn('agendar', 'Precisa agendar') . $sn('pet', 'Aceita pet') . '</div>'
        . '<fieldset><legend>Localização no mapa</legend><p class="ajuda">Cole a coordenada do Google Maps (clique com o botão direito no lugar → primeiro item). Sem coordenada, o lugar aparece só no município.</p><div class="linha">'
        . $campo('lat', 'Latitude', ' inputmode="decimal" placeholder="-22.4540"') . $campo('lng', 'Longitude', ' inputmode="decimal" placeholder="-43.4690"')
        . '<label>Precisão <select name="precisao"><option value="endereco"' . (($in['precisao'] ?? '') !== 'referencia' ? ' selected' : '') . '>Exata (na porta do lugar)</option><option value="referencia"' . (($in['precisao'] ?? '') === 'referencia' ? ' selected' : '') . '>Aproximada (bairro, estrada)</option></select></label></div></fieldset>'
        . '<label>Rota principal * (cor e ícone do alfinete) <select name="rota_principal" required><option value="">Escolha</option>'
        . implode('', array_map(fn ($t) => '<option value="' . e($t['slug']) . '"' . ($t['slug'] === $rotaP ? ' selected' : '') . '>' . e($t['nome']) . '</option>', array_filter($todos, fn ($t) => $t['tipo'] === 'rota'))) . '</select>' . $erro('rota_principal') . '</label>'
        . $caixas('rota', 'rotas', 'Também nas rotas') . $caixas('produto', 'produtos', 'Produtos') . $caixas('experiencia', 'experiencias', 'O que fazer (experiências)')
        . '<label>Descrição (português) <textarea name="descricao" rows="6" maxlength="6000">' . $v('descricao') . '</textarea>' . $erro('descricao') . '</label>'
        . '<fieldset><legend>Traduções</legend><p class="ajuda">Marque "revisada" só depois que uma pessoa conferir. Se mudar o texto em português, as traduções revisadas voltam a "automática".</p>';
    $nomesL = ['en' => 'Inglês', 'fr' => 'Francês', 'de' => 'Alemão'];
    foreach (IDIOMAS as $l) {
        $html .= '<details' . ($post ? ' open' : '') . '><summary>' . $nomesL[$l] . ' — ' . e($trad[$l]['descricao'][1] === 'revisada' ? 'revisada' : ($trad[$l]['descricao'][0] === '' ? 'sem tradução' : 'automática')) . '</summary>';
        foreach (['funcionamento' => 'Funcionamento', 'descricao' => 'Descrição'] as $c => $rot) {
            $html .= '<label>' . $rot . ' (' . $l . ') <textarea name="t_' . $l . '_' . $c . '" rows="' . ($c === 'descricao' ? 5 : 2) . '" lang="' . $l . '">' . e($trad[$l][$c][0]) . '</textarea></label>'
                . '<label class="caixa"><input type="checkbox" name="r_' . $l . '_' . $c . '"' . ($trad[$l][$c][1] === 'revisada' ? ' checked' : '') . '> revisada</label>';
        }
        $html .= '</details>';
    }
    $html .= '</fieldset><div class="acoes"><button type="submit">Salvar</button> <a href="?p=lista">Cancelar</a></div></form>';
    if ($a) {
        $html .= '<form method="post" action="?p=excluir" class="perigo">' . csrf_campo() . '<input type="hidden" name="id" value="' . $a['id'] . '">'
            . '<label class="caixa"><input type="checkbox" name="confirmo" required> Confirmo que quero excluir este lugar (dá para restaurar depois)</label> <button type="submit">Excluir</button></form>'
            . '<p class="ajuda">Código: ' . e($a['codigo']) . ' · origem: ' . e($a['origem']) . ' · atualizado em ' . e($a['atualizado_em']) . '</p>';
    }
    pagina($a ? 'Editar: ' . $a['nome'] : 'Novo lugar', $html);
}

if ($p === 'excluir' && $post) {
    if (!pode('editar') || empty($_POST['confirmo'])) {
        ir('?p=lista', 'Exclusão não confirmada.');
    }
    ir('?p=lista', excluir_atrativo((int) $_POST['id']) ? 'Excluído. Ele está em "Excluídos" e pode ser restaurado.' : 'Nada excluído.');
}
if ($p === 'restaurar' && $post) {
    if (!pode('editar')) {
        ir('?p=lista');
    }
    ir('?p=lista&situacao=excluidos', restaurar_atrativo((int) $_POST['id']) ? 'Restaurado.' : 'Não restaurado: já existe outro lugar ativo com o mesmo nome no município.');
}

// ---------- planilha CSV ----------
if ($p === 'csv') {
    if (!pode('csv')) {
        ir('?p=lista', 'Seu papel não permite importar.');
    }
    if (isset($_GET['baixar'])) {
        $modelo = $_GET['baixar'] === 'modelo';
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . ($modelo ? 'modelo-lugares.csv' : 'lugares-' . date('Y-m-d') . '.csv') . '"');
        echo exportar_csv($modelo);
        exit;
    }
    $html = '';
    if ($post && ($_POST['etapa'] ?? '') === 'confirmar') {
        $prev = $_SESSION['previa_csv'] ?? null;
        if (!$prev || !hash_equals($prev['assinatura'], (string) ($_POST['assinatura'] ?? ''))) {
            ir('?p=csv', 'A prévia expirou. Envie o arquivo de novo.');
        }
        unset($_SESSION['previa_csv']);
        $r = importar_csv($prev['previa']);
        ir('?p=lista', "Importado: {$r['inseridos']} novo(s), {$r['atualizados']} atualizado(s), {$r['ignorados']} ignorado(s) com erro. Lembre de publicar.");
    }
    if ($post && isset($_FILES['arquivo'])) {
        $f = $_FILES['arquivo'];
        try {
            if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
                throw new InvalidArgumentException('Falha no envio do arquivo.');
            }
            if ($f['size'] > CSV_MAX_BYTES) {
                throw new InvalidArgumentException('Arquivo maior que 2 MB.');
            }
            $previa = previa_csv(ler_csv((string) file_get_contents($f['tmp_name'])));
            $_SESSION['previa_csv'] = ['previa' => $previa, 'assinatura' => bin2hex(random_bytes(16))];
            $html .= '<p class="conta">' . $previa['validas'] . ' linha(s) válida(s), ' . $previa['com_erro'] . ' com erro (não entram).</p>';
            if ($previa['desconhecidas']) {
                $html .= '<p class="aviso">Colunas ignoradas: ' . e(implode(', ', $previa['desconhecidas'])) . '</p>';
            }
            $html .= '<table><thead><tr><th>Linha</th><th>Nome</th><th>Ação</th><th>Problemas</th></tr></thead><tbody>';
            foreach ($previa['linhas'] as $l) {
                $html .= '<tr' . ($l['erros'] ? ' class="com-erro"' : '') . '><td>' . $l['linha'] . '</td><td>' . e($l['nome']) . '</td><td>' . e($l['acao']) . '</td><td>'
                    . e(implode(' ', array_map(fn ($c, $m) => "$c: $m", array_keys($l['erros']), $l['erros']))) . '</td></tr>';
            }
            $html .= '</tbody></table>';
            if ($previa['validas']) {
                $html .= '<form method="post">' . csrf_campo() . '<input type="hidden" name="etapa" value="confirmar"><input type="hidden" name="assinatura" value="' . e($_SESSION['previa_csv']['assinatura']) . '">'
                    . '<button type="submit">Importar ' . $previa['validas'] . ' linha(s) válida(s)</button> <a href="?p=csv">Cancelar</a></form>';
            }
        } catch (InvalidArgumentException $ex) {
            $html .= '<p class="erro" role="alert">' . e($ex->getMessage()) . '</p>';
        }
    }
    pagina('Planilha (CSV)', $html . '<div class="cartao"><p>1. Baixe o <a href="?p=csv&amp;baixar=modelo">modelo</a> ou a <a href="?p=csv&amp;baixar=todos">planilha com todos os lugares</a>.<br>'
        . '2. Preencha no Excel ou LibreOffice e salve como <b>CSV UTF-8</b> (separado por ponto e vírgula). Uma linha por lugar; rotas, produtos e experiências separados por ";".<br>'
        . '3. Envie: você vê a prévia, linha a linha, antes de gravar. Linha com <b>código</b> existente atualiza o lugar; sem código, cria (ou atualiza se o nome já existir no município).</p>'
        . '<form method="post" enctype="multipart/form-data">' . csrf_campo() . '<label>Arquivo CSV (até 2 MB) <input type="file" name="arquivo" accept=".csv,text/csv" required></label> <button type="submit">Ver prévia</button></form></div>');
}

// ---------- publicar ----------
if ($p === 'publicar') {
    if (!pode('publicar')) {
        ir('?p=lista', 'Só administradores publicam.');
    }
    if ($post) {
        $r = publicar();
        ir('?p=publicar', "Publicado: {$r['lugares']} lugares (versão {$r['versao']}). Cópia da versão anterior guardada.");
    }
    $ult = db()->query("SELECT quando, depois FROM auditoria WHERE acao = 'publicar' ORDER BY id DESC LIMIT 1")->fetch();
    $mud = db()->query("SELECT COUNT(*) FROM auditoria WHERE entidade IN ('atrativo','csv') AND id > COALESCE((SELECT MAX(id) FROM auditoria WHERE acao = 'publicar'), 0)")->fetchColumn();
    pagina('Publicar no site', '<div class="cartao"><p>O site e o telão leem arquivos estáticos (abrem até sem internet). Publicar gera esses arquivos a partir do banco.</p>'
        . '<p>Última publicação: ' . e($ult['quando'] ?? 'nunca (o site ainda mostra a versão gerada dos guias)') . '. Alterações desde então: <b>' . (int) $mud . '</b>.</p>'
        . '<form method="post">' . csrf_campo() . '<button type="submit">Publicar agora</button></form></div>');
}

// ---------- usuários ----------
if ($p === 'usuarios') {
    if (!pode('usuarios')) {
        ir('?p=lista', 'Só administradores gerenciam usuários.');
    }
    $msg = '';
    if ($post) {
        $acao = (string) ($_POST['acao'] ?? '');
        if ($acao === 'criar') {
            $email = mb_strtolower(trim((string) ($_POST['email'] ?? '')));
            $papel = (string) ($_POST['papel'] ?? 'editor');
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !in_array($papel, PAPEIS, true) || trim((string) ($_POST['nome'] ?? '')) === '') {
                $msg = '<p class="erro">Preencha nome, e-mail válido e papel.</p>';
            } else {
                $temp = substr(strtr(base64_encode(random_bytes(12)), '+/', 'xy'), 0, 14) . random_int(10, 99);
                try {
                    db()->prepare('INSERT INTO usuarios (email, nome, senha_hash, papel, trocar_senha) VALUES (?, ?, ?, ?, 1)')
                        ->execute([$email, trim((string) $_POST['nome']), password_hash($temp, PASSWORD_DEFAULT), $papel]);
                    auditar('criar', 'usuario', db()->lastInsertId(), null, ['email' => $email, 'papel' => $papel]);
                    $msg = '<p class="aviso">Usuário criado. Senha temporária (mostrada uma vez só; a pessoa troca no primeiro acesso): <code>' . e($temp) . '</code></p>';
                } catch (PDOException) {
                    $msg = '<p class="erro">Já existe um usuário com esse e-mail.</p>';
                }
            }
        } elseif ($acao === 'ativar' && (int) $_POST['id'] !== (int) $u['id']) {
            db()->prepare('UPDATE usuarios SET ativo = 1 - ativo WHERE id = ?')->execute([(int) $_POST['id']]);
            auditar('ativar_desativar', 'usuario', (string) (int) $_POST['id'], null, null);
            ir('?p=usuarios', 'Situação alterada.');
        }
    }
    $html = $msg . '<table><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Situação</th><th></th></tr></thead><tbody>';
    foreach (db()->query('SELECT id, nome, email, papel, ativo FROM usuarios ORDER BY nome') as $x) {
        $html .= '<tr><td>' . e($x['nome']) . '</td><td>' . e($x['email']) . '</td><td>' . e($x['papel']) . '</td><td>' . ($x['ativo'] ? 'ativo' : 'desativado') . '</td><td>'
            . ((int) $x['id'] !== (int) $u['id'] ? '<form method="post">' . csrf_campo() . '<input type="hidden" name="acao" value="ativar"><input type="hidden" name="id" value="' . $x['id'] . '"><button type="submit">' . ($x['ativo'] ? 'Desativar' : 'Reativar') . '</button></form>' : '') . '</td></tr>';
    }
    $html .= '</tbody></table><form method="post" class="cartao estreito">' . csrf_campo() . '<input type="hidden" name="acao" value="criar"><h2>Novo usuário</h2>'
        . '<label>Nome <input name="nome" required></label><label>E-mail <input type="email" name="email" required></label>'
        . '<label>Papel <select name="papel"><option value="editor">Editor (cadastra, edita e importa)</option><option value="moderador">Moderador (aprova cadastros enviados)</option><option value="administrador">Administrador (tudo, publica e gerencia usuários)</option></select></label>'
        . '<button type="submit">Criar</button></form>';
    pagina('Usuários', $html);
}

// ---------- histórico ----------
if ($p === 'auditoria') {
    $html = '<table><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>O quê</th></tr></thead><tbody>';
    foreach (db()->query("SELECT a.quando, a.acao, a.entidade, a.entidade_id, u.nome, t.nome AS lugar FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
        LEFT JOIN atrativos t ON a.entidade = 'atrativo' AND t.id = a.entidade_id ORDER BY a.id DESC LIMIT 200") as $x) {
        $html .= '<tr><td>' . e($x['quando']) . '</td><td>' . e($x['nome'] ?? '—') . '</td><td>' . e($x['acao']) . '</td><td>' . e($x['entidade'] . ($x['lugar'] ? ': ' . $x['lugar'] : ($x['entidade_id'] ? ' #' . $x['entidade_id'] : ''))) . '</td></tr>';
    }
    pagina('Histórico (últimas 200 ações)', $html . '</tbody></table>');
}

http_response_code(404);
pagina('Página não encontrada', '<p><a href="?p=lista">Voltar à lista</a></p>');
