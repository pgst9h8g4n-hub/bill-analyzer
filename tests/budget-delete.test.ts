import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { db } from '$lib/db';
import { getBudgets, saveBudget, deleteBudget } from '$lib/db/budget';

beforeAll(async () => {
  await db.budgets.clear();
  await db.categories.clear();
  await db.categories.add({ id: 1, ledger_id: 1, name: '餐饮', icon: '🍜', color: '#ef4444', is_default: true } as any);
  await db.categories.add({ id: 2, ledger_id: 1, name: '交通', icon: '🚗', color: '#3b82f6', is_default: true } as any);
});

afterAll(async () => {
  await db.budgets.clear();
  await db.categories.clear();
});

describe('deleteBudget', () => {
  it('删除后该月该分类的预算消失，其它预算保留', async () => {
    await db.budgets.clear();
    await saveBudget(1, { month: '2026-05', limitCents: 100000, categoryId: null }); // 总预算
    await saveBudget(1, { month: '2026-05', limitCents: 50000, categoryId: 1 });        // 餐饮
    await saveBudget(1, { month: '2026-05', limitCents: 20000, categoryId: 2 });        // 交通

    const target = await db.budgets.where('ledger_id').equals(1).and((b) => b.month === '2026-05' && b.category_id === 1).first();
    expect(target).toBeTruthy();

    await deleteBudget(1, target!.id);

    const remaining = await getBudgets(1, '2026-05');
    expect(remaining).toHaveLength(2);
    expect(remaining.find((b) => b.category_id === 1)).toBeUndefined(); // 餐饮被删
    expect(remaining.find((b) => b.category_id === null)).toBeTruthy(); // 总预算还在
    expect(remaining.find((b) => b.category_id === 2)).toBeTruthy();    // 交通还在
  });

  it('删除不存在的 id 不报错（幂等）', async () => {
    await db.budgets.clear();
    await expect(deleteBudget(1, 99999)).resolves.toBeUndefined();
    expect(await getBudgets(1, '2026-05')).toHaveLength(0);
  });
});
