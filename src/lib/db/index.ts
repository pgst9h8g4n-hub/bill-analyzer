import Dexie, { type EntityTable } from 'dexie';

// ─── 类型定义 ───────────────────────────────────────────

export interface User {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
}

export interface Ledger {
  id: number;
  name: string;
  created_by: number;
  code: string;
  created_at: string;
}

export interface LedgerMember {
  id: number;
  ledger_id: number;
  user_id: number;
  role: 'admin' | 'member';
  joined_at: string;
}

export interface Expense {
  id: number;
  user_id: number;
  ledger_id: number;
  amount_cents: number;
  category_id: number;
  merchant?: string;
  remark?: string;
  is_refund: boolean;
  paid_at: string;
  created_at: string;
  // 方向/子类型（导入账单时区分 消费/收入/中性交易）。可选：老数据缺失时按 expense+consumption 兜底。
  direction?: 'expense' | 'income' | 'neutral';
  subType?: 'consumption' | 'transfer' | 'repay' | 'refund' | 'redpacket' | 'fund_return';
}

export interface Category {
  id: number;
  ledger_id: number;
  name: string;
  icon: string;
  color: string;
  is_default: boolean;
}

export interface Budget {
  id: number;
  ledger_id: number;
  user_id: number;
  month: string;
  limit_cents: number;
  category_id: number | null;
}

// ─── 数据库定义 ───────────────────────────────────────────

export class XiaoLiujiDB extends Dexie {
  users!: EntityTable<User, 'id'>;
  ledgers!: EntityTable<Ledger, 'id'>;
  members!: EntityTable<LedgerMember, 'id'>;
  expenses!: EntityTable<Expense, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  budgets!: EntityTable<Budget, 'id'>;
  settings!: EntityTable<{ key: string; value: string }, 'key'>;

  constructor() {
    super('XiaoLiujiDB');

    this.version(1).stores({
      users: '++id, username',
      expenses: '++id, user_id, ledger_id, [user_id+paid_at], [ledger_id+paid_at], category_id, paid_at',
      categories: '++id, ledger_id, name, is_default',
      budgets: '++id, [ledger_id+month], ledger_id, [user_id+month], user_id, month',
      settings: 'key'
    });

    // v2: 加入账本系统，迁移旧数据
    // 注意：必须声明全部 existing stores，否则 Dexie 会 drop 未列出的表
    this.version(2).stores({
      users: '++id, username',
      ledgers: '++id, code',
      members: '[ledger_id+user_id], ledger_id, user_id',
      expenses: '++id, user_id, ledger_id, [user_id+paid_at], [ledger_id+paid_at], category_id, paid_at',
      categories: '++id, ledger_id, name, is_default',
      budgets: '++id, [ledger_id+month], ledger_id, [user_id+month], user_id, month',
      settings: 'key'
    }).upgrade(async () => {
      const userList = await db.users.toArray();
      for (const user of userList) {
        // 为每个用户创建一个同名账本
        const id = await db.ledgers.add({
          name: `${user.username}的账本`,
          created_by: user.id,
          code: generateCode(),
          created_at: new Date().toISOString()
        });
        // 迁移旧数据
        await db.expenses.where('user_id').equals(user.id).modify({ ledger_id: id });
        await db.categories.where('name').anyOf(['餐饮','交通','购物','娱乐','医疗','教育','住房','通讯','其他']).modify({ ledger_id: id });
        await db.budgets.where('user_id').equals(user.id).modify({ ledger_id: id });
        // 建立成员关系
        await db.members.add({
          ledger_id: id,
          user_id: user.id,
          role: 'admin',
          joined_at: new Date().toISOString()
        });
      }
    });

    // v3: 修复 active_ledger 设置（之前迁移时未保存）
    // 注意：必须重复声明全部 stores，否则 Dexie 会把未列出的表 drop 掉
    this.version(3).stores({
      users: '++id, username',
      ledgers: '++id, code',
      members: '[ledger_id+user_id], ledger_id, user_id',
      expenses: '++id, user_id, ledger_id, [user_id+paid_at], [ledger_id+paid_at], category_id, paid_at',
      categories: '++id, ledger_id, name, is_default',
      budgets: '++id, [ledger_id+month], ledger_id, [user_id+month], user_id, month',
      settings: 'key'
    }).upgrade(async () => {
      const settings = await db.settings.toArray();
      const hasActiveLedger = settings.some(s => s.key === 'active_ledger');
      if (!hasActiveLedger) {
        const ledgers = await db.ledgers.toArray();
        if (ledgers.length > 0) {
          await db.settings.put({ key: 'active_ledger', value: String(ledgers[0].id) });
          console.log('[DB Migration v3] Set active_ledger to', ledgers[0].id);
        }
      }
    });

    // v4: 修复 v3 schema bug（之前 v3 缺 .stores() 导致所有表被 drop）
    // 保留旧数据：把各表重建并重新播种默认分类
    this.version(4).stores({
      users: '++id, username',
      ledgers: '++id, code',
      members: '[ledger_id+user_id], ledger_id, user_id',
      expenses: '++id, user_id, ledger_id, [user_id+paid_at], [ledger_id+paid_at], category_id, paid_at',
      categories: '++id, ledger_id, name, is_default',
      budgets: '++id, [ledger_id+month], ledger_id, [user_id+month], user_id, month',
      settings: 'key'
    }).upgrade(async () => {
      const users = await db.users.toArray();
      if (users.length > 0) {
        const existingLedgers = await db.ledgers.toArray();
        for (const user of users) {
          // 如果用户还没有账本，创建一个
          let ledger = existingLedgers.find(l => l.created_by === user.id);
          if (!ledger) {
            const id = await db.ledgers.add({
              name: `${user.username}的账本`,
              created_by: user.id,
              code: generateCode(),
              created_at: new Date().toISOString()
            });
            ledger = await db.ledgers.get(id);
          }
          if (ledger) {
            await seedDefaultCategories(ledger.id);
            // 建立成员关系
            const member = await db.members.where({ ledger_id: ledger.id, user_id: user.id }).first();
            if (!member) {
              await db.members.add({
                ledger_id: ledger.id,
                user_id: user.id,
                role: 'admin',
                joined_at: new Date().toISOString()
              });
            }
            // 确保 active_ledger 设置存在
            const settings = await db.settings.toArray();
            const hasActive = settings.some(s => s.key === 'active_ledger');
            if (!hasActive) {
              await db.settings.put({ key: 'active_ledger', value: String(ledger.id) });
            }
          }
        }
      }
    });

    // v5: 修复默认分类重复播种问题
    // 1) 补建 [ledger_id+name] 复合索引（幂等，Dexie 会在索引已存在时跳过）
    // 2) 去重：每个账本只保留每组 (ledger_id, name) 的第一条 is_default=true 记录
    // 3) 确保 active_ledger 设置存在
    this.version(5).stores({
      users: '++id, username',
      ledgers: '++id, code',
      members: '[ledger_id+user_id], ledger_id, user_id',
      expenses: '++id, user_id, ledger_id, [user_id+paid_at], [ledger_id+paid_at], category_id, paid_at',
      categories: '++id, ledger_id, ledger_id+name, name, is_default',
      budgets: '++id, [ledger_id+month], ledger_id, [user_id+month], user_id, month',
      settings: 'key'
    }).upgrade(async () => {
      const ledgers = await db.ledgers.toArray();
      for (const ledger of ledgers) {
        let removedDuplicates = 0;
        // 去重：按 name 分组，每组只保留第一条 is_default=true 的记录
        const allCats = await db.categories.where('ledger_id').equals(ledger.id).toArray();
        const defaultCats = allCats.filter(c => c.is_default);
        const byName = new Map<string, number[]>();
        for (const cat of defaultCats) {
          if (!byName.has(cat.name)) byName.set(cat.name, []);
          byName.get(cat.name)!.push(cat.id);
        }
        for (const [, ids] of byName) {
          for (const id of ids.slice(1)) {
            await db.categories.delete(id);
            removedDuplicates++;
          }
        }
        // 确保有默认分类（种子函数已改用可靠检查，不会再重复）
        await seedDefaultCategories(ledger.id);
        if (removedDuplicates > 0) {
          console.log(`[DB Migration v5] 账本${ledger.id} 去重：删除 ${removedDuplicates} 条重复默认分类`);
        }
      }
      // 确保 active_ledger 设置存在
      const settings = await db.settings.toArray();
      if (!settings.some(s => s.key === 'active_ledger') && ledgers.length > 0) {
        await db.settings.put({ key: 'active_ledger', value: String(ledgers[0].id) });
      }
    });

    // v6: 修复旧版本 Dexie 数据库 schema 损坏问题
    // 强制重建所有表索引，清除损坏的 keyPath
    this.version(6).stores({
      users: '++id, username',
      ledgers: '++id, code, created_by',
      members: '[ledger_id+user_id], ledger_id, user_id',
      expenses: '++id, user_id, ledger_id, [user_id+paid_at], [ledger_id+paid_at], category_id, paid_at',
      categories: '++id, ledger_id, name, is_default',
      budgets: '++id, [ledger_id+month], ledger_id, [user_id+month], user_id, month',
      settings: 'key'
    }).upgrade(async () => {
      console.log('[DB Migration v6] Rebuilding schema to fix corrupted indexes');
      const users = await db.users.toArray();
      for (const user of users) {
        let ledger = await db.ledgers.where('created_by').equals(user.id).first();
        if (!ledger) {
          // 内联创建账本（避免循环依赖）
          const code = generateCode();
          const id = await db.ledgers.add({
            name: `${user.username}的账本`,
            created_by: user.id,
            code,
            created_at: new Date().toISOString()
          });
          ledger = await db.ledgers.get(id);
        }
        if (ledger) {
          await seedDefaultCategories(ledger.id);
          const member = await db.members.where({ ledger_id: ledger.id, user_id: user.id }).first();
          if (!member) {
            await db.members.add({ ledger_id: ledger.id, user_id: user.id, role: 'admin', joined_at: new Date().toISOString() });
          }
        }
      }
      const settings = await db.settings.toArray();
      if (!settings.some(s => s.key === 'active_ledger') && users.length > 0) {
        const firstLedger = await db.ledgers.where('created_by').equals(users[0].id).first();
        if (firstLedger) {
          await db.settings.put({ key: 'active_ledger', value: String(firstLedger.id) });
        }
      }
    });

    // v7: 账单导入 — 给 Expense 加 direction/subType 概念
    // 注意：必须重复声明全部 stores，否则 Dexie 会 drop 未列出的表（v3 教训）
    // 老数据没有 direction/subType 字段，迁移里统一补齐 expense+consumption
    this.version(7).stores({
      users: '++id, username',
      ledgers: '++id, code, created_by',
      members: '[ledger_id+user_id], ledger_id, user_id',
      expenses: '++id, user_id, ledger_id, [user_id+paid_at], [ledger_id+paid_at], category_id, paid_at, direction, subType',
      categories: '++id, ledger_id, name, is_default',
      budgets: '++id, [ledger_id+month], ledger_id, [user_id+month], user_id, month',
      settings: 'key'
    }).upgrade(async () => {
      // 老数据补齐 direction/subType
      await db.expenses.toCollection().modify(e => {
        if (!e.direction) e.direction = 'expense';
        if (!e.subType) e.subType = 'consumption';
      });
      // 播种"转账"中性分类 + "待整理"（幂等）
      const users = await db.users.toArray();
      for (const user of users) {
        const ledger = await db.ledgers.where('created_by').equals(user.id).first();
        if (ledger) await seedDefaultCategories(ledger.id);
      }
    });

    // v8: budgets 表补 limit_cents / category_id 索引
    // 之前 7 个版本 schema 都没声明这两个字段——Dexie 存对象时值仍会持久化，
    // 但 .and(b => b.category_id === ...) 这类过滤无索引可走、行为不可靠。
    // 加普通索引后匹配稳定；已有数据不丢（只补索引，不重建表）。
    this.version(8).stores({
      users: '++id, username',
      ledgers: '++id, code, created_by',
      members: '[ledger_id+user_id], ledger_id, user_id',
      expenses: '++id, user_id, ledger_id, [user_id+paid_at], [ledger_id+paid_at], category_id, paid_at, direction, subType',
      categories: '++id, ledger_id, name, is_default',
      budgets: '++id, [ledger_id+month], ledger_id, [user_id+month], user_id, month, limit_cents, category_id',
      settings: 'key'
    });
  }
}

export const db = new XiaoLiujiDB();

// ─── 工具函数 ──────────────────────────────────────────────

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function generateInviteCode(): string {
  return generateCode();
}

// ─── 预设分类（按账本初始化时用） ──────────────────────────────

export const DEFAULT_CATEGORIES: Omit<Category, 'id' | 'ledger_id'>[] = [
  { name: '餐饮', icon: '🍜', color: '#ef4444', is_default: true },
  { name: '交通', icon: '🚗', color: '#3b82f6', is_default: true },
  { name: '购物', icon: '🛒', color: '#f59e0b', is_default: true },
  { name: '娱乐', icon: '🎮', color: '#8b5cf6', is_default: true },
  { name: '医疗', icon: '💊', color: '#10b981', is_default: true },
  { name: '教育', icon: '📚', color: '#06b6d4', is_default: true },
  { name: '住房', icon: '🏠', color: '#f97316', is_default: true },
  { name: '通讯', icon: '📱', color: '#6366f1', is_default: true },
  { name: '其他', icon: '📝', color: '#6b7280', is_default: true },
  { name: '待整理', icon: '🗂️', color: '#9ca3af', is_default: true },
  { name: '转账', icon: '💱', color: '#d4d4d8', is_default: true }
];

// "待整理"分类名常量，OCR/导入空商户兜底用
export const UNSORTED_CATEGORY_NAME = '待整理';
// 中性交易（转账/还款/退款冲抵）专用分类名，导入中性交易时归类用
export const TRANSFER_CATEGORY_NAME = '转账';

// ─── 初始化函数 ────────────────────────────────────────────

export async function seedDefaultCategories(ledgerId: number): Promise<void> {
  // 按 name 补缺，绝对幂等：已存在的不会重复插入
  const existing = await db.categories.where('ledger_id').equals(ledgerId).toArray();
  const existingNames = new Set(existing.map(c => c.name));
  for (const cat of DEFAULT_CATEGORIES) {
    if (!existingNames.has(cat.name)) {
      await db.categories.add({ ...cat, ledger_id: ledgerId } as Category);
    }
  }
}

export async function initDB(): Promise<void> {
  // 迁移逻辑已在 Dexie version upgrade 中处理
}

export async function getCategories(ledgerId?: number): Promise<Category[]> {
  if (ledgerId !== undefined) {
    return db.categories.where('ledger_id').equals(ledgerId).toArray();
  }
  return db.categories.toArray();
}

export async function getCategoryById(id: number, ledgerId?: number): Promise<Category | undefined> {
  if (ledgerId !== undefined) {
    return db.categories.where('ledger_id').equals(ledgerId).filter(c => c.id === id).first();
  }
  return db.categories.get(id);
}

// 取某账本的"待整理"兜底分类 id（OCR 空商户时用）。缺失时即时播种，保证可用。
export async function getUnsortedCategoryId(ledgerId: number): Promise<number> {
  let cat = await db.categories.where('ledger_id').equals(ledgerId).filter(c => c.name === UNSORTED_CATEGORY_NAME).first();
  if (!cat) {
    await seedDefaultCategories(ledgerId);
    cat = await db.categories.where('ledger_id').equals(ledgerId).filter(c => c.name === UNSORTED_CATEGORY_NAME).first();
  }
  return cat!.id;
}

// 取某账本的"转账"中性分类 id（导入中性交易归类用）。缺失时即时播种。
export async function getTransferCategoryId(ledgerId: number): Promise<number> {
  let cat = await db.categories.where('ledger_id').equals(ledgerId).filter(c => c.name === TRANSFER_CATEGORY_NAME).first();
  if (!cat) {
    await seedDefaultCategories(ledgerId);
    cat = await db.categories.where('ledger_id').equals(ledgerId).filter(c => c.name === TRANSFER_CATEGORY_NAME).first();
  }
  return cat!.id;
}
