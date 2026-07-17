@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   Amazon Toolbox - Full Verification
echo ============================================

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was not found.
    goto :failed
)

where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python was not found.
    goto :failed
)

if not exist "node_modules\" (
    echo [INFO] Installing frontend dependencies...
    call npm ci
    if errorlevel 1 goto :failed
)

call npm run verify
if errorlevel 1 goto :failed

echo [OK] All configured checks passed.
if not defined TOOLBOX_NO_PAUSE pause
exit /b 0

:failed
echo [ERROR] Verification failed. Review the messages above.
if not defined TOOLBOX_NO_PAUSE pause
exit /b 1
