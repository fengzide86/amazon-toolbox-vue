"""
云服务器部署脚本
通过 SSH 将重构后的后端代码部署到云服务器
"""
import paramiko
import os
import sys

# 服务器配置
SERVER_HOST = "8.130.113.104"
SERVER_USER = "root"
SERVER_PASSWORD = "Wei99991221"
REMOTE_DIR = "/opt/amazon-toolbox/backend"

# 本地 backend 目录
LOCAL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")

def connect():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(SERVER_HOST, username=SERVER_USER, password=SERVER_PASSWORD, timeout=10)
    return ssh

def run_cmd(ssh, cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out:
        print(f"  {out.strip()}")
    if err:
        print(f"  [ERR] {err.strip()}")
    return stdout.channel.recv_exit_status()

def upload_file(sftp, local_path, remote_path):
    sftp.put(local_path, remote_path)
    print(f"  Uploaded: {os.path.basename(local_path)}")

def main():
    print("=== 连接服务器 ===")
    ssh = connect()
    print("  连接成功!")

    # 创建目录
    print("\n=== 创建目录 ===")
    dirs = ["core", "routers", "services", "updates", "data"]
    for d in dirs:
        run_cmd(ssh, f"mkdir -p {REMOTE_DIR}/{d}")
    print("  目录创建完成")

    # 上传文件
    print("\n=== 上传文件 ===")
    sftp = ssh.open_sftp()

    # 根目录文件
    root_files = ["main.py", "database.py", "models.py", "schemas.py", "requirements.txt"]
    for f in root_files:
        local = os.path.join(LOCAL_DIR, f)
        if os.path.exists(local):
            upload_file(sftp, local, f"{REMOTE_DIR}/{f}")

    # 上传 package.json（用于版本号同步）
    pkg_json = os.path.join(LOCAL_DIR, "..", "package.json")
    if os.path.exists(pkg_json):
        upload_file(sftp, pkg_json, f"{REMOTE_DIR}/package.json")

    # 上传 .env.production 配置文件
    env_file = os.path.join(LOCAL_DIR, ".env.production")
    if os.path.exists(env_file):
        upload_file(sftp, env_file, f"{REMOTE_DIR}/.env")
        print("  [INFO] 已上传生产环境配置")

    # core 目录
    core_dir = os.path.join(LOCAL_DIR, "core")
    if os.path.isdir(core_dir):
        for f in os.listdir(core_dir):
            if f.endswith(".py"):
                upload_file(sftp, os.path.join(core_dir, f), f"{REMOTE_DIR}/core/{f}")

    # routers 目录
    routers_dir = os.path.join(LOCAL_DIR, "routers")
    if os.path.isdir(routers_dir):
        for f in os.listdir(routers_dir):
            if f.endswith(".py"):
                upload_file(sftp, os.path.join(routers_dir, f), f"{REMOTE_DIR}/routers/{f}")

    # services 目录
    services_dir = os.path.join(LOCAL_DIR, "services")
    if os.path.isdir(services_dir):
        for f in os.listdir(services_dir):
            if f.endswith(".py"):
                upload_file(sftp, os.path.join(services_dir, f), f"{REMOTE_DIR}/services/{f}")

    sftp.close()

    # 安装系统依赖（MySQL 客户端库）
    print("\n=== 安装系统依赖 ===")
    run_cmd(ssh, "apt-get update -qq")
    run_cmd(ssh, "apt-get install -y -qq libmysqlclient-dev pkg-config")

    # 安装 Python 依赖
    print("\n=== 安装 Python 依赖 ===")
    run_cmd(ssh, f"cd {REMOTE_DIR} && pip3 install -r requirements.txt -q")

    # 创建 systemd 服务（如果不存在）- 使用多进程启动优化500人并发
    print("\n=== 配置系统服务 ===")
    run_cmd(ssh, """cat > /etc/systemd/system/toolbox-backend.service << 'EOF'
[Unit]
Description=Amazon Toolbox Backend
After=network.target mysql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/amazon-toolbox/backend
ExecStart=/usr/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF""")
    run_cmd(ssh, "systemctl daemon-reload")
    run_cmd(ssh, "systemctl enable toolbox-backend")
    
    # 先杀掉可能占用端口的旧进程
    print("\n=== 停止旧服务 ===")
    run_cmd(ssh, "pkill -f 'python.*main.py' || true")
    run_cmd(ssh, "sleep 1")
    
    # 重启服务
    print("\n=== 重启服务 ===")
    run_cmd(ssh, "systemctl restart toolbox-backend")
    run_cmd(ssh, "sleep 3 && systemctl status toolbox-backend --no-pager")

    # 查看错误日志
    print("\n=== 错误日志 ===")
    run_cmd(ssh, "journalctl -u toolbox-backend -n 30 --no-pager")
    
    # 健康检查
    print("\n=== 健康检查 ===")
    run_cmd(ssh, "curl -s http://localhost:8000/api/health")

    ssh.close()
    print("\n=== 部署完成! ===")

if __name__ == "__main__":
    main()