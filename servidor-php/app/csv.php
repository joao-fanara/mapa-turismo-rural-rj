<?php
// Importação em lote por planilha CSV (RF15) e exportação. A importação passa pelas MESMAS regras do formulário
// (validar_atrativo) e só grava depois da prévia, numa transação única. Linhas com erro não entram.
declare(strict_types=1);

const CSV_COLUNAS = ['codigo', 'nome', 'municipio', 'endereco', 'funcionamento', 'telefone', 'instagram', 'site', 'wifi', 'agendar', 'pet',
    'lat', 'lng', 'precisao', 'rota_principal', 'rotas', 'produtos', 'experiencias', 'descricao'];
const CSV_MAX_BYTES = 2_000_000;
const CSV_MAX_LINHAS = 2000;

/** Lê o texto do arquivo: tira o BOM, converte de Windows-1252 se não for UTF-8, detecta ; ou , e normaliza o cabeçalho. */
function ler_csv(string $bruto): array
{
    if (strlen($bruto) > CSV_MAX_BYTES) {
        throw new InvalidArgumentException('Arquivo maior que 2 MB.');
    }
    $bruto = preg_replace('/^\xEF\xBB\xBF/', '', $bruto);
    if (!mb_check_encoding($bruto, 'UTF-8')) {
        $bruto = mb_convert_encoding($bruto, 'UTF-8', 'Windows-1252');
    }
    $primeira = strtok($bruto, "\n") ?: '';
    $sep = substr_count($primeira, ';') >= substr_count($primeira, ',') ? ';' : ',';
    $f = fopen('php://temp', 'r+');
    fwrite($f, $bruto);
    rewind($f);
    $cab = fgetcsv($f, null, $sep, '"', '');
    if (!$cab) {
        throw new InvalidArgumentException('Arquivo vazio.');
    }
    $sinon = ['município' => 'municipio', 'categorias' => 'produtos', 'latitude' => 'lat', 'longitude' => 'lng', 'rota' => 'rota_principal', 'descrição' => 'descricao', 'endereço' => 'endereco', 'horario' => 'funcionamento', 'horário' => 'funcionamento'];
    $cab = array_map(fn ($c) => $sinon[mb_strtolower(trim($c))] ?? str_replace('-', '_', slug((string) $c)), $cab);
    $linhas = [];
    while (($l = fgetcsv($f, null, $sep, '"', '')) !== false) {
        if ($l === [null] || !array_filter($l, fn ($v) => trim((string) $v) !== '')) {
            continue;
        }
        if (count($linhas) >= CSV_MAX_LINHAS) {
            throw new InvalidArgumentException('Mais de ' . CSV_MAX_LINHAS . ' linhas: divida o arquivo.');
        }
        $linhas[] = array_combine($cab, array_pad(array_slice($l, 0, count($cab)), count($cab), ''));
    }
    fclose($f);
    $desconhecidas = array_values(array_diff($cab, CSV_COLUNAS));
    return ['colunas' => $cab, 'desconhecidas' => $desconhecidas, 'linhas' => $linhas];
}

/** Dados atuais de um lugar no formato de entrada (para completar o que a planilha não traz numa atualização). */
function entrada_de(array $a): array
{
    $por = ['rota' => [], 'experiencia' => [], 'produto' => []];
    $todos = array_column(termos(), null, 'id');
    foreach ($a['termos'] as $t) {
        $por[$todos[$t]['tipo']][] = $todos[$t]['slug'];
    }
    return ['nome' => $a['nome'], 'municipio' => $a['municipio_codigo'], 'endereco' => $a['endereco'], 'funcionamento' => $a['funcionamento'],
        'telefone' => $a['telefone'], 'instagram' => $a['instagram'], 'site' => $a['site'], 'wifi' => $a['wifi'], 'agendar' => $a['agendar'], 'pet' => $a['pet'],
        'lat' => $a['lat'] ?? '', 'lng' => $a['lng'] ?? '', 'precisao' => $a['precisao'], 'rota_principal' => $todos[$a['rota_principal_id']]['slug'] ?? '',
        'rotas' => $por['rota'], 'produtos' => $por['produto'], 'experiencias' => $por['experiencia'], 'descricao' => (string) $a['descricao']];
}

/** Valida cada linha. Atualiza quando o código (ou nome + município) já existe; senão insere. Nada é gravado aqui. */
function previa_csv(array $lido): array
{
    $saida = [];
    $validas = $erros = 0;
    $vistos = [];
    foreach ($lido['linhas'] as $n => $l) {
        $err = [];
        foreach ($l as $c => $v) {
            if (preg_match('/^\s*[=+@]/', (string) $v)) { // célula que a planilha executaria como fórmula
                $err[$c] = 'Começa com =, + ou @ (parece fórmula de planilha).';
            }
        }
        $id = null;
        if (trim($l['codigo'] ?? '') !== '') {
            $s = db()->prepare('SELECT id FROM atrativos WHERE mapa_id = 1 AND codigo = ? AND excluido_em IS NULL');
            $s->execute([trim($l['codigo'])]);
            $id = $s->fetchColumn() ?: null;
            if (!$id) {
                $err['codigo'] = 'Código não encontrado (deixe em branco para criar um lugar novo).';
            }
        } elseif (($mun = achar_municipio((string) ($l['municipio'] ?? ''))) && trim($l['nome'] ?? '') !== '') {
            $s = db()->prepare('SELECT id FROM atrativos WHERE mapa_id = 1 AND nome = ? AND municipio_codigo = ? AND excluido_em IS NULL');
            $s->execute([trim($l['nome']), $mun]);
            $id = $s->fetchColumn() ?: null;
        }
        $in = $l;
        if ($id) {
            $in = entrada_de(carregar_atrativo((int) $id));
            foreach ($l as $c => $v) {
                if (trim((string) $v) !== '' && $c !== 'codigo') {
                    $in[$c] = $v;
                }
            }
        }
        [$d, $e2] = validar_atrativo($in, $id ? (int) $id : null);
        $err += $e2;
        $chave = mb_strtolower(trim($l['nome'] ?? '')) . '|' . ($d['municipio_codigo'] ?? '');
        if (isset($vistos[$chave])) {
            $err['nome'] = 'Repetido na própria planilha (linha ' . ($vistos[$chave] + 2) . ').';
        }
        $vistos[$chave] = $n;
        $err ? $erros++ : $validas++;
        $saida[] = ['linha' => $n + 2, 'nome' => $l['nome'] ?? '', 'acao' => $id ? 'atualizar' : 'inserir', 'id' => $id ? (int) $id : null, 'dados' => $d, 'erros' => $err];
    }
    return ['validas' => $validas, 'com_erro' => $erros, 'linhas' => $saida, 'desconhecidas' => $lido['desconhecidas'] ?? []];
}

/** Grava as linhas válidas da prévia numa transação única (tudo ou nada) e registra um resumo na auditoria. */
function importar_csv(array $previa): array
{
    $pdo = db();
    $r = ['inseridos' => 0, 'atualizados' => 0, 'ignorados' => 0];
    $pdo->beginTransaction();
    try {
        foreach ($previa['linhas'] as $l) {
            if ($l['erros']) {
                $r['ignorados']++;
                continue;
            }
            salvar_atrativo($l['dados'], $l['id']);
            $r[$l['id'] ? 'atualizados' : 'inseridos']++;
        }
        auditar('importar', 'csv', null, null, $r);
        $pdo->commit();
    } catch (Throwable $ex) {
        $pdo->rollBack();
        throw $ex;
    }
    return $r;
}

/** Planilha de todos os lugares ativos (ou só o cabeçalho, como modelo). Células de texto que começam com =, +, - ou @ ganham um apóstrofo. */
function exportar_csv(bool $soModelo = false): string
{
    $f = fopen('php://temp', 'r+');
    fwrite($f, "\xEF\xBB\xBF");
    fputcsv($f, CSV_COLUNAS, ';', '"', '');
    if (!$soModelo) {
        $termos = array_column(termos(), null, 'id');
        $porAtr = [];
        foreach (db()->query('SELECT atrativo_id, termo_id FROM atrativo_termos') as $x) {
            $t = $termos[$x['termo_id']];
            $porAtr[$x['atrativo_id']][$t['tipo']][] = $t['nome'];
        }
        $s = db()->query("SELECT a.*, m.nome AS municipio FROM atrativos a JOIN municipios m ON m.codigo = a.municipio_codigo WHERE a.mapa_id = 1 AND a.excluido_em IS NULL ORDER BY a.nome");
        $seguro = static fn ($v) => is_string($v) && $v !== '' && !is_numeric($v) && preg_match('/^[=+\-@\t\r]/', $v) ? "'" . $v : $v;
        foreach ($s as $a) {
            $t = $porAtr[$a['id']] ?? [];
            $linha = [$a['codigo'], $a['nome'], $a['municipio'], $a['endereco'], $a['funcionamento'], $a['telefone'], $a['instagram'], $a['site'],
                $a['wifi'], $a['agendar'], $a['pet'], $a['lat'], $a['lng'], $a['precisao'], $termos[$a['rota_principal_id']]['nome'] ?? '',
                implode('; ', $t['rota'] ?? []), implode('; ', $t['produto'] ?? []), implode('; ', $t['experiencia'] ?? []), $a['descricao']];
            fputcsv($f, array_map($seguro, $linha), ';', '"', '');
        }
    }
    rewind($f);
    return stream_get_contents($f);
}
