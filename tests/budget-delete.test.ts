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

describe('saveBudget 总预算（UI 传 categoryId=0）', () => {
  it('设总预算存成 category_id=null，页面按 !category_id 能匹配到（不出现 =0 脏记录）', async () => {
    await db.budgets.clear();
    // 模拟 UI：总预算按钮把 categoryId 设成 0，saveBudget 必须归一为 null
    await saveBudget(1, { month: '2026-10', limitCents: 500000, categoryId: 0 });
    const all = await getBudgets(1, '2026-10');
    // 只有一条，且 category_id 是 null（不是 0）——页面 totalBudget 过滤 !category_id 才能算上它
    expect(all).toHaveLength(1);
    expect(all[0].category_id).toBe(null);
    expect(all[0].limit_cents).toBe(500000);
  });

  it('重复设总预算是更新而非新增', async () => {
    await db.budgets.clear();
    await saveBudget(1, { month: '2026-10', limitCents: 500000, categoryId: 0 });
    await saveBudget(1, { month: '2026-10', limitCents: 800000, categoryId: 0 }); // 再设一次
    const all = await getBudgets(1, '2026-10');
    expect(all).toHaveLength(1);
    expect(all[0].limit_cents).toBe(800000); // 是覆盖，不是又插一条
  });

  it('分类预算存成对应 category_id', async () => {
    await db.budgets.clear();
    await saveBudget(1, { month: '2026-10', limitCents: 100000, categoryId: 1 }); // 餐饮
    const all = await getBudgets(1, '2026-10');
    expect(all.find((b) => b.category_id === 1)).toMatchObject({ limit_cents: 100000 });
  });

  it('总预算 set → 改值 → 命中 update 分支不新增（saveBudget .and() 匹配 limit_cents 完整写入）', async () => {
    await db.budgets.clear();
    await saveBudget(1, { month: '2026-11', limitCents: 500000, categoryId: null }); // 设总预算 5000
    let all = await getBudgets(1, '2026-11');
    expect(all).toHaveLength(1);
    expect(all[0].limit_cents).toBe(500000);       // limit_cents 真的落库了（不是 undefined）
    expect(all[0].category_id).toBe(null);
    await saveBudget(1, { month: '2026-11', limitCents: 800000, categoryId: null }); // 再设 8000
    all = await getBudgets(1, '2026-11');
    expect(all).toHaveLength(1);                    // 仍一条（走 update，没新增）
    expect(all[0].limit_cents).toBe(800000);
  });

  it('历史脏数据：总预算 null 与 0 并存时合并为一条（limit 相加），不双计', async () => {
    await db.budgets.clear();
    // 模拟历史：一条正常总预算(null) + 一条脏总预算(0) 并存
    await db.budgets.add({ id: 100, ledger_id: 1, month: '2026-10', limit_cents: 500000, category_id: null } as any);
    await db.budgets.add({ id: 101, ledger_id: 1, month: '2026-10', limit_cents: 300000, category_id: 0 } as any);
    await db.budgets.add({ id: 102, ledger_id: 1, month: '2026-10', limit_cents: 100000, category_id: 1 } as any);
    const all = await getBudgets(1, '2026-10');
    const totals = all.filter((b) => !b.category_id);
    const cats = all.filter((b) => b.category_id);
    expect(totals).toHaveLength(1);           // 两条总预算合并成一条
    expect(totals[0].limit_cents).toBe(800000); // 50万+30万
    expect(cats).toHaveLength(1);            // 分类预算不受影响
    expect(cats[0].category_id).toBe(1);
  });
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
