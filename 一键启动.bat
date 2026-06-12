@echo off
chcp 65001 >nul
echo ============================================
echo   亚马逊赛训效率工具箱 - 一键启动
echo ============================================
echo.

cd /d "%~dp0"

:: ===== 检查 Python =====
echo [检查] 正在检查 Python 环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Python，请先安装 Python 3.8+
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)
echo [OK] Python 已安装

:: ===== 检查后端依赖 =====
echo.
echo [检查] 正在检查后端依赖...
cd backend
python -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo [安装] 正在安装后端依赖（首次运行需要）...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [错误] 依赖安装失败！
        pause
        exit /b 1
    )
    echo [OK] 后端依赖安装完成
) else (
    echo [OK] 后端依赖已安装
)
cd ..

:: ===== 检查 Node.js =====
echo.
echo [检查] 正在检查 Node.js 环境...
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 16+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js 已安装

:: ===== 检查前端依赖 =====
echo.
echo [检查] 正在检查前端依赖...
if not exist "node_modules\" (
    echo [安装] 正在安装前端依赖（首次运行需要）...
    call npm install
    if errorlevel 1 (
        echo [错误] 前端依赖安装失败！
        pause
        exit /b 1
    )
    echo [OK] 前端依赖安装完成
) else (
    echo [OK] 前端依赖已安装
)

:: ===== 启动后端 =====
echo.
echo [启动] 正在启动后端服务...
start "后端服务" cmd /k "cd /d %~dp0backend && python main.py"

:: ===== 等待后端就绪 =====
echo [等待] 正在等待后端服务启动...
set /a retry=0
:wait_backend
timeout /t 2 /nobreak >nul
set /a retry+=1
python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" >nul 2>&1
if errorlevel 1 (
    if %retry% LSS 15 (
        goto wait_backend
    ) else (
        echo [警告] 后端启动超时，请检查后端窗口
    )
) else (
    echo [OK] 后端服务已就绪
)

:: ===== 启动前端 =====
echo.
echo [启动] 正在启动前端服务...
start "前端服务" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo ============================================
echo   启动完成！
echo ============================================
echo.
echo  前端地址: http://localhost:3000
echo  后端地址: http://localhost:8000
echo  API文档:  http://localhost:8000/docs
echo  管理员登录: http://localhost:3000/#/admin/login
echo.
echo  默认管理员密码: admin123
echo.
echo  按任意键退出此窗口（服务会继续运行）
pause >nul