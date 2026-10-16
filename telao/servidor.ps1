# Servidor HTTP nativo para telão (PowerShell 5.1+)
# Uso: .\servidor.ps1 [-porta 8797]
# CTRL+C para encerrar

param([int]$porta = 8797)

$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = [System.Net.HttpListener]::new()
# Só localhost: não pede administrador e não expõe o telão na rede
$listener.Prefixes.Add("http://localhost:$porta/")

try {
    $listener.Start()
    Write-Host "Servidor em http://localhost:$porta/" -ForegroundColor Green
    Write-Host "Pressione CTRL+C para encerrar" -ForegroundColor Yellow

    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response
        
        $url = $req.Url.LocalPath
        if ($url -eq "/") { $url = "/index.html" }
        $url = $url -replace "^\/+", ""
        
        # Segurança: bloqueia traversal (.., %2e, barras invertidas)
        if ($url -match "\.\." -or $url -match "%2[eE]" -or $url -match "\\") {
            $res.StatusCode = 403
            $res.Close()
            continue
        }
        
        $arquivo = Join-Path $raiz $url
        
        # Verifica se arquivo está realmente dentro de $raiz
        $arquivoResolvido = Resolve-Path $arquivo -ErrorAction SilentlyContinue
        if (-not $arquivoResolvido -or -not $arquivoResolvido.Path.StartsWith($raiz)) {
            $res.StatusCode = 403
            $res.Close()
            continue
        }
        
        if (-not (Test-Path $arquivo -PathType Leaf)) {
            $res.StatusCode = 404
            $res.Close()
            continue
        }
        
        # MIME types
        $mimes = @{
            '.html' = 'text/html; charset=utf-8'
            '.js'   = 'application/javascript; charset=utf-8'
            '.mjs'  = 'application/javascript; charset=utf-8'
            '.css'  = 'text/css; charset=utf-8'
            '.json' = 'application/json; charset=utf-8'
            '.svg'  = 'image/svg+xml'
            '.png'  = 'image/png'
            '.jpg'  = 'image/jpeg'
            '.gif'  = 'image/gif'
            '.bin'  = 'application/octet-stream'
            '.wasm' = 'application/wasm'
        }
        
        $ext = [System.IO.Path]::GetExtension($arquivo).ToLower()
        $mime = if ($mimes.ContainsKey($ext)) { $mimes[$ext] } else { 'application/octet-stream' }
        
        $res.ContentType = $mime
        $res.StatusCode = 200
        $buffer = [System.IO.File]::ReadAllBytes($arquivo)
        $res.OutputStream.Write($buffer, 0, $buffer.Length)
        $res.Close()
    }
} finally {
    $listener.Stop()
    $listener.Dispose()
}
