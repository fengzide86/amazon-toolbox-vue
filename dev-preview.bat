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

for /f %%V in ('node -p "require('./package.json').version"') do set "TOOLBOX_APP_VERSION=%%V"

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
    echo [INFO] Checking remote control service and API contract: !REMOTE_CONTROL_URL!
    powershell.exe -NoLogo -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { $health=Invoke-RestMethod -Uri '!REMOTE_CONTROL_URL!/api/health/live' -TimeoutSec 10; $openapi=Invoke-RestMethod -Uri '!REMOTE_CONTROL_URL!/openapi.json' -TimeoutSec 15; $required=@('/api/staff/auth/login','/api/demo/runs','/api/orders/{order_id}/mark-paid','/api/profit/policy'); if ($health.status -ne 'ok' -or $health.version -ne '!TOOLBOX_APP_VERSION!') { exit 1 }; foreach ($path in $required) { if (-not $openapi.paths.PSObject.Properties.Name.Contains($path)) { exit 1 } } } catch { exit 1 }"
    if not errorlevel 1 (
        set "TOOLBOX_CONTROL_API_URL=!REMOTE_CONTROL_URL!"
        set "TOOLBOX_USE_BUNDLED_BACKEND=false"
        set "VITE_CONTROL_API_BASE=!REMOTE_CONTROL_URL!"
        echo [OK] Remote control service is available.
    ) else (
        echo [ERROR] Remote service is unavailable or its API version does not match v!TOOLBOX_APP_VERSION!: !REMOTE_CONTROL_URL!
        echo [HINT] For local development, first run backend\start.bat and set
        echo        TOOLBOX_CONTROL_API_URL=http://127.0.0.1:8000
        goto :failed
    )
)

if not defined TOOLBOX_CONTROL_API_URL (
    set "TOOLBOX_CONTROL_API_URL=http://127.0.0.1:8000"
    set "VITE_CONTROL_API_BASE=http://127.0.0.1:8000"
    set "TOOLBOX_USE_BUNDLED_BACKEND=false"
    echo [INFO] Using the explicit local development backend.
)

if /i "%TOOLBOX_DRY_RUN%"=="1" (
    echo [OK] Preview configuration is valid. Dry run completed.
    exit /b 0
)

echo [INFO] Starting the Vite development server and Electron...
call npm run electron:dev
if errorlevel 1 goto :failed
exit /b 0

:failed
echo [ERROR] Development preview failed.
if not defined TOOLBOX_NO_PAUSE pause
exit /b 1
