from typing import Optional
"""
统计分析路由
"""

from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.bill import BillRecord, Category

router = APIRouter()


@router.get("/summary")
def get_summary(
    user_id: str = "",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """获取总体统计摘要"""
    query = db.query(BillRecord).filter(
        BillRecord.user_id == user_id,
        BillRecord.direction == "支出",
    )

    if start_date:
        query = query.filter(BillRecord.trans_time >= start_date)
    if end_date:
        query = query.filter(BillRecord.trans_time <= end_date)

    total_amount = query.with_entities(func.sum(BillRecord.amount)).scalar() or Decimal("0")
    record_count = query.with_entities(func.count(BillRecord.id)).scalar() or 0

    # 计算天数范围
    if start_date and end_date:
        try:
            sd = datetime.fromisoformat(start_date)
            ed = datetime.fromisoformat(end_date)
            days = max((ed - sd).days, 1)
        except (ValueError, TypeError):
            days = 1
    else:
        days = 1

    avg_daily = total_amount / days
    max_single = query.with_entities(func.max(BillRecord.amount)).scalar() or Decimal("0")

    # 按平台统计
    by_platform = (
        query.with_entities(BillRecord.platform, func.sum(BillRecord.amount), func.count(BillRecord.id))
        .group_by(BillRecord.platform)
        .all()
    )

    # 按分类统计
    by_category = (
        query.join(Category, BillRecord.category_id == Category.id, isouter=True)
        .with_entities(
            Category.id,
            Category.name,
            Category.parent_id,
            func.sum(BillRecord.amount),
            func.count(BillRecord.id),
        )
        .group_by(Category.id, Category.name, Category.parent_id)
        .all()
    )

    # 按月份统计
    by_month = (
        query.with_entities(
            func.to_char(BillRecord.trans_time, "YYYY-MM"),
            func.sum(BillRecord.amount),
            func.count(BillRecord.id),
        )
        .group_by(func.to_char(BillRecord.trans_time, "YYYY-MM"))
        .order_by(func.to_char(BillRecord.trans_time, "YYYY-MM"))
        .all()
    )

    return {
        "total_amount": float(total_amount),
        "expense_amount": float(total_amount),
        "record_count": record_count,
        "avg_daily": float(avg_daily),
        "max_single": float(max_single),
        "by_platform": [
            {"platform": p, "amount": float(a), "count": c}
            for p, a, c in by_platform
        ],
        "by_category": [
            {
                "category_id": str(c[0]),
                "category_name": c[1],
                "parent_id": str(c[2]) if c[2] else None,
                "amount": float(c[3]),
                "count": c[4],
                "percentage": float(c[3] / total_amount * 100) if total_amount > 0 else 0,
            }
            for c in by_category
        ],
        "by_month": [
            {"month": m, "amount": float(a), "count": c}
            for m, a, c in by_month
        ],
    }
