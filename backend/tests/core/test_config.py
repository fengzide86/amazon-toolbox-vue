"""Configuration schema tests that do not depend on a developer's local .env values."""
from core.config import Settings, settings


def test_runtime_settings_have_valid_network_defaults() -> None:
    assert settings.HOST
    assert 1 <= settings.PORT <= 65535
    assert isinstance(settings.CORS_ORIGINS, list)


def test_security_configuration_uses_supported_types() -> None:
    assert settings.JWT_ALGORITHM == "HS256"
    assert settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES > 0
    assert isinstance(settings.JWT_SECRET_KEY, str)


def test_database_configuration_is_explicit() -> None:
    assert settings.DB_TYPE in {"", "sqlite", "mysql"}
    assert isinstance(settings.DB_PATH, str)
    assert settings.MYSQL_PORT > 0


def test_ai_configuration_has_bounded_retry_values() -> None:
    assert settings.AI_PROVIDER in {"qwen", "openai", "local"}
    assert settings.AI_CHAT_MAX_RETRIES >= 0
    assert settings.AI_CHAT_MAX_HISTORY > 0


def test_environment_override_is_parsed(monkeypatch) -> None:
    monkeypatch.setenv("DEBUG", "true")
    assert Settings().DEBUG is True
