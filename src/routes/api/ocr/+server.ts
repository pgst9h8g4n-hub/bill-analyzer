import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { provider, apiKey, secretKey, imageBase64 } = body;

  console.log('[API /ocr] Provider:', provider, 'API Key:', apiKey?.substring(0, 8) + '...');

  try {
    if (provider === 'baidu') {
      // 获取 access token
      const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;
      console.log('[API /ocr] Getting token from:', tokenUrl);
      
      const tokenResp = await fetch(tokenUrl);
      const tokenData = await tokenResp.json();
      console.log('[API /ocr] Token response:', tokenData);
      
      const accessToken = tokenData.access_token;

      if (!accessToken) {
        console.error('[API /ocr] Token获取失败:', tokenData);
        return json({ error: 'Token 获取失败', details: tokenData.error_description || tokenData.error }, { status: 400 });
      }

      // 调用 OCR API（带重试，应对偶发网络超时）
      const ocrUrl = `https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${accessToken}`;
      console.log('[API /ocr] Calling OCR API');

      let data: any;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const resp = await fetch(ocrUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `image=${encodeURIComponent(imageBase64)}`,
            signal: AbortSignal.timeout(15000) // 15s 超时
          });
          data = await resp.json();
          break;
        } catch (netErr) {
          if (attempt === 0) {
            console.warn('[API /ocr] 网络超时，重试中...');
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          throw netErr;
        }
      }
      console.log('[API /ocr] OCR response:', JSON.stringify(data).substring(0, 800));

      if (data.error_code) {
        console.error('[API /ocr] OCR错误:', data.error_code, data.error_msg);
        // 百度额度/频率类错误码（17/18/19/23）→ 标记 quotaExhausted
        const isQuotaError = ['17','18','19','23'].includes(String(data.error_code));
        return json({
          error: 'OCR 失败',
          details: `${data.error_code}: ${data.error_msg}`,
          quotaExhausted: isQuotaError
        }, { status: 400 });
      }

      // 百度 OCR 返回字段是 words_result（不是 result）
      const wordsResult = data.words_result || data.result;
      if (!Array.isArray(wordsResult)) {
        console.error('[API /ocr] 返回缺少 words_result 字段:', JSON.stringify(data));
        return json({ error: 'OCR 返回格式错误', details: `缺少 words_result，实际返回: ${JSON.stringify(data).substring(0,200)}` }, { status: 500 });
      }

      const text = wordsResult
        .map((item: { words: string }) => item.words)
        .join('\n');

      const confidence = wordsResult.length > 0
        ? wordsResult.reduce((sum: number, item: { confidence?: number }) => sum + (item.confidence ?? 0), 0) / wordsResult.length
        : 0;

      console.log('[API /ocr] 成功识别，文本长度:', text.length, '置信度:', confidence);
      return json({ text, confidence, provider: 'baidu' });
    } else if (provider === 'tencent') {
      return json({ error: '腾讯云 OCR 暂不支持，请使用百度 OCR' }, { status: 400 });
    } else {
      return json({ error: '不支持的提供商' }, { status: 400 });
    }
  } catch (e: any) {
    console.error('[API /ocr] 异常:', e);
    return json({ error: '请求失败', details: e.message }, { status: 500 });
  }
};
