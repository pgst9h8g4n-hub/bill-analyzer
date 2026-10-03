import * as XLSX from 'xlsx';
import type { ParsedRecord, Direction, SubType } from './types';

// 微信时间列归一 → 'YYYY-MM-DDTHH:mm'
// 三种来源：
//  1) Excel 数字序列（如 44844.323）
//  2) 文本日期 '2026-05-31 07:55:42' / '2026/5/31 7:55'
//  3) 纯文本 '2026-05-31'（无时间）
// 返回 null 表示该列不是可识别的时间（表头/说明行）。
function normalizeWechatTime(val: unknown): string | null {
  if (val === null || val === undefined) return null;

  // 数字：Excel 序列日期
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return null;
    const ms = Math.round((val - 25569) * 86400 * 1000);
    const d = new Date(ms);
    const y = String(d.getFullYear()).padStart(4, '0');
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${mo}-${day}T${h}:${mi}`;
  }

  if (typeof val !== 'string') return null;
  const s = val.trim();
  if (!s) return null;

  // 'YYYY-MM-DD HH:MM:SS' / 'YYYY/MM/DD HH:MM' / 全角/半角斜杠/破折号
  const m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})[ ]?(\d{1,2}):(\d{2})?/);
  if (m) {
    const y = m[1];
    const mo = m[2].padStart(2, '0');
    const day = m[3].padStart(2, '0');
    const h = (m[4] ?? '00').padStart(2, '0');
    const mi = (m[5] ?? '00');
    return `${y}-${mo}-${day}T${h}:${mi}`;
  }

  // 纯数字字符串（序列号）
  if (/^\d+(\.\d+)?$/.test(s)) {
    return normalizeWechatTime(parseFloat(s));
  }

  return null;
}

// 读微信支付账单 xlsx → ParsedRecord[]
// 数据列：A交易时间(序列)/B交易类型/C交易对方/D商品/E收支/F金额/G支付方式/H当前状态/I交易单号/J商户单号/K备注
export async function parseWechatXlsx(file: File): Promise<ParsedRecord[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });

  const results: ParsedRecord[] = [];
  for (const row of rows) {
    const timeVal = row[0];
    // 表头/说明行：A 列不是可识别的时间 → 跳过。数据行 A 列是数字序列或文本日期。
    const paid_at = normalizeWechatTime(timeVal);
    if (!paid_at) continue;

    const typeCol = String(row[1] || '').trim();   // 交易类型
    const counterparty = String(row[2] || '').trim(); // 交易对方
    const product = String(row[3] || '').trim();    // 商品
    const incomeCol = String(row[4] || '').trim();   // 收/支
    const amountStr = String(row[5] || '0').trim();  // 金额
    const status = String(row[7] || '').trim();      // 当前状态
    const remark = String(row[10] || '').trim();     // 备注

    const amountCents = Math.round(parseFloat(amountStr) * 100);
    if (isNaN(amountCents)) continue;

    const isRefunded = /退款/.test(status);
    const inBalance = /已退款/.test(status);

    let direction: Direction;
    let subType: SubType;

    if (incomeCol === '收入') {
      // 退款：中性（冲减消费，单列黄色），不算收入
      const refundHint = /消费|门票|酒店|餐饮|外卖|出行|打车|加油|购物|商品|订单|12306|铁路|航空|机票/.test(typeCol + counterparty + product);
      if (isRefunded || /退款/.test(typeCol) || (refundHint && !/红包|理财|基金|零钱通|余额宝/.test(typeCol + counterparty + product))) {
        direction = 'neutral'; subType = 'refund';
      } else if (/红包/.test(typeCol + counterparty + product)) {
        direction = 'income'; subType = 'redpacket';
      } else {
        direction = 'income'; subType = 'transfer';
      }
    } else if (incomeCol === '中性交易') {
      direction = 'neutral';
      if (/还款/.test(typeCol + counterparty + product)) subType = 'repay';
      else if (/理财|零钱通|余额宝|基金/.test(typeCol + counterparty + product)) subType = 'fund_return';
      else subType = 'transfer';
    } else {
      // 支出
      if (inBalance || isRefunded) {
        // 原支出已被退款：保留该行，标记 refund（中性，冲抵消费）
        direction = 'neutral'; subType = 'refund';
      } else {
        direction = 'expense';
        subType = /还款/.test(typeCol + counterparty + product) ? 'repay' : 'consumption';
      }
    }

    results.push({
      paid_at,
      amount_cents: Math.abs(amountCents),
      merchant: counterparty || undefined,
      remark: product || typeCol || undefined,
      direction,
      subType,
      source: 'wechat'
    });
  }
  return results;
}
