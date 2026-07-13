@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

cd /d "%~dp0"
set "RUNTIME_ROOT=D:\AmazonToolboxData"
set "TEMP=%RUNTIME_ROOT%\build-tmp"
set "TMP=%RUNTIME_ROOT%\build-tmp"
set "ELECTRON_CACHE=%RUNTIME_ROOT%\electron-cache"
set "ELECTRON_BUILDER_CACHE=%RUNTIME_ROOT%\electron-builder-cache"
set "PYINSTALLER_CONFIG_DIR=%RUNTIME_ROOT%\pyinstaller-config"
set "CSC_IDENTITY_AUTO_DISCOVERY=false"
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"

if not exist "%TEMP%" mkdir "%TEMP%"
if not exist "%ELECTRON_CACHE%" mkdir "%ELECTRON_CACHE%"
if not exist "%ELECTRON_BUILDER_CACHE%" mkdir "%ELECTRON_BUILDER_CACHE%"

echo ============================================
echo   Amazon Toolbox - Windows Build
echo ============================================

if not exist "package.json" (
    echo [ERROR] package.json was not found.
    exit /b 1
)

REM A local Electron preview runs this exact executable and Windows cannot replace it.
REM Stop only the copy inside this project; installed customer applications are unaffected.
echo [INFO] Stopping bundled backend left by local preview...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$target=[IO.Path]::GetFullPath('%CD%\electron\toolbox-backend.exe'); Get-CimInstance Win32_Process ^| Where-Object { $_.ExecutablePath -eq $target } ^| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 1 /nobreak >nul

REM Keep the last installer for rollback, but remove an interrupted unpack directory.
if exist "release\win-unpacked" (
    echo [INFO] Removing incomplete win-unpacked directory...
    rd /s /q "release\win-unpacked"
    if exist "release\win-unpacked" (
        echo [ERROR] win-unpacked is locked. Close any packaged Toolbox window and retry.
        exit /b 1
    )
)

where pyinstaller >nul 2>&1
if errorlevel 1 (
    echo [ERROR] PyInstaller was not found in PATH.
    echo Install it with: python -m pip install pyinstaller
    exit /b 1
)

echo [1/3] Building frontend...
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed.
    exit /b 1
)

echo [2/3] Rebuilding bundled backend...
pushd backend\build
call pyinstaller --noconfirm --clean toolbox-backend.spec
if errorlevel 1 (
    popd
    echo [ERROR] Backend packaging failed.
    exit /b 1
)
set "BACKEND_COPIED=0"
for /L %%R in (1,1,3) do (
    if "!BACKEND_COPIED!"=="0" (
        copy /Y "dist\toolbox-backend.exe" "..\..\electron\toolbox-backend.exe" >nul
        if errorlevel 1 (
            echo [INFO] Bundled backend is still busy; retrying (%%R/3)...
            timeout /t 2 /nobreak >nul
        ) else (
            set "BACKEND_COPIED=1"
        )
    )
)
if not "!BACKEND_COPIED!"=="1" (
    popd
    echo [ERROR] Could not replace electron\toolbox-backend.exe.
    echo [ERROR] Close local preview windows and run the build again.
    exit /b 1
)
popd

echo [3/3] Building Windows installer...
call npx electron-builder --win nsis
if errorlevel 1 (
    echo [ERROR] Windows installer build failed.
    exit /b 1
)

echo.
echo [OK] Build complete. See the release directory.
exit /b 0
