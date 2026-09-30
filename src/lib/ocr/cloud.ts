/**
 * 云端 OCR 客户端
 * 支持百度 OCR 和腾讯云 OCR
 * API Key 存储在 IndexedDB 中，不暴露给第三方
 */

export type OCRProvider = 'baidu' | 'tencent';
export type OCRMode = 'local' | 'cloud' | 'auto' | 'smart';

export interface OCRConfig {
  provider: OCRProvider;
  apiKey: string;
  secretKey: string; // 仅腾讯云需要
}

export interface OCRResult {
  text: string;
  confidence: number;
  provider: OCRProvider;
}

// 智能模式配置：云端优先，额度耗尽后自动降级
export interface SmartModeConfig {
  cloudFirst: boolean;  // 是否优先使用云端
  cloudFailLocal: boolean;  // 云端失败是否降级本地
  localFailCloud: boolean;  // 本地失败是否尝试云端
  maxCloudAttempts: number;  // 最大云端尝试次数（防止频繁请求）
  quotaKey: string;  // 用于本地追踪调用次数的 key
}

// 默认智能模式配置
export const DEFAULT_SMART_CONFIG: SmartModeConfig = {
  cloudFirst: true,
  cloudFailLocal: true,
  localFailCloud: false,  // 云端有额度时不降级
  maxCloudAttempts: 10,  // 每天最多尝试 10 次云端（防止配额浪费）
  quotaKey: 'xiaoliuji_cloud_quota',
};

// 本地存储的配额信息（按自然月）
interface QuotaInfo {
  period: string;  // YYYY-MM
  count: number;
  lastError?: string;
  quotaExhausted?: boolean;  // 本月额度已耗尽（由百度实际报错触发）
}

// 获取当前自然月
function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// 从 IndexedDB 获取 OCR 配置
export async function getOCRConfig(): Promise<OCRConfig | null> {
  const { db } = await import('$lib/db');
  const stored = await db.settings.get('ocr_config');
  if (stored?.value) {
    try {
      return JSON.parse(stored.value) as OCRConfig;
    } catch {
      return null;
    }
  }
  return null;
}

// 保存 OCR 配置到 IndexedDB
export async function saveOCRConfig(config: OCRConfig): Promise<void> {
  const { db } = await import('$lib/db');
  await db.settings.put({
    key: 'ocr_config',
    value: JSON.stringify(config)
  });
}

// 获取智能模式配置
export async function getSmartModeConfig(): Promise<SmartModeConfig> {
  const { db } = await import('$lib/db');
  const stored = await db.settings.get('ocr_smart_config');
  if (stored?.value) {
    try {
      return JSON.parse(stored.value) as SmartModeConfig;
    } catch {
      return DEFAULT_SMART_CONFIG;
    }
  }
  return DEFAULT_SMART_CONFIG;
}

// 保存智能模式配置
export async function saveSmartModeConfig(config: SmartModeConfig): Promise<void> {
  const { db } = await import('$lib/db');
  await db.settings.put({
    key: 'ocr_smart_config',
    value: JSON.stringify(config)
  });
}

// 获取本自然月的云端调用次数
export async function getTodayCloudQuota(): Promise<QuotaInfo> {
  const { db } = await import('$lib/db');
  const period = currentPeriod();
  const stored = await db.settings.get('ocr_cloud_quota');
  if (stored?.value) {
    try {
      const raw = JSON.parse(stored.value);
      // 新格式：有 period 字段
      if (raw.period === period) {
        return raw as QuotaInfo;
      }
      // 旧格式：有 date 字段（YYYY-MM-DD）→ 迁移
      if (raw.date && raw.count !== undefined) {
        const migrated: QuotaInfo = {
          period,
          count: raw.count,
          lastError: raw.lastError,
          quotaExhausted: false
        };
        await db.settings.put({ key: 'ocr_cloud_quota', value: JSON.stringify(migrated) });
        return migrated;
      }
    } catch {}
  }
  return { period, count: 0, quotaExhausted: false };
}

// 增加本自然月云端调用计数
export async function incrementCloudQuota(error?: string): Promise<void> {
  const { db } = await import('$lib/db');
  let quota = await getTodayCloudQuota();
  quota.count++;
  if (error) quota.lastError = error;
  // 百度 error_code 17/18/19/23 = 额度/频率问题
  const quotaCodes = ['17', '18', '19', '23'];
  if (error && quotaCodes.some(c => error.includes(c))) {
    quota.quotaExhausted = true;
  }
  await db.settings.put({
    key: 'ocr_cloud_quota',
    value: JSON.stringify(quota)
  });
}

// 标记本月额度已耗尽（由百度实际报错触发）
export async function markQuotaExhausted(): Promise<void> {
  const { db } = await import('$lib/db');
  let quota = await getTodayCloudQuota();
  quota.quotaExhausted = true;
  await db.settings.put({
    key: 'ocr_cloud_quota',
    value: JSON.stringify(quota)
  });
}

// 检查本自然月云端额度是否即将耗尽（超过 80% 或已被标记耗尽）
export async function isCloudQuotaNearlyExhausted(maxMonthly: number = 1000): Promise<boolean> {
  const quota = await getTodayCloudQuota();
  if (quota.quotaExhausted) return true;
  return quota.count >= maxMonthly * 0.8;
}

// 本月额度是否已耗尽
export async function isCloudQuotaExhausted(): Promise<boolean> {
  const quota = await getTodayCloudQuota();
  return !!quota.quotaExhausted;
}

// 获取云端错误状态（用于判断是否触发降级）
export async function getCloudErrorStatus(): Promise<{ failed: boolean; lastError?: string }> {
  const { db } = await import('$lib/db');
  const stored = await db.settings.get('ocr_cloud_error');
  if (stored?.value) {
    try {
      return JSON.parse(stored.value) as { failed: boolean; lastError?: string };
    } catch {}
  }
  return { failed: false };
}

// 保存云端错误状态
export async function saveCloudError(error: string): Promise<void> {
  const { db } = await import('$lib/db');
  await db.settings.put({
    key: 'ocr_cloud_error',
    value: JSON.stringify({ failed: true, lastError: error, timestamp: Date.now() })
  });
}

// 清除云端错误状态
export async function clearCloudError(): Promise<void> {
  const { db } = await import('$lib/db');
  await db.settings.delete('ocr_cloud_error');
}

// 统一调用入口：始终走 /api/ocr 服务端代理（SvelteKit server route），
// 避免浏览器直接跨域请求 aip.baidubce.com 被 CORS 拦截。
export async function callCloudOCR(
  imageBase64: string,
  config: OCRConfig
): Promise<OCRResult> {
  const resp = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: config.provider,
      apiKey: config.apiKey,
      secretKey: config.secretKey,
      imageBase64
    })
  });

  const data = await resp.json();
  if (data.error) {
    throw new Error(data.details || data.error);
  }
  return {
    text: data.text,
    confidence: data.confidence ?? 0,
    provider: config.provider
  };
}

// 检查是否有云端配置
export async function hasCloudConfig(): Promise<boolean> {
  const config = await getOCRConfig();
  return config !== null && config.apiKey.length > 0;
}
