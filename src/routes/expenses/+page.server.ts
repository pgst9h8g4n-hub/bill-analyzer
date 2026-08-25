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

export async function getExpenses(userId: number, filters?: {
  startDate?: string;
  endDate?: string;
  categoryId?: number;
}): Promise<Expense[]> {
  let collection = db.expenses.where('user_id').equals(userId).reverse();

  if (filters?.startDate) {
    collection = db.expenses
      .where('user_id').equals(userId)
      .and((e) => e.paid_at >= filters.startDate!);
  }
  if (filters?.endDate) {
    const col = filters?.startDate ? collection : db.expenses.where('user_id').equals(userId);
    collection = col.and((e) => e.paid_at <= filters.endDate!);
  }
  if (filters?.categoryId) {
    collection = db.expenses
      .where('user_id').equals(userId)
      .and((e) => e.category_id === filters.categoryId!);
  }

  return collection.toArray();
}

export async function createExpense(userId: number, data: ExpenseFormData): Promise<number> {
  return db.expenses.add({
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
  const expense = await db.expenses.get(id);
  if (!expense) return;

  const updates: Partial<Expense> = {};
  if (data.amount !== undefined) {
    updates.amount_cents = Math.round(parseFloat(data.amount) * 100);
  }
  if (data.date !== undefined) updates.paid_at = data.date;
  if (data.categoryId !== undefined) updates.category_id = data.categoryId;
  if (data.merchant !== undefined) updates.merchant = data.merchant;
  if (data.remark !== undefined) updates.remark = data.remark;
  if (data.isRefund !== undefined) updates.is_refund = data.isRefund;

  await db.expenses.update(id, updates);
}

export async function deleteExpense(id: number): Promise<void> {
  await db.expenses.delete(id);
}

export async function getCategories(): Promise<Category[]> {
  return db.categories.toArray();
}
