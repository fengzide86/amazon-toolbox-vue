"""
在云服务器上安装 MySQL
使用 MariaDB 替代（完全兼容 MySQL，阿里云镜像源有）
"""
import paramiko
import time

# 服务器配置
SERVER_HOST = "8.130.113.104"
SERVER_USER = "root"
SERVER_PASSWORD = "Wei99991221"

def connect():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(SERVER_HOST, username=SERVER_USER, password=SERVER_PASSWORD, timeout=30)
    return ssh

def run_cmd(ssh, cmd, timeout=300):
    print(f"\n>>> {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out.strip():
        for line in out.strip().split('\n')[-10:]:  # 只显示最后10行
            print(f"  {line}")
    if err.strip() and exit_status != 0:
        for line in err.strip().split('\n')[-5:]:
            print(f"  [ERR] {line}")
    print(f"  退出码: {exit_status}")
    return exit_status

def main():
    print("=" * 50)
    print("  在服务器上安装 MariaDB (MySQL 兼容)")
    print("=" * 50)

    print("\n=== 连接服务器 ===")
    ssh = connect()
    print("  OK")

    # 方案：使用 MariaDB（MySQL 的完全兼容替代品）
    # 先尝试修复 apt
    print("\n=== 修复 apt 源 ===")
    run_cmd(ssh, "apt-get clean")
    run_cmd(ssh, "apt-get update --fix-missing -qq", timeout=120)

    # 安装 MariaDB（MySQL 兼容，镜像源有）
    print("\n=== 安装 MariaDB ===")
    run_cmd(ssh, "DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-server mariadb-client", timeout=300)

    # 启动 MariaDB
    print("\n=== 启动 MariaDB ===")
    run_cmd(ssh, "systemctl start mariadb")
    run_cmd(ssh, "systemctl enable mariadb")
    run_cmd(ssh, "systemctl status mariadb --no-pager")

    # 设置 root 密码
    print("\n=== 设置 root 密码 ===")
    run_cmd(ssh, f'mysql -u root -e "ALTER USER \'root\'@\'localhost\' IDENTIFIED BY \'{SERVER_PASSWORD}\'; FLUSH PRIVILEGES;"')

    # 创建数据库
    print("\n=== 创建数据库 ===")
    run_cmd(ssh, f'mysql -u root -p{SERVER_PASSWORD} -e "CREATE DATABASE IF NOT EXISTS amazon_toolbox CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"')

    # 显示数据库列表
    print("\n=== 数据库列表 ===")
    run_cmd(ssh, f'mysql -u root -p{SERVER_PASSWORD} -e "SHOW DATABASES;"')

    # 重启后端服务
    print("\n=== 重启后端服务 ===")
    run_cmd(ssh, "systemctl restart toolbox-backend")
    print("  等待 5 秒...")
    time.sleep(5)

    # 检查服务状态
    print("\n=== 后端服务状态 ===")
    run_cmd(ssh, "systemctl status toolbox-backend --no-pager")

    # 查看日志
    print("\n=== 后端日志 ===")
    run_cmd(ssh, "journalctl -u toolbox-backend -n 20 --no-pager")

    # 健康检查
    print("\n=== 健康检查 ===")
    run_cmd(ssh, "curl -s http://localhost:8000/api/health")

    ssh.close()
    print("\n" + "=" * 50)
    print("  完成!")
    print("=" * 50)

if __name__ == "__main__":
    main()