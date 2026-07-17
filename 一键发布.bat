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

for /f %%a in ('node -p "require('./package.json').version"') do set "CURRENT_VERSION=%%a"
echo [INFO] Current version: !CURRENT_VERSION!
if defined TOOLBOX_RELEASE_VERSION (
    set "NEW_VERSION=!TOOLBOX_RELEASE_VERSION!"
) else (
    set /p "NEW_VERSION=New version (Enter keeps !CURRENT_VERSION!): "
)

if not "!NEW_VERSION!"=="" (
    node -e "if(!/^\d+\.\d+\.\d+$/.test(process.argv[1])) process.exit(1)" "!NEW_VERSION!"
    if errorlevel 1 (
        echo [ERROR] Version must use the format 1.2.3.
        goto :failed
    )
    if not "!NEW_VERSION!"=="!CURRENT_VERSION!" (
        call npm version "!NEW_VERSION!" --no-git-tag-version
        if errorlevel 1 goto :failed
    )
)

echo [INFO] Running the full quality gate...
call npm run verify
if errorlevel 1 goto :failed

echo [INFO] Building the Windows installer...
call npm run electron:release
if errorlevel 1 goto :failed

echo [INFO] Auditing installer contents...
call npm run package:audit
if errorlevel 1 goto :failed

echo [OK] Installer created in the release directory.
start "" explorer.exe "%CD%\release"
echo [NEXT] Upload the installer, blockmap and latest.yml in Admin - App Updates.
if not defined TOOLBOX_NO_PAUSE pause
exit /b 0

:failed
echo [ERROR] Release build failed. No files were uploaded.
if not defined TOOLBOX_NO_PAUSE pause
exit /b 1
