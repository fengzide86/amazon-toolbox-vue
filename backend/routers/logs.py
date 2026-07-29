"""
运行日志路由模块
包含日志的创建、查询、筛选、导出等接口
"""
import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user
from core.logging import get_logger
from core.response import CompatibleResponse
from database import get_db
from models import RunLog
from schemas import LogCreate, LogResponse

logger = get_logger(__name__)

router = APIRouter()


@router.get("", response_model=CompatibleResponse)
async def get_logs(
    user_id: int | None = Query(None, description="用户ID"),
    start_date: str | None = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="结束日期 (YYYY-MM-DD)"),
    tool_name: str | None = Query(None, description="工具名称"),
    status: str | None = Query(None, description="状态 (success/failed)"),
    platform_key: str | None = Query(None, description="平台标识 (amazon/aliexpress)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取运行日志列表，支持多条件筛选
    
    Args:
        user_id: 按用户ID筛选
        start_date: 开始日期
        end_date: 结束日期
        tool_name: 工具名称
        status: 状态筛选
        platform_key: 平台标识（1.5 新增）
        limit: 返回数量限制
    """
    query = select(RunLog)
    
    # 权限控制：普通用户只能查看自己的日志
    if current_user.get("role") != "admin":
        user_id = current_user.get("user_id")  # 强制使用当前用户ID
    elif user_id:
        query = query.where(RunLog.user_id == user_id)
    
    # 普通用户强制只能看自己的
    if current_user.get("role") != "admin":
        query = query.where(RunLog.user_id == current_user.get("user_id"))
    
    # 日期范围筛选
    if start_date:
        try:
            start = datetime.fromisoformat(start_date)
            query = query.where(RunLog.created_at >= start)
        except ValueError:
            pass
    
    if end_date:
        try:
            end = datetime.fromisoformat(end_date)
            # 包含结束日期的整天
            end = end.replace(hour=23, minute=59, second=59)
            query = query.where(RunLog.created_at <= end)
        except ValueError:
            pass
    
    # 工具名称筛选
    if tool_name:
        query = query.where(RunLog.tool_name == tool_name)
    
    # 状态筛选
    if status:
        query = query.where(RunLog.status == status)
    
    # 平台筛选（1.5 新增）
    if platform_key:
        query = query.where(RunLog.platform_key == platform_key)
    
    # 排序和限制
    count_result = await db.execute(
        select(func.count()).select_from(query.order_by(None).subquery())
    )
    query = (
        query.order_by(RunLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    result = await db.execute(query)
    return {
        "data": result.scalars().all(),
        "page": page,
        "page_size": page_size,
        "total": int(count_result.scalar() or 0),
    }


@router.get("/export", response_model=CompatibleResponse)
async def export_logs(
    user_id: int | None = Query(None, description="用户ID"),
    start_date: str | None = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="结束日期 (YYYY-MM-DD)"),
    tool_name: str | None = Query(None, description="工具名称"),
    status: str | None = Query(None, description="状态 (success/failed)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """导出日志为 CSV 文件"""
    query = select(RunLog)
    
    # 权限控制：普通用户只能导出自己的日志
    if current_user.get("role") != "admin":
        query = query.where(RunLog.user_id == current_user.get("user_id"))
    elif user_id:
        query = query.where(RunLog.user_id == user_id)
    if start_date:
        try:
            start = datetime.fromisoformat(start_date)
            query = query.where(RunLog.created_at >= start)
        except ValueError:
            pass
    if end_date:
        try:
            end = datetime.fromisoformat(end_date)
            end = end.replace(hour=23, minute=59, second=59)
            query = query.where(RunLog.created_at <= end)
        except ValueError:
            pass
    if tool_name:
        query = query.where(RunLog.tool_name == tool_name)
    if status:
        query = query.where(RunLog.status == status)
    
    query = query.order_by(RunLog.created_at.desc()).limit(10000)
    
    result = await db.execute(query)
    logs = result.scalars().all()
    
    # 生成 CSV
    output = io.StringIO()
    # 添加 BOM 以支持 Excel 打开中文
    output.write('\ufeff')
    writer = csv.writer(output)
    
    # 写入表头
    writer.writerow(['ID', '用户ID', '设备ID', '工具名称', '模块', '状态', '错误码', '详情', '创建时间'])
    
    # 写入数据
    for log in logs:
        writer.writerow([
            log.id,
            log.user_id or '',
            log.device_id or '',
            log.tool_name or '',
            log.module or '',
            log.status or '',
            log.error_code or '',
            log.detail or '',
            log.created_at.strftime('%Y-%m-%d %H:%M:%S') if log.created_at else ''
        ])
    
    # 返回 CSV 文件
    output.seek(0)
    filename = f"logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/tools", response_model=CompatibleResponse)
async def get_log_tools(
    user_id: int | None = Query(None, description="用户ID"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """获取日志中的工具名称列表（用于筛选下拉框）"""
    query = select(RunLog.tool_name).distinct()

    if current_user.get("role") != "admin":
        query = query.where(RunLog.user_id == current_user.get("user_id"))
    elif user_id:
        query = query.where(RunLog.user_id == user_id)
    
    query = query.where(RunLog.tool_name.isnot(None))
    
    result = await db.execute(query)
    tools = [row[0] for row in result.all() if row[0]]
    return sorted(tools)


@router.post("", response_model=LogResponse)
async def create_log(
    req: LogCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Real execution logs are read-only until a Runner-only API exists."""
    del req, db, current_user
    raise HTTPException(status_code=403, detail="真实执行记录只能由未来 Runner 写入")
