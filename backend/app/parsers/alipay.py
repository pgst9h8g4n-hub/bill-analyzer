"""
支付宝 CSV 解析器
GBK 编码，前22行元数据，第23行表头
"""

from __future__ import annotations

import csv
import io
import re
from datetime import datetime
from typing import Any

from app.parsers.base import BaseParser, Platform, RawRecord, ParseMeta


class AlipayParser(BaseParser):
    """支付宝交易明细 CSV 解析器"""

    SKIP_LINES = 23  # 前23行（索引0-22）是元数据和分隔线，索引23是表头
    ENCODING = "gbk"

    # 支付宝 CSV 字段索引映射
    FIELD_MAP = {}  # type: dict[str, int]

    def parse(self, file_path: str) -> tuple[list[RawRecord], ParseMeta]:
        with open(file_path, "r", encoding=self.ENCODING) as f:
            lines = f.readlines()

        # 提取元数据
        meta = self._extract_metadata(lines[:self.SKIP_LINES])

        # 解析表头
        header_line = lines[self.SKIP_LINES].strip().rstrip("\r\n")
        headers = [h.strip() for h in header_line.split(",")]
        self.FIELD_MAP = {h: i for i, h in enumerate(headers)}

        # 解析数据行
        records: list[RawRecord] = []
        for line in lines[self.SKIP_LINES + 1:]:
            line = line.strip().rstrip("\r\n")
            if not line:
                continue
            values = [v.strip() for v in line.split(",")]
            if len(values) < 5:
                continue
            record = self._to_raw_record(headers, values)
            if record:
                records.append(record)

        meta.total_count = len(records)
        return records, meta

    def _extract_metadata(self, lines: list[str]) -> ParseMeta:
        meta = ParseMeta()
        for line in lines:
            line = line.strip()
            # 提取手机号/账号
            m = re.search(r"(1[3-9]\d{9})", line)
            if m:
                meta.user_identifier = m.group(1)
            # 提取姓名
            m = re.search(r"姓名[：:]\s*(.+?)(?:\s*$)", line)
            if m:
                meta.user_identifier = m.group(1).strip()
            # 提取时间范围
            m = re.search(r"起始时间[：:]\s*\[(.+?)\]", line)
            if m:
                meta.period_start = m.group(1).strip()
            m = re.search(r"终止时间[：:]\s*\[(.+?)\]", line)
            if m:
                meta.period_end = m.group(1).strip()
        return meta

    def _to_raw_record(self, headers: list[str], values: list[str]) -> RawRecord | None:
        def get_field(name: str) -> str:
            idx = self.FIELD_MAP.get(name)
            if idx is not None and idx < len(values):
                return values[idx].strip()
            return ""

        try:
            amount_str = get_field("金额")
            if not amount_str:
                return None
            amount = float(amount_str)
        except (ValueError, TypeError):
            return None

        # 跳过0金额记录
        if amount <= 0:
            return None

        direction = get_field("收/支")
        if direction not in ("支出", "收入", "不计收支"):
            direction = "支出"

        trans_time_str = get_field("交易时间")
        try:
            trans_time = datetime.strptime(trans_time_str, "%Y-%m-%d %H:%M:%S")
        except (ValueError, TypeError):
            trans_time = datetime.now()

        return RawRecord(
            platform=Platform.ALIPAY,
            trans_time=trans_time,
            amount=amount,
            direction=direction,
            merchant=get_field("交易对方"),
            product=get_field("商品说明"),
            platform_order_no=get_field("交易订单号"),
            merchant_order_no=get_field("商家订单号"),
            original_category=get_field("交易分类"),
            payment_method=get_field("收/付款方式"),
            status=get_field("交易状态"),
            note=get_field("备注"),
        )
