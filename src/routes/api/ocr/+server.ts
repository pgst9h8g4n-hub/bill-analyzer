import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { provider, apiKey, secretKey, imageBase64 } = body;

  try {
    if (provider === 'baidu') {
      // 获取 access token
      const tokenResp = await fetch(
        `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
      );
      const tokenData = await tokenResp.json();
      const accessToken = tokenData.access_token;

      if (!accessToken) {
        return json({ error: 'Token 获取失败', details: tokenData }, { status: 400 });
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
        return json({ error: 'OCR 失败', details: data.error_msg }, { status: 400 });
      }

      const text = data.result
        .map((item: { words: string }) => item.words)
        .join('\n');

      const confidence = data.result.length > 0
        ? data.result.reduce((sum: number, item: { confidence: number }) => sum + item.confidence, 0) / data.result.length
        : 0;

      return json({ text, confidence, provider: 'baidu' });
    } else if (provider === 'tencent') {
      // 腾讯云 OCR 需要完整签名，这里暂不支持
      return json({ error: '腾讯云 OCR 暂不支持，请使用百度 OCR' }, { status: 400 });
    } else {
      return json({ error: '不支持的提供商' }, { status: 400 });
    }
  } catch (e: any) {
    return json({ error: '请求失败', details: e.message }, { status: 500 });
  }
};
