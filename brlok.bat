@echo off
chcp 65001 >nul
REM Launcher Brlok pour Windows (double-clic dans l'Explorateur)
cd /d "%~dp0"

python launch_brlok.py
if errorlevel 1 (
    echo.
    echo Erreur au lancement. Verifiez que Python 3.8+ est installe.
    pause
    exit /b 1
)
