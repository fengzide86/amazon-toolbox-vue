@echo off
chcp 65001 >nul
echo ========================================
echo   代码检查 - 运行前后端测试
echo ========================================
echo.

echo [1/2] 运行前端测试...
echo ----------------------------------------
call npm run test:run
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

echo [2/2] 运行后端测试...
echo ----------------------------------------
cd backend
call pytest -v --tb=short
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
echo 提示：E2E 测试需要前后端服务正在运行
echo 请先运行 一键启动.bat 启动服务
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

echo ========================================
echo   所有测试通过！
echo ========================================
pause
