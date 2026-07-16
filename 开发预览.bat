@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   Amazon Toolbox - Development Preview
echo ============================================

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was not found.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [INFO] Installing dependencies...
    call npm ci
    if errorlevel 1 goto :failed
)

call npm run electron:dev
if errorlevel 1 goto :failed
exit /b 0

:failed
echo [ERROR] Development preview failed.
pause
exit /b 1
