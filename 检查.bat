@echo off
chcp 65001 >nul
echo ========================================
echo   代码检查 - 运行前后端测试
echo ========================================
echo.

echo [1/3] 运行前端测试...
echo ----------------------------------------
call npm test
if %errorlevel% neq 0 (
    echo.
    echo [失败] 前端测试未通过！
    echo.
    pause
    exit /b 1
)
echo.
echo [通过] 前端测试通过！
echo.

echo [2/3] 运行后端测试...
echo ----------------------------------------
cd backend
call python -m pytest --rootdir=. -v --tb=short
if %errorlevel% neq 0 (
    echo.
    echo [失败] 后端测试未通过！
    cd ..
    pause
    exit /b 1
)
cd ..
echo.
echo [通过] 后端测试通过！
echo.

echo [3/3] 运行 E2E 测试（需要前后端服务运行）...
echo ----------------------------------------
echo 检测服务状态...

:: 检测后端服务
set BACKEND_READY=0
python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=3)" >nul 2>&1
if %errorlevel% equ 0 set BACKEND_READY=1

:: 检测前端服务
set FRONTEND_READY=0
python -c "import urllib.request; urllib.request.urlopen('http://localhost:3000', timeout=3)" >nul 2>&1
if %errorlevel% equ 0 set FRONTEND_READY=1

if %BACKEND_READY% equ 1 if %FRONTEND_READY% equ 1 (
    echo [成功] 前后端服务均已运行
    goto :RUN_E2E_PROMPT
)

echo [警告] 前后端服务未运行！
echo.
echo 请先运行 一键启动.bat 启动服务，然后再重新运行本检查脚本。
echo.
echo 跳过 E2E 测试。
echo.
goto :SKIP_E2E

:RUN_E2E_PROMPT
echo.
set /p RUN_E2E="是否运行 E2E 测试？(y/n): "
if /i "%RUN_E2E%"=="y" (
    call npx playwright test
    if %errorlevel% neq 0 (
        echo.
        echo [失败] E2E 测试未通过！
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [通过] E2E 测试通过！
    echo.
) else (
    echo [跳过] E2E 测试已跳过
    echo.
)

:SKIP_E2E
echo ========================================
echo   所有测试通过！
echo ========================================
pause
