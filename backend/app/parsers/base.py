"""
账单解析器基类
定义统一的解析接口
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Optional


class Platform(Enum):
    ALIPAY = "alipay"
    WECHAT = "wechat"
    DOUYIN = "douyin"


@dataclass
class RawRecord:
    """解析后的原始交易记录"""
    platform: Platform
    trans_time: datetime
    amount: float
    direction: str  # "支出" | "收入" | "不计收支"
    merchant: str = ""
    product: str = ""
    platform_order_no: str = ""
    merchant_order_no: str = ""
    original_category: str = ""
    payment_method: str = ""
    status: str = ""
    note: str = ""
    extra_fields: dict[str, Any] = field(default_factory=dict)


@dataclass
class ParseMeta:
    """账单文件元数据"""
    user_identifier: str = ""  # 手机号/昵称/证件号
    period_start: str = ""
    period_end: str = ""
    total_count: int = 0


class BaseParser(ABC):
    @abstractmethod
    def parse(self, file_path: str) -> tuple[list[RawRecord], ParseMeta]:
        """
        解析账单文件

        Args:
            file_path: 账单文件路径

        Returns:
            (记录列表, 元数据)
        """
        ...

    def detect_platform(self, file_path: str) -> Optional[Platform]:
        """
        自动检测平台类型（基于文件扩展名和内容特征）
        """
        import os
        ext = os.path.splitext(file_path)[1].lower()
        if ext == ".csv":
            return Platform.ALIPAY
        elif ext == ".xlsx":
            return Platform.WECHAT
        elif ext == ".pdf":
            return Platform.DOUYIN
        return None
