<?php
// Cria um usuário do admin pela linha de comando (o primeiro administrador nasce aqui: nenhuma senha padrão no repositório).
// Uso no servidor:  php bin/criar-usuario.php email@exemplo.org "Nome" administrador
// Gera uma senha temporária forte, mostra uma vez só; a pessoa troca no primeiro acesso.
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}
require __DIR__ . '/../app/bootstrap.php';
[, $email, $nome, $papel] = $argv + [null, '', '', 'editor'];
$email = mb_strtolower(trim((string) $email));
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || trim((string) $nome) === '' || !in_array($papel, PAPEIS, true)) {
    fwrite(STDERR, "Uso: php bin/criar-usuario.php email \"Nome\" administrador|editor|moderador\n");
    exit(2);
}
$temp = substr(strtr(base64_encode(random_bytes(12)), '+/', 'xy'), 0, 14) . random_int(10, 99);
db()->prepare('INSERT INTO usuarios (email, nome, senha_hash, papel, trocar_senha) VALUES (?, ?, ?, ?, 1)')
    ->execute([$email, trim((string) $nome), password_hash($temp, PASSWORD_DEFAULT), $papel]);
auditar('criar', 'usuario', db()->lastInsertId(), null, ['email' => $email, 'papel' => $papel, 'via' => 'linha de comando'], null);
echo "Usuário criado: $email ($papel)\nSenha temporária (troque no primeiro acesso): $temp\n";
