# Gera windows\saida\Instalar-Sistema-Hotel.exe (seção 12 da especificação).
#
# Normalmente quem roda isto é o GitHub (workflow "Instalador do hotel"), num Windows na nuvem.
# Para rodar à mão no Windows, dentro da pasta sistema-hotel:
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

# Comandos externos (npm, ISCC) não param o script sozinhos quando dão erro: confere o código de saída
function Rodar([string]$descricao, [scriptblock]$comando) {
  & $comando
  if ($LASTEXITCODE -ne 0) { throw "Falhou: $descricao (código $LASTEXITCODE)" }
}

function Baixar([string[]]$urls, [string]$destino) {
  if (Test-Path $destino) { return }
  foreach ($url in $urls) {
    for ($tentativa = 1; $tentativa -le 3; $tentativa++) {
      try {
        Invoke-WebRequest $url -OutFile $destino -UseBasicParsing
        return
      } catch {
        Write-Host "  falhou $url (tentativa $tentativa): $($_.Exception.Message)"
        Start-Sleep -Seconds (5 * $tentativa)
      }
    }
  }
  throw "Não consegui baixar $destino"
}

$versaoNode = (node --version).TrimStart('v')
if (-not $versaoNode.StartsWith('22.')) { throw "Use o Node 22 LTS para gerar o instalador (encontrado: $versaoNode)." }
if ((node -p "process.arch") -ne 'x64') { throw 'Use o Node de 64 bits (x64).' }
$versao = (Get-Content package.json -Raw | ConvertFrom-Json).version
$versaoSqlite = (Get-Content servidor\package.json -Raw | ConvertFrom-Json).dependencies.'better-sqlite3'
$iscc = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'
if (-not (Test-Path $iscc)) { throw "Inno Setup 6 não encontrado em $iscc" }

Write-Host "== Sistema do Hotel $versao (Node $versaoNode) ==" -ForegroundColor Cyan

Write-Host '1/6 Instalando dependências e compilando...'
Rodar 'npm ci' { npm ci --no-audit --no-fund }
if (-not $PularTestes) { Rodar 'testes' { npm test } }
Rodar 'build' { npm run build }

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
$pkg = @{ name = 'sistema-hotel-app'; version = $versao; private = $true; type = 'module'; dependencies = @{ 'better-sqlite3' = $versaoSqlite } } | ConvertTo-Json
[IO.File]::WriteAllText("$pacote\app\package.json", $pkg)  # UTF-8 sem BOM
Push-Location "$pacote\app"
Rodar 'better-sqlite3' { npm install --omit=dev --no-audit --no-fund }
Pop-Location
if (-not (Test-Path "$pacote\app\node_modules\better-sqlite3\build\Release\better_sqlite3.node")) {
  throw 'better-sqlite3 não foi compilado para Windows.'
}

Write-Host "4/6 Node $versaoNode para Windows..."
$zipNode = Join-Path $baixados "node-v$versaoNode-win-x64.zip"
Baixar @("https://nodejs.org/dist/v$versaoNode/node-v$versaoNode-win-x64.zip") $zipNode
Expand-Archive $zipNode -DestinationPath "$baixados\node" -Force
New-Item -ItemType Directory -Force -Path "$pacote\node" | Out-Null
Copy-Item "$baixados\node\node-v$versaoNode-win-x64\node.exe" "$pacote\node\node.exe"

Write-Host '5/6 NSSM (serviço do Windows)...'
$zipNssm = Join-Path $baixados 'nssm-2.24.zip'
Baixar @('https://nssm.cc/release/nssm-2.24.zip', 'https://nssm.cc/ci/nssm-2.24-101-g897c7ad.zip') $zipNssm
Expand-Archive $zipNssm -DestinationPath "$baixados\nssm" -Force
$nssm = Get-ChildItem "$baixados\nssm" -Recurse -Filter nssm.exe | Where-Object { $_.FullName -match '\\win64\\' } | Select-Object -First 1
if (-not $nssm) { throw 'nssm.exe (win64) não encontrado no zip.' }
New-Item -ItemType Directory -Force -Path "$pacote\nssm" | Out-Null
Copy-Item $nssm.FullName "$pacote\nssm\nssm.exe"
Copy-Item "$PSScriptRoot\servico.ps1", "$PSScriptRoot\LEIA-ME.md" $pacote

Write-Host '6/6 Gerando o instalador...'
Rodar 'Inno Setup' { & $iscc "/DVersao=$versao" "$PSScriptRoot\instalador.iss" }

Write-Host "Pronto: $PSScriptRoot\saida\Instalar-Sistema-Hotel.exe" -ForegroundColor Green
