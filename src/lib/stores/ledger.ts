import { writable } from 'svelte/store';
import { db } from '$lib/db';
import { session } from './auth';

export interface ActiveLedger {
  id: number;
  name: string;
}

// 默认值为 null，表示未选择账本
const activeLedgerStore = writable<number | null>(null);

export async function setActiveLedger(ledgerId: number): Promise<void> {
  activeLedgerStore.set(ledgerId);
  await db.settings.put({ key: 'active_ledger', value: String(ledgerId) });
}

export async function getActiveLedger(userId: number): Promise<ActiveLedger | null> {
  console.log("[DEBUG] getActiveLedger called, userId:", userId);
  const stored = await db.settings.get('active_ledger');
  console.log("[DEBUG] stored active_ledger:", stored);
  if (stored?.value) {
    const ledgerId = parseInt(stored.value, 10);
    const ledger = await db.ledgers.get(ledgerId);
    // 验证用户是否仍在该账本中
    if (ledger) {
      const member = await db.members.where({ ledger_id: ledgerId, user_id: userId }).first();
      if (member) return { id: ledger.id, name: ledger.name };
    }
  }
  return null;
}

export async function loadActiveLedger(userId: number): Promise<ActiveLedger | null> {
  const active = await getActiveLedger(userId);
  if (active) {
    activeLedgerStore.set(active.id);
  } else {
    activeLedgerStore.set(null);
  }
  return active;
}

export const activeLedger = {
  subscribe: activeLedgerStore.subscribe,
  set: activeLedgerStore.set
};
