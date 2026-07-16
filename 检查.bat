@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   Amazon Toolbox - Full Verification
echo ============================================

call npm run verify
if errorlevel 1 (
    echo [ERROR] Verification failed.
    pause
    exit /b 1
)

echo [OK] All configured checks passed.
pause
exit /b 0
