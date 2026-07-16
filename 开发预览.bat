@echo off
setlocal EnableExtensions EnableDelayedExpansion
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

if not defined TOOLBOX_CONTROL_API_URL if exist ".env.deploy" (
    for /f "usebackq tokens=1,* delims==" %%A in (".env.deploy") do (
        if /i "%%A"=="DEPLOY_SERVER_HOST" set "TOOLBOX_PREVIEW_HOST=%%B"
    )
    if defined TOOLBOX_PREVIEW_HOST (
        set "TOOLBOX_CONTROL_API_URL=http://!TOOLBOX_PREVIEW_HOST!:8000"
        set "TOOLBOX_USE_BUNDLED_BACKEND=false"
        set "VITE_CONTROL_API_BASE=http://!TOOLBOX_PREVIEW_HOST!:8000"
        echo [INFO] Using the configured remote control service.
    )
)

if not defined TOOLBOX_CONTROL_API_URL (
    set "TOOLBOX_USE_BUNDLED_BACKEND=true"
    echo [INFO] Using the bundled local backend.
)

call npm run electron:dev
if errorlevel 1 goto :failed
exit /b 0

:failed
echo [ERROR] Development preview failed.
pause
exit /b 1
