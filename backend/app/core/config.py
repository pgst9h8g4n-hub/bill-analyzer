"""
应用配置管理
从环境变量读取 Supabase URL、密钥等配置
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """应用配置"""

    # Supabase
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # Database (Direct PostgreSQL connection for SQLAlchemy)
    database_url: str = "postgresql://postgres:postgres@localhost:5432/postgres"

    # Security
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # CORS
    allowed_origins: list[str] = ["http://localhost:5173"]

    # Upload
    max_upload_size_mb: int = 10

    model_config = {"env_file": ".env", "case_sensitive": True}


@lru_cache()
def get_settings() -> Settings:
    """获取配置单例"""
    return Settings()
