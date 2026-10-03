import { db } from '$lib/db';
import { expenseSigned, isConsumptionScope } from '$lib/db/expense-math';
import type { Expense, Category } from '$lib/db';

export interface ExpenseFormData {
  amount: string;
  date: string;
  categoryId: number;
  merchant?: string;
  remark?: string;
  isRefund: boolean;
  direction?: 'expense' | 'income' | 'neutral';
  subType?: 'consumption' | 'transfer' | 'repay' | 'refund' | 'redpacket' | 'fund_return';
}

export interface ExpenseFilters {
  startDate?: string;
  endDate?: string;
  categoryId?: number;
}

// 消费净额（含退款冲抵）：只有消费口径内的笔（expense + refund）参与，income/中性(转账/还款/理财)为 0
function netReduce(s: number, e: Expense): number {
  return s + (isConsumptionScope(e) ? expenseSigned(e) : 0);
}

export async function getExpenses(ledgerId: number, filters?: ExpenseFilters): Promise<Expense[]> {
  try {
    if (!filters?.startDate && !filters?.endDate && !filters?.categoryId) {
      return db.expenses.where('ledger_id').equals(ledgerId).reverse().toArray();
    }

    const base = db.expenses.where('ledger_id').equals(ledgerId);

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

export async function createExpense(ledgerId: number, data: ExpenseFormData & { userId: number }): Promise<void> {
  const isRefund = data.isRefund;
  const direction = data.direction ?? 'expense';
  const subType = data.subType ?? (isRefund ? 'refund' : 'consumption');
  await db.expenses.add({
    user_id: data.userId,
    ledger_id: ledgerId,
    amount_cents: Math.round(parseFloat(data.amount) * 100),
    category_id: data.categoryId,
    merchant: data.merchant,
    remark: data.remark,
    is_refund: isRefund,
    paid_at: data.date,
    created_at: new Date().toISOString(),
    direction,
    subType
  });
}

// 账单导入：一次性批量写入多条（含方向/子类型/分类/来源），返回写入条数
export interface ImportRecord {
  paid_at: string;
  amount_cents: number;
  category_id: number;
  merchant?: string;
  remark?: string;
  direction: 'expense' | 'income' | 'neutral';
  subType: 'consumption' | 'transfer' | 'repay' | 'refund' | 'redpacket' | 'fund_return';
}
export async function importExpenses(ledgerId: number, userId: number, records: ImportRecord[]): Promise<number> {
  if (records.length === 0) return 0;
  const now = new Date().toISOString();
  const rows = records.map(r => ({
    user_id: userId,
    ledger_id: ledgerId,
    amount_cents: r.amount_cents,
    category_id: r.category_id,
    merchant: r.merchant || undefined,
    remark: r.remark || undefined,
    is_refund: r.subType === 'refund',
    paid_at: r.paid_at,
    created_at: now,
    direction: r.direction,
    subType: r.subType
  }));
  await db.expenses.bulkAdd(rows);
  return rows.length;
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
    if (data.isRefund !== undefined) {
      updates.is_refund = data.isRefund;
      // 手动勾选退款同步 subType；取消勾选恢复 consumption（仅当原 subType 为 refund/consumption 时）
      if (data.isRefund) {
        updates.subType = 'refund';
      } else if (expense.subType === 'refund' || !expense.subType) {
        updates.subType = 'consumption';
      }
    }

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

export async function getTotalByMonth(ledgerId: number, month: string): Promise<number> {
  try {
    const prefix = month + '-';
    const expenses = await db.expenses
      .where('ledger_id').equals(ledgerId)
      .and((e) => e.paid_at.startsWith(prefix))
      .toArray();
    return expenses.reduce(netReduce, 0);
  } catch {
    return 0;
  }
}

export async function getExpensesByCategory(ledgerId: number, month: string): Promise<Array<{ category: Category; total: number }>> {
  try {
    const prefix = month + '-';
    const expenses = await db.expenses
      .where('ledger_id').equals(ledgerId)
      .and((e) => e.paid_at.startsWith(prefix))
      .toArray();

    const byCat = new Map<number, number>();
    for (const e of expenses) {
      const val = isConsumptionScope(e) ? expenseSigned(e) : 0;
      byCat.set(e.category_id, (byCat.get(e.category_id) ?? 0) + val);
    }

    const categories = await db.categories.where('ledger_id').equals(ledgerId).toArray();
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

export async function getDailySpending(ledgerId: number, days: number): Promise<Array<{ date: string; total: number }>> {
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
        .where('ledger_id').equals(ledgerId)
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
