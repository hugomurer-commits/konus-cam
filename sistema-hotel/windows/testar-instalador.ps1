# Testa o instalador de verdade num Windows (o GitHub roda isto depois de gerar o .exe):
# instala em silêncio, confere que o serviço sobe, cria dados, reinicia o serviço (como se o PC
# tivesse reiniciado), atualiza por cima e desinstala. Os dados têm que sobreviver a tudo.
#   powershell -ExecutionPolicy Bypass -File windows\testar-instalador.ps1
# CUIDADO: instala e desinstala em C:\SistemaHotel. Use só numa máquina de teste.

$ErrorActionPreference = 'Stop'
$exe = Join-Path $PSScriptRoot 'saida\Instalar-Sistema-Hotel.exe'
$base = 'http://localhost:8787'
$dados = 'C:\SistemaHotel\dados'

function Esperar-Sistema {
  for ($i = 0; $i -lt 60; $i++) {
    try {
      $r = Invoke-WebRequest "$base/health" -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -eq 200) { return }
    } catch { }
    Start-Sleep -Seconds 1
  }
  if (Test-Path "$dados\logs\servico.log") { Get-Content "$dados\logs\servico.log" -Tail 40 }
  throw 'O sistema não respondeu em 60 segundos.'
}

function Api([string]$metodo, [string]$url, $corpo, $sessao) {
  $params = @{ Method = $metodo; Uri = "$base$url"; WebSession = $sessao; ContentType = 'application/json' }
  if ($null -ne $corpo) { $params.Body = ($corpo | ConvertTo-Json -Depth 5) }
  return Invoke-RestMethod @params
}

function Instalar {
  $p = Start-Process -FilePath $exe -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART' -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "O instalador terminou com código $($p.ExitCode)" }
}

Write-Host '1. Instalando...'
Instalar
Esperar-Sistema
if ((Get-Service SistemaHotel).StartType -ne 'Automatic') { throw 'O serviço não está para iniciar sozinho.' }
if (-not (Test-Path 'C:\Users\Public\Desktop\Hotel.url')) { throw 'Atalho "Hotel" não foi criado na área de trabalho.' }

Write-Host '2. Primeiro uso e uma hospedagem...'
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Api POST '/api/sistema/primeiro-uso' @{ nomeHotel = 'Hotel Tropical'; nome = 'Teste'; login = 'teste'; senha = 'senha-de-teste-1' } $s | Out-Null
$q = Api POST '/api/quartos' @{ codigo = '1A'; capacidade = 2; ativo = $true; mostrar_no_site = $false } $s
$hoje = (Api GET '/api/hoje' $null $s).hoje
$amanha = ([datetime]::ParseExact($hoje, 'yyyy-MM-dd', $null)).AddDays(1).ToString('yyyy-MM-dd')
Api POST '/api/estadias' @{
  hospede = @{ nome = 'Hóspede do Teste' }; quartoId = $q.quarto.id; entrada = $hoje; saida = $amanha
  pessoas = 1; valorDiaria = 15000; jaChegou = $true
  pagamento = @{ valor = 15000; forma = 'pix'; contaRecebedoraId = 1 }
} $s | Out-Null

Write-Host '3. Reiniciando o serviço (como se o PC tivesse reiniciado)...'
Restart-Service SistemaHotel
Esperar-Sistema
$h = Api GET '/api/hoje' $null $s
if (@($h.noHotel).Count + @($h.saem).Count -lt 1) { throw 'A hospedagem sumiu depois de reiniciar.' }

Write-Host '4. Atualizando por cima...'
Instalar
Esperar-Sistema
if (-not (Get-ChildItem $dados -Filter 'antes-da-atualizacao-*.db')) { throw 'A atualização não guardou cópia do banco.' }
$h = Api GET '/api/hoje' $null $s
if (@($h.noHotel).Count + @($h.saem).Count -lt 1) { throw 'A hospedagem sumiu depois de atualizar.' }

Write-Host '5. Backup...'
Api POST '/api/backup/agora' @{} $s | Out-Null
if (-not (Get-ChildItem "$dados\backups\diario" -Filter 'hotel-*.db')) { throw 'Backup não foi gravado.' }

Write-Host '6. Desinstalando (os dados ficam)...'
$p = Start-Process -FilePath 'C:\SistemaHotel\unins000.exe' -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART' -Wait -PassThru
Start-Sleep -Seconds 5
if (Get-Service SistemaHotel -ErrorAction SilentlyContinue) { throw 'O serviço continuou registrado depois de desinstalar.' }
if (-not (Test-Path "$dados\hotel.db")) { throw 'A desinstalação apagou o banco!' }

Write-Host 'Tudo certo: instala, sobe sozinho, guarda os dados, atualiza e desinstala sem perder nada.' -ForegroundColor Green
