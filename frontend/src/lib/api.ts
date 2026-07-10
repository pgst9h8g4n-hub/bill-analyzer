/**
 * 后端 API 客户端
 * 封装所有与 FastAPI 后端的 HTTP 调用
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

let getToken: (() => string | null) | null = null;

export function setTokenGetter(getter: () => string | null) {
  getToken = getter;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const token = getToken?.() || null;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (options.headers) {
    if (typeof options.headers === 'object' && !Array.isArray(options.headers)) {
      for (const [k, v] of Object.entries(options.headers as Record<string, string>)) {
        if (v !== undefined) headers[k] = v;
      }
    }
  }

  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error ${response.status}: ${error}`);
  }
  return response.json() as T;
}

// ── Types ──────────────────────────────────────────────

export interface CategoryNode {
  id: string; name: string; parent_id: string | null;
  sort_order: number; color: string; keywords: string[];
  children: CategoryNode[];
}

export interface BillRecord {
  id: string; platform: string; original_merchant: string;
  original_product: string | null; original_category: string | null;
  trans_time: string; amount: number; direction: string;
  category_id: string | null; category_name: string | null;
  parent_category_name: string | null; classification_method: string;
  platform_order_no: string | null; created_at: string;
}

export interface RecordListResponse {
  data: BillRecord[]; total: number; page: number;
  page_size: number; total_pages: number;
}

export interface StatsSummary {
  total_amount: number; expense_amount: number; record_count: number;
  avg_daily: number; max_single: number;
  by_platform: { platform: string; amount: number; count: number }[];
  by_category: {
    category_id: string; category_name: string; parent_id: string | null;
    amount: number; count: number; percentage: number;
  }[];
  by_month: { month: string; amount: number; count: number }[];
}

export interface UserInfo {
  id: string; name: string; phone: string | null; avatar_url: string | null;
}

// ── Auth ───────────────────────────────────────────────

export async function getUsers(): Promise<UserInfo[]> {
  return apiFetch<{ users: UserInfo[] }>('/users/').then(r => r.users);
}

// ── Categories ─────────────────────────────────────────

export async function getCategories(userId: string): Promise<CategoryNode[]> {
  return apiFetch<CategoryNode[]>(`/categories/?user_id=${userId}`);
}

export async function createCategory(userId: string, data: { name: string; keywords?: string[]; color?: string }) {
  return apiFetch('/categories/', {
    method: 'POST', body: JSON.stringify({ ...data, user_id: userId, sort_order: 0 }),
  });
}

export async function updateCategory(categoryId: string, data: { name?: string; keywords?: string[]; color?: string; sort_order?: number }) {
  return apiFetch(`/categories/${categoryId}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteCategory(categoryId: string) {
  return apiFetch(`/categories/${categoryId}`, { method: 'DELETE' });
}

// ── Records ────────────────────────────────────────────

export async function getRecords(params: {
  user_id: string; platform?: string; category_id?: string;
  start_date?: string; end_date?: string; direction?: string;
  page?: number; page_size?: number; sort_by?: string; sort_order?: string;
}): Promise<RecordListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  return apiFetch<RecordListResponse>(`/records/?${qs.toString()}`);
}

export async function updateRecordCategory(recordId: string, categoryId: string) {
  return apiFetch(`/records/${recordId}/category`, {
    method: 'PUT', body: JSON.stringify({ category_id: categoryId }),
  });
}

// ── Stats ──────────────────────────────────────────────

export async function getStats(userId: string, params?: { start_date?: string; end_date?: string }): Promise<StatsSummary> {
  const qs = new URLSearchParams({ user_id: userId });
  if (params?.start_date) qs.set('start_date', params.start_date);
  if (params?.end_date) qs.set('end_date', params.end_date);
  return apiFetch<StatsSummary>(`/stats/summary?${qs.toString()}`);
}

// ── Upload ─────────────────────────────────────────────

export async function uploadFile(file: File, userId: string, platformHint?: string) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('user_id', userId);
  if (platformHint) formData.append('platform_hint', platformHint);

  const url = `${API_BASE}/upload/`;
  const token = getToken?.() || null;
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url, { method: 'POST', headers, body: formData });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Upload failed: ${error}`);
  }
  return response.json();
}

// ── Utils ──────────────────────────────────────────────

export function formatAmount(amount: number): string {
  return `¥${amount.toFixed(2)}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function getPlatformLabel(p: string): string {
  return { alipay: '支付宝', wechat: '微信', douyin: '抖音' }[p] || p;
}

export function getPlatformColor(p: string): string {
  return { alipay: '#1677FF', wechat: '#07C160', douyin: '#FE2C55' }[p] || '#6366f1';
}
