import { db } from '$lib/db';
import type { Budget, Category } from '$lib/db';

export async function getBudgets(userId: number, month: string): Promise<Budget[]> {
  return db.budgets.where('user_id').equals(userId).and((b) => b.month === month).toArray();
}

export async function getCurrentMonthSpending(userId: number, month: string): Promise<number> {
  const prefix = month + '-';
  const expenses = await db.expenses
    .where('user_id').equals(userId)
    .and((e) => e.paid_at.startsWith(prefix))
    .toArray();
  return expenses.reduce((s, e) => s + (e.is_refund ? -e.amount_cents : e.amount_cents), 0);
}

export async function saveBudget(userId: number, data: { month: string; limitCents: number; categoryId: number | null }): Promise<void> {
  const existing = await db.budgets
    .where('user_id').equals(userId)
    .and((b) => b.month === data.month && b.category_id === data.categoryId)
    .first();

  if (existing) {
    await db.budgets.update(existing.id, { limit_cents: data.limitCents });
  } else {
    await db.budgets.add({
      user_id: userId,
      month: data.month,
      limit_cents: data.limitCents,
      category_id: data.categoryId
    });
  }
}

export async function getCategories(): Promise<Category[]> {
  return db.categories.toArray();
}
