"""
Supabase 客户端
用于 Auth 管理和 Storage 操作
"""

from supabase import create_client, Client
from app.core.config import get_settings

_settings: Settings | None = None


def get_supabase() -> Client:
    """获取 Supabase 客户端单例"""
    global _settings
    if _settings is None:
        _settings = get_settings()
    return create_client(_settings.supabase_url, _settings.supabase_service_role_key)
