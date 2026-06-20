@echo off
chcp 65001 >nul
echo ============================================
echo   亚马逊赛训效率工具箱 - 一键打包
echo ============================================
echo.

cd /d "%~dp0"

:: 清理旧的 release 目录
echo [0/4] 清理旧文件...
if exist "release" (
    echo 正在删除旧的 release 目录...
    rd /s /q "release" 2>nul
    if exist "release" (
        echo 警告：release 目录无法完全删除，可能被杀毒软件占用
        echo 请手动删除 release 目录后重新运行此脚本
        pause
        exit /b 1
    )
    echo release 目录已删除
)
echo.

echo [1/4] 构建前端代码...
echo.
call npm run build
if errorlevel 1 (
    echo 前端构建失败！
    pause
    exit /b 1
)
echo 前端构建完成！
echo.

echo [2/4] 打包后端为 exe...
echo.
cd backend
python -m PyInstaller --noconfirm --onefile --console --name toolbox-backend --distpath ..\electron --workpath build --specpath build --hidden-import aiosqlite --hidden-import uvicorn.logging --hidden-import uvicorn.loops --hidden-import uvicorn.loops.auto --hidden-import uvicorn.protocols --hidden-import uvicorn.protocols.http --hidden-import uvicorn.protocols.http.auto --hidden-import uvicorn.protocols.websockets --hidden-import uvicorn.protocols.websockets.auto --hidden-import uvicorn.lifespan --hidden-import uvicorn.lifespan.on --hidden-import sqlalchemy.ext.asyncio --hidden-import sqlalchemy.dialects.sqlite --hidden-import starlette.middleware --hidden-import starlette.middleware.cors --hidden-import core.config --hidden-import core.security --hidden-import core.exceptions --hidden-import core.logging --hidden-import core.cache --hidden-import core.response --hidden-import core.pagination --hidden-import core.tasks --hidden-import core.token_blacklist --hidden-import core.dependencies --hidden-import core.audit --hidden-import routers.auth --hidden-import routers.dashboard --hidden-import routers.plans --hidden-import routers.auth_codes --hidden-import routers.orders --hidden-import routers.users --hidden-import routers.logs --hidden-import routers.feedback --hidden-import routers.profit --hidden-import routers.settings --hidden-import routers.tools --hidden-import routers.updates --hidden-import routers.devices --hidden-import routers.announcements --hidden-import routers.knowledge --hidden-import routers.user_dashboard --hidden-import routers.help --hidden-import services.seed_service --hidden-import services.ai_chat_service --hidden-import services.ai_provider --hidden-import services.auth_service --hidden-import services.dashboard_service --hidden-import services.feedback_service --hidden-import services.knowledge_service --hidden-import services.order_service --hidden-import services.plan_service --hidden-import services.user_service --hidden-import services.vector_store main.py
if errorlevel 1 (
    echo 后端打包失败！
    pause
    exit /b 1
)
cd ..
echo 后端打包完成！
echo.

echo [3/4] 复制启动脚本...
echo.
copy /Y "electron\start-backend.bat" "electron\start-backend.bat" >nul 2>&1
echo 启动脚本已就绪
echo.

echo [4/4] 生成安装包...
echo.
:: 设置 Electron 国内镜像源（加速下载）
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npx electron-builder --win nsis
if errorlevel 1 (
    echo 安装包生成失败！
    echo.
    echo 可能的原因：
    echo 1. 杀毒软件锁定了 release 目录
    echo 2. 之前的程序进程未关闭
    echo.
    echo 解决方法：
    echo 1. 关闭所有相关程序
    echo 2. 暂时关闭杀毒软件实时保护
    echo 3. 手动删除 release 目录后重试
    pause
    exit /b 1
)
echo.

:: 从 package.json 读取版本号
for /f "tokens=2 delims=:, " %%a in ('findstr /c:"\"version\"" package.json') do set PKG_VERSION=%%~a
echo ============================================
echo   打包完成！
echo   安装包：release\亚马逊赛训效率工具箱 Setup %PKG_VERSION%.exe
echo ============================================
echo.
pause