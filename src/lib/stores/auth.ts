import { writable } from 'svelte/store';
import bcrypt from 'bcryptjs';
import { db, type User } from '$lib/db';

export interface Session {
  userId: number;
  username: string;
  createdAt: string;
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function register(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await db.users.where('username').equals(username).first();
    if (existing) {
      return { success: false, error: '用户名已存在' };
    }
    const hash = await hashPassword(password);
    const id = await db.users.add({
      username,
      password_hash: hash,
      created_at: new Date().toISOString()
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: '注册失败，请重试' };
  }
}

export async function login(username: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const user = await db.users.where('username').equals(username).first();
    if (!user) {
      return { success: false, error: '用户名或密码错误' };
    }
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return { success: false, error: '用户名或密码错误' };
    }
    return { success: true, user };
  } catch (e) {
    return { success: false, error: '登录失败，请重试' };
  } finally {
    syncSessionStorage();
  }
}

export async function changePassword(userId: number, oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await db.users.get(userId);
    if (!user) return { success: false, error: '用户不存在' };
    const valid = await verifyPassword(oldPassword, user.password_hash);
    if (!valid) return { success: false, error: '旧密码错误' };
    const hash = await hashPassword(newPassword);
    await db.users.update(userId, { password_hash: hash });
    return { success: true };
  } catch (e) {
    return { success: false, error: '修改失败，请重试' };
  }
}

export async function deleteUser(userId: number): Promise<void> {
  await db.transaction('rw', db.expenses, db.budgets, db.users, async () => {
    await db.expenses.where('user_id').equals(userId).delete();
    await db.budgets.where('user_id').equals(userId).delete();
    await db.users.where('id').equals(userId).delete();
  });
}

// 会话状态
const sessionStore = writable<Session | null>(null);

export async function setSession(user: User): Promise<void> {
  sessionStore.set({
    userId: user.id,
    username: user.username,
    createdAt: user.created_at
  });
  await db.settings.put({ key: 'session', value: JSON.stringify({
    userId: user.id,
    username: user.username,
    createdAt: user.created_at
  }) });
  syncSessionStorage();
}

export async function clearSession(): Promise<void> {
  sessionStore.set(null);
  await db.settings.delete('session');
  syncSessionStorage();
}

export async function restoreSession(): Promise<Session | null> {
  const stored = await db.settings.get('session');
  if (stored?.value) {
    try {
      const session = JSON.parse(stored.value) as Session;
      const user = await db.users.get(session.userId);
      if (user) {
        sessionStore.set(session);
        return session;
      }
    } catch {}
  }
  return null;
}

export const session = {
  subscribe: sessionStore.subscribe,
  set: sessionStore.set
};

// Sync localStorage with IndexedDB session on login/logout
export function syncSessionStorage(): void {
  let current: Session | null = null;
  const unsub = sessionStore.subscribe(val => { current = val; });
  unsub();
  if (current) {
    localStorage.setItem('xiaoliuji_session', JSON.stringify(current));
  } else {
    localStorage.removeItem('xiaoliuji_session');
  }
}
