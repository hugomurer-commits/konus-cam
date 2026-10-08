; Instalador do Sistema do Hotel (Inno Setup 6). Gerado por build-windows.ps1.
; - Copia tudo para C:\SistemaHotel (Node, programa, NSSM). O PC não precisa ter nada antes.
; - Registra o serviço "SistemaHotel", que sobe sozinho no boot, sem ninguém fazer login.
; - Cria o atalho "Hotel" na área de trabalho.
; - Atualização: para o serviço, faz cópia do banco e troca só o programa. A pasta "dados" nunca é apagada.

#ifndef Versao
  #define Versao "0.0.0"
#endif
#define Servico "SistemaHotel"
#define Porta "8787"

[Setup]
AppId={{6F1C8B52-3D4E-4A7B-9C21-5E8F0A1D2B3C}
AppName=Sistema do Hotel
AppVersion={#Versao}
AppPublisher=Hotel Tropical
DefaultDirName=C:\SistemaHotel
DisableDirPage=yes
DisableProgramGroupPage=yes
OutputDir=saida
OutputBaseFilename=Instalar-Sistema-Hotel
SetupIconFile=..\painel\public\favicon.ico
UninstallDisplayIcon={app}\hotel.ico
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
WizardStyle=modern
CloseApplications=no
; Node 22 precisa de Windows 10 ou 11, 64 bits
MinVersion=10.0

[Languages]
Name: "pt"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "energia"; Description: "Deixar o computador sempre ligado (nunca suspender nem hibernar na tomada)"

[Dirs]
; Banco, fotos, backups locais e logs. Nunca é apagada, nem ao desinstalar.
Name: "{app}\dados"; Flags: uninsneveruninstall
Name: "{app}\dados\logs"; Flags: uninsneveruninstall

[Files]
Source: "pacote\app\*"; DestDir: "{app}\app"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "pacote\node\node.exe"; DestDir: "{app}\node"; Flags: ignoreversion
Source: "pacote\nssm\nssm.exe"; DestDir: "{app}\nssm"; Flags: ignoreversion
Source: "pacote\servico.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "pacote\LEIA-ME.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\painel\public\favicon.ico"; DestDir: "{app}"; DestName: "hotel.ico"; Flags: ignoreversion

[INI]
; Atalho "Hotel" na área de trabalho: abre o sistema no navegador
Filename: "{commondesktop}\Hotel.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://localhost:{#Porta}/"
Filename: "{commondesktop}\Hotel.url"; Section: "InternetShortcut"; Key: "IconFile"; String: "{app}\hotel.ico"
Filename: "{commondesktop}\Hotel.url"; Section: "InternetShortcut"; Key: "IconIndex"; String: "0"

[UninstallDelete]
Type: files; Name: "{commondesktop}\Hotel.url"

[Run]
Filename: "{app}\nssm\nssm.exe"; Parameters: "install {#Servico} ""{app}\node\node.exe"" ""{app}\app\servidor\dist\servidor.mjs"""; Flags: runhidden waituntilterminated; StatusMsg: "Registrando o serviço..."
Filename: "{app}\nssm\nssm.exe"; Parameters: "set {#Servico} DisplayName ""Sistema do Hotel"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set {#Servico} Description ""Sistema do Hotel Tropical (painel em http://localhost:{#Porta})"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set {#Servico} AppDirectory ""{app}\app"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set {#Servico} AppEnvironmentExtra ""HOTEL_DADOS={app}\dados"" ""HOTEL_PORTA={#Porta}"" ""NODE_ENV=production"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set {#Servico} Start SERVICE_AUTO_START"; Flags: runhidden waituntilterminated
; Se o programa cair, volta sozinho em 5 segundos
Filename: "{app}\nssm\nssm.exe"; Parameters: "set {#Servico} AppExit Default Restart"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set {#Servico} AppRestartDelay 5000"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set {#Servico} AppStopMethodConsole 10000"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set {#Servico} AppStdout ""{app}\dados\logs\servico.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set {#Servico} AppStderr ""{app}\dados\logs\servico.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set {#Servico} AppRotateFiles 1"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set {#Servico} AppRotateBytes 2000000"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "start {#Servico}"; Flags: runhidden waituntilterminated; StatusMsg: "Iniciando o sistema..."
; O sistema roda no próprio PC: ele não pode dormir
Filename: "{sys}\powercfg.exe"; Parameters: "/change standby-timeout-ac 0"; Flags: runhidden waituntilterminated; Tasks: energia
Filename: "{sys}\powercfg.exe"; Parameters: "/change hibernate-timeout-ac 0"; Flags: runhidden waituntilterminated; Tasks: energia
Filename: "http://localhost:{#Porta}/"; Description: "Abrir o sistema agora"; Flags: shellexec postinstall nowait skipifsilent

[UninstallRun]
Filename: "{app}\nssm\nssm.exe"; Parameters: "stop {#Servico}"; Flags: runhidden waituntilterminated; RunOnceId: "PararServico"
Filename: "{app}\nssm\nssm.exe"; Parameters: "remove {#Servico} confirm"; Flags: runhidden waituntilterminated; RunOnceId: "RemoverServico"

[Code]
// Antes de instalar por cima (atualização): para o serviço e guarda uma cópia do banco.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Codigo: Integer;
  Nssm, Dados, Copia: String;
begin
  Result := '';
  Nssm := ExpandConstant('{app}\nssm\nssm.exe');
  Dados := ExpandConstant('{app}\dados');
  if FileExists(Nssm) then
  begin
    Exec(Nssm, 'stop {#Servico}', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
    Exec(Nssm, 'remove {#Servico} confirm', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  end;
  if FileExists(Dados + '\hotel.db') then
  begin
    Copia := Dados + '\antes-da-atualizacao-' + GetDateTimeString('yyyy-mm-dd-hhnn', '-', '-');
    if not CopyFile(Dados + '\hotel.db', Copia + '.db', False) then
    begin
      Result := 'Não consegui copiar o banco antes de atualizar. Nada foi mudado.';
      exit;
    end;
    if FileExists(Dados + '\hotel.db-wal') then
      CopyFile(Dados + '\hotel.db-wal', Copia + '.db-wal', False);
  end;
end;
