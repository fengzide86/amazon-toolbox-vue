"""
日志清理脚本
定期清理过期的运行日志，防止数据库表过大

使用方式:
1. 手动运行: python scripts/cleanup_logs.py
2. 定时任务: 每天凌晨3点执行
   - Linux cron: 0 3 * * * cd /path/to/backend && python scripts/cleanup_logs.py
   - Windows 任务计划程序: 设置每日定时运行
"""
import asyncio
import sys
from datetime import datetime, timedelta
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import delete, func, select
from database import async_session_maker, engine
from models import RunLog
from core.logging import setup_logging, get_logger

# 配置日志
setup_logging()
logger = get_logger(__name__)

# 保留天数（可配置）
RETENTION_DAYS = 90


async def cleanup_old_logs(days: int = RETENTION_DAYS) -> dict:
    """清理过期日志
    
    Args:
        days: 保留天数，默认90天
        
    Returns:
        清理结果统计
    """
    cutoff_date = datetime.now() - timedelta(days=days)
    
    logger.info(f"开始清理 {days} 天前的日志 (截止日期: {cutoff_date.strftime('%Y-%m-%d')})")
    
    async with async_session_maker() as session:
        try:
            # 先统计要删除的数量
            count_result = await session.execute(
                select(func.count(RunLog.id)).where(RunLog.created_at < cutoff_date)
            )
            delete_count = count_result.scalar() or 0
            
            if delete_count == 0:
                logger.info("没有需要清理的日志")
                return {"deleted": 0, "status": "ok"}
            
            logger.info(f"找到 {delete_count} 条过期日志")
            
            # 分批删除，避免长时间锁定
            batch_size = 1000
            total_deleted = 0
            
            while total_deleted < delete_count:
                result = await session.execute(
                    delete(RunLog)
                    .where(RunLog.created_at < cutoff_date)
                    .execution_options(synchronize_session=False)
                )
                await session.commit()
                
                # 由于使用了 synchronize_session=False，需要重新查询剩余数量
                count_result = await session.execute(
                    select(func.count(RunLog.id)).where(RunLog.created_at < cutoff_date)
                )
                remaining = count_result.scalar() or 0
                
                if remaining == 0:
                    break
                    
                logger.info(f"已删除 {total_deleted} 条，剩余 {remaining} 条")
            
            logger.info(f"日志清理完成，共删除 {delete_count} 条")
            return {"deleted": delete_count, "status": "ok"}
            
        except Exception as e:
            await session.rollback()
            logger.error(f"日志清理失败: {e}", exc_info=True)
            return {"deleted": 0, "status": "error", "error": str(e)}


async def get_log_stats() -> dict:
    """获取日志统计信息"""
    async with async_session_maker() as session:
        # 总日志数
        total_result = await session.execute(select(func.count(RunLog.id)))
        total = total_result.scalar() or 0
        
        # 30天前的日志数
        old_count_result = await session.execute(
            select(func.count(RunLog.id)).where(
                RunLog.created_at < datetime.now() - timedelta(days=30)
            )
        )
        old_count = old_count_result.scalar() or 0
        
        # 90天前的日志数
        very_old_count_result = await session.execute(
            select(func.count(RunLog.id)).where(
                RunLog.created_at < datetime.now() - timedelta(days=90)
            )
        )
        very_old_count = very_old_count_result.scalar() or 0
        
        return {
            "total": total,
            "over_30_days": old_count,
            "over_90_days": very_old_count,
        }


async def main():
    """主函数"""
    logger.info("=" * 50)
    logger.info("日志清理脚本启动")
    logger.info("=" * 50)
    
    try:
        # 获取统计信息
        stats = await get_log_stats()
        logger.info(f"当前日志统计: 总计 {stats['total']} 条, "
                   f"30天前 {stats['over_30_days']} 条, "
                   f"90天前 {stats['over_90_days']} 条")
        
        # 执行清理
        result = await cleanup_old_logs(RETENTION_DAYS)
        
        if result["status"] == "ok":
            logger.info(f"清理成功，删除了 {result['deleted']} 条日志")
        else:
            logger.error(f"清理失败: {result.get('error')}")
            
    except Exception as e:
        logger.error(f"脚本执行异常: {e}", exc_info=True)
    finally:
        await engine.dispose()
        logger.info("脚本执行完毕")


if __name__ == "__main__":
    asyncio.run(main())
