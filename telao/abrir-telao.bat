@echo off
rem Abre o tel?o: sobe o servidor local (PowerShell, s? localhost) e abre o navegador em tela cheia.
rem Uso: abrir-telao.bat [porta]      Defina TELAO_SEM_NAVEGADOR=1 para s? subir o servidor (testes).
setlocal
set "PORTA=%~1"
if "%PORTA%"=="" set "PORTA=8797"
set "URL=http://localhost:%PORTA%/?modo=telao"

start "Servidor do telao" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1" -porta %PORTA%

rem espera o servidor responder (at? 15 s)
powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){try{if((Invoke-WebRequest -UseBasicParsing '%URL%' -TimeoutSec 1).StatusCode -eq 200){exit 0}}catch{};Start-Sleep -Milliseconds 250};exit 1"
if errorlevel 1 (
  echo Nao foi possivel iniciar o servidor na porta %PORTA%. Tente: abrir-telao.bat 9000
  pause
  exit /b 1
)
if defined TELAO_SEM_NAVEGADOR exit /b 0

rem Edge (j? vem no Windows) em modo quiosque; sem Edge, Chrome; sem os dois, o navegador padr?o
start "" msedge --kiosk "%URL%" --edge-kiosk-type=fullscreen 2>nul && exit /b 0
start "" chrome --kiosk "%URL%" 2>nul && exit /b 0
start "" "%URL%"
