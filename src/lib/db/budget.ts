import { db } from '$lib/db';
import { expenseSigned, isConsumptionScope } from '$lib/db/expense-math';
import type { Budget } from '$lib/db';

export async function getBudgets(ledgerId: number, month: string): Promise<Budget[]> {
  try {
    const rows = await db.budgets
      .where('ledger_id').equals(ledgerId)
      .and((b) => b.month === month)
      .toArray();
    // 历史脏数据：总预算曾被存成 category_id=0，与正确的 null 并存。
    // 同一月多条"总预算"记录合并为一条（按 limit 相加），避免页面双计。
    const totals = rows.filter((b) => !b.category_id);
    if (totals.length > 1) {
      const merged: Budget = {
        ...totals[0],
        limit_cents: totals.reduce((s, b) => s + b.limit_cents, 0)
      };
      const rest = rows.filter((b) => b.category_id);
      return [merged, ...rest];
    }
    return rows;
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

export async function saveBudget(
  ledgerId: number,
  data: { month: string; limitCents: number; categoryId: number | null; userId?: number }
): Promise<void> {
  // UI 的"总预算"会传 categoryId=0，统一归一为 null（总预算记录 category_id=null）；
  // 否则严格 === 比对不上已存的 null 记录 → 每次新增一条 0，读取端（按 null 过滤）永远不显示。
  const categoryId = data.categoryId || null;
  const existing = await db.budgets
    .where('ledger_id').equals(ledgerId)
    .and((b) => b.month === data.month && b.category_id === categoryId)
    .first();

  if (existing) {
    await db.budgets.update(existing.id, { limit_cents: data.limitCents });
  } else {
    await db.budgets.add({
      ledger_id: ledgerId,
      user_id: data.userId ?? 0, // 填 user_id，[user_id+month] 复合索引才可靠（老记录可能缺，0 占位）
      month: data.month,
      limit_cents: data.limitCents,
      category_id: categoryId
    });
  }
}

// 删除某条预算（按 id）。id 不存在时静默返回（幂等，避免误删/重复删报错）。
export async function deleteBudget(ledgerId: number, id: number): Promise<void> {
  await db.budgets.delete(id);
}

// 把 fromMonth 的预算（总+分类）复制到 toMonth；toMonth 已有同 (category_id) 的则不覆盖，
// 避免误改用户手动设过的预算。返回实际新增的条数。
export async function copyBudgetsFrom(
  ledgerId: number,
  fromMonth: string,
  toMonth: string,
  userId?: number
): Promise<number> {
  if (!fromMonth || fromMonth === toMonth) return 0;
  const src = await getBudgets(ledgerId, fromMonth);
  if (src.length === 0) return 0;
  const existing = await getBudgets(ledgerId, toMonth);
  const haveCats = new Set(existing.map((b) => b.category_id ?? 0));
  let added = 0;
  for (const b of src) {
    const key = b.category_id ?? 0;
    if (haveCats.has(key)) continue; // 目标月已有同类预算，不覆盖
    await saveBudget(ledgerId, {
      month: toMonth,
      limitCents: b.limit_cents,
      categoryId: b.category_id,
      userId
    });
    added++;
  }
  return added;
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
