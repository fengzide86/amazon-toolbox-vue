"""
安全模块单元测试
测试密码哈希、JWT Token、CORS 配置等安全功能
"""
import pytest
from datetime import timedelta
from unittest.mock import MagicMock, patch

from core.security import (
    hash_password,
    verify_password,
    verify_password_fallback,
    create_access_token,
    verify_token,
    extract_token_from_header,
    configure_cors
)
from core.config import settings


class TestPasswordHashing:
    """密码哈希测试"""
    
    def test_hash_password(self):
        """测试密码哈希"""
        password = "test_password_123"
        hashed = hash_password(password)
        
        assert hashed is not None
        assert len(hashed) > 0
        assert hashed != password
        # bcrypt 哈希格式: $2b$12$...
        assert hashed.startswith("$2b$")
    
    def test_hash_password_different_salts(self):
        """测试相同密码生成不同哈希"""
        password = "same_password"
        hash1 = hash_password(password)
        hash2 = hash_password(password)
        
        # 由于盐值不同，两次哈希应该不同
        assert hash1 != hash2
    
    def test_verify_password_correct(self):
        """测试正确密码验证"""
        password = "my_secret_password"
        hashed = hash_password(password)
        
        assert verify_password(password, hashed) is True
    
    def test_verify_password_incorrect(self):
        """测试错误密码验证"""
        password = "correct_password"
        hashed = hash_password(password)
        
        assert verify_password("wrong_password", hashed) is False
    
    def test_verify_password_empty(self):
        """测试空密码验证"""
        hashed = hash_password("some_password")
        
        assert verify_password("", hashed) is False
    
    def test_verify_password_invalid_hash(self):
        """测试无效哈希格式"""
        assert verify_password("password", "invalid_hash_format") is False
    
    def test_verify_password_unicode(self):
        """测试 Unicode 密码"""
        password = "密码测试_中文_🔐"
        hashed = hash_password(password)
        
        assert verify_password(password, hashed) is True
        assert verify_password("错误的密码", hashed) is False


class TestPasswordFallback:
    """密码降级验证测试（兼容旧版明文密码）"""
    
    def test_bcrypt_password_no_upgrade(self):
        """测试 bcrypt 密码不需要升级"""
        password = "test_password"
        hashed = hash_password(password)
        
        match, needs_upgrade = verify_password_fallback(password, hashed)
        
        assert match is True
        assert needs_upgrade is False
    
    def test_plaintext_password_needs_upgrade(self):
        """测试明文密码需要升级"""
        password = "plaintext_password"
        
        match, needs_upgrade = verify_password_fallback(password, password)
        
        assert match is True
        assert needs_upgrade is True
    
    def test_wrong_password_no_match(self):
        """测试错误密码不匹配"""
        stored = hash_password("correct_password")
        
        match, needs_upgrade = verify_password_fallback("wrong_password", stored)
        
        assert match is False
        assert needs_upgrade is False
    
    def test_plaintext_wrong_password(self):
        """测试明文密码错误情况"""
        stored = "stored_plaintext"
        
        match, needs_upgrade = verify_password_fallback("wrong_plaintext", stored)
        
        assert match is False
        assert needs_upgrade is False


class TestJWTToken:
    """JWT Token 测试"""
    
    def test_create_access_token(self):
        """测试创建 Token"""
        data = {"user_id": 1, "role": "admin"}
        token = create_access_token(data)
        
        assert token is not None
        assert len(token) > 0
        # JWT 格式: header.payload.signature
        parts = token.split(".")
        assert len(parts) == 3
    
    def test_create_token_with_custom_expiry(self):
        """测试自定义过期时间"""
        data = {"user_id": 1}
        expires = timedelta(hours=2)
        token = create_access_token(data, expires_delta=expires)
        
        assert token is not None
        
        # 验证 Token 内容
        payload = verify_token(token)
        assert payload is not None
        assert payload["user_id"] == 1
    
    def test_create_token_contains_iat(self):
        """测试 Token 包含签发时间"""
        data = {"user_id": 1}
        token = create_access_token(data)
        
        payload = verify_token(token)
        assert payload is not None
        assert "iat" in payload
        assert "exp" in payload
    
    def test_verify_valid_token(self):
        """测试验证有效 Token"""
        data = {"user_id": 42, "role": "user", "name": "测试用户"}
        token = create_access_token(data)
        
        payload = verify_token(token)
        
        assert payload is not None
        assert payload["user_id"] == 42
        assert payload["role"] == "user"
        assert payload["name"] == "测试用户"
    
    def test_verify_invalid_token(self):
        """测试验证无效 Token"""
        result = verify_token("invalid.token.here")
        
        assert result is None
    
    def test_verify_empty_token(self):
        """测试验证空 Token"""
        result = verify_token("")
        
        assert result is None
    
    def test_verify_tampered_token(self):
        """测试验证篡改的 Token"""
        data = {"user_id": 1}
        token = create_access_token(data)
        
        # 篡改 Token
        tampered = token[:-5] + "XXXXX"
        result = verify_token(tampered)
        
        assert result is None
    
    def test_token_expiry(self):
        """测试 Token 过期"""
        data = {"user_id": 1}
        # 创建已过期的 Token
        expires = timedelta(seconds=-1)
        token = create_access_token(data, expires_delta=expires)
        
        result = verify_token(token)
        
        # 过期的 Token 应该返回 None
        assert result is None
    
    def test_token_with_complex_data(self):
        """测试包含复杂数据的 Token"""
        data = {
            "user_id": 1,
            "role": "admin",
            "permissions": ["read", "write", "delete"],
            "metadata": {"department": "tech", "level": 5}
        }
        token = create_access_token(data)
        
        payload = verify_token(token)
        
        assert payload is not None
        assert payload["user_id"] == 1
        assert payload["role"] == "admin"
        assert payload["permissions"] == ["read", "write", "delete"]
        assert payload["metadata"]["department"] == "tech"


class TestExtractToken:
    """Token 提取测试"""
    
    def test_extract_valid_bearer_token(self):
        """测试提取有效的 Bearer Token"""
        auth_header = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature"
        
        token = extract_token_from_header(auth_header)
        
        assert token == "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature"
    
    def test_extract_token_case_insensitive(self):
        """测试 Bearer 大小写不敏感"""
        auth_header = "bearer my_token_here"
        
        token = extract_token_from_header(auth_header)
        
        assert token == "my_token_here"
    
    def test_extract_token_uppercase_bearer(self):
        """测试大写 BEARER"""
        auth_header = "BEARER token123"
        
        token = extract_token_from_header(auth_header)
        
        assert token == "token123"
    
    def test_extract_token_empty_string(self):
        """测试空字符串"""
        result = extract_token_from_header("")
        
        assert result is None
    
    def test_extract_token_none(self):
        """测试 None"""
        result = extract_token_from_header(None)
        
        assert result is None
    
    def test_extract_token_no_bearer_prefix(self):
        """测试没有 Bearer 前缀"""
        auth_header = "my_token_here"
        
        result = extract_token_from_header(auth_header)
        
        assert result is None
    
    def test_extract_token_wrong_prefix(self):
        """测试错误的前缀"""
        auth_header = "Basic dXNlcjpwYXNz"
        
        result = extract_token_from_header(auth_header)
        
        assert result is None
    
    def test_extract_token_too_many_parts(self):
        """测试过多部分"""
        auth_header = "Bearer token extra_part"
        
        result = extract_token_from_header(auth_header)
        
        assert result is None
    
    def test_extract_token_only_bearer(self):
        """测试只有 Bearer 没有 Token"""
        auth_header = "Bearer"
        
        result = extract_token_from_header(auth_header)
        
        assert result is None
    
    def test_extract_token_with_spaces(self):
        """测试带空格的 Token"""
        auth_header = "Bearer   token_with_spaces  "
        
        # split() 会处理多余空格，Python 的 split() 默认分割所有空白
        # "Bearer   token_with_spaces  ".split() => ["Bearer", "token_with_spaces"]
        result = extract_token_from_header(auth_header)
        
        # Python split() 会把多个空格当作一个分隔符，所以返回 token
        assert result == "token_with_spaces"


class TestCORSSonfiguration:
    """CORS 配置测试"""
    
    def test_configure_cors(self):
        """测试 CORS 配置"""
        mock_app = MagicMock()
        
        configure_cors(mock_app)
        
        # 验证添加了中间件
        mock_app.add_middleware.assert_called_once()
        
        # 验证中间件类型
        call_args = mock_app.add_middleware.call_args
        assert call_args[0][0].__name__ == "CORSMiddleware"
    
    def test_cors_allows_credentials(self):
        """测试 CORS 允许凭证"""
        mock_app = MagicMock()
        
        configure_cors(mock_app)
        
        call_kwargs = mock_app.add_middleware.call_args[1]
        assert call_kwargs["allow_credentials"] is True
    
    def test_cors_allows_standard_methods(self):
        """测试 CORS 允许标准方法"""
        mock_app = MagicMock()
        
        configure_cors(mock_app)
        
        call_kwargs = mock_app.add_middleware.call_args[1]
        methods = call_kwargs["allow_methods"]
        
        assert "GET" in methods
        assert "POST" in methods
        assert "PUT" in methods
        assert "DELETE" in methods
        assert "OPTIONS" in methods
    
    def test_cors_allows_standard_headers(self):
        """测试 CORS 允许标准头"""
        mock_app = MagicMock()
        
        configure_cors(mock_app)
        
        call_kwargs = mock_app.add_middleware.call_args[1]
        headers = call_kwargs["allow_headers"]
        
        assert "Content-Type" in headers
        assert "Authorization" in headers
    
    def test_cors_max_age(self):
        """测试 CORS 预检缓存时间"""
        mock_app = MagicMock()
        
        configure_cors(mock_app)
        
        call_kwargs = mock_app.add_middleware.call_args[1]
        assert call_kwargs["max_age"] == 600  # 10分钟