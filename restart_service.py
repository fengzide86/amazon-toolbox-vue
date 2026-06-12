"""重启服务并验证"""
import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('8.130.113.104', username='root', password='Wei99991221', timeout=10)

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