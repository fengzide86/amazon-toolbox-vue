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

echo ========================================
echo   所有测试通过！
echo ========================================
pause