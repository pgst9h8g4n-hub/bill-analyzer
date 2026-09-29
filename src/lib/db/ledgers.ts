import { db } from '$lib/db';
import type { Budget, Ledger, LedgerMember } from '$lib/db';

export async function createLedger(userId: number, name: string): Promise<Ledger> {
  const code = await generateUniqueCode();
  const id = await db.ledgers.add({
    name,
    created_by: userId,
    code,
    created_at: new Date().toISOString()
  });
  // 创建者自动成为管理员
  await db.members.add({
    ledger_id: id,
    user_id: userId,
    role: 'admin',
    joined_at: new Date().toISOString()
  });
  return { id, name, created_by: userId, code, created_at: new Date().toISOString() };
}

async function generateUniqueCode(): Promise<string> {
  const { generateInviteCode } = await import('$lib/db');
  for (let i = 0; i < 10; i++) {
    const code = generateInviteCode();
    const exists = await db.ledgers.where('code').equals(code).first();
    if (!exists) return code;
  }
  return generateInviteCode();
}

export async function joinLedger(userId: number, code: string): Promise<{ success: boolean; error?: string }> {
  const ledger = await db.ledgers.where('code').equals(code.toUpperCase()).first();
  if (!ledger) return { success: false, error: '邀请码无效' };
  const already = await db.members.where({ ledger_id: ledger.id, user_id: userId }).first();
  if (already) return { success: false, error: '你已在这个账本中' };
  await db.members.add({
    ledger_id: ledger.id,
    user_id: userId,
    role: 'member',
    joined_at: new Date().toISOString()
  });
  return { success: true };
}

export async function getLedger(code: string): Promise<Ledger | undefined> {
  return db.ledgers.where('code').equals(code.toUpperCase()).first();
}

export async function getLedgerMembers(ledgerId: number): Promise<(LedgerMember & { user?: { id: number; username: string } })[]> {
  const members = await db.members.where('ledger_id').equals(ledgerId).toArray();
  const result = [];
  for (const m of members) {
    const user = await db.users.get(m.user_id);
    result.push({ ...m, user: user ? { id: user.id, username: user.username } : undefined });
  }
  return result;
}

export async function getUserLedgers(userId: number): Promise<Ledger[]> {
  const memberList = await db.members.where('user_id').equals(userId).toArray();
  const ledgers: Ledger[] = [];
  for (const m of memberList) {
    const ledger = await db.ledgers.get(m.ledger_id);
    if (ledger) ledgers.push(ledger);
  }
  return ledgers;
}

export async function getUserRole(userId: number, ledgerId: number): Promise<'admin' | 'member' | null> {
  const member = await db.members.where({ ledger_id: ledgerId, user_id: userId }).first();
  return member?.role ?? null;
}

export async function leaveLedger(userId: number, ledgerId: number): Promise<void> {
  await db.members.where({ ledger_id: ledgerId, user_id: userId }).delete();
}

export async function deleteLedger(ledgerId: number, userId: number): Promise<void> {
  const member = await db.members.where({ ledger_id: ledgerId, user_id: userId }).first();
  if (!member || member.role !== 'admin') throw new Error('只有创建者可以删除账本');
  await db.transaction('rw', db.expenses, db.budgets, db.categories, db.members, db.ledgers, async () => {
    await db.expenses.where('ledger_id').equals(ledgerId).delete();
    await db.budgets.where('ledger_id').equals(ledgerId).delete();
    await db.categories.where('ledger_id').equals(ledgerId).delete();
    await db.members.where('ledger_id').equals(ledgerId).delete();
    await db.ledgers.delete(ledgerId);
  });
}

export async function updateLedgerName(ledgerId: number, userId: number, name: string): Promise<void> {
  const member = await db.members.where({ ledger_id: ledgerId, user_id: userId }).first();
  if (!member || member.role !== 'admin') throw new Error('没有权限');
  await db.ledgers.update(ledgerId, { name });
}

export async function getLedgerById(id: number): Promise<Ledger | undefined> {
  return db.ledgers.get(id);
}

export async function copyLedgerCode(code: string): Promise<void> {
  const text = code.toUpperCase();
  await navigator.clipboard.writeText(text);
}
