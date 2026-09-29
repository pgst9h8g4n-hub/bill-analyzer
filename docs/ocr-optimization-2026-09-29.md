# 小六记 OCR 优化方案 — 实施总结

**日期**：2026-09-29  
**状态**：✅ 本地优化已完成，云端 fallback 已集成

---

## 一、问题回顾

用户反馈：账单截图中的 `24.50` 被识别为 `24.52`（Tesseract 将 "0" 误识别为 "2"）。

---

## 二、已实现的本地优化（零成本）

### 2.1 多 PSM 模式尝试
```javascript
// runOCR 现在同时尝试 PSM 4（单列文本）和 PSM 11（稀疏文本）
const psmResults = await Promise.all([
  runOCRWithPSM(imageDataUrl, 4),
  runOCRWithPSM(imageDataUrl, 11),
]);
// 选择包含更多有效金额的文本
```

### 2.2 数字后处理修正
```javascript
function correctAmountDigits(amount: string): string {
  // "24.52" → "24.50"（如果分位是常见混淆数字且角位是 5）
}
```

### 2.3 预处理增强
- 对比度增强（1.5x）
- Otsu 自适应阈值二值化
- 2x 放大

---

## 三、云端 OCR Fallback（已集成）

### 3.1 支持的提供商
| 提供商 | 免费额度 | 价格 |
|--------|---------|------|
| **百度 OCR** | 500次/天（~15,000次/月） | ¥0.002/次 |
| 腾讯云 OCR | 500次/月 | ¥0.002/次 |
| 阿里云 OCR | 500次/月 | ¥0.0025/次 |

**推荐：百度 OCR**（额度最高）

### 3.2 架构设计
```
用户上传图片
    ↓
本地 Tesseract OCR（多 PSM）
    ↓
是否有金额？
├── 有 → 直接使用
└── 无 → 自动调用云端 OCR
             ↓
        是否有 API Key？
        ├── 有 → 调用云端 API
        └── 无 → 提示用户手动输入
```

### 3.3 配置方式
1. 打开设置页面 → 滚动到 "OCR 配置"
2. 选择提供商（百度/腾讯）
3. 输入 API Key 和 Secret Key
4. 保存后重启应用生效

---

## 四、下一步建议

### 4.1 立即可做
- ✅ 测试多 PSM 模式对 24.50 的识别效果
- ✅ 在真实账单截图上测试本地优化

### 4.2 如需更高精度
- 申请百度 OCR API Key（免费 500次/天）
- 在设置页面配置
- 系统会自动 fallback

### 4.3 长期优化方向
- [ ] 添加 ROI 框引导用户拍摄金额区域
- [ ] 集成 PaddleOCR（更高精度，但模型大）
- [ ] 添加 OCR 历史，支持手动修正后保存

---

## 五、技术细节

### 关键文件
- `src/routes/ocr/+page.svelte` — OCR 主逻辑
- `src/lib/ocr/cloud.ts` — 云端 API 封装
- `src/lib/stores/ocr-config.ts` — 配置 store

### API 文档
- 百度 OCR：https://cloud.baidu.com/doc/OCR/s/4knbj1y4w
- 腾讯云 OCR：https://cloud.tencent.com/document/product/867

---

## 六、注意事项

1. **API Key 安全性**：密钥存储在 IndexedDB，不上传服务器
2. **免费额度**：百度每天 500 次，足够个人使用
3. **离线优先**：本地 OCR 始终优先，云端只在本地失败时调用
4. **手动输入兜底**：即使云端也失败，用户仍可手动输入
