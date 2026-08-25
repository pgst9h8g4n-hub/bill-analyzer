import { db } from '$lib/db';

export async function load() {
  const categories = await db.categories.toArray();
  return { categories };
}

export const actions = {
  create: async ({ request }) => {
    const fd = await request.formData();
    const amount = fd.get('amount')?.toString();
    const date = fd.get('date')?.toString();
    const categoryId = parseInt(fd.get('categoryId') as string);
    const merchant = fd.get('merchant')?.toString() || undefined;
    const remark = fd.get('remark')?.toString() || undefined;
    const isRefund = fd.get('isRefund') === 'on';

    if (!amount || !date || !categoryId) return { error: '请填写必要字段' };

    await db.expenses.add({
      user_id: 0,
      amount_cents: Math.round(parseFloat(amount) * 100),
      category_id: categoryId,
      merchant,
      remark,
      is_refund: isRefund,
      paid_at: date,
      created_at: new Date().toISOString()
    });
    return { success: true };
  },
  update: async ({ request }) => {
    const fd = await request.formData();
    const id = parseInt(fd.get('id') as string);
    const amount = fd.get('amount')?.toString();
    const date = fd.get('date')?.toString();
    const categoryId = parseInt(fd.get('categoryId') as string);
    const merchant = fd.get('merchant')?.toString() || undefined;
    const remark = fd.get('remark')?.toString() || undefined;
    const isRefund = fd.get('isRefund') === 'on';

    const updates: any = {};
    if (amount) updates.amount_cents = Math.round(parseFloat(amount) * 100);
    if (date) updates.paid_at = date;
    if (categoryId) updates.category_id = categoryId;
    updates.merchant = merchant;
    updates.remark = remark;
    updates.is_refund = isRefund;

    await db.expenses.update(id, updates);
    return { success: true };
  },
  delete: async ({ request }) => {
    const fd = await request.formData();
    const id = parseInt(fd.get('id') as string);
    await db.expenses.delete(id);
    return { success: true };
  }
};
