"""
自动分类引擎
基于关键词的多层级评分匹配
"""

from __future__ import annotations

from dataclasses import dataclass

from app.parsers.base import RawRecord, Platform


@dataclass
class ClassifyResult:
    category_id: str | None
    score: float
    matched_keyword: str | None


def classify_record(
    record: RawRecord,
    categories: list[dict],
) -> ClassifyResult:
    """
    对一条交易记录进行自动分类

    Args:
        record: 解析后的原始交易记录
        categories: 用户的一级分类列表，每项包含 id/name/keywords

    Returns:
        ClassifyResult: 分类结果（category_id, score, matched_keyword）
    """
    merchant = record.merchant or ""
    product = record.product or ""
    original_cat = record.original_category or ""
    combined = f"{merchant} {product}".lower()

    best = ClassifyResult(category_id=None, score=0.0, matched_keyword=None)

    for cat in categories:
        # 只匹配一级分类
        if cat.get("parent_id"):
            continue

        cat_keywords = cat.get("keywords", [])
        cat_id = cat.get("id", "")
        cat_name = cat.get("name", "")

        # 1. 支付宝自带分类精确匹配（最高优先级）
        if record.platform == Platform.ALIPAY and original_cat and original_cat == cat_name:
            return ClassifyResult(category_id=cat_id, score=1.0, matched_keyword=f"[{original_cat}]精确匹配")

        # 2. 商户名完全匹配
        if merchant == cat_name:
            return ClassifyResult(category_id=cat_id, score=1.0, matched_keyword=cat_name)

        # 3. 逐关键词评分
        for kw in cat_keywords:
            score = _calculate_score(combined, kw, merchant, product)
            if score > best.score:
                best = ClassifyResult(
                    category_id=cat_id,
                    score=score,
                    matched_keyword=kw,
                )

    return best


def _calculate_score(text: str, keyword: str, merchant: str, product: str) -> float:
    """
    综合评分：
    - 商户名完全匹配: 1.0
    - 商户名包含关键词: 0.8
    - 商品描述包含关键词: 0.6
    - 全文包含关键词: 0.4
    """
    if merchant == keyword:
        return 1.0
    if keyword in merchant:
        return 0.8
    if product and keyword in product:
        return 0.6
    if keyword in text:
        return 0.4
    return 0.0


def batch_classify(
    records: list[RawRecord],
    categories: list[dict],
) -> list[ClassifyResult]:
    """批量分类"""
    return [classify_record(r, categories) for r in records]
