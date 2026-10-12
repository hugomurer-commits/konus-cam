@echo off
REM Instalador da Konus Cam: prepara o Python, as bibliotecas, a senha/ngrok
REM e coloca o script para iniciar sozinho com o Windows.
setlocal
cd /d "%~dp0"
title Instalador Konus Cam

echo ============================================================
echo   Instalador Konus Cam
echo ============================================================
echo.

REM 1) Encontrar o Python (py launcher ou python no PATH)
set "PY="
where py >nul 2>&1 && set "PY=py -3"
if not defined PY (
    where python >nul 2>&1 && python --version >nul 2>&1 && set "PY=python"
)
if not defined PY (
    echo Python nao encontrado. Tentando instalar pelo winget...
    winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements
    echo.
    echo Feche esta janela e rode instalar.bat de novo para continuar.
    pause
    exit /b 1
)
echo [1/5] Python encontrado: %PY%

REM 2) Ambiente virtual
if not exist ".venv\Scripts\python.exe" (
    echo [2/5] Criando ambiente virtual...
    %PY% -m venv .venv || goto erro
) else (
    echo [2/5] Ambiente virtual ja existe.
)

REM 3) Bibliotecas + binario do ngrok
echo [3/5] Instalando bibliotecas (OpenCV, Flask, pyngrok)...
".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
".venv\Scripts\python.exe" -m pip install -r requirements.txt || goto erro
".venv\Scripts\python.exe" -c "from pyngrok import conf, installer; import os; p=conf.get_default().ngrok_path; os.path.exists(p) or installer.install_ngrok(p)" || goto erro

REM 4) Usuario, senha e token do ngrok
echo [4/5] Configuracao
if exist config.ini (
    choice /m "Ja existe um config.ini. Deseja altera-lo"
    if errorlevel 2 goto atalho
)
".venv\Scripts\python.exe" webcam_stream.py --configurar || goto erro

:atalho
REM 5) Inicializacao automatica: coloca um lancador na pasta shell:startup
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
> "%STARTUP%\Konus Cam.bat" echo @echo off
>> "%STARTUP%\Konus Cam.bat" echo call "%~dp0iniciar_camera.bat"
echo [5/5] Inicializacao automatica configurada em:
echo       %STARTUP%\Konus Cam.bat
echo.

choice /m "Iniciar a camera agora"
if errorlevel 2 goto fim
call "%~dp0iniciar_camera.bat"
echo A Konus Cam esta rodando numa janela minimizada na barra de tarefas.
echo O link publico tambem fica salvo em link_publico.txt nesta pasta.

:fim
echo.
echo Instalacao concluida.
pause
exit /b 0

:erro
echo.
echo *** Algo deu errado. Leia a mensagem acima. ***
pause
exit /b 1
