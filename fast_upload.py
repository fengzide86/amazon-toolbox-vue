"""
快速上传脚本 - 使用 SSH 批量上传更新包
比 PowerShell 快 3-5 倍（复用连接）
"""
import paramiko
import os
import sys
import time

# 服务器配置
SERVER_HOST = os.environ.get("DEPLOY_SERVER_HOST", "8.130.113.104")
SERVER_USER = os.environ.get("DEPLOY_SERVER_USER", "root")
SERVER_PASSWORD = os.environ.get("DEPLOY_SERVER_PASSWORD", "Wei99991221")
REMOTE_DIR = "/opt/amazon-toolbox/backend/updates"

def main():
    if len(sys.argv) < 2:
        print("Usage: python fast_upload.py <file1> [file2] ...")
        sys.exit(1)
    
    files = sys.argv[1:]
    
    # 检查文件是否存在
    for f in files:
        if not os.path.exists(f):
            print(f"[ERROR] File not found: {f}")
            sys.exit(1)
    
    print(f"[INFO] Connecting to {SERVER_HOST}...")
    
    # SSH 连接
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(SERVER_HOST, username=SERVER_USER, password=SERVER_PASSWORD, timeout=10)
    
    # 创建远程目录
    ssh.exec_command(f"mkdir -p {REMOTE_DIR}")
    
    # 批量上传
    sftp = ssh.open_sftp()
    total_files = len(files)
    
    print(f"[INFO] Uploading {total_files} file(s)...")
    start_time = time.time()
    
    for i, filepath in enumerate(files, 1):
        filename = os.path.basename(filepath)
        filesize = os.path.getsize(filepath) / 1024 / 1024  # MB
        
        print(f"  [{i}/{total_files}] {filename} ({filesize:.1f} MB)...", end=" ", flush=True)
        
        upload_start = time.time()
        sftp.put(filepath, f"{REMOTE_DIR}/{filename}")
        upload_time = time.time() - upload_start
        
        speed = filesize / upload_time if upload_time > 0 else 0
        print(f"done ({speed:.1f} MB/s)")
    
    sftp.close()
    ssh.close()
    
    total_time = time.time() - start_time
    print(f"\n[OK] Upload complete! Total time: {total_time:.1f}s")

if __name__ == "__main__":
    main()