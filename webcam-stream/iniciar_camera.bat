@echo off
REM Inicia a Konus Cam numa janela minimizada.
REM Este arquivo e chamado pelo atalho da pasta shell:startup (ou pelo Agendador de Tarefas).

if not "%~1"=="min" (
    start "Konus Cam" /min cmd /k ""%~f0" min"
    exit /b
)

cd /d "%~dp0"
title Konus Cam

if not exist ".venv\Scripts\python.exe" (
    echo Ambiente nao instalado. Rode instalar.bat primeiro.
    pause
    exit /b 1
)

REM Se o script cair (ex.: camera desconectada, sem internet), reinicia sozinho.
:loop
".venv\Scripts\python.exe" webcam_stream.py
if %errorlevel%==3 (
    timeout /t 15 >nul
    exit
)
echo.
echo O script parou. Reiniciando em 10 segundos... (feche a janela para encerrar)
timeout /t 10 /nobreak >nul
goto loop
