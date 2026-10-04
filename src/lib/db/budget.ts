import { db } from '$lib/db';
import { expenseSigned, isConsumptionScope } from '$lib/db/expense-math';
import type { Budget } from '$lib/db';

export async function getBudgets(ledgerId: number, month: string): Promise<Budget[]> {
  try {
    return db.budgets.where('ledger_id').equals(ledgerId).and((b) => b.month === month).toArray();
  } catch {
    return [];
  }
}

export async function getCurrentMonthSpending(ledgerId: number, month: string): Promise<number> {
  try {
    const prefix = month + '-';
    const expenses = await db.expenses
      .where('ledger_id').equals(ledgerId)
      .and((e) => e.paid_at.startsWith(prefix))
      .toArray();
    // 消费净额 expenseSigned 记负，预算进度算"已花"正值，取绝对值
    return expenses.reduce((s, e) => s + (isConsumptionScope(e) ? Math.abs(expenseSigned(e)) : 0), 0);
  } catch {
    return 0;
  }
}

// 某分类在指定月份的实际消费净额（cent）。categoryId 为 null/undefined 时等于全月消费净额。
export async function getCategorySpending(ledgerId: number, month: string, categoryId: number | null): Promise<number> {
  try {
    const prefix = month + '-';
    const expenses = await db.expenses
      .where('ledger_id').equals(ledgerId)
      .and((e) => e.paid_at.startsWith(prefix) && (categoryId == null || e.category_id === categoryId))
      .toArray();
    return expenses.reduce((s, e) => s + (isConsumptionScope(e) ? Math.abs(expenseSigned(e)) : 0), 0);
  } catch {
    return 0;
  }
}

export async function saveBudget(ledgerId: number, data: { month: string; limitCents: number; categoryId: number | null }): Promise<void> {
  const existing = await db.budgets
    .where('ledger_id').equals(ledgerId)
    .and((b) => b.month === data.month && b.category_id === data.categoryId)
    .first();

  if (existing) {
    await db.budgets.update(existing.id, { limit_cents: data.limitCents });
  } else {
    await db.budgets.add({
      ledger_id: ledgerId,
      month: data.month,
      limit_cents: data.limitCents,
      category_id: data.categoryId
    });
  }
}
