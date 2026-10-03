/**
 * 云端 OCR 客户端
 * 支持百度 OCR 和腾讯云 OCR
 * API Key 存储在 IndexedDB 中，不暴露给第三方
 */

export type OCRProvider = 'baidu' | 'tencent';
export type OCRMode = 'local' | 'cloud' | 'auto' | 'smart';
export type BaiduOCRVersion = 'accurate_basic' | 'general_basic';

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

// 本地存储的配额信息（按自然月）
interface QuotaInfo {
  period: string;  // YYYY-MM
  count: number;
  lastError?: string;
  quotaExhausted?: boolean;
}

// 双版本额度容器（高精度版 + 标准版，各自独立 1000 次/月）
export interface DualQuota {
  period: string;
  accurate: QuotaInfo;
  general: QuotaInfo;
}

// 智能模式配置（保留兼容旧代码）
export interface SmartModeConfig {
  cloudFirst: boolean;
  cloudFailLocal: boolean;
  localFailCloud: boolean;
  maxCloudAttempts: number;
  quotaKey: string;
}

export const DEFAULT_SMART_CONFIG: SmartModeConfig = {
  cloudFirst: true,
  cloudFailLocal: true,
  localFailCloud: false,
  maxCloudAttempts: 10,
  quotaKey: 'xiaoliuji_cloud_quota',
};

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

// 获取本自然月的双版本云端调用次数
export async function getTodayCloudQuota(): Promise<DualQuota> {
  const { db } = await import('$lib/db');
  const period = currentPeriod();
  const empty: DualQuota = {
    period,
    accurate: { period, count: 0, quotaExhausted: false },
    general:  { period, count: 0, quotaExhausted: false },
  };
  const stored = await db.settings.get('ocr_cloud_quota');
  if (!stored?.value) return empty;
  try {
    const raw = JSON.parse(stored.value);
    // 新双版本格式：有 accurate + general 键
    if (raw.accurate && raw.general) {
      if (raw.period === period) return raw as DualQuota;
      // 月份切换，重置计数
      const fresh: DualQuota = {
        period,
        accurate: { period, count: 0, quotaExhausted: false },
        general:  { period, count: 0, quotaExhausted: false },
      };
      await db.settings.put({ key: 'ocr_cloud_quota', value: JSON.stringify(fresh) });
      return fresh;
    }
    // 旧单版本格式（QuotaInfo）→ 迁移：归入 accurate（标准版计数归 general）
    const oldInfo: QuotaInfo = {
      period: raw.period ?? period,
      count: raw.count ?? 0,
      lastError: raw.lastError,
      quotaExhausted: raw.quotaExhausted ?? false,
    };
    const migrated: DualQuota = {
      period,
      accurate: { ...oldInfo, period },
      general:  { period, count: 0, quotaExhausted: false },
    };
    await db.settings.put({ key: 'ocr_cloud_quota', value: JSON.stringify(migrated) });
    return migrated;
  } catch {
    return empty;
  }
}

// 保存双版本额度
async function putDualQuota(d: DualQuota): Promise<void> {
  const { db } = await import('$lib/db');
  await db.settings.put({ key: 'ocr_cloud_quota', value: JSON.stringify(d) });
}

// 增加指定版本的本月云端调用计数
export async function incrementCloudQuota(version: BaiduOCRVersion, error?: string): Promise<void> {
  const dual = await getTodayCloudQuota();
  dual[version === 'accurate_basic' ? 'accurate' : 'general'].count++;
  if (error) dual[version === 'accurate_basic' ? 'accurate' : 'general'].lastError = error;
  const quotaCodes = ['17', '18', '19', '23'];
  if (error && quotaCodes.some(c => error.includes(c))) {
    dual[version === 'accurate_basic' ? 'accurate' : 'general'].quotaExhausted = true;
  }
  await putDualQuota(dual);
}

// 标记指定版本本月额度已耗尽
export async function markQuotaExhausted(version: BaiduOCRVersion): Promise<void> {
  const dual = await getTodayCloudQuota();
  dual[version === 'accurate_basic' ? 'accurate' : 'general'].quotaExhausted = true;
  await putDualQuota(dual);
}

// 指定版本本月额度是否已耗尽
export async function isCloudQuotaExhausted(version: BaiduOCRVersion): Promise<boolean> {
  const dual = await getTodayCloudQuota();
  return !!dual[version === 'accurate_basic' ? 'accurate' : 'general'].quotaExhausted;
}

// 指定版本本月额度是否即将耗尽（≥80% 或已标记耗尽）
export async function isCloudQuotaNearlyExhausted(version: BaiduOCRVersion, maxMonthly: number = 1000): Promise<boolean> {
  const dual = await getTodayCloudQuota();
  const q = dual[version === 'accurate_basic' ? 'accurate' : 'general'];
  if (q.quotaExhausted) return true;
  return q.count >= maxMonthly * 0.8;
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
// 单版本调用（保留兼容），version 可选，默认 accurate_basic
export async function callCloudOCR(
  imageBase64: string,
  config: OCRConfig,
  version: BaiduOCRVersion = 'accurate_basic'
): Promise<OCRResult> {
  const resp = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: config.provider,
      apiKey: config.apiKey,
      secretKey: config.secretKey,
      imageBase64,
      version,
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

// 级联调用：先试高精度版，额度耗尽或失败自动降级到标准版，
// 标准版也失败则返回 null（调用方使用本地 Tesseract 结果）
export async function runCloudOCRCascade(
  imageBase64: string,
  config: OCRConfig
): Promise<string | null> {
  const CLOUD_TIMEOUT_MS = 15_000; // 单次云端请求 15s 超时，避免百度 API 卡住导致批量识别永远 pending
  for (const version of ['accurate_basic', 'general_basic'] as const) {
    const q = await getTodayCloudQuota();
    const qInfo = version === 'accurate_basic' ? q.accurate : q.general;
    if (qInfo.quotaExhausted) continue;  // 本地已知耗尽，跳过该版本

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CLOUD_TIMEOUT_MS);
      const resp = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.provider,
          apiKey: config.apiKey,
          secretKey: config.secretKey,
          imageBase64,
          version,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await resp.json();
      if (data.error) {
        if (data.quotaExhausted) await markQuotaExhausted(version);
        continue;  // 降级到下一版本
      }
      await incrementCloudQuota(version);
      return data.text as string;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        console.warn('[CLOUD] OCR 超时（15s），降级下一版本');
      }
      continue;  // 网络错误/超时，降级到下一版本
    }
  }
  return null;  // 两级均失败 → 调用方使用本地结果
}

// 检查是否有云端配置
export async function hasCloudConfig(): Promise<boolean> {
  const config = await getOCRConfig();
  return config !== null && config.apiKey.length > 0;
}
