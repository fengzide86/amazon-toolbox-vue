@echo off
REM ============================================================
REM  Amazon Toolbox - One Click Publish
REM  Flow: Build -> (optional version bump) -> Upload
REM  No interactive stdin needed (uses VBScript InputBox for GUI)
REM ============================================================
chcp 65001 >nul
setlocal enabledelayedexpansion

title Amazon Toolbox - One Click Publish
echo ============================================
echo   Amazon Toolbox - One Click Publish
echo ============================================
echo.

cd /d "%~dp0"

if not exist "package.json" (
    echo [ERROR] package.json not found!
    pause
    exit /b 1
)

REM Read current version
for /f "tokens=2 delims=:, " %%a in ('findstr /c:"\"version\"" package.json') do set CURRENT_VERSION=%%~a
echo [INFO] Current version: !CURRENT_VERSION!
echo.

REM Step 1: Build with current version
echo [1/3] Building...
echo.
call build.bat
echo.

REM Check if build succeeded
set BUILD_OK=0
dir /b "release\*.exe" 2>nul | findstr /v /i "elevate.exe" >nul 2>&1
if not errorlevel 1 set BUILD_OK=1

if "!BUILD_OK!"=="0" (
    echo [ERROR] Build failed! Version was NOT changed.
    echo [INFO] Fix the build issues and try again.
    pause
    exit /b 1
)
echo Build complete!
echo.

REM Step 2: Ask if user wants to change version (VBScript InputBox)
echo [2/3] Build succeeded. Do you want to set a new version?
echo       (Press Enter to skip, or type a version number)
echo.

REM Create temporary VBScript for GUI input
set VBS_INPUT=%TEMP%\_get_version.vbs
set VERSION_FILE=%TEMP%\_new_version.txt

(
echo Dim result
echo result = InputBox("Build succeeded with version !CURRENT_VERSION!^"^n^nEnter new version number (leave empty to keep current):", "Set Version", "")
echo If result ^<^> "" Then
echo     Set fso = CreateObject("Scripting.FileSystemObject")
echo     Set f = fso.CreateTextFile("!VERSION_FILE!", True)
echo     f.Write result
echo     f.Close
echo End If
) > "!VBS_INPUT!"

wscript //nologo "!VBS_INPUT!"

REM Read the version from temp file if it exists
set NEW_VERSION=
if exist "!VERSION_FILE!" (
    set /p NEW_VERSION=<"!VERSION_FILE!"
    del "!VERSION_FILE!" 2>nul
)
del "!VBS_INPUT!" 2>nul

if "!NEW_VERSION!"=="" (
    echo Skipping version change. Using !CURRENT_VERSION!.
    set FINAL_VERSION=!CURRENT_VERSION!
) else (
    echo Updating version to !NEW_VERSION!...
    python _update_version.py !NEW_VERSION!
    if errorlevel 1 (
        echo [ERROR] Version update failed!
        echo [WARN] Build artifacts still have version !CURRENT_VERSION!
        pause
        exit /b 1
    )
    echo Version updated to !NEW_VERSION!.
    echo.

    echo Rebuilding with new version...
    echo.
    call build.bat
    echo.

    REM Check rebuild
    set BUILD_OK=0
    dir /b "release\*.exe" 2>nul | findstr /v /i "elevate.exe" >nul 2>&1
    if not errorlevel 1 set BUILD_OK=1

    if "!BUILD_OK!"=="0" (
        echo [ERROR] Rebuild failed!
        echo [WARN] package.json version was changed to !NEW_VERSION!, but no installer generated.
        pause
        exit /b 1
    )
    echo Rebuild complete!
    set FINAL_VERSION=!NEW_VERSION!
)
echo.

REM Step 3: Upload
echo [3/3] Uploading files to server...
echo.

set RELEASE_DIR=release

if not exist "!RELEASE_DIR!" (
    echo [ERROR] Release directory not found!
    pause
    exit /b 1
)

REM Collect all files to upload
set UPLOAD_FILES=
if exist "!RELEASE_DIR!\latest.yml" set UPLOAD_FILES=!UPLOAD_FILES! "!RELEASE_DIR!\latest.yml"

for %%f in ("!RELEASE_DIR!\*.exe") do (
    if not "%%~nxf"=="elevate.exe" set UPLOAD_FILES=!UPLOAD_FILES! "%%f"
)

for %%f in ("!RELEASE_DIR!\*.blockmap") do (
    set UPLOAD_FILES=!UPLOAD_FILES! "%%f"
)

if "!UPLOAD_FILES!"=="" (
    echo [WARN] No files to upload.
) else (
    echo Uploading: !UPLOAD_FILES!
    python fast_upload.py !UPLOAD_FILES!
    if errorlevel 1 (
        echo [ERROR] Upload failed!
        pause
        exit /b 1
    )
)

echo.
echo ============================================
echo   Publish Success! Version: !FINAL_VERSION!
echo ============================================
echo.
endlocal
pause
