/** 金额分转元 */
export function centsToYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** 金额元转分（接受字符串或数字） */
export function yuanToCents(yuan: string | number): number {
  const num = typeof yuan === 'string' ? parseFloat(yuan) : yuan;
  return Math.round(num * 100);
}

/** 格式化日期为 YYYY-MM-DD */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

/** 获取当前月份字符串 YYYY-MM */
export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** 判断日期是否在当月 */
export function isThisMonth(dateStr: string): boolean {
  return formatDate(dateStr) === formatDate(new Date());
}

/** 判断日期是否在本周 */
export function isThisWeek(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1);
  startOfWeek.setHours(0, 0, 0, 0);
  return date >= startOfWeek && date <= now;
}
