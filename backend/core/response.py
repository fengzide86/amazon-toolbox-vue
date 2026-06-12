"""
统一响应格式模块
提供标准化的 API 响应结构
"""
from typing import Any, Optional, List, Dict
from pydantic import BaseModel, Field


class APIResponse(BaseModel):
    """统一 API 响应格式"""
    success: bool = Field(default=True, description="是否成功")
    message: str = Field(default="ok", description="响应消息")
    data: Optional[Any] = Field(default=None, description="响应数据")
    total: Optional[int] = Field(default=None, description="总数（分页用）")
    page: Optional[int] = Field(default=None, description="当前页码")
    page_size: Optional[int] = Field(default=None, description="每页数量")


class ErrorResponse(BaseModel):
    """错误响应格式"""
    success: bool = Field(default=False)
    message: str
    error_code: Optional[int] = None
    detail: Optional[Any] = None


# ===== 快捷响应函数 =====

def success_response(
    data: Any = None,
    message: str = "ok",
    total: int = None,
    page: int = None,
    page_size: int = None
) -> Dict:
    """成功响应
    
    Args:
        data: 响应数据
        message: 响应消息
        total: 总记录数（分页时）
        page: 当前页码
        page_size: 每页数量
        
    Returns:
        标准化的成功响应字典
    """
    response = {
        "success": True,
        "message": message,
        "data": data,
    }
    if total is not None:
        response["total"] = total
    if page is not None:
        response["page"] = page
    if page_size is not None:
        response["page_size"] = page_size
    return response


def error_response(
    message: str = "操作失败",
    error_code: int = None,
    detail: Any = None
) -> Dict:
    """错误响应
    
    Args:
        message: 错误消息
        error_code: 错误代码
        detail: 错误详情
        
    Returns:
        标准化的错误响应字典
    """
    response = {
        "success": False,
        "message": message,
    }
    if error_code is not None:
        response["error_code"] = error_code
    if detail is not None:
        response["detail"] = detail
    return response


def paginated_response(
    items: List[Any],
    total: int,
    page: int,
    page_size: int
) -> Dict:
    """分页响应
    
    Args:
        items: 当前页数据列表
        total: 总记录数
        page: 当前页码
        page_size: 每页数量
        
    Returns:
        标准化的分页响应字典
    """
    return {
        "success": True,
        "message": "ok",
        "data": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
    }


def created_response(data: Any = None, message: str = "创建成功") -> Dict:
    """创建成功响应"""
    return success_response(data=data, message=message)


def updated_response(data: Any = None, message: str = "更新成功") -> Dict:
    """更新成功响应"""
    return success_response(data=data, message=message)


def deleted_response(message: str = "删除成功") -> Dict:
    """删除成功响应"""
    return success_response(data=None, message=message)


# ===== 错误代码常量 =====
class ErrorCodes:
    """错误代码定义"""
    # 通用错误 1xxx
    UNKNOWN_ERROR = 1000
    INVALID_PARAMS = 1001
    MISSING_PARAMS = 1002
    RESOURCE_NOT_FOUND = 1003
    RESOURCE_ALREADY_EXISTS = 1004
    
    # 认证错误 2xxx
    UNAUTHORIZED = 2000
    TOKEN_EXPIRED = 2001
    TOKEN_INVALID = 2002
    PERMISSION_DENIED = 2003
    
    # 业务错误 3xxx
    AUTH_CODE_INVALID = 3000
    AUTH_CODE_EXPIRED = 3001
    AUTH_CODE_FROZEN = 3002
    DEVICE_LIMIT_EXCEEDED = 3003
    ORDER_ALREADY_PAID = 3004
    PLAN_DISABLED = 3005
    
    # 系统错误 5xxx
    DATABASE_ERROR = 5000
    CACHE_ERROR = 5001
    EXTERNAL_SERVICE_ERROR = 5002