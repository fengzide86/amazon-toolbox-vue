@echo off
chcp 65001 >nul
echo ================================================
echo   Docker 一键部署
echo ================================================
echo.

REM 检查 Python 是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Python，请先安装 Python 3.8+
    pause
    exit /b 1
)

REM 检查 paramiko 是否安装
python -c "import paramiko" >nul 2>&1
if errorlevel 1 (
    echo [提示] 正在安装 paramiko...
    pip install paramiko -q
)

echo.
echo 开始部署...
echo.

python docker_deploy.py

echo.
if errorlevel 1 (
    echo [错误] 部署失败，请检查上面的日志
) else (
    echo [完成] 部署成功！
)

pause