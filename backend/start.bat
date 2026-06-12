@echo off
echo ============================================
echo   亚马逊赛训效率工具箱 - 后端服务启动
echo ============================================
echo.
echo 正在安装依赖...
pip install -r requirements.txt
echo.
echo 正在启动后端服务 (http://localhost:8000)...
echo API文档: http://localhost:8000/docs
echo.
python main.py
pause