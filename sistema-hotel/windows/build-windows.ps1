# Gera windows\saida\Instalar-Sistema-Hotel.exe (seção 12 da especificação).
#
# Rodar NO WINDOWS (notebook do Hugo), dentro da pasta sistema-hotel:
#   powershell -ExecutionPolicy Bypass -File windows\build-windows.ps1
#
# Precisa ter instalado antes: Node.js 22 LTS (64 bits) e Inno Setup 6.
# O Node, o NSSM e o better-sqlite3 compilado para Windows vão DENTRO do instalador:
# o PC do hotel não precisa ter nada instalado.

param(
  [switch]$PularTestes
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$versaoNode = (node --version).TrimStart('v')
if (-not $versaoNode.StartsWith('22.')) { throw "Use o Node 22 LTS para gerar o instalador (encontrado: $versaoNode)." }
if ((node -p "process.arch") -ne 'x64') { throw 'Use o Node de 64 bits (x64).' }
$versao = (Get-Content package.json -Raw | ConvertFrom-Json).version
$versaoSqlite = (Get-Content servidor\package.json -Raw | ConvertFrom-Json).dependencies.'better-sqlite3'
$iscc = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'
if (-not (Test-Path $iscc)) { throw "Inno Setup 6 não encontrado em $iscc" }

Write-Host "== Sistema do Hotel $versao (Node $versaoNode) ==" -ForegroundColor Cyan

Write-Host '1/6 Instalando dependências e compilando...'
npm ci
if (-not $PularTestes) { npm test }
npm run build

$pacote = Join-Path $PSScriptRoot 'pacote'
$baixados = Join-Path $PSScriptRoot 'baixados'
if (Test-Path $pacote) { Remove-Item $pacote -Recurse -Force }
New-Item -ItemType Directory -Force -Path $pacote, $baixados | Out-Null

Write-Host '2/6 Copiando o programa...'
New-Item -ItemType Directory -Force -Path "$pacote\app\servidor", "$pacote\app\painel" | Out-Null
Copy-Item servidor\dist "$pacote\app\servidor\dist" -Recurse
Copy-Item painel\dist "$pacote\app\painel\dist" -Recurse

Write-Host '3/6 better-sqlite3 para Windows x64...'
# Só o módulo nativo fica fora do arquivo único do servidor
@{ name = 'sistema-hotel-app'; version = $versao; private = $true; type = 'module'; dependencies = @{ 'better-sqlite3' = $versaoSqlite } } |
  ConvertTo-Json | Set-Content "$pacote\app\package.json" -Encoding UTF8
Push-Location "$pacote\app"
npm install --omit=dev --no-audit --no-fund
Pop-Location
if (-not (Test-Path "$pacote\app\node_modules\better-sqlite3\build\Release\better_sqlite3.node")) {
  throw 'better-sqlite3 não foi compilado para Windows.'
}

Write-Host "4/6 Node $versaoNode para Windows..."
$zipNode = Join-Path $baixados "node-v$versaoNode-win-x64.zip"
if (-not (Test-Path $zipNode)) {
  Invoke-WebRequest "https://nodejs.org/dist/v$versaoNode/node-v$versaoNode-win-x64.zip" -OutFile $zipNode
}
Expand-Archive $zipNode -DestinationPath "$baixados\node" -Force
New-Item -ItemType Directory -Force -Path "$pacote\node" | Out-Null
Copy-Item "$baixados\node\node-v$versaoNode-win-x64\node.exe" "$pacote\node\node.exe"

Write-Host '5/6 NSSM (serviço do Windows)...'
$zipNssm = Join-Path $baixados 'nssm-2.24.zip'
if (-not (Test-Path $zipNssm)) {
  Invoke-WebRequest 'https://nssm.cc/release/nssm-2.24.zip' -OutFile $zipNssm
}
Expand-Archive $zipNssm -DestinationPath "$baixados\nssm" -Force
New-Item -ItemType Directory -Force -Path "$pacote\nssm" | Out-Null
Copy-Item "$baixados\nssm\nssm-2.24\win64\nssm.exe" "$pacote\nssm\nssm.exe"
Copy-Item "$PSScriptRoot\servico.ps1", "$PSScriptRoot\LEIA-ME.md" $pacote

Write-Host '6/6 Gerando o instalador...'
& $iscc "/DVersao=$versao" "$PSScriptRoot\instalador.iss"
if ($LASTEXITCODE -ne 0) { throw 'O Inno Setup deu erro.' }

Write-Host "Pronto: $PSScriptRoot\saida\Instalar-Sistema-Hotel.exe" -ForegroundColor Green
Write-Host 'Antes de levar ao hotel, teste numa máquina limpa (veja windows\LEIA-ME.md).'
