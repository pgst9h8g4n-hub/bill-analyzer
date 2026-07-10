"""
Pydantic 数据模型
用于请求/响应的数据验证
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, List, Optional

from pydantic import BaseModel, Field


class Platform(str, Enum):
    ALIPAY = "alipay"
    WECHAT = "wechat"
    DOUYIN = "douyin"


class Direction(str, Enum):
    EXPENSE = "支出"
    INCOME = "收入"
    NEUTRAL = "不计收支"


# ── 分类 ──────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    parent_id: Optional[str] = None
    sort_order: int = 0
    color: str = "#6366f1"
    keywords: List[str] = Field(default_factory=list)


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    sort_order: Optional[int] = None
    color: Optional[str] = None
    keywords: Optional[List[str]] = None


class CategoryOut(BaseModel):
    id: str
    name: str
    parent_id: Optional[str]
    sort_order: int
    color: str
    keywords: List[str]
    children: List["CategoryOut"] = Field(default_factory=list)

    model_config = {"from_attributes": True}


# ── 账单文件 ──────────────────────────────────────────

class FileInfoOut(BaseModel):
    id: str
    platform: Platform
    original_name: str
    period_start: Optional[datetime]
    period_end: Optional[datetime]
    record_count: int
    status: str
    parsed_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── 账单记录 ──────────────────────────────────────────

class RecordOut(BaseModel):
    id: str
    platform: Platform
    original_merchant: str
    original_product: Optional[str]
    original_category: Optional[str]
    trans_time: datetime
    amount: Decimal
    direction: Direction
    category_id: Optional[str]
    category_name: Optional[str] = None
    parent_category_name: Optional[str] = None
    classification_method: str
    platform_order_no: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class RecordListParams(BaseModel):
    """账单记录查询参数"""
    platform: Optional[Platform] = None
    category_id: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    direction: Optional[Direction] = None
    page: int = Field(1, ge=1)
    page_size: int = Field(50, ge=1, le=200)
    sort_by: str = "trans_time"
    sort_order: str = "desc"


class BatchUpdateCategory(BaseModel):
    """批量修改分类"""
    record_ids: List[str]
    category_id: str


# ── 统计 ──────────────────────────────────────────────

class PlatformStat(BaseModel):
    platform: Platform
    amount: Decimal
    count: int


class CategoryStat(BaseModel):
    category_id: str
    category_name: str
    parent_name: Optional[str]
    amount: Decimal
    count: int
    percentage: float


class MonthStat(BaseModel):
    month: str  # "2026-01"
    amount: Decimal
    count: int


class StatsSummary(BaseModel):
    total_amount: Decimal
    expense_amount: Decimal
    record_count: int
    avg_daily: Decimal
    max_single: Decimal
    by_platform: List[PlatformStat]


class StatsSummaryResponse(BaseModel):
    data: StatsSummary
    by_category: List[CategoryStat]
    by_month: List[MonthStat]


# ── 上传响应 ──────────────────────────────────────────

class UploadResponse(BaseModel):
    file_id: str
    status: str
    estimated_records: Optional[int] = None


class ParseStatusResponse(BaseModel):
    status: str  # "pending" | "parsing" | "done" | "error"
    record_count: Optional[int] = None
    error_message: Optional[str] = None
