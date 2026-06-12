"""
应用配置管理
集中管理所有配置项，支持环境变量覆盖
"""
from typing import List, Optional
import os
import json

# 加载 .env 文件（如果存在）
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv 未安装时忽略


def _get_version() -> str:
    """从 package.json 自动读取版本号"""
    # 尝试多个路径：本地开发 / 服务器部署
    for rel in ["../../package.json", "../package.json", "package.json"]:
        try:
            pkg_path = os.path.normpath(os.path.join(os.path.dirname(__file__), rel))
            with open(pkg_path, encoding="utf-8") as f:
                v = json.load(f).get("version", "")
                if v:
                    return v
        except Exception:
            pass
    return "1.0.4"  # 最终兜底


class Settings:
    """应用配置"""
    
    # 应用配置
    APP_NAME: str = "亚马逊赛训效率工具箱"
    APP_VERSION: str = _get_version()
    DEBUG: bool = False
    
    # 服务器配置
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # CORS 配置
    CORS_ORIGINS: List[str] = None
    
    # ===== 数据库配置 =====
    # 数据库类型: "sqlite" (本地开发) 或 "mysql" (生产环境)
    DB_TYPE: str = ""
    
    # SQLite 配置（本地开发用）
    DB_PATH: str = ""
    
    # MySQL 配置（生产环境用）
    MYSQL_HOST: str = ""
    MYSQL_PORT: int = 3306
    MYSQL_USER: str = ""
    MYSQL_PASSWORD: str = ""
    MYSQL_DATABASE: str = ""
    
    # ===== JWT 配置 =====
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24小时
    
    # ===== Redis 配置（可选）=====
    REDIS_URL: Optional[str] = None
    
    # ===== API 频率限制 =====
    RATE_LIMIT_PER_MINUTE: int = 60  # 每分钟最多60次请求
    
    # 默认管理员密码
    DEFAULT_ADMIN_PASSWORD: str = "admin123"
    
    # 默认分润比例
    DEFAULT_PROFIT_RATIOS: dict = None
    
    def __init__(self):
        # 初始化 CORS 配置
        cors_env = os.getenv("CORS_ORIGINS", "*")
        self.CORS_ORIGINS = [origin.strip() for origin in cors_env.split(",")]
        
        # ===== 初始化数据库配置 =====
        # 优先使用环境变量，否则根据环境自动选择
        self.DB_TYPE = os.getenv("DB_TYPE", "").lower()
        
        if self.DB_TYPE == "mysql":
            # 生产环境：使用 MySQL
            self.MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
            self.MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
            self.MYSQL_USER = os.getenv("MYSQL_USER", "root")
            self.MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
            self.MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "amazon_toolbox")
        else:
            # 本地开发：使用 SQLite
            self.DB_TYPE = "sqlite"
            self.DB_PATH = self._get_db_path()
        
        # ===== 初始化 JWT 配置 =====
        # 生产环境必须设置强密码！
        self.JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-key-change-in-production")
        
        # ===== 初始化 Redis 配置 =====
        self.REDIS_URL = os.getenv("REDIS_URL")  # 例如: redis://localhost:6379/0
        
        # 初始化默认分润比例
        self.DEFAULT_PROFIT_RATIOS = {
            "tech": 0.30, "market": 0.25, "product": 0.15,
            "service": 0.15, "coordination": 0.10, "record": 0.05
        }
    
    def _get_db_path(self) -> str:
        """获取数据库路径：始终使用用户 AppData 目录"""
        appdata = os.environ.get('APPDATA') or os.path.expanduser('~')
        db_dir = os.path.join(appdata, "AmazonToolbox")
        os.makedirs(db_dir, exist_ok=True)
        return os.path.join(db_dir, "toolbox.db")
    
    def get_database_url(self) -> str:
        """获取数据库连接 URL"""
        if self.DB_TYPE == "mysql":
            # MySQL 异步连接 URL
            return f"mysql+aiomysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}?charset=utf8mb4"
        else:
            # SQLite 异步连接 URL
            return f"sqlite+aiosqlite:///{self.DB_PATH}"


# 全局配置实例
settings = Settings()
