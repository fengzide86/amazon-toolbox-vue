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
    
    # 默认管理员密码（通过环境变量覆盖）
    DEFAULT_ADMIN_PASSWORD: str = ""
    
    # 默认分润比例
    DEFAULT_PROFIT_RATIOS: dict = None
    
    # ===== AI 客服配置 =====
    AI_PROVIDER: str = "qwen"                    # qwen/openai/ollama
    QWEN_API_KEY: str = ""                       # 通义千问API Key
    QWEN_MODEL: str = "qwen-turbo"               # 对话模型
    QWEN_EMBEDDING_MODEL: str = "text-embedding-v2"  # Embedding模型
    CHROMA_PERSIST_DIR: str = "./chroma_db"      # ChromaDB数据目录
    AI_CHAT_MAX_RETRIES: int = 2                 # AI最大重试次数
    AI_CHAT_MAX_HISTORY: int = 5                 # 对话历史轮数
    
    def __init__(self):
        # 初始化 DEBUG 模式（优先环境变量）
        self.DEBUG = os.getenv("DEBUG", "false").lower() == "true"
        
        # 初始化默认管理员密码（优先环境变量）
        self.DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")
        
        # 初始化 CORS 配置（生产环境禁止使用 *）
        cors_env = os.getenv("CORS_ORIGINS", "")
        self.CORS_ORIGINS = [origin.strip() for origin in cors_env.split(",") if origin.strip()] if cors_env else ["*"]
        
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
        jwt_key = os.getenv("JWT_SECRET_KEY", "")
        
        # 判断是否为生产环境（使用 MySQL 且非 DEBUG 模式）
        is_production = not self.DEBUG and self.DB_TYPE == "mysql"
        
        if not jwt_key:
            if is_production:
                # 生产环境：强制要求配置 JWT_SECRET_KEY
                raise ValueError(
                    "生产环境必须配置 JWT_SECRET_KEY！\n"
                    "请在 .env 文件中设置：JWT_SECRET_KEY=你的强密钥（至少32位）\n"
                    "可以使用命令生成：python -c \"import secrets; print(secrets.token_urlsafe(48))\""
                )
            else:
                # 开发环境：使用固定的开发密钥（确保重启后 Token 不失效）
                import warnings
                warnings.warn(
                    "JWT_SECRET_KEY 未设置，使用开发环境固定密钥。\n"
                    "生产环境请在 .env 文件中配置 JWT_SECRET_KEY。",
                    UserWarning,
                    stacklevel=2,
                )
                jwt_key = "dev-only-fixed-key-for-restart-stability-do-not-use-in-production"
        
        self.JWT_SECRET_KEY = jwt_key
        
        # ===== 初始化 Redis 配置 =====
        self.REDIS_URL = os.getenv("REDIS_URL")  # 例如: redis://localhost:6379/0
        
        # 初始化默认分润比例
        self.DEFAULT_PROFIT_RATIOS = {
            "tech": 0.30, "market": 0.25, "product": 0.15,
            "service": 0.15, "coordination": 0.10, "record": 0.05
        }
        
        # ===== 初始化 AI 客服配置 =====
        self.AI_PROVIDER = os.getenv("AI_PROVIDER", "qwen").lower()
        self.QWEN_API_KEY = os.getenv("QWEN_API_KEY", "")
        self.QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen-turbo")
        self.QWEN_EMBEDDING_MODEL = os.getenv("QWEN_EMBEDDING_MODEL", "text-embedding-v2")
        self.CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")
    
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
    
    def check_security(self) -> dict:
        """
        生产环境安全检查
        返回: {"warnings": [], "errors": []}
        - warnings: 低风险警告，不阻止启动
        - errors: 高风险错误，建议修复后再启动
        """
        result = {"warnings": [], "errors": []}
        # 使用 SQLite 或 DEBUG 模式时，视为开发环境，跳过严格检查
        is_production = not self.DEBUG and self.DB_TYPE != "sqlite"
        
        # 1. JWT_SECRET_KEY 长度检查
        if not self.JWT_SECRET_KEY or len(self.JWT_SECRET_KEY) < 32:
            result["errors"].append("JWT_SECRET_KEY 未设置或长度不足 32 位，存在安全风险")
        
        # 2. CORS 配置检查（仅生产环境）
        if is_production and "*" in self.CORS_ORIGINS:
            result["errors"].append("生产环境 CORS_ORIGINS 不应包含 *，请设置具体域名")
        
        # 3. DEBUG 模式检查
        if self.DEBUG:
            result["warnings"].append("DEBUG 模式已启用，生产环境应设置 DEBUG=False")
        
        # 4. 默认管理员密码检查（仅生产环境）
        if is_production and self.DEFAULT_ADMIN_PASSWORD == "admin123":
            result["errors"].append("使用默认管理员密码 'admin123'，生产环境必须修改 DEFAULT_ADMIN_PASSWORD")
        
        # 5. MySQL 密码检查（仅生产环境）
        if is_production and self.DB_TYPE == "mysql" and not self.MYSQL_PASSWORD:
            result["errors"].append("生产环境 MySQL 密码未设置")
        
        # 6. AI Key 检查（仅生产环境）
        if is_production and not self.QWEN_API_KEY:
            result["warnings"].append("生产环境未配置 QWEN_API_KEY，AI 客服功能将不可用")
        
        # 7. 更新地址检查（仅生产环境）
        update_url = os.getenv("UPDATE_URL", "")
        if is_production and (not update_url or "localhost" in update_url or "127.0.0.1" in update_url):
            result["warnings"].append("生产环境 UPDATE_URL 未设置或仍为本地地址")
        
        return result


# 全局配置实例
settings = Settings()
