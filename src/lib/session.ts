import { writable } from 'svelte/store';
import { goto } from '$app/navigation';
import { onMount } from 'svelte';
import { initDB, getCategories, seedDefaultCategories } from '$lib/db';
import { clearSession, restoreSession, setSession } from '$lib/stores/auth';
import { db } from '$lib/db';
import { createLedger } from '$lib/db/ledgers';
import { getActiveLedger, setActiveLedger } from '$lib/stores/ledger';

// 调试期开关：自动登录，无需注册/密码。调试完成改为 false 即可恢复原流程。
const DEBUG_AUTO_LOGIN = true;
const DEBUG_USERNAME = 'debug';

export const currentUserId = writable<number>(0);
export const currentUsername = writable<string>('');
export const currentLedgerId = writable<number>(0);

// 调试直接放行：跳过会话守卫，直接置就绪，免去注册/登录
export const authReady = writable<boolean>(!DEBUG_AUTO_LOGIN);

async function autoLoginDebug(): Promise<boolean> {
  console.log("[DEBUG] autoLoginDebug called");
  // 找到或创建调试用户
  let user = await db.users.where('username').equals(DEBUG_USERNAME).first();
  if (!user) {
    const id = await db.users.add({
      username: DEBUG_USERNAME,
      password_hash: 'debug-no-password',
      created_at: new Date().toISOString()
    });
    user = await db.users.get(id);
  }
  if (!user) return false;

  // 首次进入：若没有账本就建一个，避免卡在选账本页
  // 无论新建还是已存在，都确保账本里播种了默认分类（否则分类下拉框一直"加载中"）
  const active = await getActiveLedger(user.id);
  if (!active) {
    const ledger = await createLedger(user.id, '调试账本');
    await seedDefaultCategories(ledger.id);
    await setActiveLedger(ledger.id); // 保存到 IndexedDB，防止刷新后丢失
  } else {
    // 已存在的账本：种子分类是幂等的（已有默认分类则跳过），补种历史账本
    await seedDefaultCategories(active.id);
  }

  await setSession(user);
  console.log("[DEBUG] session set, userId:", user.id);
  return true;
}

export function useAuth() {
  onMount(async () => {
    await initDB();
    let session = await restoreSession();

    if (!session && DEBUG_AUTO_LOGIN) {
      const ok = await autoLoginDebug();
      if (ok) session = await restoreSession();
    }

    if (session) {
      currentUserId.set(session.userId);
      currentUsername.set(session.username);
      const active = await getActiveLedger(session.userId);
      if (active) {
        currentLedgerId.set(active.id);
      console.log("[DEBUG] currentLedgerId set to:", active.id);
      } else {
        goto('/ledger');
      }
      authReady.set(true);
    } else {
      // 调试期自动登录失败也不跳登录页，避免卡住
      if (DEBUG_AUTO_LOGIN) {
        authReady.set(true);
      } else {
        goto('/login');
      }
    }
  });

  return {
    logout() {
      clearSession();
      goto('/login');
    }
  };
}
