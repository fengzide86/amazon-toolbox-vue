"""
设置 999 套餐的 SVIP 前缀 - 通过 SSH 直接操作数据库
"""
import paramiko
import os

# 服务器配置（优先从环境变量读取，默认值仅供开发使用）
SERVER_HOST = os.environ.get("DEPLOY_SERVER_HOST", "8.130.113.104")
SERVER_USER = os.environ.get("DEPLOY_SERVER_USER", "root")
SERVER_PASSWORD = os.environ.get("DEPLOY_SERVER_PASSWORD", "Wei99991221")
MYSQL_PASSWORD = os.environ.get("DEPLOY_MYSQL_PASSWORD", "Wei99991221")

def run_cmd(ssh, cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    return out, err

def main():
    print("=== 连接服务器 ===")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(SERVER_HOST, username=SERVER_USER, password=SERVER_PASSWORD, timeout=10)
    print("  连接成功!")

    # 1. 查看所有套餐
    print("\n=== 当前套餐列表 ===")
    out, err = run_cmd(ssh, f'mysql -u root -p{MYSQL_PASSWORD} amazon_toolbox -e "SELECT id, name, price, code_prefix FROM plans WHERE status != \\"deleted\\";"')
    print(out)

    # 2. 找到 999 套餐并更新
    print("=== 设置 999 套餐 code_prefix = SVIP ===")
    out, err = run_cmd(ssh, f'mysql -u root -p{MYSQL_PASSWORD} amazon_toolbox -e "UPDATE plans SET code_prefix = \\"SVIP\\" WHERE price = 999 OR name LIKE \\"%999%\\";"')
    if err and "ERROR" in err:
        print(f"  更新失败: {err}")
    else:
        print("  更新成功!")

    # 3. 验证
    print("\n=== 验证结果 ===")
    out, err = run_cmd(ssh, f'mysql -u root -p{MYSQL_PASSWORD} amazon_toolbox -e "SELECT id, name, price, code_prefix FROM plans WHERE status != \\"deleted\\";"')
    print(out)

    ssh.close()
    print("=== 完成 ===")

if __name__ == "__main__":
    main()