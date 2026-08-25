import { db } from '$lib/db';
import type { Expense } from '$lib/db';

export async function exportCSV(userId: number, expenses: Expense[]): Promise<string> {
  const header = '日期,时间,金额(元),类型,商户,备注,是否退款\n';
  const rows = expenses.map(e => {
    const d = new Date(e.paid_at);
    const date = d.toISOString().slice(0, 10);
    const time = d.toISOString().slice(11, 16);
    const amount = (e.is_refund ? -e.amount_cents : e.amount_cents) / 100;
    return `${date},${time},${amount.toFixed(2)},,,${e.merchant ?? ''},${e.remark ?? ''},${e.is_refund ? '是' : '否'}`;
  });
  return '﻿' + header + rows.join('\n');
}

export async function exportJSON(userId: number, expenses: Expense[]): Promise<string> {
  return JSON.stringify(expenses, null, 2);
}

export async function getExpensesForExport(userId: number): Promise<Expense[]> {
  return db.expenses.where('user_id').equals(userId).toArray();
}
