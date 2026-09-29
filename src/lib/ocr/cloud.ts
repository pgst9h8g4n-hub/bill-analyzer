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

// 本地存储的配额信息
interface QuotaInfo {
  date: string;  // YYYY-MM-DD
  count: number;
  lastError?: string;
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

// 获取今日云端调用次数
export async function getTodayCloudQuota(): Promise<QuotaInfo> {
  const { db } = await import('$lib/db');
  const today = new Date().toISOString().slice(0, 10);
  const stored = await db.settings.get('ocr_cloud_quota');
  if (stored?.value) {
    try {
      const quota: QuotaInfo = JSON.parse(stored.value);
      // 如果是今天的记录，返回；否则重置
      if (quota.date === today) {
        return quota;
      }
    } catch {}
  }
  return { date: today, count: 0 };
}

// 增加今日云端调用计数
export async function incrementCloudQuota(error?: string): Promise<void> {
  const { db } = await import('$lib/db');
  const today = new Date().toISOString().slice(0, 10);
  let quota = await getTodayCloudQuota();
  quota.count++;
  if (error) quota.lastError = error;
  await db.settings.put({
    key: 'ocr_cloud_quota',
    value: JSON.stringify(quota)
  });
}

// 检查今日云端额度是否即将耗尽（超过 80%）
export async function isCloudQuotaNearlyExhausted(maxDaily: number = 500): Promise<boolean> {
  const quota = await getTodayCloudQuota();
  return quota.count >= maxDaily * 0.8;
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

// 百度 OCR API
async function callBaiduOCR(imageBase64: string, apiKey: string, secretKey: string): Promise<OCRResult> {
  // 获取 access token
  const tokenResp = await fetch(
    `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
  );
  const tokenData = await tokenResp.json();
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    throw new Error('百度 OCR Token 获取失败');
  }

  // 调用 OCR API
  const resp = await fetch(
    `https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${accessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `image=${encodeURIComponent(imageBase64)}`
    }
  );

  const data = await resp.json();
  if (data.error_code) {
    throw new Error(`百度 OCR 错误: ${data.error_msg}`);
  }

  const text = data.result
    .map((item: { words: string }) => item.words)
    .join('\n');

  return {
    text,
    confidence: data.result.reduce((sum: number, item: { confidence: number }) => sum + item.confidence, 0) / data.result.length,
    provider: 'baidu'
  };
}

// 腾讯云 OCR API
async function callTencentOCR(imageBase64: string, apiKey: string, secretKey: string): Promise<OCRResult> {
  // 腾讯云 OCR 需要签名，这里简化处理（实际项目需要 HMAC-SHA256 签名）
  // 使用通用 OCR API
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = Math.random().toString(36).substring(2);

  const resp = await fetch('https://ocr.tencentcloudapi.com/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TC-Action': 'GeneralBasicOCR',
      'X-TC-Version': '2018-11-19',
      'X-TC-Region': 'ap-beijing',
      'X-TC-Timestamp': timestamp.toString(),
      'X-TC-Nonce': nonce,
      'Authorization': `TC3-HMAC-SHA256 Credential=${apiKey}/${timestamp}/ocr/tc3_request_hex` // 简化签名
    },
    body: JSON.stringify({
      ImageUrl: `data:image/png;base64,${imageBase64}`
    })
  });

  const data = await resp.json();
  if (data.Response?.Error) {
    throw new Error(`腾讯云 OCR 错误: ${data.Response.Error.Message}`);
  }

  const text = data.Response?.TextDetections
    ?.map((item: { DetectedText: string }) => item.DetectedText)
    .join('\n') || '';

  return {
    text,
    confidence: 0.9, // 腾讯 API 不直接返回置信度
    provider: 'tencent'
  };
}

// 统一调用入口
export async function callCloudOCR(
  imageBase64: string,
  config: OCRConfig
): Promise<OCRResult> {
  if (config.provider === 'baidu') {
    return callBaiduOCR(imageBase64, config.apiKey, config.secretKey);
  } else if (config.provider === 'tencent') {
    return callTencentOCR(imageBase64, config.apiKey, config.secretKey);
  }
  throw new Error('不支持的 OCR 提供商');
}

// 检查是否有云端配置
export async function hasCloudConfig(): Promise<boolean> {
  const config = await getOCRConfig();
  return config !== null && config.apiKey.length > 0;
}
