@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

cd /d "%~dp0"
set "EXIT_CODE=0"
set "PYTHON=%CD%\venv\Scripts\python.exe"

title Amazon Toolbox - One Click Publish
echo ============================================
echo   Amazon Toolbox - One Click Publish
echo ============================================

if not exist "package.json" (
    echo [ERROR] package.json was not found.
    set "EXIT_CODE=1"
    goto :finish
)

if not exist "%PYTHON%" (
    echo [ERROR] Python virtual environment was not found.
    set "EXIT_CODE=1"
    goto :finish
)

for /f "tokens=2 delims=:, " %%a in ('findstr /c:"\"version\"" package.json') do set "CURRENT_VERSION=%%~a"
if not defined CURRENT_VERSION (
    echo [ERROR] Could not read the version from package.json.
    set "EXIT_CODE=1"
    goto :finish
)

set "FINAL_VERSION=!CURRENT_VERSION!"
echo [INFO] Current version: !CURRENT_VERSION!
set /p "NEW_VERSION=New version (press Enter to keep !CURRENT_VERSION!): "

if not "!NEW_VERSION!"=="" (
    echo [INFO] Updating version to !NEW_VERSION!...
    "%PYTHON%" _update_version.py "!NEW_VERSION!"
    if errorlevel 1 (
        echo [ERROR] Version update failed.
        set "EXIT_CODE=1"
        goto :finish
    )
    set "FINAL_VERSION=!NEW_VERSION!"
)

findstr /c:"\"version\": \"!FINAL_VERSION!\"" package.json >nul
if errorlevel 1 (
    echo [ERROR] package.json does not contain the requested version !FINAL_VERSION!.
    set "EXIT_CODE=1"
    goto :finish
)

echo.
echo [1/2] Building version !FINAL_VERSION!...
call build.bat
if errorlevel 1 (
    echo [ERROR] Build failed. Nothing was uploaded.
    set "EXIT_CODE=1"
    goto :finish
)

set "INSTALLER=release\AmazonToolbox Setup !FINAL_VERSION!.exe"
set "BLOCKMAP=release\AmazonToolbox Setup !FINAL_VERSION!.exe.blockmap"
if not exist "%INSTALLER%" (
    echo [ERROR] Expected installer was not generated:
    echo         %INSTALLER%
    set "EXIT_CODE=1"
    goto :finish
)

findstr /b /c:"version: !FINAL_VERSION!" "release\latest.yml" >nul
if errorlevel 1 (
    echo [ERROR] latest.yml does not match the built version !FINAL_VERSION!.
    set "EXIT_CODE=1"
    goto :finish
)

echo.
echo [2/2] Uploading release files...
if exist "%BLOCKMAP%" (
    if exist "release\latest.yml" (
        "%PYTHON%" fast_upload.py "%INSTALLER%" "%BLOCKMAP%" "release\latest.yml"
    ) else (
        "%PYTHON%" fast_upload.py "%INSTALLER%" "%BLOCKMAP%"
    )
) else (
    if exist "release\latest.yml" (
        "%PYTHON%" fast_upload.py "%INSTALLER%" "release\latest.yml"
    ) else (
        "%PYTHON%" fast_upload.py "%INSTALLER%"
    )
)
if errorlevel 1 (
    echo [ERROR] Upload failed.
    set "EXIT_CODE=1"
    goto :finish
)

echo.
echo [OK] Publish completed: !FINAL_VERSION!

:finish
echo.
if not "!EXIT_CODE!"=="0" echo [INFO] Publish stopped with exit code !EXIT_CODE!.
pause
endlocal & exit /b %EXIT_CODE%
