import Dexie, { type EntityTable } from 'dexie';

// ─── 类型定义 ───────────────────────────────────────────

export interface User {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
}

export interface Expense {
  id: number;
  user_id: number;
  amount_cents: number;
  category_id: number;
  merchant?: string;
  remark?: string;
  is_refund: boolean;
  paid_at: string;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  is_default: boolean;
}

export interface Budget {
  id: number;
  user_id: number;
  month: string;
  limit_cents: number;
  category_id: number | null;
}

// ─── 数据库定义 ───────────────────────────────────────────

export class XiaoLiujiDB extends Dexie {
  users!: EntityTable<User, 'id'>;
  expenses!: EntityTable<Expense, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  budgets!: EntityTable<Budget, 'id'>;
  settings!: EntityTable<{ key: string; value: string }, 'key'>;

  constructor() {
    super('XiaoLiujiDB');

    this.version(1).stores({
      users: '++id, username',
      expenses: '++id, user_id, [user_id+paid_at], category_id, paid_at',
      categories: '++id, name, is_default',
      budgets: '++id, [user_id+month], user_id, month',
      settings: 'key'
    });
  }
}

export const db = new XiaoLiujiDB();

// ─── 预设分类 ──────────────────────────────────────────────

export const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: '餐饮', icon: '🍜', color: '#ef4444', is_default: true },
  { name: '交通', icon: '🚗', color: '#3b82f6', is_default: true },
  { name: '购物', icon: '🛒', color: '#f59e0b', is_default: true },
  { name: '娱乐', icon: '🎮', color: '#8b5cf6', is_default: true },
  { name: '医疗', icon: '💊', color: '#10b981', is_default: true },
  { name: '教育', icon: '📚', color: '#06b6d4', is_default: true },
  { name: '住房', icon: '🏠', color: '#f97316', is_default: true },
  { name: '通讯', icon: '📱', color: '#6366f1', is_default: true },
  { name: '其他', icon: '📝', color: '#6b7280', is_default: true }
];

// ─── 初始化函数 ────────────────────────────────────────────

export async function seedDefaultCategories(): Promise<void> {
  const count = await db.categories.where({ is_default: true }).count();
  if (count > 0) return;

  for (const cat of DEFAULT_CATEGORIES) {
    await db.categories.add(cat as Category);
  }
}

export async function initDB(): Promise<void> {
  await seedDefaultCategories();
}
