"""
抖音 PDF 账单解析器
3 页 PDF，交易记录横跨多行（金额/支付方式可能被换行截断）
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from PyPDF2 import PdfReader

from app.parsers.base import BaseParser, Platform, RawRecord, ParseMeta


class DouyinParser(BaseParser):
    """抖音支付交易流水 PDF 解析器"""

    def parse(self, file_path: str) -> tuple[list[RawRecord], ParseMeta]:
        reader = PdfReader(file_path)
        all_text_parts: list[str] = []

        for page_idx, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            all_text_parts.append(text)

        all_text = "\n".join(all_text_parts)
        lines = all_text.split("\n")

        # 提取元数据
        meta = self._extract_metadata(lines)

        # 合并跨行记录（PDF 中长字段可能被换行截断）
        merged_lines = self._merge_pdf_lines(lines)

        # 解析交易记录
        records: list[RawRecord] = []
        for line in merged_lines:
            record = self._parse_line(line)
            if record:
                records.append(record)

        meta.total_count = len(records)
        return records, meta

    def _extract_metadata(self, lines: list[str]) -> ParseMeta:
        meta = ParseMeta()
        for line in lines:
            # 提取姓名
            m = re.search(r"抖音支付\s+(.+?)\s*[\(\(]", line)
            if m:
                meta.user_identifier = m.group(1).strip()
            # 提取证件号
            m = re.search(r"证件号码[：:]\s*(\d{15,18})", line)
            if m:
                meta.user_identifier = m.group(1)
            # 提取时间范围
            m = re.search(r"交易时间段[：:]\s*(\d{4}-\d{2}-\d{2})", line)
            if m:
                meta.period_start = m.group(1)
            m = re.search(r"至\s*(\d{4}-\d{2}-\d{2})", line)
            if m:
                meta.period_end = m.group(1)
        return meta

    def _merge_pdf_lines(self, lines: list[str]) -> list[str]:
        """
        合并 PDF 中被换行截断的记录行
        策略：如果一行不以时间戳开头，且前一行包含交易数据特征，则合并
        """
        merged: list[str] = []
        current = ""

        for line in lines:
            line = line.strip()
            if not line:
                if current:
                    merged.append(current)
                    current = ""
                continue

            # 检查是否是新的交易记录（以时间戳开头）
            if re.match(r"\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}", line):
                if current:
                    merged.append(current)
                current = line
            else:
                # 续行：拼接到当前行
                if current:
                    current += " " + line
                else:
                    # 可能是标题行，跳过
                    pass

        if current:
            merged.append(current)

        return merged

    def _parse_line(self, line: str) -> RawRecord | None:
        """
        解析单条交易记录
        格式示例：
        2026-05-27 10:05:26 支出 5.80 抖音月付 2105012605270602692563824164 抖音电商 ONP26052710052329004739733064164
        合并后可能包含跨行内容如：中信银行信用卡（6 963）2105012605070509643291720032 抖音生活服务
        """
        # 先匹配时间和收支
        m = re.search(
            r"(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(支出|收入|其他)\s+([\d.]+)",
            line,
        )
        if not m:
            return None

        try:
            trans_time = datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S")
            amount = float(m.group(3))
        except (ValueError, TypeError):
            return None

        if amount <= 0:
            return None

        direction = m.group(2)
        if direction == "其他":
            direction = "不计收支"

        # 剩余部分：付款方式 + 交易单号 + 交易对方 + 商家单号
        rest = line[m.end():]

        # 查找交易对方（抖音电商 / 抖音生活服务）
        partner_match = re.search(r"(抖音电商|抖音生活服务)", rest)
        if not partner_match:
            return None

        merchant = partner_match.group(1)
        before_partner = rest[:partner_match.start()].strip()
        after_partner = rest[partner_match.end():].strip()

        # 交易单号是 before_partner 中的长数字串
        order_match = re.search(r"(\d{20,})", before_partner)
        platform_order_no = order_match.group(1) if order_match else ""

        # 付款方式是 before_partner 中去掉订单号后的剩余
        payment_method = before_partner.replace(platform_order_no, "").strip()

        # 商家单号是 after_partner 中的字符串
        merchant_order_no = after_partner.strip()

        return RawRecord(
            platform=Platform.DOUYIN,
            trans_time=trans_time,
            amount=amount,
            direction=direction,
            merchant=merchant,
            platform_order_no=platform_order_no,
            merchant_order_no=merchant_order_no,
            payment_method=payment_method,
        )
