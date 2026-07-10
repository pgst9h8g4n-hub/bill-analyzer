"""
账单上传与解析路由
"""

from typing import Optional

import os
import tempfile
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.parsers.base import Platform
from app.parsers.factory import get_parser
from app.parsers.classifier import classify_record
from app.models.bill import BillFile, BillRecord, User, Category

router = APIRouter()


@router.post("/", response_model=dict)
async def upload_file(
    file: UploadFile = File(...),
    user_id: str = "",  # TODO: 从 JWT 获取
    platform_hint: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    上传账单文件并触发解析

    Args:
        file: 账单文件 (CSV/XLSX/PDF)
        user_id: 用户ID
        platform_hint: 平台类型提示 (alipay/wechat/douyin)
    """
    # 验证文件类型
    ext = os.path.splitext(file.filename)[1].lower()
    allowed_ext = {".csv": "alipay", ".xlsx": "wechat", ".pdf": "douyin"}

    if ext not in allowed_ext:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型: {ext}")

    if not platform_hint:
        platform_hint = allowed_ext[ext]

    # 验证平台
    if platform_hint not in ("alipay", "wechat", "douyin"):
        raise HTTPException(status_code=400, detail=f"不支持的平台: {platform_hint}")

    # 创建临时文件
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # 解析文件
        parser = get_parser(Platform(platform_hint))
        records, meta = parser.parse(tmp_path)

        if not records:
            raise HTTPException(status_code=400, detail="未解析到任何交易记录")

        # 查找或创建用户
        user = _find_or_create_user(db, user_id, meta.user_identifier)
        if not user:
            raise HTTPException(status_code=400, detail="无法识别用户，请先在设置中添加成员")

        # 创建文件记录
        file_record = BillFile(
            user_id=str(user.id),
            platform=platform_hint,
            original_name=file.filename,
            file_key=f"{user.id}/{platform_hint}_{datetime.now().strftime('%Y%m%d%H%M%S')}{ext}",
            period_start=meta.period_start[:10] if meta.period_start else None,
            period_end=meta.period_end[:10] if meta.period_end else None,
            record_count=len(records),
            status="done",
        )
        db.add(file_record)
        db.flush()  # 获取 ID

        # 获取用户的分类列表
        categories = db.query(Category).filter(
            Category.user_id == str(user.id),
            Category.parent_id.is_(None),
        ).all()

        # 插入账单记录
        inserted = 0
        skipped = 0
        for rec in records:
            # 去重检查
            if rec.platform_order_no:
                existing = db.query(BillRecord).filter(
                    BillRecord.user_id == str(user.id),
                    BillRecord.platform == platform_hint,
                    BillRecord.platform_order_no == rec.platform_order_no,
                ).first()
                if existing:
                    skipped += 1
                    continue

            # 自动分类
            cat_id = None
            class_method = "auto"
            if categories:
                result = classify_record(rec, categories)
                if result.score >= 0.5 and result.category_id:
                    cat_id = result.category_id
                    class_method = "auto"

            bill_record = BillRecord(
                user_id=str(user.id),
                file_id=str(file_record.id),
                platform=platform_hint,
                original_merchant=rec.merchant,
                original_product=rec.product,
                original_category=rec.original_category,
                trans_time=rec.trans_time,
                amount=rec.amount,
                direction=rec.direction,
                category_id=cat_id,
                classification_method=class_method,
                platform_order_no=rec.platform_order_no,
                merchant_order_no=rec.merchant_order_no,
            )
            db.add(bill_record)
            inserted += 1

        db.commit()
        file_record.record_count = inserted

        return {
            "file_id": str(file_record.id),
            "status": "done",
            "estimated_records": len(records),
            "inserted": inserted,
            "skipped": skipped,
            "meta": {
                "user_identifier": meta.user_identifier,
                "period_start": meta.period_start,
                "period_end": meta.period_end,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"解析失败: {str(e)}")
    finally:
        # 清理临时文件
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def _find_or_create_user(db: Session, user_id: str, identifier: str) -> 'User | None':
    """根据标识符查找或创建用户"""
    # 优先按 user_id 查找
    if user_id:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            return user

    # 通过标识符匹配
    user = (
        db.query(User)
        .filter(
            (User.phone == identifier) |
            (User.name.contains(identifier))
        )
        .first()
    )

    if user:
        return user

    # 创建新用户
    if identifier:
        user = User(name=identifier, phone=identifier if len(identifier) == 11 else None)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    return None
