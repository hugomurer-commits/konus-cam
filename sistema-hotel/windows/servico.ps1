# Comandos do serviço no PC do hotel (rodar o PowerShell como administrador):
#   powershell -ExecutionPolicy Bypass -File C:\SistemaHotel\servico.ps1 status
#   ... servico.ps1 reiniciar | parar | iniciar | log
param([ValidateSet('status', 'iniciar', 'parar', 'reiniciar', 'log')][string]$acao = 'status')

$nssm = Join-Path $PSScriptRoot 'nssm\nssm.exe'
$servico = 'SistemaHotel'

switch ($acao) {
  'status' {
    & $nssm status $servico
    try {
      $r = Invoke-WebRequest 'http://localhost:8787/health' -UseBasicParsing -TimeoutSec 5
      Write-Host "Sistema respondendo: $($r.Content)" -ForegroundColor Green
    } catch {
      Write-Host 'O sistema NÃO está respondendo em http://localhost:8787' -ForegroundColor Red
    }
  }
  'iniciar' { & $nssm start $servico }
  'parar' { & $nssm stop $servico }
  'reiniciar' { & $nssm restart $servico }
  'log' { Get-Content (Join-Path $PSScriptRoot 'dados\logs\servico.log') -Tail 60 }
}
