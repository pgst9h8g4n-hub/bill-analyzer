from typing import Optional
"""
账单记录路由
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, desc, asc
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.models.bill import BillRecord, Category, ManualOverride

router = APIRouter()


@router.get("/")
def list_records(
    user_id: str = "",  # TODO: 从 JWT 获取
    platform: Optional[str] = None,
    category_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    direction: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort_by: str = Query("trans_time"),
    sort_order: str = Query("desc"),
    db: Session = Depends(get_db),
):
    """分页查询账单记录"""
    query = db.query(BillRecord).filter(BillRecord.user_id == user_id)

    if platform:
        query = query.filter(BillRecord.platform == platform)
    if category_id:
        query = query.filter(BillRecord.category_id == category_id)
    if direction:
        query = query.filter(BillRecord.direction == direction)
    if start_date:
        query = query.filter(BillRecord.trans_time >= start_date)
    if end_date:
        query = query.filter(BillRecord.trans_time <= end_date)

    # 排序
    sort_col = getattr(BillRecord, sort_by, BillRecord.trans_time)
    query = query.order_by(desc(sort_col) if sort_order == "desc" else asc(sort_col))

    # 总数
    total = query.count()

    # 分页
    records = query.offset((page - 1) * page_size).limit(page_size).all()

    # 组装结果（包含分类名）
    result = []
    for r in records:
        cat_name = None
        parent_cat_name = None
        if r.category_id:
            cat = db.query(Category).filter(Category.id == r.category_id).first()
            if cat:
                cat_name = cat.name
                if cat.parent_id:
                    parent = db.query(Category).filter(Category.id == cat.parent_id).first()
                    if parent:
                        parent_cat_name = parent.name

        result.append({
            "id": str(r.id),
            "platform": r.platform,
            "original_merchant": r.original_merchant,
            "original_product": r.original_product,
            "original_category": r.original_category,
            "trans_time": r.trans_time.isoformat() if r.trans_time else None,
            "amount": float(r.amount) if r.amount else 0,
            "direction": r.direction,
            "category_id": str(r.category_id) if r.category_id else None,
            "category_name": cat_name,
            "parent_category_name": parent_cat_name,
            "classification_method": r.classification_method,
            "platform_order_no": r.platform_order_no,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    return {
        "data": result,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


@router.get("/{record_id}", response_model=dict)
def get_record(record_id: str, db: Session = Depends(get_db)):
    """获取单条记录详情"""
    r = db.query(BillRecord).filter(BillRecord.id == record_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"record": _record_to_dict(r)}


@router.put("/{record_id}/category", response_model=dict)
def update_record_category(
    record_id: str,
    category_id: str,
    db: Session = Depends(get_db),
):
    """修改记录分类（写入 manual_overrides）"""
    record = db.query(BillRecord).filter(BillRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")

    # 检查或创建修正记录
    override = db.query(ManualOverride).filter(
        ManualOverride.record_id == record_id
    ).first()

    if override:
        override.category_id = category_id
    else:
        override = ManualOverride(record_id=record_id, category_id=category_id)
        db.add(override)

    record.classification_method = "manual"
    db.commit()

    return {"message": "分类已更新", "record_id": record_id, "category_id": category_id}


def _record_to_dict(r) -> dict:
    return {
        "id": str(r.id),
        "platform": r.platform,
        "original_merchant": r.original_merchant,
        "original_product": r.original_product,
        "trans_time": r.trans_time.isoformat() if r.trans_time else None,
        "amount": float(r.amount) if r.amount else 0,
        "direction": r.direction,
        "category_id": str(r.category_id) if r.category_id else None,
        "platform_order_no": r.platform_order_no,
    }
