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

set "REMOTE_CONTROL_URL="
if not defined TOOLBOX_CONTROL_API_URL if exist ".env.deploy" (
    for /f "usebackq tokens=1,* delims==" %%A in (".env.deploy") do (
        if /i "%%A"=="TOOLBOX_CONTROL_API_URL" set "TOOLBOX_CONTROL_API_URL=%%B"
        if /i "%%A"=="DEPLOY_SERVER_HOST" set "TOOLBOX_PREVIEW_HOST=%%B"
    )
    if defined TOOLBOX_CONTROL_API_URL set "REMOTE_CONTROL_URL=!TOOLBOX_CONTROL_API_URL!"
    if not defined REMOTE_CONTROL_URL if defined TOOLBOX_PREVIEW_HOST set "REMOTE_CONTROL_URL=https://!TOOLBOX_PREVIEW_HOST!"
)

if defined TOOLBOX_CONTROL_API_URL if not defined REMOTE_CONTROL_URL set "REMOTE_CONTROL_URL=!TOOLBOX_CONTROL_API_URL!"

if defined REMOTE_CONTROL_URL (
    echo [INFO] Checking remote control service: !REMOTE_CONTROL_URL!
    powershell.exe -NoLogo -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { $response=Invoke-RestMethod -Uri '!REMOTE_CONTROL_URL!/api/health' -TimeoutSec 10; if ($response.status -ne 'ok') { exit 1 } } catch { exit 1 }"
    if not errorlevel 1 (
        set "TOOLBOX_CONTROL_API_URL=!REMOTE_CONTROL_URL!"
        set "TOOLBOX_USE_BUNDLED_BACKEND=false"
        set "VITE_CONTROL_API_BASE=!REMOTE_CONTROL_URL!"
        echo [OK] Remote control service is available.
    ) else (
        echo [WARN] Remote service is unavailable. Falling back to the bundled local backend.
        set "TOOLBOX_CONTROL_API_URL="
        set "VITE_CONTROL_API_BASE="
    )
)

if not defined TOOLBOX_CONTROL_API_URL (
    set "TOOLBOX_USE_BUNDLED_BACKEND=true"
    echo [INFO] Using the bundled local backend.
)

if /i "%TOOLBOX_DRY_RUN%"=="1" (
    echo [OK] Preview configuration is valid. Dry run completed.
    exit /b 0
)

call npm run electron:dev
if errorlevel 1 goto :failed
exit /b 0

:failed
echo [ERROR] Development preview failed.
pause
exit /b 1
