"""
Docker 一键部署脚本
通过 SSH 将代码部署到服务器并使用 Docker Compose 运行
"""
import paramiko
import os
import sys
import tarfile
import tempfile
import time

# 服务器配置（优先从环境变量读取）
SERVER_HOST = os.environ.get("DEPLOY_SERVER_HOST", "8.130.113.104")
SERVER_USER = os.environ.get("DEPLOY_SERVER_USER", "root")
SERVER_PASSWORD = os.environ.get("DEPLOY_SERVER_PASSWORD", "Wei99991221")
REMOTE_DIR = os.environ.get("DEPLOY_REMOTE_DIR", "/opt/amazon-toolbox")

# 本地项目根目录
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))


def connect():
    """SSH 连接"""
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"  连接服务器 {SERVER_HOST}...")
    ssh.connect(SERVER_HOST, username=SERVER_USER, password=SERVER_PASSWORD, timeout=15)
    print("  ✓ 连接成功")
    return ssh


def run_cmd(ssh, cmd, show_output=True):
    """执行远程命令"""
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=300)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    exit_code = stdout.channel.recv_exit_status()
    
    if show_output:
        if out:
            for line in out.split('\n')[-20:]:  # 只显示最后20行
                print(f"    {line}")
        if err and exit_code != 0:
            print(f"    [ERR] {err[:500]}")
    
    return exit_code, out, err


def create_tarball():
    """创建项目压缩包（排除不需要的文件）"""
    print("\n[1/5] 打包项目文件...")
    
    # 创建临时 tar.gz 文件
    tmp_fd, tmp_path = tempfile.mkstemp(suffix='.tar.gz')
    os.close(tmp_fd)
    
    exclude_patterns = [
        '.git', 'node_modules', '__pycache__', '.pytest_cache',
        'chroma_db', 'dist', '.env', 'backend/.env',
        'backend/chroma_db', 'backend/updates',
        '*.pyc', '*.pyo', '.DS_Store', 'reports'
    ]
    
    def should_exclude(path):
        for pattern in exclude_patterns:
            if pattern in path:
                return True
        return False
    
    with tarfile.open(tmp_path, 'w:gz') as tar:
        for root, dirs, files in os.walk(PROJECT_DIR):
            # 过滤目录
            dirs[:] = [d for d in dirs if not should_exclude(os.path.join(root, d))]
            
            for file in files:
                if should_exclude(file):
                    continue
                full_path = os.path.join(root, file)
                arc_name = os.path.relpath(full_path, PROJECT_DIR)
                tar.add(full_path, arcname=arc_name)
    
    size_mb = os.path.getsize(tmp_path) / 1024 / 1024
    print(f"  ✓ 打包完成: {size_mb:.1f} MB")
    return tmp_path


def upload_tarball(ssh, tarball_path):
    """上传压缩包到服务器"""
    print("\n[2/5] 上传到服务器...")
    
    remote_tarball = f"{REMOTE_DIR}/project.tar.gz"
    
    # 确保远程目录存在
    run_cmd(ssh, f"mkdir -p {REMOTE_DIR}", show_output=False)
    
    # 上传
    sftp = ssh.open_sftp()
    file_size = os.path.getsize(tarball_path)
    
    uploaded = [0]
    last_print = [0]
    
    def progress(transferred, total):
        uploaded[0] = transferred
        now = time.time()
        if now - last_print[0] > 2:  # 每2秒打印一次
            percent = transferred * 100 / total
            mb = transferred / 1024 / 1024
            total_mb = total / 1024 / 1024
            print(f"    上传中: {mb:.1f}/{total_mb:.1f} MB ({percent:.0f}%)")
            last_print[0] = now
    
    sftp.put(tarball_path, remote_tarball, callback=progress)
    sftp.close()
    
    print(f"  ✓ 上传完成")
    return remote_tarball


def extract_and_build(ssh, remote_tarball):
    """解压并构建 Docker 镜像"""
    print("\n[3/5] 解压并构建 Docker 镜像（首次构建可能需要5-10分钟）...")
    
    # 停止旧容器
    print("  停止旧容器...")
    run_cmd(ssh, f"cd {REMOTE_DIR} && docker-compose down 2>/dev/null || true", show_output=False)
    
    # 解压
    print("  解压项目文件...")
    run_cmd(ssh, f"cd {REMOTE_DIR} && rm -rf src backend electron public scripts docs tests *.json *.js *.html *.yml *.yaml Dockerfile .dockerignore .env* 2>/dev/null; tar -xzf project.tar.gz", show_output=False)
    
    # 复制 .env.production 作为 .env
    run_cmd(ssh, f"cp {REMOTE_DIR}/backend/.env.production {REMOTE_DIR}/backend/.env 2>/dev/null || true", show_output=False)
    
    # 构建镜像
    print("  构建 Docker 镜像...")
    exit_code, out, err = run_cmd(ssh, f"cd {REMOTE_DIR} && docker-compose build --no-cache 2>&1 | tail -30")
    
    if exit_code != 0:
        print("  ✗ 构建失败!")
        return False
    
    print("  ✓ 构建完成")
    return True


def start_services(ssh):
    """启动服务"""
    print("\n[4/5] 启动服务...")
    
    exit_code, out, err = run_cmd(ssh, f"cd {REMOTE_DIR} && docker-compose up -d")
    
    if exit_code != 0:
        print("  ✗ 启动失败!")
        return False
    
    print("  ✓ 服务已启动")
    return True


def health_check(ssh):
    """健康检查"""
    print("\n[5/5] 健康检查...")
    
    # 等待服务启动
    print("  等待服务就绪...")
    for i in range(12):
        time.sleep(5)
        exit_code, out, err = run_cmd(ssh, "curl -sf http://localhost:8000/api/health 2>/dev/null", show_output=False)
        if exit_code == 0:
            print(f"  ✓ 服务已就绪! (等待了 {(i+1)*5} 秒)")
            
            # 显示容器状态
            print("\n  容器状态:")
            run_cmd(ssh, f"cd {REMOTE_DIR} && docker-compose ps")
            
            # 清理压缩包
            run_cmd(ssh, f"rm -f {REMOTE_DIR}/project.tar.gz", show_output=False)
            
            return True
        print(f"    等待中... ({(i+1)*5}s)")
    
    print("  ✗ 服务启动超时")
    
    # 显示日志
    print("\n  应用日志:")
    run_cmd(ssh, f"cd {REMOTE_DIR} && docker-compose logs --tail=30 app")
    
    return False


def main():
    print("=" * 50)
    print("  Docker 一键部署")
    print("=" * 50)
    
    tarball_path = None
    
    try:
        # 1. 连接服务器
        print("\n=== 连接服务器 ===")
        ssh = connect()
        
        # 2. 检查 Docker 是否安装
        print("\n=== 检查 Docker ===")
        exit_code, out, err = run_cmd(ssh, "docker --version && docker-compose --version", show_output=False)
        if exit_code != 0:
            print("  ✗ Docker 未安装，正在安装...")
            run_cmd(ssh, "curl -fsSL https://get.docker.com | sh")
            run_cmd(ssh, "systemctl start docker && systemctl enable docker")
            run_cmd(ssh, "curl -L 'https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)' -o /usr/local/bin/docker-compose && chmod +x /usr/local/bin/docker-compose")
            print("  ✓ Docker 安装完成")
        
        print("  ✓ Docker 已就绪")
        
        # 3. 打包项目
        tarball_path = create_tarball()
        
        # 4. 上传
        remote_tarball = upload_tarball(ssh, tarball_path)
        
        # 5. 解压并构建
        if not extract_and_build(ssh, remote_tarball):
            print("\n✗ 部署失败!")
            return 1
        
        # 6. 启动服务
        if not start_services(ssh):
            print("\n✗ 部署失败!")
            return 1
        
        # 7. 健康检查
        if not health_check(ssh):
            print("\n✗ 服务启动异常，请检查日志")
            return 1
        
        print("\n" + "=" * 50)
        print("  ✓ 部署成功!")
        print("=" * 50)
        print(f"  应用地址: http://{SERVER_HOST}:8000")
        print(f"  API文档:  http://{SERVER_HOST}:8000/docs")
        print("\n  常用命令:")
        print(f"    查看日志: cd {REMOTE_DIR} && docker-compose logs -f")
        print(f"    重启服务: cd {REMOTE_DIR} && docker-compose restart")
        print(f"    停止服务: cd {REMOTE_DIR} && docker-compose down")
        print("=" * 50)
        
        ssh.close()
        return 0
        
    except Exception as e:
        print(f"\n✗ 部署出错: {e}")
        return 1
        
    finally:
        # 清理本地临时文件
        if tarball_path and os.path.exists(tarball_path):
            os.remove(tarball_path)


if __name__ == "__main__":
    sys.exit(main())