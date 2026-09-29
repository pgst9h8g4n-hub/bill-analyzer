import { writable } from 'svelte/store';
import { getOCRConfig, saveOCRConfig, type OCRConfig } from '$lib/ocr/cloud';

// 当前 OCR 模式：local（本地）| cloud（云端）| auto（自动 fallback）
export const ocrMode = writable<'local' | 'cloud' | 'auto'>('auto');

// 当前 OCR 提供商
export const ocrProvider = writable<'baidu' | 'tencent'>('baidu');

// 加载保存的配置
export async function loadOCRConfig(): Promise<OCRConfig | null> {
  const config = await getOCRConfig();
  if (config) {
    ocrProvider.set(config.provider);
  }
  return config;
}

// 保存配置
export async function saveConfig(config: OCRConfig): Promise<void> {
  await saveOCRConfig(config);
  ocrProvider.set(config.provider);
}

// 清除配置
export async function clearOCRConfig(): Promise<void> {
  const { db } = await import('$lib/db');
  await db.settings.delete('ocr_config');
  ocrProvider.set('baidu');
}
