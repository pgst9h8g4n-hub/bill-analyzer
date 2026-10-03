import { parseAlipayCsv } from './alipay';
import { parseWechatXlsx } from './wechat';
import { parseDouyinPdf } from './douyin';
import type { ParsedRecord } from './types';

export type SourceKind = 'alipay' | 'wechat' | 'douyin' | 'unknown';

// 按文件名/扩展名判断来源，选对应解析器
export function detectSource(file: File): SourceKind {
  const name = file.name.toLowerCase();
  if (name.includes('支付宝') || name.endsWith('.csv')) return 'alipay';
  if (name.includes('微信') || name.endsWith('.xlsx')) return 'wechat';
  if (name.endsWith('.pdf') || name.includes('抖音') || name.startsWith('dy_')) return 'douyin';
  return 'unknown';
}

export async function parseBillFile(file: File): Promise<{ source: SourceKind; records: ParsedRecord[] }> {
  const source = detectSource(file);
  if (source === 'alipay') {
    return { source, records: await parseAlipayCsv(file) };
  }
  if (source === 'wechat') {
    return { source, records: await parseWechatXlsx(file) };
  }
  if (source === 'douyin') {
    return { source, records: await parseDouyinPdf(file) };
  }
  throw new Error('无法识别账单来源，请上传支付宝 CSV、微信 xlsx 或抖音 PDF 文件');
}
