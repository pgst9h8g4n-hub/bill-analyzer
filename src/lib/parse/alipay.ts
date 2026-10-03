import { normalizeCategoryName, matchKeywordCategory, MERCHANT_CATEGORY } from './category-keywords';
import type { ParsedRecord, Direction, SubType } from './types';

// 支付宝"投资理财"（余额宝/基金收益发放）→ 收入 fund_return（正数，计入收入合计）
const FUND_CATEGORIES = new Set(['投资理财', '余额宝', '理财通']);
const TRANSFER_KEYWORDS = ['转账', '还款', '提款', '提现', '充值'];

function detectRefund(status: string, remark: string): boolean {
  return /退款/.test(status) || /退款|原路退回|退货退款/.test(remark);
}

// 读 GBK 编码的支付宝 CSV 文件 → ParsedRecord[]
export async function parseAlipayCsv(file: File): Promise<ParsedRecord[]> {
  const buf = await file.arrayBuffer();
  const text = new TextDecoder('gbk').decode(buf);
  const lines = text.split(/\r?\n/);

  // 定位表头行（以"交易时间"开头），其后为数据行
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('交易时间')) { start = i + 1; break; }
  }
  if (start === -1) throw new Error('未找到支付宝账单表头（应以"交易时间"开头）');

  const results: ParsedRecord[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = splitCsvLine(line);
    if (cols.length < 7) continue;

    // 列序：交易时间/交易分类/交易对方/对方账号/商品说明/收支/金额/收付款方式/交易状态/交易订单号/商家订单号/备注
    const t = cols[0].trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(t)) continue; // 非数据行（说明文字）跳过
    const cat = cols[1]?.trim() || '';
    const merchant = cols[2]?.trim() || '';
    const product = cols[4]?.trim() || '';
    const incomeCol = cols[5]?.trim() || '';  // 收支
    const amountStr = cols[6]?.trim() || '0';
    const status = cols[8]?.trim() || '';
    const remark = cols[11]?.trim() || '';

    const amountCents = Math.round(parseFloat(amountStr) * 100);
    if (isNaN(amountCents)) continue;

    // 时间 "2026-06-14 02:55:24" → paid_at
    const m = t.match(/(\d{4}-\d{2}-\d{2})[ T]?(\d{2}:\d{2})?/);
    if (!m) continue;
    const paid_at = m[2] ? `${m[1]}T${m[2]}` : m[1];

    let direction: Direction;
    let subType: SubType;
    const isRefund = detectRefund(status, remark);
    if (isRefund) {
      // 退款：中性（冲减消费，单列黄色），不算收入
      direction = 'neutral'; subType = 'refund';
    } else if (incomeCol === '不计收支' || FUND_CATEGORIES.has(cat)) {
      // 余额宝/基金收益发放 → 收入 fund_return（正数）
      direction = 'income'; subType = 'fund_return';
    } else if (incomeCol === '收入') {
      // 支付宝把消费类退款（12306退票、美团退款等）记账为"收入"，实质是消费冲抵，归 refund
      const refundHint = /消费|门票|酒店|餐饮|外卖|出行|打车|加油|购物|商品|订单|12306|铁路|航空|机票/.test(cat + product + merchant);
      if (/红包/.test(cat + remark + product)) {
        direction = 'income'; subType = 'redpacket';
      } else if (refundHint) {
        // 消费类退款（原路退回）→ 中性 refund
        direction = 'neutral'; subType = 'refund';
      } else {
        // 真收入（转账到账、红包等）
        direction = 'income'; subType = 'transfer';
      }
    } else {
      direction = 'expense';
      subType = TRANSFER_KEYWORDS.some(k => cat.includes(k) || product.includes(k) || merchant.includes(k)) ? 'transfer' : 'consumption';
      // 信用卡还款也视为中性
      if (/还款/.test(merchant + product + cat)) subType = 'repay';
    }

    results.push({
      paid_at,
      amount_cents: Math.abs(amountCents),
      merchant: merchant || undefined,
      remark: cat || remark || undefined,
      direction,
      subType,
      source: 'alipay'
    });
  }
  return results;
}

// 支付宝导出里交易订单号/商家订单号列带制表符，普通 split(',') 已能正确切分 12 列
function splitCsvLine(line: string): string[] {
  // 订单号字段内嵌 \t，但逗号是列分隔符，直接 split 即可
  return line.split(',');
}
