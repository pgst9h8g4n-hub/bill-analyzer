import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import 'fake-indexeddb';
import 'fake-indexeddb/auto'; // 把 fake IndexedDB 挂到全局 indexedDB / IDBKeyRange
import { db } from '$lib/db';
import {
  getPeriodSummary,
  getPeriodTrend,
  getPeriodCategoryStats,
  getPeriodTopExpenses,
  monthsOf,
} from '$lib/db/stats';

// 造一条最小 expense。amount_cents 单位「分」。
function exp(o: {
  id: number;
  amount: number; // 分
  paid_at: string; // 'YYYY-MM-DD'
  direction?: 'expense' | 'income' | 'neutral';
  subType?: 'consumption' | 'transfer' | 'repay' | 'refund' | 'redpacket' | 'fund_return';
  categoryId?: number;
  merchant?: string;
}) {
  return {
    id: o.id,
    user_id: 1,
    ledger_id: 1,
    amount_cents: o.amount,
    category_id: o.categoryId ?? 1,
    merchant: o.merchant ?? '商户',
    is_refund: o.subType === 'refund',
    paid_at: o.paid_at,
    created_at: o.paid_at,
    direction: o.direction ?? 'expense',
    subType: o.subType ?? 'consumption',
  } as any;
}

beforeAll(async () => {
  // 清表，避免测试间/重复跑串数据
  await db.expenses.clear();
  await db.categories.clear();
  await db.budgets.clear();

  // 两个分类，颜色/图标用于断言
  await db.categories.add({ id: 1, ledger_id: 1, name: '餐饮', icon: '🍜', color: '#ef4444', is_default: true } as any);
  await db.categories.add({ id: 2, ledger_id: 1, name: '交通', icon: '🚗', color: '#3b82f6', is_default: true } as any);

  // 2026 年 2 月、3 月、5 月各放一笔消费（消费在数据层记负，绝对值=金额）
  await db.expenses.bulkAdd([
    exp({ id: 1, amount: 100000, paid_at: '2026-02-10', categoryId: 1, merchant: '2月大额餐饮' }), // 1000 元
    exp({ id: 2, amount: 20000, paid_at: '2026-03-05', categoryId: 2, merchant: '3月交通' }),        // 200 元
    exp({ id: 3, amount: 3000, paid_at: '2026-05-01', categoryId: 1, merchant: '5月小额餐饮' }),      // 30 元
    exp({ id: 4, amount: 5000, paid_at: '2026-05-02', categoryId: 2, merchant: '5月交通' }),          // 50 元
  ]);
});

afterAll(async () => {
  await db.expenses.clear();
  await db.categories.clear();
});

describe('周期前缀正确性（月周期只匹配当月，不混进全年）', () => {
  it('getPeriodSummary：选 2026-05 只出 5 月净额（80 元），不含 2/3 月', async () => {
    const s = await getPeriodSummary(1, '2026-05');
    // 5 月消费 30+50=80 元 → 净额 -8000 分
    expect(s.monthTotal).toBe(-8000);
  });

  it('getPeriodSummary：选 2026-02 只出 2 月净额（1000 元），不混进 5 月', async () => {
    const s = await getPeriodSummary(1, '2026-02');
    expect(s.monthTotal).toBe(-100000);
  });

  it('getPeriodSummary：选 2026（整年）出全年净额（1280 元）', async () => {
    const s = await getPeriodSummary(1, '2026');
    // 1000+200+30+50 = 1280 元
    expect(s.monthTotal).toBe(-128000);
  });

  it('getPeriodCategoryStats：选 2026-05 只含 5 月的两个分类，无 2/3 月分类混入', async () => {
    const cats = await getPeriodCategoryStats(1, '2026-05');
    const names = cats.map((c) => c.category.name).sort();
    expect(names).toEqual(['交通', '餐饮']);
    // 5 月：餐饮 30 元、交通 50 元
    const catering = cats.find((c) => c.category.name === '餐饮')!;
    const transport = cats.find((c) => c.category.name === '交通')!;
    expect(catering.total).toBe(-3000);
    expect(transport.total).toBe(-5000);
  });

  it('getPeriodTopExpenses：选 2026-05 最大单笔是 5 月 50 元（不再把 2 月 1000 元拉进来）', async () => {
    const tops = await getPeriodTopExpenses(1, '2026-05', 5);
    expect(tops.length).toBe(2);
    expect(tops[0].amount).toBe(5000); // 50 元最大
    // 关键断言：2 月那笔 1000 元的记录绝不出现
    expect(tops.find((t) => t.amount === 100000)).toBeUndefined();
  });

  it('getPeriodTopExpenses：选 2026（整年）最大单笔是 2 月 1000 元', async () => {
    const tops = await getPeriodTopExpenses(1, '2026', 5);
    expect(tops[0].amount).toBe(100000);
  });

  it('getPeriodTrend：选 2026-05（逐天）横轴按天聚合，各天 0/30/50 元', async () => {
    const days = ['2026-05-01', '2026-05-02', '2026-05-03'];
    const trend = await getPeriodTrend(1, '2026-05', days);
    expect(trend.map((d) => d.total)).toEqual([-3000, -5000, 0]);
  });

  it('getPeriodTrend：选 2026（逐月）横轴按月聚合，5 月=80 元', async () => {
    const buckets = monthsOf('2026');
    const trend = await getPeriodTrend(1, '2026', buckets);
    const may = trend.find((d) => d.date === '2026-05')!;
    const feb = trend.find((d) => d.date === '2026-02')!;
    const mar = trend.find((d) => d.date === '2026-03')!;
    expect(may.total).toBe(-8000);
    expect(feb.total).toBe(-100000);
    expect(mar.total).toBe(-20000);
    expect(trend.find((d) => d.date === '2026-04')!.total).toBe(0);
  });
});
