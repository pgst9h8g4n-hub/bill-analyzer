import { db } from '$lib/db';
import type { Expense, Category } from '$lib/db';

export interface StatSummary {
  monthTotal: number;
  weekTotal: number;
  yesterdayTotal: number;
}

export interface CategoryStat {
  category: Category;
  total: number;
}

export interface DailyStat {
  date: string;
  total: number;
}

export async function getSummary(userId: number): Promise<StatSummary> {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const dayOfWeek = now.getDay() || 7;
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - dayOfWeek + 1);
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  const allExpenses = await db.expenses.where('user_id').equals(userId).toArray();

  const monthTotal = allExpenses
    .filter(e => e.paid_at.startsWith(currentMonth))
    .reduce((s, e) => s + (e.is_refund ? -e.amount_cents : e.amount_cents), 0);

  const weekTotal = allExpenses
    .filter(e => e.paid_at >= weekStartStr)
    .reduce((s, e) => s + (e.is_refund ? -e.amount_cents : e.amount_cents), 0);

  const yesterdayTotal = allExpenses
    .filter(e => e.paid_at.startsWith(yesterdayStr))
    .reduce((s, e) => s + (e.is_refund ? -e.amount_cents : e.amount_cents), 0);

  return { monthTotal, weekTotal, yesterdayTotal };
}

export async function getCategoryStats(userId: number, month: string): Promise<CategoryStat[]> {
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
    .filter((item): item is CategoryStat => item.category !== undefined)
    .sort((a, b) => b.total - a.total);
}

export async function getDailyTrend(userId: number, days: number): Promise<DailyStat[]> {
  const now = new Date();
  const result: DailyStat[] = [];

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

    const total = expenses.reduce((s, e) => s + (e.is_refund ? -e.amount_cents : e.amount_cents), 0);
    result.unshift({ date: dateStr, total });
  }
  return result;
}
