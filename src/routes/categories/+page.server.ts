import { db } from '$lib/db';
import type { Category } from '$lib/db';

export async function load() {
  const categories = await db.categories.toArray();
  return { categories };
}

export const actions = {
  create: async ({ request }) => {
    const fd = await request.formData();
    const name = fd.get('name')?.toString()?.trim();
    const icon = fd.get('icon')?.toString() || '📝';
    const color = fd.get('color')?.toString() || '#6366f1';
    if (!name) return { error: '请输入分类名称' };
    const id = await db.categories.add({ name, icon, color, is_default: false } as Category);
    return { id };
  },
  update: async ({ request }) => {
    const fd = await request.formData();
    const id = parseInt(fd.get('id') as string);
    const name = fd.get('name')?.toString()?.trim();
    const icon = fd.get('icon')?.toString();
    const color = fd.get('color')?.toString();
    if (!name) return { error: '请输入分类名称' };
    await db.categories.update(id, { name, icon, color });
    return { id };
  },
  delete: async ({ request }) => {
    const fd = await request.formData();
    const id = parseInt(fd.get('id') as string);
    const cat = await db.categories.get(id);
    if (!cat || cat.is_default) return { error: '预设分类不可删除' };
    const other = await db.categories.where('name').equals('其他').first();
    if (other) {
      await db.expenses.where('category_id').equals(id).modify({ category_id: other.id });
    }
    await db.categories.delete(id);
    return { id };
  }
};
