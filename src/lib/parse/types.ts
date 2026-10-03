import type { Category } from '$lib/db';
import { UNSORTED_CATEGORY_NAME, TRANSFER_CATEGORY_NAME } from '$lib/db';
import { normalizeCategoryName, matchKeywordCategory } from './category-keywords';

export type Direction = 'expense' | 'income' | 'neutral';
export type SubType = 'consumption' | 'transfer' | 'repay' | 'refund' | 'redpacket' | 'fund_return';

// 解析后的中间形态（未写库）
export interface ParsedRecord {
  paid_at: string;         // 'YYYY-MM-DD' 或 'YYYY-MM-DDTHH:mm'
  amount_cents: number;    // 始终为正数（金额绝对值）
  merchant?: string;
  remark?: string;
  direction: Direction;
  subType: SubType;
  source: 'alipay' | 'wechat' | 'douyin';
}

// 把 remark 里"收款方备注:二维码收款"/"转账备注:微信转账"这类模板前缀去掉，只留有效片段
function cleanRemark(remark?: string): string {
  if (!remark) return '';
  // 微信模板：'收款方备注:xxx' / '转账备注:xxx' → 取冒号后内容；但'二维码收款'/'微信转账'本身无关键词价值
  const m = remark.match(/^(?:收款方备注|转账备注)\s*[:：]\s*(.+)$/);
  if (m) {
    const inner = m[1].trim();
    if (/二维码收款|微信转账|^\/$|^[·.\s]*$/.test(inner)) return '';
    return inner;
  }
  // 支付宝/通用：纯 '/' 或空白不算
  const t = remark.trim();
  return t === '/' || t === '' ? '' : t;
}

// 中性交易（纯转账/还款/理财）固定落"转账"分类；消费类退款和 income/expense 走关键词归一到真实分类
export function categoryForRecord(
  rec: ParsedRecord,
  categories: Category[],
  unsortedId: number,
  transferId: number
): number {
  // 纯中性（转账/还款/理财，非退款）→ "转账"分类
  if (rec.direction === 'neutral' && rec.subType !== 'refund') {
    return transferId > 0 ? transferId : (categories.find(c => c.name === TRANSFER_CATEGORY_NAME)?.id ?? unsortedId);
  }
  // 消费/收入/消费类退款：商户名为主关键词源，remark（去模板前缀）为辅，匹配不到落"待整理"
  const merchant = rec.merchant ?? '';
  const remarkClean = cleanRemark(rec.remark);
  const fromRemark = normalizeCategoryName(remarkClean);
  const fromMerchant = matchKeywordCategory(merchant, merchant);
  // merchant（交易对方/行业名）比 remark（常含支付渠道词）更可信；两边都命中时，
  // 谁不是兜底的"其他"就用谁；都命中"其他"才落"其他"；都落空才"待整理"
  const catName = (fromMerchant && fromMerchant !== '其他') ? fromMerchant : (fromRemark || fromMerchant);
  const matched = categories.find(c => c.name === catName);
  if (matched) return matched.id;
  return unsortedId;
}
