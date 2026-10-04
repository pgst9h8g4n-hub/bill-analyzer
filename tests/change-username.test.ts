import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { db } from '$lib/db';
import { changeUsername, register } from '$lib/stores/auth';

beforeAll(async () => {
  await db.users.clear();
});

afterAll(async () => {
  await db.users.clear();
});

async function mkUser(name: string, password = 'pass123'): Promise<number> {
  const r = await register(name, password);
  if (!r.success) throw new Error(r.error ?? 'register failed');
  const u = await db.users.where('username').equals(name).first();
  return u!.id;
}

describe('changeUsername', () => {
  it('改名成功，旧用户名查不到、新用户名查到', async () => {
    await db.users.clear();
    const id = await mkUser('alice');
    expect(await changeUsername(id, 'alice2')).toMatchObject({ success: true });
    expect(await db.users.where('username').equals('alice').first()).toBeUndefined();
    const u2 = await db.users.where('username').equals('alice2').first();
    expect(u2?.id).toBe(id);
  });

  it('与已有用户重名 → 拒绝', async () => {
    await db.users.clear();
    const a = await mkUser('bob');
    const b = await mkUser('carol');
    const r = await changeUsername(b, 'bob');
    expect(r.success).toBe(false);
    expect(r.error).toContain('已被占用');
    // carol 仍是 carol
    expect(await db.users.where('username').equals('carol').first()).toBeTruthy();
  });

  it('同名（未改）幂等成功', async () => {
    await db.users.clear();
    const a = await mkUser('dave');
    expect(await changeUsername(a, 'dave')).toMatchObject({ success: true });
    expect(await db.users.where('username').equals('dave').first()).toBeTruthy();
  });

  it('空名 / 单字符 → 拒绝', async () => {
    await db.users.clear();
    const a = await mkUser('erin');
    expect((await changeUsername(a, '   ')).success).toBe(false);
    expect((await changeUsername(a, 'x')).success).toBe(false);
  });

  it('不存在的用户 → 拒绝', async () => {
    await db.users.clear();
    expect((await changeUsername(99999, 'ghost')).success).toBe(false);
  });
});
