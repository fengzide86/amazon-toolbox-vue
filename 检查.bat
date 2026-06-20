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

echo [警告] 服务未运行，正在自动启动...

:: 直接启动后端服务
echo [启动] 正在启动后端服务...
start "后端服务" cmd /k "cd /d %~dp0backend && python main.py"

:: 循环等待后端服务就绪（最多60秒）
echo 等待后端服务启动...
set WAIT_COUNT=0
:WAIT_BACKEND_LOOP
timeout /t 3 /nobreak >nul
set /a WAIT_COUNT+=1
python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=3)" >nul 2>&1
if %errorlevel% neq 0 (
    if %WAIT_COUNT% LSS 20 (
        echo   等待中... (%WAIT_COUNT%/20)
        goto :WAIT_BACKEND_LOOP
    ) else (
        echo [失败] 后端服务启动超时，请手动运行 一键启动.bat
        pause
        exit /b 1
    )
)
echo [成功] 后端服务已就绪

:: 直接启动前端服务
echo [启动] 正在启动前端服务...
start "前端服务" cmd /k "cd /d %~dp0 && npm run dev"

:: 循环等待前端服务就绪（最多60秒）
echo 等待前端服务启动...
set WAIT_COUNT=0
:WAIT_FRONTEND_LOOP
timeout /t 3 /nobreak >nul
set /a WAIT_COUNT+=1
python -c "import urllib.request; urllib.request.urlopen('http://localhost:3000', timeout=3)" >nul 2>&1
if %errorlevel% neq 0 (
    if %WAIT_COUNT% LSS 20 (
        echo   等待中... (%WAIT_COUNT%/20)
        goto :WAIT_FRONTEND_LOOP
    ) else (
        echo [失败] 前端服务启动超时，请手动运行 一键启动.bat
        pause
        exit /b 1
    )
)
echo [成功] 前端服务已就绪

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

echo ========================================
echo   所有测试通过！
echo ========================================
pause
