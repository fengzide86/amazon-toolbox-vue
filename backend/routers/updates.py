"""
自动更新路由模块
包含更新文件的上传、列表等接口
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
import os

from core.logging import get_logger
from core.dependencies import get_current_admin

logger = get_logger(__name__)

router = APIRouter()

# 创建更新文件目录
UPDATES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "updates")
os.makedirs(UPDATES_DIR, exist_ok=True)


def get_static_files():
    """获取静态文件服务实例"""
    return StaticFiles(directory=UPDATES_DIR)


@router.post("/upload")
async def upload_update(
    file: UploadFile = File(...),
    _admin: dict = Depends(get_current_admin)
):
    """上传更新文件（latest.yml 或 exe 安装包）
    
    只允许上传 .yml、.exe 或 .blockmap 文件
    需要管理员权限
    """
    if not file.filename:
        raise HTTPException(400, "文件名不能为空")
    
    # 只允许上传 .yml 和 .exe 文件
    if not file.filename.endswith(('.yml', '.exe', '.blockmap')):
        raise HTTPException(400, "只允许上传 .yml、.exe 或 .blockmap 文件")
    
    # 安全处理文件名：只取 basename，防止路径遍历攻击
    safe_filename = os.path.basename(file.filename)
    filepath = os.path.join(UPDATES_DIR, safe_filename)
    content = await file.read()
    
    with open(filepath, "wb") as f:
        f.write(content)
    
    logger.info(f"上传更新文件: {file.filename}, 大小: {len(content)} bytes")
    return {"success": True, "filename": file.filename, "size": len(content)}


@router.get("/list")
async def list_updates(_admin: dict = Depends(get_current_admin)):
    """列出已上传的更新文件"""
    files = []
    if os.path.exists(UPDATES_DIR):
        for f in os.listdir(UPDATES_DIR):
            fp = os.path.join(UPDATES_DIR, f)
            if os.path.isfile(fp):
                files.append({"name": f, "size": os.path.getsize(fp)})
    return files