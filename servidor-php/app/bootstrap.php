<?php
// Núcleo do lado servidor: configuração, conexão, sessão segura, CSRF, escape, permissões e auditoria.
// Fica FORA da pasta pública (~/apps/turismo-rural/app). Config em ../config/config.php (nunca versionado).
declare(strict_types=1);

const IDIOMAS = ['en', 'fr', 'de'];
const PAPEIS = ['administrador', 'editor', 'moderador'];
const SIM_NAO = ['', 'SIM', 'NÃO'];

function config(): array
{
    static $cfg = null;
    return $cfg ??= require dirname(__DIR__) . '/config/config.php';
}

/** Pasta pública do site (onde ficam index.html e dados/). Nos testes, TURISMO_PUBLICO aponta para uma pasta temporária. */
function pasta_publica(): string
{
    return getenv('TURISMO_PUBLICO') ?: (config()['publico'] ?? dirname(__DIR__, 3) . '/turismo.fanara.com.br');
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo) {
        return $pdo;
    }
    $b = config()['banco'];
    $nome = getenv('TURISMO_BANCO') ?: $b['nome']; // os testes apontam para o banco de teste; nunca escrevem no de produção
    $pdo = new PDO(
        "mysql:host={$b['host']};port={$b['porta']};dbname={$nome};charset={$b['charset']}",
        $b['usuario'],
        $b['senha'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]
    );
    $pdo->exec("SET time_zone = '-03:00', SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'"); // nunca cortar dado em silêncio
    return $pdo;
}

function e(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function iniciar_sessao(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name('turismo_admin');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/admin/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime', '7200');
    session_start();
    if (isset($_SESSION['ate']) && $_SESSION['ate'] < time()) { // 2 h sem uso: sai
        $_SESSION = [];
        session_regenerate_id(true);
    }
    $_SESSION['ate'] = time() + 7200;
}

function cabecalhos_seguranca(): void
{
    header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    header('X-Frame-Options: DENY');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');
}

function csrf_token(): string
{
    return $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
}

function csrf_campo(): string
{
    return '<input type="hidden" name="csrf" value="' . e(csrf_token()) . '">';
}

function exigir_csrf(): void
{
    if (!hash_equals($_SESSION['csrf'] ?? '', (string) ($_POST['csrf'] ?? ''))) {
        http_response_code(400);
        exit('Formulário expirado. Volte, recarregue a página e tente de novo.');
    }
}

function usuario(): ?array
{
    if (empty($_SESSION['uid'])) {
        return null;
    }
    static $u = null;
    if ($u === null || $u['id'] !== $_SESSION['uid']) {
        $s = db()->prepare('SELECT id, email, nome, papel, trocar_senha FROM usuarios WHERE id = ? AND ativo = 1');
        $s->execute([$_SESSION['uid']]);
        $u = $s->fetch() ?: null;
    }
    return $u;
}

function pode(string $acao, ?array $u = null): bool
{
    $p = ($u ?? usuario())['papel'] ?? '';
    return match ($acao) {
        'editar', 'csv' => in_array($p, ['administrador', 'editor'], true),
        'moderar' => in_array($p, ['administrador', 'moderador'], true),
        'publicar', 'usuarios' => $p === 'administrador',
        'ver' => $p !== '',
        default => false,
    };
}

/** Tentativa de login: bloqueia 15 min depois de 5 erros seguidos. Devolve o usuário ou uma mensagem. */
function autenticar(string $email, string $senha): array|string
{
    $s = db()->prepare('SELECT * FROM usuarios WHERE email = ?');
    $s->execute([mb_strtolower(trim($email))]);
    $u = $s->fetch();
    $generico = 'E-mail ou senha incorretos.';
    if (!$u || !$u['ativo']) {
        static $falso = null;
        password_verify($senha, $falso ??= password_hash(bin2hex(random_bytes(8)), PASSWORD_DEFAULT)); // mesmo custo de tempo: não revela se o e-mail existe
        return $generico;
    }
    if ($u['bloqueado_ate'] && strtotime($u['bloqueado_ate']) > time()) {
        return 'Muitas tentativas. Aguarde alguns minutos.';
    }
    if (!password_verify($senha, $u['senha_hash'])) {
        $n = $u['tentativas'] + 1;
        db()->prepare('UPDATE usuarios SET tentativas = ?, bloqueado_ate = ? WHERE id = ?')
            ->execute([$n >= 5 ? 0 : $n, $n >= 5 ? date('Y-m-d H:i:s', time() + 900) : null, $u['id']]);
        auditar('login_falhou', 'usuario', (string) $u['id'], null, null, (int) $u['id']);
        return $generico;
    }
    db()->prepare('UPDATE usuarios SET tentativas = 0, bloqueado_ate = NULL WHERE id = ?')->execute([$u['id']]);
    if (password_needs_rehash($u['senha_hash'], PASSWORD_DEFAULT)) {
        db()->prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?')->execute([password_hash($senha, PASSWORD_DEFAULT), $u['id']]);
    }
    return $u;
}

function senha_forte(string $s): ?string
{
    if (mb_strlen($s) < 10) {
        return 'A senha precisa de pelo menos 10 caracteres.';
    }
    if (!preg_match('/[A-Za-z]/', $s) || !preg_match('/\d/', $s)) {
        return 'Use letras e números na senha.';
    }
    return null;
}

function auditar(string $acao, string $entidade, ?string $id, mixed $antes, mixed $depois, ?int $uid = null): void
{
    $j = static fn ($v) => $v === null ? null : json_encode($v, JSON_UNESCAPED_UNICODE);
    db()->prepare('INSERT INTO auditoria (usuario_id, acao, entidade, entidade_id, antes, depois, ip) VALUES (?, ?, ?, ?, ?, ?, ?)')
        ->execute([$uid ?? usuario()['id'] ?? null, $acao, $entidade, $id, $j($antes), $j($depois), $_SERVER['REMOTE_ADDR'] ?? 'cli']);
}

function slug(string $s): string
{
    $s = transliterator_transliterate('Any-Latin; Latin-ASCII; Lower()', $s) ?: strtolower($s);
    return trim(preg_replace('/[^a-z0-9]+/', '-', $s), '-');
}
