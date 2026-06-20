@echo off
setlocal
title Amazon Toolbox - One Click Publish
echo ============================================
echo   Amazon Toolbox - One Click Publish
echo ============================================
echo.

cd /d "%~dp0"

if not exist "package.json" (
    echo [ERROR] package.json not found!
    echo.
    pause
    exit /b 1
)

echo [INFO] Reading current version...
for /f "tokens=2 delims=:, " %%a in ('findstr /c:"\"version\"" package.json') do set CURRENT_VERSION=%%~a
echo Current version: %CURRENT_VERSION%
echo.

set /p NEW_VERSION="Enter new version (press Enter to use %CURRENT_VERSION%): "
if "%NEW_VERSION%"=="" set NEW_VERSION=%CURRENT_VERSION%

echo.
echo [INFO] Target version: %NEW_VERSION%
echo.

echo [1/4] Building (version not changed yet)...
echo.
pushd "%~dp0"
call build.bat
set BUILD_RESULT=%errorlevel%
popd
if %BUILD_RESULT% neq 0 (
    echo.
    echo [ERROR] Build failed! (exit code: %BUILD_RESULT%)
    echo [INFO] package.json version NOT changed, you can retry with same version.
    echo.
    pause
    exit /b 1
)
echo Build complete!
echo.

echo [2/4] Updating version to %NEW_VERSION%...
python _update_version.py %NEW_VERSION%
if errorlevel 1 (
    echo [ERROR] Version update failed!
    pause
    exit /b 1
)
echo Version updated to %NEW_VERSION%.
echo.

echo [3/4] Uploading files to server...
echo.

set RELEASE_DIR=release
set SERVER_URL=http://8.130.113.104:8000

if not exist "%RELEASE_DIR%" (
    echo [ERROR] Release directory not found!
    echo.
    pause
    exit /b 1
)

set SCRIPT_DIR=%~dp0

if exist "%RELEASE_DIR%\latest.yml" (
    echo Uploading latest.yml...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%upload_file.ps1" -FilePath "%RELEASE_DIR%\latest.yml" -ServerUrl "%SERVER_URL%"
    if errorlevel 1 (
        echo [ERROR] latest.yml upload failed!
        echo.
        pause
        exit /b 1
    )
) else (
    echo [WARN] latest.yml not found, skipping.
)

set EXE_FOUND=0
for %%f in ("%RELEASE_DIR%\*.exe") do (
    if not "%%~nxf"=="elevate.exe" (
        set EXE_FOUND=1
        echo Uploading %%~nxf...
        powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%upload_file.ps1" -FilePath "%%f" -ServerUrl "%SERVER_URL%"
        if errorlevel 1 (
            echo [ERROR] %%~nxf upload failed!
            echo.
            pause
            exit /b 1
        )
    )
)

if "%EXE_FOUND%"=="0" (
    echo [WARN] No exe installer files found.
)

for %%f in ("%RELEASE_DIR%\*.blockmap") do (
    echo Uploading %%~nxf...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%upload_file.ps1" -FilePath "%%f" -ServerUrl "%SERVER_URL%"
)

echo.
echo [4/4] Done!
echo.
echo ============================================
echo   Publish Success! Version: %NEW_VERSION%
echo   Server: %SERVER_URL%
echo ============================================
echo.
endlocal
pause