import { writable } from 'svelte/store';
import { getOCRConfig, saveOCRConfig, type OCRConfig } from '$lib/ocr/cloud';

// 当前 OCR 模式：local（本地）| cloud（云端）| auto（自动 fallback）| smart（智能切换）
export const ocrMode = writable<'local' | 'cloud' | 'auto' | 'smart'>('auto');

// 当前 OCR 提供商
export const ocrProvider = writable<'baidu' | 'tencent'>('baidu');

// 保存配置（包括模式）
export async function saveConfig(config: OCRConfig & { mode?: 'local' | 'cloud' | 'auto' | 'smart' }): Promise<void> {
  await saveOCRConfig(config);
  ocrProvider.set(config.provider);
  if (config.mode) {
    ocrMode.set(config.mode);
  }
}

// 清除配置
export async function clearConfig(): Promise<void> {
  const { db } = await import('$lib/db');
  await db.settings.delete('ocr_config');
  ocrProvider.set('baidu');
  ocrMode.set('auto');
}

// 加载配置
export async function loadConfig(): Promise<{ config: OCRConfig | null; mode: 'local' | 'cloud' | 'auto' | 'smart' }> {
  const config = await getOCRConfig();
  if (config) {
    ocrProvider.set(config.provider);
  }
  // 从 IndexedDB 加载模式
  const { db } = await import('$lib/db');
  const modeStored = await db.settings.get('ocr_mode');
  if (modeStored?.value) {
    try {
      const mode = JSON.parse(modeStored.value) as 'local' | 'cloud' | 'auto' | 'smart';
      ocrMode.set(mode);
    } catch {}
  }
  const currentMode = ocrMode;
  return { config, mode: currentMode };
}

// 设置模式
export async function setMode(mode: 'local' | 'cloud' | 'auto' | 'smart'): Promise<void> {
  ocrMode.set(mode);
  const { db } = await import('$lib/db');
  await db.settings.put({ key: 'ocr_mode', value: JSON.stringify(mode) });
}

// Re-export quota functions for convenience
export { hasCloudConfig, getTodayCloudQuota, isCloudQuotaNearlyExhausted } from '$lib/ocr/cloud';
