@echo off
echo ========================================
echo   Save Code to Git
echo ========================================
echo.

git add .

git commit -m "%~1"

if %errorlevel% neq 0 (
    echo.
    echo [INFO] No changes to commit, or commit failed
    pause
    exit /b
)

echo.
echo [OK] Code saved!
echo.

git push origin main

if %errorlevel% neq 0 (
    echo.
    echo [INFO] Push to GitHub failed, please check network connection
    pause
    exit /b
)

echo [OK] Code pushed to GitHub!
pause