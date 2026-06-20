"""重启服务并验证"""
import paramiko
import time
import os

# 服务器配置（优先从环境变量读取，默认值仅供开发使用）
SERVER_HOST = os.environ.get("DEPLOY_SERVER_HOST", "8.130.113.104")
SERVER_USER = os.environ.get("DEPLOY_SERVER_USER", "root")
SERVER_PASSWORD = os.environ.get("DEPLOY_SERVER_PASSWORD", "Wei99991221")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(SERVER_HOST, username=SERVER_USER, password=SERVER_PASSWORD, timeout=10)

# 重启服务
print('=== 重启服务 ===')
stdin, stdout, stderr = ssh.exec_command('systemctl restart toolbox-backend')
print(stdout.read().decode())
print(stderr.read().decode())

time.sleep(5)

# 检查状态
print('=== 服务状态 ===')
stdin, stdout, stderr = ssh.exec_command('systemctl status toolbox-backend --no-pager')
print(stdout.read().decode())

# 健康检查
print('=== 健康检查 ===')
stdin, stdout, stderr = ssh.exec_command('curl -s http://localhost:8000/api/health')
out = stdout.read().decode()
print(out)

# 如果健康检查失败，查看日志
if 'ok' not in out.lower():
    print('\n=== 错误日志 ===')
    stdin, stdout, stderr = ssh.exec_command('journalctl -u toolbox-backend -n 50 --no-pager')
    print(stdout.read().decode())

ssh.close()
print('\n=== 完成! ===')