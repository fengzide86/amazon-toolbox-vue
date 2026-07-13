@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

cd /d "%~dp0"
set "PROJECT_ROOT=%CD%"
set "PYTHON=%PROJECT_ROOT%\venv\Scripts\python.exe"
set "TOOLBOX_RUNTIME_DIR=D:\AmazonToolboxData"
set "NODE_ENV=development"

echo ============================================
echo   Amazon Toolbox - Development Preview
echo ============================================

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was not found.
    pause
    exit /b 1
)

if not exist "%PYTHON%" (
    echo [ERROR] Python virtual environment was not found.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [INFO] Installing frontend dependencies...
    call npm install
    if errorlevel 1 exit /b 1
)

curl -s http://localhost:8000/api/health >nul 2>&1
if errorlevel 1 (
    echo [1/3] Starting backend...
    start "Amazon Toolbox Backend" /D "%PROJECT_ROOT%\backend" cmd /k call "%PROJECT_ROOT%\backend\start.bat"
) else (
    echo [1/3] Reusing backend at http://localhost:8000
)

echo [2/3] Waiting for backend...
set "BACKEND_READY=0"
for /l %%I in (1,1,15) do (
    curl -s http://localhost:8000/api/health >nul 2>&1
    if not errorlevel 1 set "BACKEND_READY=1"
    if "!BACKEND_READY!"=="1" goto :backend_ready
    timeout /t 1 /nobreak >nul
)

echo [ERROR] Backend did not become ready.
pause
exit /b 1

:backend_ready
echo [3/3] Starting Vite and Electron...
start "Amazon Toolbox Vite" /D "%PROJECT_ROOT%" cmd /k npm run dev

set "VITE_READY=0"
for /l %%I in (1,1,20) do (
    curl -s http://localhost:3000 >nul 2>&1
    if not errorlevel 1 set "VITE_READY=1"
    if "!VITE_READY!"=="1" goto :vite_ready
    timeout /t 1 /nobreak >nul
)

echo [ERROR] Vite did not become ready.
pause
exit /b 1

:vite_ready
npx electron .
exit /b %ERRORLEVEL%
