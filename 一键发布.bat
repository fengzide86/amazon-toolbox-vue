@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   Amazon Toolbox - Build Release
echo ============================================

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was not found.
    goto :failed
)

for /f "tokens=2 delims=:, " %%a in ('findstr /c:"\"version\"" package.json') do set "CURRENT_VERSION=%%~a"
echo [INFO] Current version: !CURRENT_VERSION!
set /p "NEW_VERSION=New version (Enter keeps !CURRENT_VERSION!): "

if not "!NEW_VERSION!"=="" (
    call npm version "!NEW_VERSION!" --no-git-tag-version
    if errorlevel 1 goto :failed
)

call npm run electron:build
if errorlevel 1 goto :failed

echo [OK] Installer created in the release directory.
start "" explorer.exe "%CD%\release"
echo [NEXT] Upload the installer, blockmap and latest.yml in Admin - App Updates.
pause
exit /b 0

:failed
echo [ERROR] Release build failed. No files were uploaded.
pause
exit /b 1
