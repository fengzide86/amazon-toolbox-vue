@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   Amazon Toolbox - Verification
echo ============================================

set "VERIFY_SCRIPT=verify:quick"
set "VERIFY_LABEL=Fast frontend/backend tests"
if /I "%~1"=="full" (
    set "VERIFY_SCRIPT=verify"
    set "VERIFY_LABEL=Full release verification"
)
echo [INFO] Mode: %VERIFY_LABEL%

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

call npm run %VERIFY_SCRIPT%
if errorlevel 1 goto :failed

echo [OK] All configured checks passed.
if /I not "%~1"=="full" echo [INFO] Run "%~nx0 full" before publishing a release.
if not defined TOOLBOX_NO_PAUSE pause
exit /b 0

:failed
echo [ERROR] Verification failed. Review the messages above.
if not defined TOOLBOX_NO_PAUSE pause
exit /b 1
