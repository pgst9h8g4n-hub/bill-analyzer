"""
分类管理路由
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.bill import Category
from app.schemas.bill import CategoryCreate, CategoryUpdate, CategoryOut

router = APIRouter()


@router.get("/", response_model=list[CategoryOut])
def list_categories(user_id: str, db: Session = Depends(get_db)):
    """获取当前用户的所有分类（树形结构）"""
    cats = (
        db.query(Category)
        .filter(Category.user_id == user_id)
        .order_by(Category.sort_order, Category.id)
        .all()
    )

    # 构建树形结构
    cat_map = {c.id: {"obj": c, "children": []} for c in cats}
    roots = []
    for c in cats:
        entry = cat_map[c.id]
        if c.parent_id and c.parent_id in cat_map:
            cat_map[c.parent_id]["children"].append(entry["obj"])
        else:
            roots.append(entry["obj"])

    def serialize(node: Category) -> dict:
        result = {
            "id": str(node.id),
            "name": node.name,
            "parent_id": str(node.parent_id) if node.parent_id else None,
            "sort_order": node.sort_order,
            "color": node.color,
            "keywords": node.keywords or [],
            "children": [serialize(child) for child in node.children],
        }
        return result

    return [serialize(r) for r in roots]


@router.post("/", response_model=dict)
def create_category(
    payload: CategoryCreate,
    user_id: str,
    db: Session = Depends(get_db),
):
    """创建一级分类"""
    cat = Category(
        user_id=user_id,
        name=payload.name,
        parent_id=None,
        sort_order=payload.sort_order,
        color=payload.color,
        keywords=payload.keywords or [],
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {"id": str(cat.id), "message": "分类创建成功"}


@router.put("/{category_id}", response_model=dict)
def update_category(
    category_id: str,
    payload: CategoryUpdate,
    user_id: str,
    db: Session = Depends(get_db),
):
    """更新分类"""
    cat = db.query(Category).filter(
        Category.id == category_id,
        Category.user_id == user_id,
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(cat, key, value)

    db.commit()
    db.refresh(cat)
    return {"id": str(cat.id), "message": "分类更新成功"}


@router.delete("/{category_id}", response_model=dict)
def delete_category(
    category_id: str,
    user_id: str,
    db: Session = Depends(get_db),
):
    """删除分类（级联删除子分类和关联记录）"""
    cat = db.query(Category).filter(
        Category.id == category_id,
        Category.user_id == user_id,
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")

    db.delete(cat)
    db.commit()
    return {"message": "分类已删除"}
