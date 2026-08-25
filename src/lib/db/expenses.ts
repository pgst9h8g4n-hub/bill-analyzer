import { db } from '$lib/db';
import type { Expense, Category } from '$lib/db';

export interface ExpenseFormData {
  amount: string;
  date: string;
  categoryId: number;
  merchant?: string;
  remark?: string;
  isRefund: boolean;
}

export interface ExpenseFilters {
  startDate?: string;
  endDate?: string;
  categoryId?: number;
}

function netReduce(s: number, e: Expense): number {
  return s + (e.is_refund ? -e.amount_cents : e.amount_cents);
}

export async function getExpenses(userId: number, filters?: ExpenseFilters): Promise<Expense[]> {
  try {
    if (!filters?.startDate && !filters?.endDate && !filters?.categoryId) {
      return db.expenses.where('user_id').equals(userId).reverse().toArray();
    }

    const base = db.expenses.where('user_id').equals(userId);

    if (filters?.startDate && filters?.endDate) {
      return base
        .and((e) => e.paid_at >= filters.startDate! && e.paid_at <= filters.endDate!)
        .toArray();
    }
    if (filters?.startDate) {
      return base.and((e) => e.paid_at >= filters.startDate!).toArray();
    }
    if (filters?.endDate) {
      return base.and((e) => e.paid_at <= filters.endDate!).toArray();
    }
    if (filters?.categoryId) {
      return base.and((e) => e.category_id === filters.categoryId!).toArray();
    }
    return base.reverse().toArray();
  } catch {
    return [];
  }
}

export async function createExpense(userId: number, data: ExpenseFormData): Promise<void> {
  await db.expenses.add({
    user_id: userId,
    amount_cents: Math.round(parseFloat(data.amount) * 100),
    category_id: data.categoryId,
    merchant: data.merchant,
    remark: data.remark,
    is_refund: data.isRefund,
    paid_at: data.date,
    created_at: new Date().toISOString()
  });
}

export async function updateExpense(id: number, data: Partial<ExpenseFormData>): Promise<void> {
  try {
    const expense = await db.expenses.get(id);
    if (!expense) return;

    const updates: Partial<Expense> = {};
    if (data.amount !== undefined) updates.amount_cents = Math.round(parseFloat(data.amount) * 100);
    if (data.date !== undefined) updates.paid_at = data.date;
    if (data.categoryId !== undefined) updates.category_id = data.categoryId;
    if (data.merchant !== undefined) updates.merchant = data.merchant;
    if (data.remark !== undefined) updates.remark = data.remark;
    if (data.isRefund !== undefined) updates.is_refund = data.isRefund;

    await db.expenses.update(id, updates);
  } catch {
    throw new Error('更新失败，请重试');
  }
}

export async function deleteExpense(id: number): Promise<void> {
  try {
    await db.expenses.delete(id);
  } catch {
    throw new Error('删除失败，请重试');
  }
}

export async function getTotalByMonth(userId: number, month: string): Promise<number> {
  try {
    const prefix = month + '-';
    const expenses = await db.expenses
      .where('user_id').equals(userId)
      .and((e) => e.paid_at.startsWith(prefix))
      .toArray();
    return expenses.reduce(netReduce, 0);
  } catch {
    return 0;
  }
}

export async function getExpensesByCategory(userId: number, month: string): Promise<Array<{ category: Category; total: number }>> {
  try {
    const prefix = month + '-';
    const expenses = await db.expenses
      .where('user_id').equals(userId)
      .and((e) => e.paid_at.startsWith(prefix))
      .toArray();

    const byCat = new Map<number, number>();
    for (const e of expenses) {
      const val = e.is_refund ? -e.amount_cents : e.amount_cents;
      byCat.set(e.category_id, (byCat.get(e.category_id) ?? 0) + val);
    }

    const categories = await db.categories.toArray();
    return Array.from(byCat.entries())
      .map(([catId, total]) => ({
        category: categories.find(c => c.id === catId)!,
        total
      }))
      .filter(Boolean)
      .sort((a, b) => b.total - a.total);
  } catch {
    return [];
  }
}

export async function getDailySpending(userId: number, days: number): Promise<Array<{ date: string; total: number }>> {
  try {
    const now = new Date();
    const result: Array<{ date: string; total: number }> = [];

    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const nextDate = new Date(d);
      nextDate.setDate(nextDate.getDate() + 1);
      const nextDateStr = nextDate.toISOString().slice(0, 10);

      const expenses = await db.expenses
        .where('user_id').equals(userId)
        .and((e) => e.paid_at >= dateStr && e.paid_at < nextDateStr)
        .toArray();

      const total = expenses.reduce(netReduce, 0);
      result.unshift({ date: dateStr, total });
    }
    return result;
  } catch {
    return [];
  }
}
