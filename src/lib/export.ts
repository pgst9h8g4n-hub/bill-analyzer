import { db } from '$lib/db';
import { expenseSigned, isConsumptionScope, isIncome, isNeutral, isRefund, subTypeLabel } from '$lib/db/expense-math';
import type { Expense } from '$lib/db';

export async function exportCSV(ledgerId: number, expenses: Expense[]): Promise<string> {
  const header = '日期,时间,金额(元),方向,子类型,商户,备注\n';
  const rows = expenses.map(e => {
    const d = new Date(e.paid_at);
    const date = d.toISOString().slice(0, 10);
    const time = d.toISOString().slice(11, 16);
    const amount = (isIncome(e) ? e.amount_cents : isConsumptionScope(e) ? expenseSigned(e) : 0) / 100;
    const dir = isRefund(e) ? '退款' : isIncome(e) ? '收入' : isNeutral(e) ? '中性' : '支出';
    const sub = subTypeLabel(e);
    return `${date},${time},${amount.toFixed(2)},${dir},${sub},${e.merchant ?? ''},${e.remark ?? ''}`;
  });
  return '﻿' + header + rows.join('\n');
}

export async function exportJSON(ledgerId: number, expenses: Expense[]): Promise<string> {
  return JSON.stringify(expenses, null, 2);
}

export async function getExpensesForExport(ledgerId: number): Promise<Expense[]> {
  return db.expenses.where('ledger_id').equals(ledgerId).toArray();
}
