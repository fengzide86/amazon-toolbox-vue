@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0"
set "PROJECT_ROOT=%~dp0.."
set "VENV_DIR=%PROJECT_ROOT%\venv"
set "PYTHON=%VENV_DIR%\Scripts\python.exe"
set "PIP=%VENV_DIR%\Scripts\pip.exe"
set "TOOLBOX_RUNTIME_DIR=D:\AmazonToolboxData"

echo ============================================
echo   Amazon Toolbox - Local Backend
echo ============================================

if not exist "%PYTHON%" (
    echo [ERROR] Python virtual environment was not found:
    echo         %VENV_DIR%
    echo Run: python -m venv "%VENV_DIR%"
    pause
    exit /b 1
)

if not exist "%TOOLBOX_RUNTIME_DIR%" mkdir "%TOOLBOX_RUNTIME_DIR%"

"%PYTHON%" -c "import fastapi, uvicorn, sqlalchemy, aiosqlite" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Installing backend dependencies...
    "%PIP%" install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Dependency installation failed.
        pause
        exit /b 1
    )
)

set "DEBUG=false"
echo [INFO] Runtime data: %TOOLBOX_RUNTIME_DIR%
echo [INFO] Backend URL: http://localhost:8000
echo.
"%PYTHON%" main.py
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo [INFO] Backend stopped with exit code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%
