"""
日志配置模块（增强版）
提供结构化日志、日志轮转、请求追踪等功能
"""
import logging
import logging.handlers
import sys
import os
import json
import uuid
from pathlib import Path
from datetime import datetime
from typing import Optional, Any, Dict
from contextvars import ContextVar

# ===== 请求上下文变量 =====
# 用于在请求链路中传递 request_id
_request_id_var: ContextVar[str] = ContextVar('request_id', default='')
_user_id_var: ContextVar[Optional[int]] = ContextVar('user_id', default=None)


def get_request_id() -> str:
    """获取当前请求ID"""
    return _request_id_var.get()


def set_request_id(request_id: str = None) -> str:
    """设置当前请求ID"""
    if not request_id:
        request_id = uuid.uuid4().hex[:8]
    _request_id_var.set(request_id)
    return request_id


def get_user_id() -> Optional[int]:
    """获取当前用户ID"""
    return _user_id_var.get()


def set_user_id(user_id: Optional[int]):
    """设置当前用户ID"""
    _user_id_var.set(user_id)


# ===== 结构化日志格式化器 =====

class StructuredFormatter(logging.Formatter):
    """结构化 JSON 日志格式化器
    
    输出格式：
    {
        "timestamp": "2024-01-01 12:00:00.000",
        "level": "INFO",
        "logger": "module.name",
        "message": "日志内容",
        "request_id": "abc12345",
        "user_id": 1,
        "module": "module",
        "function": "func_name",
        "line": 42
    }
    """
    
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.fromtimestamp(record.created).strftime('%Y-%m-%d %H:%M:%S.') + f"{int(record.msecs):03d}",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        
        # 添加请求ID
        request_id = _request_id_var.get()
        if request_id:
            log_data["request_id"] = request_id
        
        # 添加用户ID
        user_id = _user_id_var.get()
        if user_id is not None:
            log_data["user_id"] = user_id
        
        # 添加异常信息
        if record.exc_info and record.exc_info[0] is not None:
            log_data["exception"] = self.formatException(record.exc_info)
        
        # 添加额外字段
        if hasattr(record, 'extra_data'):
            log_data["data"] = record.extra_data
        
        return json.dumps(log_data, ensure_ascii=False)


class HumanReadableFormatter(logging.Formatter):
    """人类可读的日志格式化器（带颜色和请求ID）"""
    
    # ANSI 颜色代码
    COLORS = {
        'DEBUG': '\033[36m',     # 青色
        'INFO': '\033[32m',      # 绿色
        'WARNING': '\033[33m',   # 黄色
        'ERROR': '\033[31m',     # 红色
        'CRITICAL': '\033[35m',  # 紫色
    }
    RESET = '\033[0m'
    
    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, '')
        reset = self.RESET
        
        # 请求ID
        request_id = _request_id_var.get()
        rid_str = f"[{request_id}] " if request_id else ""
        
        # 用户ID
        user_id = _user_id_var.get()
        uid_str = f"[user:{user_id}] " if user_id is not None else ""
        
        # 基础格式
        timestamp = datetime.fromtimestamp(record.created).strftime('%H:%M:%S')
        
        msg = (
            f"{color}{timestamp}{reset} "
            f"{color}{record.levelname:8s}{reset} "
            f"{rid_str}{uid_str}"
            f"{record.name}: "
            f"{record.getMessage()}"
        )
        
        # 添加异常信息
        if record.exc_info and record.exc_info[0] is not None:
            msg += f"\n{self.formatException(record.exc_info)}"
        
        return msg


# ===== 日志配置 =====

def setup_logging(
    level: str = "INFO",
    log_dir: str = None,
    json_format: bool = False,
    max_bytes: int = 10 * 1024 * 1024,  # 10MB
    backup_count: int = 5,
) -> None:
    """配置日志系统（增强版）
    
    Args:
        level: 日志级别
        log_dir: 日志文件目录，None 则使用默认目录
        json_format: 是否使用 JSON 格式（生产环境推荐）
        max_bytes: 单个日志文件最大字节数
        backup_count: 保留的日志文件数量
    """
    # 日志级别
    log_level = getattr(logging, level.upper(), logging.INFO)
    
    # 根日志器
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.handlers.clear()
    
    # ===== 控制台处理器 =====
    console_handler = logging.StreamHandler(sys.stdout)
    if json_format:
        console_handler.setFormatter(StructuredFormatter())
    else:
        console_handler.setFormatter(HumanReadableFormatter())
    root_logger.addHandler(console_handler)
    
    # ===== 文件处理器（带轮转）=====
    if log_dir is None:
        appdata = os.environ.get('APPDATA') or os.path.expanduser('~')
        log_dir = os.path.join(appdata, "AmazonToolbox", "logs")
    
    try:
        os.makedirs(log_dir, exist_ok=True)
        
        # 主日志文件（轮转）
        main_log_file = os.path.join(log_dir, "app.log")
        rotating_handler = logging.handlers.RotatingFileHandler(
            main_log_file,
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding='utf-8',
        )
        if json_format:
            rotating_handler.setFormatter(StructuredFormatter())
        else:
            rotating_handler.setFormatter(HumanReadableFormatter())
        root_logger.addHandler(rotating_handler)
        
        # 错误日志单独文件
        error_log_file = os.path.join(log_dir, "error.log")
        error_handler = logging.handlers.RotatingFileHandler(
            error_log_file,
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding='utf-8',
        )
        error_handler.setLevel(logging.ERROR)
        if json_format:
            error_handler.setFormatter(StructuredFormatter())
        else:
            error_handler.setFormatter(HumanReadableFormatter())
        root_logger.addHandler(error_handler)
        
    except Exception as e:
        root_logger.warning(f"文件日志创建失败: {e}")
    
    # ===== 降低第三方库日志级别 =====
    logging.getLogger('uvicorn').setLevel(logging.WARNING)
    logging.getLogger('uvicorn.error').setLevel(logging.WARNING)
    logging.getLogger('uvicorn.access').setLevel(logging.WARNING)
    logging.getLogger('sqlalchemy').setLevel(logging.WARNING)
    logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)
    logging.getLogger('sqlalchemy.pool').setLevel(logging.WARNING)
    logging.getLogger('aiomysql').setLevel(logging.WARNING)
    logging.getLogger('aiosqlite').setLevel(logging.WARNING)
    
    # ===== 记录启动信息 =====
    logger = logging.getLogger(__name__)
    logger.info("=" * 60)
    logger.info("亚马逊赛训效率工具箱 - 后端服务启动")
    logger.info(f"日志级别: {level}")
    logger.info(f"日志目录: {log_dir}")
    logger.info(f"JSON格式: {json_format}")
    logger.info("=" * 60)


def get_logger(name: str) -> 'ToolboxLogger':
    """获取增强日志器
    
    Args:
        name: 日志器名称，通常使用 __name__
        
    Returns:
        增强版日志器实例
    """
    return ToolboxLogger(name)


class ToolboxLogger:
    """增强版日志器
    
    支持：
    - 标准日志方法（debug, info, warning, error, critical）
    - 带额外数据的日志
    - 请求追踪
    """
    
    def __init__(self, name: str):
        self._logger = logging.getLogger(name)
    
    def debug(self, msg: str, *args, **kwargs):
        self._logger.debug(msg, *args, **kwargs)
    
    def info(self, msg: str, *args, **kwargs):
        self._logger.info(msg, *args, **kwargs)
    
    def warning(self, msg: str, *args, **kwargs):
        self._logger.warning(msg, *args, **kwargs)
    
    def error(self, msg: str, *args, **kwargs):
        self._logger.error(msg, *args, **kwargs)
    
    def critical(self, msg: str, *args, **kwargs):
        self._logger.critical(msg, *args, **kwargs)
    
    def exception(self, msg: str, *args, **kwargs):
        """记录异常（自动包含堆栈信息）"""
        self._logger.exception(msg, *args, **kwargs)
    
    def with_data(self, msg: str, data: Dict[str, Any], level: int = logging.INFO):
        """记录带额外数据的日志
        
        Args:
            msg: 日志消息
            data: 额外数据字典
            level: 日志级别
        """
        record = self._logger.makeRecord(
            self._logger.name,
            level,
            "(with_data)",
            0,
            msg,
            (),
            None,
        )
        record.extra_data = data
        self._logger.handle(record)
    
    def api_call(self, method: str, path: str, status: int, duration: float, user_id: int = None):
        """记录 API 调用日志
        
        Args:
            method: HTTP 方法
            path: 请求路径
            status: 响应状态码
            duration: 耗时（秒）
            user_id: 用户ID
        """
        data = {
            "method": method,
            "path": path,
            "status": status,
            "duration_ms": round(duration * 1000, 2),
        }
        if user_id is not None:
            data["user_id"] = user_id
        
        level = logging.WARNING if status >= 400 else logging.INFO
        self.with_data(f"{method} {path} -> {status}", data, level)
    
    def db_query(self, query_type: str, table: str, duration: float, rows: int = None):
        """记录数据库查询日志
        
        Args:
            query_type: 查询类型（SELECT, INSERT, UPDATE, DELETE）
            table: 表名
            duration: 耗时（秒）
            rows: 影响行数
        """
        data = {
            "query_type": query_type,
            "table": table,
            "duration_ms": round(duration * 1000, 2),
        }
        if rows is not None:
            data["rows"] = rows
        
        self.with_data(f"DB {query_type} {table}", data)
    
    def security(self, event: str, detail: str, user_id: int = None, ip: str = None):
        """记录安全相关日志
        
        Args:
            event: 安全事件类型
            detail: 详细信息
            user_id: 用户ID
            ip: IP 地址
        """
        data = {"event": event, "detail": detail}
        if user_id is not None:
            data["user_id"] = user_id
        if ip:
            data["ip"] = ip
        
        self.with_data(f"SECURITY: {event}", data, logging.WARNING)