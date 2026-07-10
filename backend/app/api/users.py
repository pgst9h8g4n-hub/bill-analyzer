"""
用户管理路由
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.bill import User

router = APIRouter()


@router.get("/profile")
def get_profile(db: Session = Depends(get_db)):
    """获取当前用户信息（由 Supabase Auth JWT 中间件注入 user_id）"""
    # TODO: 从 JWT 中获取当前用户 ID
    raise HTTPException(status_code=501, detail="Supabase Auth 集成待实现")


@router.put("/profile")
def update_profile(name: str, db: Session = Depends(get_db)):
    """更新个人资料"""
    raise HTTPException(status_code=501, detail="Supabase Auth 集成待实现")


@router.get("/")
def list_users(db: Session = Depends(get_db)):
    """获取所有用户列表（用于多用户切换）"""
    users = db.query(User).all()
    return {
        "users": [
            {"id": u.id, "name": u.name, "phone": u.phone, "avatar_url": u.avatar_url}
            for u in users
        ]
    }
