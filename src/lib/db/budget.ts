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

// 该账本「有预算 或 有消费」的月份（降序）。预算页月份下拉用——历史月也能补设预算/看消费。
export async function getBudgetMonths(ledgerId: number): Promise<string[]> {
  try {
    const [budgets, expenses] = await Promise.all([
      db.budgets.where('ledger_id').equals(ledgerId).toArray(),
      db.expenses.where('ledger_id').equals(ledgerId).toArray()
    ]);
    const set = new Set<string>();
    for (const b of budgets) set.add(b.month);
    for (const e of expenses) {
      const m = e.paid_at.slice(0, 7);
      if (m) set.add(m);
    }
    return Array.from(set).sort().reverse();
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

// 删除某条预算（按 id）。id 不存在时静默返回（幂等，避免误删/重复删报错）。
export async function deleteBudget(ledgerId: number, id: number): Promise<void> {
  await db.budgets.delete(id);
}

// 某分类在指定月份的预算状态（记账弹窗超预算提醒用）。
// limit=null 表示该分类该月没设预算；spent=该分类该月消费净额（已花正值）；over=已花>预算。
export async function getCategoryBudgetStatus(
  ledgerId: number,
  month: string,
  categoryId: number
): Promise<{ limit: number | null; spent: number; over: boolean }> {
  try {
    const limit = (await getBudgets(ledgerId, month))
      .find((b) => b.category_id === categoryId)?.limit_cents ?? null;
    const spent = await getCategorySpending(ledgerId, month, categoryId);
    return { limit, spent, over: limit !== null && limit > 0 && spent > limit };
  } catch {
    return { limit: null, spent: 0, over: false };
  }
}
