@echo off
chcp 65001 >nul
echo ========================================
echo   保存代码到 Git
echo ========================================
echo.

git add .

git commit -m "%~1"

if %errorlevel% neq 0 (
    echo.
    echo [提示] 没有需要提交的更改，或者提交失败
    pause
    exit /b
)

echo.
echo [成功] 代码已保存！
echo.

git push origin main

if %errorlevel% neq 0 (
    echo.
    echo [提示] 推送到 GitHub 失败，请检查网络连接
    pause
    exit /b
)

echo [成功] 代码已推送到 GitHub！
pause