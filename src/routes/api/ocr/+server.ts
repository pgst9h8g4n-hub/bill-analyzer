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

      // 调用 OCR API
      const ocrUrl = `https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${accessToken}`;
      console.log('[API /ocr] Calling OCR API');
      
      const resp = await fetch(ocrUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `image=${encodeURIComponent(imageBase64)}`
      });

      const data = await resp.json();
      console.log('[API /ocr] OCR response:', JSON.stringify(data).substring(0, 500));

      if (data.error_code) {
        console.error('[API /ocr] OCR错误:', data.error_code, data.error_msg);
        return json({ error: 'OCR 失败', details: `${data.error_code}: ${data.error_msg}` }, { status: 400 });
      }
      
      if (!data.result || !Array.isArray(data.result)) {
        console.error('[API /ocr] 返回格式错误:', data);
        return json({ error: 'OCR 返回格式错误', details: 'result 字段不存在或不是数组' }, { status: 500 });
      }

      const text = data.result
        .map((item: { words: string }) => item.words)
        .join('\n');

      const confidence = data.result.length > 0
        ? data.result.reduce((sum: number, item: { confidence: number }) => sum + item.confidence, 0) / data.result.length
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
