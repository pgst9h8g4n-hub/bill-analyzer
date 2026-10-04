import { db } from '$lib/db';
import {
  expenseSigned,
  isConsumptionScope,
  incomeReduce,
  neutralStats
} from '$lib/db/expense-math';
import type { Expense, Category } from '$lib/db';

export interface StatSummary {
  monthTotal: number;
  weekTotal: number;
  yesterdayTotal: number;
  // 数据覆盖到的最新月份（'YYYY-MM'）；统计口径随数据走而非死用系统当前月，
  // 避免导入历史账单（如 1 月）时本月/趋势全为 0
  currentMonth: string;
  // 收入/中性（本月口径）
  monthIncome: number;      // 本月收入合计（cent，正）
  monthNeutralCount: number; // 本月中性交易笔数
  monthNeutralTotal: number; // 本月中性交易金额（cent）
  monthRefund: number;      // 本月退款冲抵（cent，正，已冲减消费净额）
}

export interface CompareItem {
  value: number;   // 本期（cent）
  prev: number;    // 上期（cent）
  ratio: number | null; // (本期-上期)/|上期|，上期为 0 时 null
}

export interface CategoryStat {
  category: Category;
  total: number;
}

export interface DailyStat {
  date: string;
  total: number;
}

function netReduce(s: number, e: Expense): number {
  return s + (isConsumptionScope(e) ? expenseSigned(e) : 0);
}

// 求某账本数据里最新的月份（'YYYY-MM'）。无数据时回退系统当前月。
// 统计口径随数据走：导入历史账单（如 1 月）时"本月"应指数据最新月，否则全为 0。
export async function getLatestMonth(ledgerId: number): Promise<string> {
  try {
    const all = await db.expenses.where('ledger_id').equals(ledgerId).toArray();
    let latest = '';
    for (const e of all) {
      const m = e.paid_at.slice(0, 7);
      if (m > latest) latest = m;
    }
    if (latest) return latest;
  } catch { /* fallthrough */ }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function getSummary(ledgerId: number): Promise<StatSummary> {
  try {
    // 本月口径 = 数据最新月（无数据则系统当前月）
    const currentMonth = await getLatestMonth(ledgerId);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const dayOfWeek = new Date().getDay() || 7;
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - dayOfWeek + 1);
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    weekEnd.setHours(0, 0, 0, 0);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    const allExpenses = await db.expenses.where('ledger_id').equals(ledgerId).toArray();

    const monthExpenses = allExpenses.filter(e => e.paid_at.startsWith(currentMonth));
    const monthTotal = monthExpenses.reduce(netReduce, 0);

    const weekTotal = allExpenses
      .filter(e => e.paid_at >= weekStartStr && e.paid_at < weekEndStr)
      .reduce(netReduce, 0);

    const yesterdayTotal = allExpenses
      .filter(e => e.paid_at.startsWith(yesterdayStr))
      .reduce(netReduce, 0);

    // 本月口径的收入/中性/退款（netReduce 已含退款冲抵，monthTotal 即消费净额）
    const monthNeutral = neutralStats(monthExpenses);
    const monthRefund = monthExpenses.reduce((s, e) =>
      (e.subType ?? 'consumption') === 'refund' ? s + e.amount_cents : s, 0);

    return {
      monthTotal,
      weekTotal,
      yesterdayTotal,
      currentMonth,
      monthIncome: incomeReduce(monthExpenses),
      monthNeutralCount: monthNeutral.count,
      monthNeutralTotal: monthNeutral.total,
      monthRefund
    };
  } catch {
    return {
      monthTotal: 0, weekTotal: 0, yesterdayTotal: 0, currentMonth: '',
      monthIncome: 0, monthNeutralCount: 0, monthNeutralTotal: 0, monthRefund: 0
    };
  }
}

// 同环比：消费净额 本期 vs 上期（上期为 0 时 ratio 为 null）
export async function getMonthCompare(ledgerId: number): Promise<CompareItem> {
  const [cur, prev] = await Promise.all([
    getPeriodConsumptionTotal(ledgerId, 0),
    getPeriodConsumptionTotal(ledgerId, 1)
  ]);
  return buildCompare(cur, prev);
}

export async function getWeekCompare(ledgerId: number): Promise<CompareItem> {
  const [cur, prev] = await Promise.all([
    getWeekConsumptionTotal(ledgerId, 0),
    getWeekConsumptionTotal(ledgerId, 1)
  ]);
  return buildCompare(cur, prev);
}

function buildCompare(cur: number, prev: number): CompareItem {
  return {
    value: cur,
    prev,
    ratio: prev !== 0 ? (cur - prev) / Math.abs(prev) : null
  };
}

// 消费净额口径的某月合计（offset 相对"基准月"）。基准月默认数据最新月，
// 这样历史账单（如 1 月）的"本月 vs 上月"才有意义。
export async function getPeriodConsumptionTotal(ledgerId: number, offset: number): Promise<number> {
  const baseMonth = await getLatestMonth(ledgerId);
  const [by, bm] = baseMonth.split('-').map(Number);
  const d = new Date(by, bm - 1 - offset, 1);
  const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const prefix = monthStr + '-';
  const expenses = await db.expenses
    .where('ledger_id').equals(ledgerId)
    .and((e) => e.paid_at.startsWith(prefix))
    .toArray();
  return expenses.reduce(netReduce, 0);
}

// 消费净额口径的某周合计（offset 相对"基准周"，周一为起点）。基准周 = 数据最新月所在周。
export async function getWeekConsumptionTotal(ledgerId: number, offset: number): Promise<number> {
  const baseMonth = await getLatestMonth(ledgerId);
  const [by, bm] = baseMonth.split('-').map(Number);
  // 该月最后一周的周一作为基准，避免 offset 相对系统当前周时偏移出数据范围
  const lastDay = new Date(by, bm, 0);
  const dayOfWeek = lastDay.getDay() || 7;
  const start = new Date(lastDay);
  start.setDate(start.getDate() - dayOfWeek + 1 - offset * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setHours(0, 0, 0, 0);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  const expenses = await db.expenses
    .where('ledger_id').equals(ledgerId)
    .and((e) => e.paid_at >= startStr && e.paid_at < endStr)
    .toArray();
  return expenses.reduce(netReduce, 0);
}

// 该账本数据里出现的年份列表（降序）。选周期下拉用。
export async function getAvailableYears(ledgerId: number): Promise<string[]> {
  try {
    const all = await db.expenses.where('ledger_id').equals(ledgerId).toArray();
    const set = new Set<string>();
    for (const e of all) {
      const y = e.paid_at.slice(0, 4);
      if (y) set.add(y);
    }
    return Array.from(set).sort().reverse();
  } catch {
    return [];
  }
}

// 该账本数据里出现的月份（'YYYY-MM'）列表（降序）。
export async function getAvailableMonths(ledgerId: number): Promise<string[]> {
  try {
    const all = await db.expenses.where('ledger_id').equals(ledgerId).toArray();
    const set = new Set<string>();
    for (const e of all) {
      const m = e.paid_at.slice(0, 7);
      if (m) set.add(m);
    }
    return Array.from(set).sort().reverse();
  } catch {
    return [];
  }
}

// 该年 12 个月（'YYYY-01'..'YYYY-12'）。年趋势横轴用。
export function monthsOf(year: string): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

// 该月所有天（'YYYY-MM-DD'）。月趋势横轴用。
export function daysOf(month: string): string[] {
  const [by, bm] = month.split('-').map(Number);
  const lastDay = new Date(by, bm, 0).getDate();
  return Array.from({ length: lastDay }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

// 某周期（'YYYY-MM' 单月 或 'YYYY' 整年）的汇总。"本周/昨日"口径固定系统当前日期，
// 周期是历史数据时保持现状（不随周期变），页面据此决定是否展示。
export async function getPeriodSummary(ledgerId: number, period: string): Promise<StatSummary> {
  try {
    // 月 period（'2026-05'）拆出 bm='05'（truthy）；年 period（'2026'）拆出 bm=undefined。
    // 用 bm 而非 by!==bm 判定：by 恒为年（'2026'）、月拆出的 bm 恒不为 by，旧写 by!==bm 恒 true，
    // 导致月周期误用年 prefix（'2026' 匹配全年），切周期数据不更新/混月。
    const [by, bm] = period.split('-');
    const prefix = bm ? `${period}-` : by; // 月→'2026-05-'；年→'2026'
    const all = await db.expenses
      .where('ledger_id').equals(ledgerId)
      .and((e) => e.paid_at.startsWith(prefix))
      .toArray();
    const total = all.reduce(netReduce, 0);

    // 本周/昨日固定系统当前日期
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const dayOfWeek = new Date().getDay() || 7;
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - dayOfWeek + 1);
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    weekEnd.setHours(0, 0, 0, 0);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    const weekExpenses = await db.expenses
      .where('ledger_id').equals(ledgerId)
      .and((e) => e.paid_at >= weekStartStr && e.paid_at < weekEndStr)
      .toArray();
    const weekTotal = weekExpenses.reduce(netReduce, 0);
    const yesterdayExpenses = all.filter((e) => e.paid_at.startsWith(yesterdayStr));
    const yesterdayTotal = yesterdayExpenses.reduce(netReduce, 0);

    const neutral = neutralStats(all);
    const monthRefund = all.reduce((s, e) =>
      (e.subType ?? 'consumption') === 'refund' ? s + e.amount_cents : s, 0);

    return {
      monthTotal: total,
      weekTotal,
      yesterdayTotal,
      currentMonth: period,
      monthIncome: incomeReduce(all),
      monthNeutralCount: neutral.count,
      monthNeutralTotal: neutral.total,
      monthRefund
    };
  } catch {
    return {
      monthTotal: 0, weekTotal: 0, yesterdayTotal: 0, currentMonth: '',
      monthIncome: 0, monthNeutralCount: 0, monthNeutralTotal: 0, monthRefund: 0
    };
  }
}

export async function getCategoryStats(ledgerId: number, month: string): Promise<CategoryStat[]> {
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
      .filter((item): item is CategoryStat => item.category !== undefined && item.total !== 0)
      .sort((a, b) => b.total - a.total);
  } catch {
    return [];
  }
}

export async function getRecentExpenses(ledgerId: number, limit: number = 5): Promise<Expense[]> {
  try {
    return db.expenses
      .where('ledger_id').equals(ledgerId)
      .reverse()
      .limit(limit)
      .toArray();
  } catch {
    return [];
  }
}

export async function getMonthlyTrend(ledgerId: number, months: number = 12): Promise<DailyStat[]> {
  try {
    // 以数据最新月为锚点往前推 N 个月，历史账单也能出趋势
    const baseMonth = await getLatestMonth(ledgerId);
    const [by, bm] = baseMonth.split('-').map(Number);
    const result: DailyStat[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(by, bm - 1 - i, 1);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const prefix = monthStr + '-';

      const expenses = await db.expenses
        .where('ledger_id').equals(ledgerId)
        .and((e) => e.paid_at.startsWith(prefix))
        .toArray();

      const total = expenses.reduce(netReduce, 0);
      result.push({ date: monthStr, total });
    }
    return result;
  } catch {
    return [];
  }
}

export async function getDailyTrend(ledgerId: number, days: number): Promise<DailyStat[]> {
  try {
    const baseMonth = await getLatestMonth(ledgerId);
    const [by, bm] = baseMonth.split('-').map(Number);
    const anchor = new Date(by, bm, 0); // 该月最后一日
    const result: DailyStat[] = [];

    for (let i = 0; i < days; i++) {
      const d = new Date(anchor);
      d.setDate(anchor.getDate() - i);
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

// 某月内"有消费数据的各天"（升序，'YYYY-MM-DD'）。月趋势横轴用——稀疏刻度，
// 避免全月 31 天大部分贴 0 看着像没数据。
export async function getPeriodConsumptionDays(ledgerId: number, month: string): Promise<string[]> {
  try {
    const prefix = month + '-';
    const all = await db.expenses
      .where('ledger_id').equals(ledgerId)
      .and((e) => e.paid_at.startsWith(prefix))
      .toArray();
    const set = new Set<string>();
    for (const e of all) {
      if (isConsumptionScope(e) || (e.direction ?? 'expense') === 'income') {
        set.add(e.paid_at.slice(0, 10));
      }
    }
    return Array.from(set).sort();
  } catch {
    return [];
  }
}

// 某周期（'YYYY-MM' 单月→逐天；'YYYY' 整年→逐月）的消费净额趋势。
// 横轴由调用方给（daysOf / monthsOf 已含完整刻度），这里按桶汇总。
export async function getPeriodTrend(ledgerId: number, period: string, buckets: string[]): Promise<DailyStat[]> {
  try {
    // pm（月部分）truthy=单月周期（'YYYY-MM'），undefined=整年周期（'YYYY'）。
    // 旧写 py!==pm 恒 true（月拆出的 pm='05' 永不为 py='2026'），误把单月当整年处理。
    const [py, pm] = period.split('-');
    const prefix = pm ? `${period}-` : py; // 月→'2026-05-'；年→'2026'
    const all = await db.expenses
      .where('ledger_id').equals(ledgerId)
      .and((e) => e.paid_at.startsWith(prefix))
      .toArray();
    // 单月周期横轴是各天（'YYYY-MM-DD'），按天聚合；整年横轴是各月（'YYYY-MM'），按月聚合
    const keyOf = (d: string) => (pm ? d.slice(0, 10) : d.slice(0, 7));
    const byBucket = new Map<string, number>();
    for (const e of all) {
      const k = keyOf(e.paid_at);
      byBucket.set(k, (byBucket.get(k) ?? 0) + netReduce(0, e));
    }
    return buckets.map((b) => ({ date: b, total: byBucket.get(b) ?? 0 }));
  } catch {
    return [];
  }
}

// 某周期（'YYYY-MM' 单月 或 'YYYY' 整年）各分类消费净额。
export async function getPeriodCategoryStats(ledgerId: number, period: string): Promise<CategoryStat[]> {
  try {
    // pm（月部分）truthy=单月周期，undefined=整年周期。旧写 py!==pm 恒 true，月周期误用年 prefix。
    const [py, pm] = period.split('-');
    const prefix = pm ? `${period}-` : py; // 月→'2026-05-'；年→'2026'
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
      .filter((item): item is CategoryStat => item.category !== undefined && item.total !== 0)
      .sort((a, b) => b.total - a.total);
  } catch {
    return [];
  }
}

// 某周期（'YYYY-MM' 单月 或 'YYYY' 整年）TOP 单笔消费。
export async function getPeriodTopExpenses(ledgerId: number, period: string, n: number = 5): Promise<TopExpense[]> {
  try {
    // pm（月部分）truthy=单月周期，undefined=整年周期。旧写 py!==pm 恒 true，月周期误用年 prefix。
    const [py, pm] = period.split('-');
    const prefix = pm ? `${period}-` : py; // 月→'2026-05-'；年→'2026'
    const expenses = await db.expenses
      .where('ledger_id').equals(ledgerId)
      .and((e) => e.paid_at.startsWith(prefix) && (e.direction ?? 'expense') === 'expense')
      .toArray();
    const categories = await db.categories.where('ledger_id').equals(ledgerId).toArray();
    return [...expenses]
      .sort((a, b) => b.amount_cents - a.amount_cents)
      .slice(0, n)
      .map(e => ({
        id: e.id,
        amount: e.amount_cents,
        paid_at: e.paid_at,
        merchant: e.merchant,
        category: categories.find(c => c.id === e.category_id)
      }));
  } catch {
    return [];
  }
}

// ─── 预算 vs 实际 对照 ─────────────────────────────────────
export interface BudgetVsActual {
  categoryId: number | null; // null = 总预算
  category?: Category;
  limit: number;     // cent
  actual: number;    // cent（消费净额口径）
  over: boolean;     // 超支
  ratio: number;     // actual/limit（limit=0 时 0）
}

// 某月各分类预算 + 总预算，对照该分类实际消费净额
export async function getBudgetVsActual(ledgerId: number, month: string): Promise<BudgetVsActual[]> {
  try {
    const [budgets, categories, monthExpenses] = await Promise.all([
      db.budgets.where('ledger_id').equals(ledgerId).and((b) => b.month === month).toArray(),
      db.categories.where('ledger_id').equals(ledgerId).toArray(),
      db.expenses
        .where('ledger_id').equals(ledgerId)
        .and((e) => e.paid_at.startsWith(month + '-'))
        .toArray()
    ]);

    // 各分类实际消费净额（expenseSigned 消费记负，这里取绝对值作为"已花"正值，
    // 才能和正数的预算 limit 比较算 over/ratio）
    const byCat = new Map<number, number>();
    let totalActual = 0;
    for (const e of monthExpenses) {
      if (!isConsumptionScope(e)) continue;
      const v = Math.abs(expenseSigned(e));
      totalActual += v;
      byCat.set(e.category_id, (byCat.get(e.category_id) ?? 0) + v);
    }

    return budgets.map(b => {
      const actual = b.category_id === null
        ? totalActual
        : (byCat.get(b.category_id) ?? 0);
      const limit = b.limit_cents;
      return {
        categoryId: b.category_id,
        category: b.category_id === null ? undefined : categories.find(c => c.id === b.category_id),
        limit,
        actual,
        over: limit > 0 && actual > limit,
        ratio: limit > 0 ? actual / limit : 0
      };
    });
  } catch {
    return [];
  }
}

// ─── TOP 消费 ──────────────────────────────────────────────
export interface TopExpense {
  id: number;
  amount: number;     // cent（正，消费绝对值）
  paid_at: string;
  merchant?: string;
  category?: Category;
}

// 某月单笔最大的消费 TOP n（仅 direction=expense 的消费，排除退款/中性）
export async function getTopExpenses(ledgerId: number, month: string, n: number = 5): Promise<TopExpense[]> {
  try {
    const prefix = month + '-';
    const expenses = await db.expenses
      .where('ledger_id').equals(ledgerId)
      .and((e) => e.paid_at.startsWith(prefix) && (e.direction ?? 'expense') === 'expense')
      .toArray();
    const categories = await db.categories.where('ledger_id').equals(ledgerId).toArray();
    return [...expenses]
      .sort((a, b) => b.amount_cents - a.amount_cents)
      .slice(0, n)
      .map(e => ({
        id: e.id,
        amount: e.amount_cents,
        paid_at: e.paid_at,
        merchant: e.merchant,
        category: categories.find(c => c.id === e.category_id)
      }));
  } catch {
    return [];
  }
}

