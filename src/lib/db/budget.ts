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
    return expenses.reduce((s, e) => s + (isConsumptionScope(e) ? expenseSigned(e) : 0), 0);
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
