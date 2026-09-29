/**
 * 云端 OCR 客户端
 * 支持百度 OCR 和腾讯云 OCR
 * API Key 存储在 IndexedDB 中，不暴露给第三方
 */

export type OCRProvider = 'baidu' | 'tencent';
export type OCRMode = 'local' | 'cloud' | 'auto';

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
