#!/bin/bash
# ============================================
#   跨境电商赛训效率工具箱 - 云服务器一键部署脚本
#   在服务器终端粘贴执行即可
# ============================================
set -e
echo "============================================"
echo "  跨境电商赛训效率工具箱 - 一键部署"
echo "============================================"

echo "[1/6] 更新系统并安装 Python..."
apt update -y && apt upgrade -y
apt install -y python3 python3-pip

echo "[2/6] 创建目录..."
mkdir -p /opt/amazon-toolbox/backend
mkdir -p /opt/amazon-toolbox/backend/core
mkdir -p /opt/amazon-toolbox/backend/routers
mkdir -p /opt/amazon-toolbox/backend/services
mkdir -p /opt/amazon-toolbox/backend/updates
mkdir -p /opt/amazon-toolbox/data

SERVER_IP="${DEPLOY_SERVER_HOST:-8.130.113.104}"
echo "[3/6] 部署后端代码..."
echo "  请使用 scp 从本地电脑复制代码到服务器："
echo "  scp -r ./backend/* root@${SERVER_IP}:/opt/amazon-toolbox/backend/"
echo ""
echo "  或者手动上传 backend 目录下的所有文件到 /opt/amazon-toolbox/backend/"
echo ""

# 等待用户确认代码已上传
read -p "  代码已上传？按 Enter 继续... "

echo "[4/6] 安装 Python 依赖..."
cd /opt/amazon-toolbox/backend
pip3 install fastapi==0.115.0 uvicorn==0.30.6 sqlalchemy==2.0.35 pydantic==2.9.2 pydantic-settings==2.5.2 python-multipart==0.0.9 aiosqlite==0.20.0 bcrypt==4.3.0

echo "[5/6] 配置系统服务..."
cat > /etc/systemd/system/toolbox-backend.service << 'EOF'
[Unit]
Description=Amazon Toolbox Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/amazon-toolbox/backend
ExecStart=/usr/bin/python3 main.py
Restart=always
RestartSec=5
Environment=CORS_ORIGINS=*

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable toolbox-backend
systemctl start toolbox-backend

echo "[6/6] 配置防火墙..."
ufw allow 8000/tcp 2>/dev/null || true

echo ""
echo "============================================"
echo "  部署完成！"
echo "============================================"
echo "  后端地址: http://${SERVER_IP}:8000"
echo "  API文档:  http://${SERVER_IP}:8000/docs"
echo "  健康检查: http://${SERVER_IP}:8000/api/health"
echo ""
echo "  管理命令:"
echo "    systemctl status toolbox-backend"
echo "    systemctl restart toolbox-backend"
echo "    journalctl -u toolbox-backend -f"
echo ""