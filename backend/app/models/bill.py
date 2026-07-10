"""
SQLAlchemy ORM 模型
映射到 Supabase PostgreSQL 数据库表
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Column, Text, Numeric, DateTime, Date, Boolean, Integer,
    ForeignKey, Index, UniqueConstraint, ARRAY,
)
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import relationship, Mapped

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = Column(PG_UUID(as_uuid=True), primary_key=True, default=None)
    name: Mapped[str] = Column(Text, nullable=False)
    phone: Mapped[str | None] = Column(Text, unique=True, nullable=True)
    email: Mapped[str | None] = Column(Text, unique=True, nullable=True)
    avatar_url: Mapped[str | None] = Column(Text, nullable=True)
    created_at: Mapped[datetime] = Column(DateTime(timezone=True), server_default=None)
    updated_at: Mapped[datetime] = Column(DateTime(timezone=True), server_default=None)

    bills = relationship("BillRecord", back_populates="user", cascade="all, delete-orphan")
    categories = relationship("Category", back_populates="user", cascade="all, delete-orphan")
    files = relationship("BillFile", back_populates="user", cascade="all, delete-orphan")

    __table_args__ = ()


class BillFile(Base):
    __tablename__ = "bill_files"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=None)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    platform = Column(Text, nullable=False)  # alipay, wechat, douyin
    original_name = Column(Text, nullable=False)
    file_key = Column(Text, nullable=False)  # Supabase Storage 对象键
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)
    record_count = Column(Integer, default=0)
    parsed_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(Text, default="pending")  # pending, parsing, done, error
    error_msg = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=None)

    user = relationship("User", back_populates="files")
    records = relationship("BillRecord", back_populates="file")

    __table_args__ = (
        Index("idx_bill_files_user", "user_id"),
        Index("idx_bill_files_platform", "platform"),
    )


class Category(Base):
    __tablename__ = "categories"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=None)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    parent_id = Column(PG_UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"), nullable=True)
    name = Column(Text, nullable=False)
    sort_order = Column(Integer, default=0)
    color = Column(Text, default="#6366f1")
    keywords = Column(ARRAY(Text), default=list)
    created_at = Column(DateTime(timezone=True), server_default=None)
    updated_at = Column(DateTime(timezone=True), server_default=None)

    user = relationship("User", back_populates="categories")
    records = relationship("BillRecord", back_populates="category")
    parent = relationship("Category", remote_side=[id], backref="children")
    overrides = relationship("ManualOverride", back_populates="category", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("user_id", "parent_id", "name", name="uq_category_user_parent_name"),
        UniqueConstraint("user_id", "parent_id", "sort_order", name="uq_category_user_parent_sort"),
    )


class BillRecord(Base):
    __tablename__ = "bill_records"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=None)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    file_id = Column(PG_UUID(as_uuid=True), ForeignKey("bill_files.id", ondelete="SET NULL"), nullable=True)

    # 原始平台信息
    platform = Column(Text, nullable=False)
    original_merchant = Column(Text, nullable=False, default="")
    original_product = Column(Text, nullable=True, default="")
    original_category = Column(Text, nullable=True)

    # 解析后的标准字段
    trans_time = Column(DateTime(timezone=True), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    direction = Column(Text, nullable=False, default="支出")

    # 分类结果
    category_id = Column(PG_UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True)
    classification_method = Column(Text, default="auto")  # auto, manual

    # 原始凭证
    platform_order_no = Column(Text, nullable=True)
    merchant_order_no = Column(Text, nullable=True)
    raw_extra = Column(PG_JSONB, nullable=True, default=dict)

    created_at = Column(DateTime(timezone=True), server_default=None)
    updated_at = Column(DateTime(timezone=True), server_default=None)

    user = relationship("User", back_populates="bills")
    file = relationship("BillFile", back_populates="records")
    category = relationship("Category", back_populates="records")
    override = relationship("ManualOverride", back_populates="record", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_records_user_time", "user_id", "trans_time"),
        Index("idx_records_category", "category_id"),
        Index("idx_records_platform", "platform"),
        Index("idx_records_amount", "user_id", "amount"),
    )


class ManualOverride(Base):
    __tablename__ = "manual_overrides"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=None)
    record_id = Column(PG_UUID(as_uuid=True), ForeignKey("bill_records.id", ondelete="CASCADE"), nullable=False)
    category_id = Column(PG_UUID(as_uuid=True), ForeignKey("categories.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=None)

    record = relationship("BillRecord", back_populates="override")
    category = relationship("Category", back_populates="overrides")

    __table_args__ = (
        UniqueConstraint("record_id", name="uq_override_record"),
    )


class CategoryTemplate(Base):
    """预置分类模板（不需要 RLS，系统表）"""
    __tablename__ = "category_templates"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=None)
    name = Column(Text, nullable=False)
    is_default = Column(Boolean, default=False)
    categories = Column(PG_JSONB, nullable=False)
