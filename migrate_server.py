"""
服务器数据库迁移脚本
添加 code_prefix 字段到 plans 表
"""
import paramiko
import time

SERVER_HOST = "8.130.113.104"
SERVER_USER = "root"
SERVER_PASSWORD = "Wei99991221"

def run_cmd(ssh, cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out:
        print(f"  {out.strip()}")
    if err:
        print(f"  [STDERR] {err.strip()}")
    return out, err

def main():
    print("=== 连接服务器 ===")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(SERVER_HOST, username=SERVER_USER, password=SERVER_PASSWORD, timeout=10)
    print("  连接成功!")

    # 1. 执行数据库迁移 - 添加 code_prefix 字段
    print("\n=== 数据库迁移: 添加 plans.code_prefix 字段 ===")
    sql = "ALTER TABLE plans ADD COLUMN code_prefix VARCHAR(20) NULL;"
    out, err = run_cmd(ssh, f'mysql -u root -pWei99991221 amazon_toolbox -e "{sql}"')
    if "Duplicate" in err:
        print("  字段已存在，跳过")
    elif err and "ERROR" in err:
        print(f"  迁移失败: {err}")
    else:
        print("  迁移成功!")

    # 2. 创建上传目录
    print("\n=== 创建上传目录 ===")
    run_cmd(ssh, "mkdir -p /opt/amazon-toolbox/backend/uploads/feedback")
    print("  目录创建完成")

    # 3. 重启服务
    print("\n=== 重启后端服务 ===")
    run_cmd(ssh, "systemctl restart toolbox-backend")
    time.sleep(4)

    # 4. 检查服务状态
    print("\n=== 服务状态 ===")
    run_cmd(ssh, "systemctl status toolbox-backend --no-pager")

    # 5. 健康检查
    print("\n=== 健康检查 ===")
    out, err = run_cmd(ssh, "curl -s http://localhost:8000/api/health")
    if "ok" in out:
        print("  服务正常运行!")
    else:
        print("  服务可能未就绪，查看日志...")
        run_cmd(ssh, "journalctl -u toolbox-backend -n 20 --no-pager")

    ssh.close()
    print("\n=== 迁移部署完成! ===")

if __name__ == "__main__":
    main()