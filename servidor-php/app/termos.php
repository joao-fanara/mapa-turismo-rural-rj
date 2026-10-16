<?php
// Rotas, produtos e experiências (termos): criar, editar, traduzir e excluir (só quando nenhum lugar usa).
// Uma rota nova (ex.: "Azeites e Vinhos") vira uma cor e um ícone de alfinete no mapa depois de Publicar.
declare(strict_types=1);

const TIPOS_TERMO = ['rota' => 'Rota', 'produto' => 'Produto', 'experiencia' => 'Experiência (O que fazer)'];
// ícones que o mapa sabe desenhar (SIMBOLO em telao/cena.js; a prova "termos" confere que esta lista existe lá)
const SIMBOLOS = ['cafe' => 'Xícara de café', 'queijo' => 'Queijo', 'garrafa' => 'Garrafa', 'flor' => 'Flor', 'peixe' => 'Peixe', 'folha' => 'Folha',
    'mesa' => 'Talheres', 'artesanato' => 'Vaso', 'campo' => 'Casa de campo', 'uva' => 'Cacho de uva', 'azeitona' => 'Ramo de oliveira',
    'estrela' => 'Estrela', 'anel' => 'Anel', 'circulo' => 'Círculo', 'gota' => 'Gota', 'losango' => 'Losango', 'hexagono' => 'Hexágono'];
const PAPEL_MAPA = '#fbf5e6';

function luminancia(string $hex): float
{
    $c = array_map(fn ($i) => hexdec(substr($hex, $i, 2)) / 255, [1, 3, 5]);
    $c = array_map(fn ($v) => $v <= 0.03928 ? $v / 12.92 : (($v + 0.055) / 1.055) ** 2.4, $c);
    return 0.2126 * $c[0] + 0.7152 * $c[1] + 0.0722 * $c[2];
}

function contraste(string $a, string $b): float
{
    [$x, $y] = [luminancia($a), luminancia($b)];
    return (max($x, $y) + 0.05) / (min($x, $y) + 0.05);
}

function carregar_termo(int $id): ?array
{
    $s = db()->prepare('SELECT t.*, (SELECT COUNT(*) FROM atrativo_termos x WHERE x.termo_id = t.id) AS usos FROM termos t WHERE t.id = ? AND t.mapa_id = 1');
    $s->execute([$id]);
    $t = $s->fetch();
    if (!$t) {
        return null;
    }
    $tr = db()->prepare("SELECT idioma, campo, texto, status FROM traducoes WHERE entidade = 'termo' AND entidade_id = ?");
    $tr->execute([$id]);
    $t['traducoes'] = [];
    foreach ($tr as $r) {
        $t['traducoes'][$r['idioma']][$r['campo']] = $r;
    }
    return $t;
}

/** Valida um termo. Devolve [dados, erros]. */
function validar_termo(array $in, ?array $atual = null): array
{
    $err = [];
    $tipo = $atual['tipo'] ?? (string) ($in['tipo'] ?? '');
    if (!isset(TIPOS_TERMO[$tipo])) {
        $err['tipo'] = 'Tipo inválido.';
    }
    $nome = trim((string) ($in['nome'] ?? ''));
    $curto = trim((string) ($in['curto'] ?? '')) ?: $nome;
    if ($nome === '' || mb_strlen($nome) > 160) {
        $err['nome'] = 'Informe o nome (até 160 caracteres).';
    }
    if (mb_strlen($curto) > 24) {
        $err['curto'] = 'O nome curto aparece na legenda do mapa: no máximo 24 caracteres.';
    }
    $d = ['tipo' => $tipo, 'nome' => $nome, 'curto' => $curto, 'ordem' => max(0, min(999, (int) ($in['ordem'] ?? 0)))];
    $d['slug'] = $atual['slug'] ?? substr(slug($nome), 0, 80); // o slug não muda depois de criado: é a chave nos dados publicados
    if (!$atual && $d['slug'] !== '') {
        $s = db()->prepare('SELECT 1 FROM termos WHERE mapa_id = 1 AND tipo = ? AND slug = ?');
        $s->execute([$tipo, $d['slug']]);
        if ($s->fetch()) {
            $err['nome'] = 'Já existe um termo deste tipo com esse nome.';
        }
    }
    if ($tipo === 'rota') {
        $cor = strtolower(trim((string) ($in['cor'] ?? '')));
        if (!preg_match('/^#[0-9a-f]{6}$/', $cor)) {
            $err['cor'] = 'Escolha uma cor.';
        } elseif (contraste($cor, PAPEL_MAPA) < 3) {
            $err['cor'] = sprintf('Cor clara demais para o papel do mapa (contraste %.1f:1; o mínimo é 3:1). Escolha um tom mais escuro.', contraste($cor, PAPEL_MAPA));
        }
        $simb = (string) ($in['simbolo'] ?? '');
        if (!isset(SIMBOLOS[$simb])) {
            $err['simbolo'] = 'Escolha o ícone do alfinete.';
        }
        $compoe = array_values(array_filter(array_map('trim', preg_split('/[;\n]/', (string) ($in['compoe'] ?? '')))));
        $d += ['cor' => $cor, 'simbolo' => $simb, 'compoe' => $compoe ? implode('; ', $compoe) : null];
    } else { // produtos e experiências: cor e ícone únicos por tipo (a legenda os distingue pelo nome)
        $d += ['cor' => '#e3b23c', 'simbolo' => $tipo === 'produto' ? 'anel' : 'estrela', 'compoe' => null];
    }
    return [$d, $err];
}

/** Grava o termo e as traduções do nome ([idioma => [campo => [texto, status]]]); devolve o id. */
function salvar_termo(array $d, ?int $id, array $trad): int
{
    $pdo = db();
    $antes = $id ? carregar_termo($id) : null;
    $pdo->beginTransaction();
    try {
        if ($id) {
            $pdo->prepare('UPDATE termos SET nome = ?, curto = ?, cor = ?, simbolo = ?, compoe = ?, ordem = ? WHERE id = ? AND mapa_id = 1')
                ->execute([$d['nome'], $d['curto'], $d['cor'], $d['simbolo'], $d['compoe'], $d['ordem'], $id]);
        } else {
            $pdo->prepare('INSERT INTO termos (mapa_id, tipo, slug, nome, curto, cor, simbolo, compoe, ordem) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([$d['tipo'], $d['slug'], $d['nome'], $d['curto'], $d['cor'], $d['simbolo'], $d['compoe'], $d['ordem']]);
            $id = (int) $pdo->lastInsertId();
        }
        $up = $pdo->prepare("INSERT INTO traducoes (entidade, entidade_id, idioma, campo, texto, status, revisado_por) VALUES ('termo', ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE texto = VALUES(texto), status = VALUES(status), revisado_por = VALUES(revisado_por)");
        $del = $pdo->prepare("DELETE FROM traducoes WHERE entidade = 'termo' AND entidade_id = ? AND idioma = ? AND campo = ?");
        foreach (IDIOMAS as $l) {
            foreach (['nome', 'curto'] as $c) {
                [$texto, $status] = $trad[$l][$c] ?? ['', 'automatica'];
                if (trim($texto) === '') {
                    $del->execute([$id, $l, $c]);
                } else {
                    $up->execute([$id, $l, $c, trim($texto), $status === 'revisada' ? 'revisada' : 'automatica', $status === 'revisada' ? (usuario()['id'] ?? null) : null]);
                }
            }
        }
        auditar($antes ? 'editar' : 'criar', 'termo', (string) $id, $antes ? array_diff_key($antes, ['traducoes' => 1]) : null, $d);
        $pdo->commit();
    } catch (Throwable $ex) {
        $pdo->rollBack();
        throw $ex;
    }
    return $id;
}

/** Exclui um termo que nenhum lugar usa (nem como rota principal). Devolve mensagem de erro ou null. */
function excluir_termo(int $id): ?string
{
    $t = carregar_termo($id);
    if (!$t) {
        return 'Termo não encontrado.';
    }
    $s = db()->prepare('SELECT COUNT(*) FROM atrativos WHERE rota_principal_id = ?');
    $s->execute([$id]);
    if ($t['usos'] > 0 || $s->fetchColumn() > 0) {
        return "Não dá para excluir: {$t['usos']} lugar(es) usam este termo. Tire-o desses lugares antes.";
    }
    db()->prepare("DELETE FROM traducoes WHERE entidade = 'termo' AND entidade_id = ?")->execute([$id]);
    db()->prepare('DELETE FROM termos WHERE id = ?')->execute([$id]);
    auditar('excluir', 'termo', (string) $id, array_diff_key($t, ['traducoes' => 1]), null);
    return null;
}

/** Nomes traduzidos dos termos para o site: [idioma => [nome_pt => tradução]] (nome e nome curto). */
function traducoes_termos(): array
{
    $out = array_fill_keys(IDIOMAS, []);
    foreach (db()->query("SELECT t.nome, t.curto, r.idioma, r.campo, r.texto FROM traducoes r JOIN termos t ON t.id = r.entidade_id
        WHERE r.entidade = 'termo' AND t.mapa_id = 1 ORDER BY t.id") as $r) {
        $out[$r['idioma']][$r['campo'] === 'nome' ? $r['nome'] : $r['curto']] = $r['texto'];
    }
    return $out;
}
