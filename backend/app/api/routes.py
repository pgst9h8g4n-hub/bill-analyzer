"""
主路由挂载
"""

from fastapi import APIRouter

from app.api import upload, records, categories, stats, users

router = APIRouter()

router.include_router(users.router, prefix="/users", tags=["用户"])
router.include_router(categories.router, prefix="/categories", tags=["分类"])
router.include_router(upload.router, prefix="/upload", tags=["上传"])
router.include_router(records.router, prefix="/records", tags=["记录"])
router.include_router(stats.router, prefix="/stats", tags=["统计"])


@router.get("/health")
async def health_check():
    return {"status": "ok", "service": "bill-classifier"}
