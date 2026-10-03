import type { Expense } from '$lib/db';

// ─── 方向/子类型归一 ─────────────────────────────────────────
// 老数据可能没有 direction/subType，统一按 expense+consumption 兜底
export function normDirection(e: Expense): 'expense' | 'income' | 'neutral' {
  return e.direction ?? 'expense';
}
export function normSubType(e: Expense): Expense['subType'] {
  return e.subType ?? 'consumption';
}

// ─── 符号规则（对"净额/消费合计"的贡献，单位 cent）────────
// expense      → -amount（消费记负）
// income       → +amount（收入记正）
// neutral refund → +amount（退款冲抵，减小消费合计）
// neutral 其它  → 0（转账/还款/理财收益 中性，不入净额）
export function expenseSigned(e: Expense): number {
  const dir = normDirection(e);
  const sub = normSubType(e);
  if (dir === 'income') return e.amount_cents;
  if (dir === 'neutral') {
    return sub === 'refund' ? e.amount_cents : 0;
  }
  return -e.amount_cents;
}

// 月/日小计口径：只算消费（expense）+ 退款冲抵（refund），收入与中性(转账/还款/理财)不进小计
export function isConsumptionScope(e: Expense): boolean {
  const dir = normDirection(e);
  const sub = normSubType(e);
  return dir === 'expense' || sub === 'refund';
}

// 中性交易（列表灰色弱化用）：方向 neutral 且子类型不是退款
// 注意：退款虽属 neutral，但它是"消费冲抵"，要保留在消费口径内，不灰化
export function isNeutral(e: Expense): boolean {
  return normDirection(e) === 'neutral' && normSubType(e) !== 'refund';
}

// 收入（列表绿色展示用）
export function isIncome(e: Expense): boolean {
  return normDirection(e) === 'income';
}

// 退款（列表黄色标记用）：只认 subType === 'refund'。
// 不再检查 is_refund 字段——旧 bug 导致普通消费也被写入了 is_refund: true，会造成误判。
// 手动记账勾选"这是一笔退款"时同步写 subType='refund'（见 expenses.ts createExpense/updateExpense）。
export function isRefund(e: Expense): boolean {
  return normSubType(e) === 'refund';
}

// 子类型 → 中文标签（明细行小标签用）
export function subTypeLabel(e: Expense): string {
  switch (normSubType(e)) {
    case 'transfer': return '转账';
    case 'repay': return '还款';
    case 'refund': return '退款';
    case 'redpacket': return '红包';
    case 'fund_return': return '理财';
    default: return '';
  }
}

// 收入合计（仅 income，正数，cent）
export function incomeReduce(list: Expense[]): number {
  return list.reduce((s, e) => s + (isIncome(e) ? e.amount_cents : 0), 0);
}

// 中性笔数 + 中性金额（transfer/repay/fund_return，不含退款）
export function neutralStats(list: Expense[]): { count: number; total: number } {
  let count = 0, total = 0;
  for (const e of list) {
    if (isNeutral(e)) { count++; total += e.amount_cents; }
  }
  return { count, total };
}
