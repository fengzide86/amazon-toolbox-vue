@echo off
chcp 65001 >nul
echo ============================================
echo   Electron 开发预览模式（支持热更新）
echo ============================================
echo.

cd /d "%~dp0"

:: 检查 Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found!
    pause
    exit /b 1
)

:: 检查依赖
if not exist "node_modules\" (
    echo [INFO] Installing dependencies...
    call npm install
)

:: 删除 dist 目录，强制进入开发模式
if exist "dist" (
    echo [INFO] Removing dist folder to enable dev mode...
    rd /s /q "dist" 2>nul
)

:: 设置开发环境变量
set NODE_ENV=development
:: 设置 Electron 镜像加速下载
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

:: 启动后端（新窗口）
echo [1/3] Starting backend...
start "Backend" cmd /k "cd /d %~dp0backend && python main.py"

:: 等待后端启动
echo [WAIT] Waiting for backend...
timeout /t 3 /nobreak >nul

:: 启动 Vite 开发服务器（新窗口）
echo [2/3] Starting Vite dev server...
start "Vite" cmd /k "cd /d %~dp0 && npm run dev"

:: 等待 Vite 启动
echo [WAIT] Waiting for Vite...
timeout /t 5 /nobreak >nul

:: 启动 Electron（开发模式）
echo [3/3] Starting Electron in dev mode...
echo.
echo ============================================
echo   Dev Mode Active!
echo   - Frontend: http://localhost:3000
echo   - Backend:  http://localhost:8000
echo   - Hot reload enabled!
echo ============================================
echo.

npx electron .

pause