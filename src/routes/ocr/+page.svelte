<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { createExpense } from '$lib/db/expenses';
  import { getCategories, getUnsortedCategoryId, UNSORTED_CATEGORY_NAME } from '$lib/db';
  import { centsToYuan } from '$lib/utils/format';
  import type { Category } from '$lib/db';
  import { currentUserId, currentLedgerId } from '$lib/session';
  import { createWorker, type Worker as TesseractWorker } from 'tesseract.js';
  import { get } from 'svelte/store';
  import { ocrMode, ocrProvider, loadConfig, hasCloudConfig, getTodayCloudQuota, isCloudQuotaNearlyExhausted } from '$lib/stores/ocr-config';
  import { callCloudOCR, runCloudOCRCascade, type OCRConfig, type DualQuota, getSmartModeConfig } from '$lib/ocr/cloud';
  import { MERCHANT_CATEGORY, CATEGORY_ALIASES } from '$lib/parse/category-keywords';

  let ocrAmount = '';
  let ocrTime = new Date().toISOString().slice(0, 16);
  let ocrMerchant = '';
  let selectedCategory = 0;
  let detectedCatName = ''; // OCR 检测到的大类名，分类加载完后回填
  let remark = '';
  let isRefund = false;
  let loading = false;
  let success = false;
  let successCount = 0; // 批量成功记录数
  let batchAllDone = false;
  // 云端额度（双版本）
  let cloudQuota: DualQuota = { period: '', accurate: { period: '', count: 0, quotaExhausted: false }, general: { period: '', count: 0, quotaExhausted: false } };
  // 响应式剩余次数
  $: cloudAccurateRemaining = 1000 - cloudQuota.accurate.count;
  $: cloudGeneralRemaining = 1000 - cloudQuota.general.count;
  let errorMsg = '';
  let ocrProgress = 0;
  let ocrRunning = false;
  let ocrError = '';
  // 云端 OCR 相关状态
  let cloudOCRInProgress = false;
  let cloudOCRError = '';
  let cloudHasConfig = false;
  let categories: Category[] = [];
  let unsortedCategoryId = 0; // 待整理兜底分类 id，分类加载后回填
  let selectedImage: string | null = null;
  let cameraInput: HTMLInputElement | undefined;
  let batchInput: HTMLInputElement | undefined;

  // ── 批量录入 ──────────────────────────────────────────────────────────
  interface BatchItem {
    id: string;
    imageDataUrl: string;
    ocrText: string;
    amount: string;
    merchant: string;
    time: string;
    categoryId: number;
    rawOcrText: string;
    ocrDone: boolean;
    ocrBusy: boolean;
    categoryOptions: Category[];
    saved: boolean;
    // 识别状态：ok = 金额+商户都识别到；partial = 只有部分字段；failed = 基本没识别到
    ocrStatus: 'ok' | 'partial' | 'failed';
    expandRaw: boolean;
    // 识别建议值（用于"一键应用修正"）
    suggestAmount: string;
    suggestMerchant: string;
    suggestTime: string;
  }
  let batchItems: BatchItem[] = [];
  let batchBusy = false;

  // 识别填充 item.amount/merchant/time 后，直接写对应 DOM input 的 .value。
  // 用 setTimeout(0) 确保在 Svelte 完成本次 batchItems=[...] 重渲染之后执行，避免被重置。
  // 识别填充 item.amount/merchant/time 后，直接写对应 DOM input 的 .value。
  // Svelte 4 风格下 input 的 value 属性只在节点创建时设一次，之后嵌套属性变更
  // 不会同步到 DOM。这里手动写 .value。三重保险：同步写一次 + 双 rAF 再写一次，
  // 防止后续重渲染把 .value 重置回旧的初始值。
  function writeInputs(item: BatchItem) {
    const doWrite = () => {
      const card = document.querySelector(`[data-item-id="${item.id}"]`);
      if (!card) return;
      const a = card.querySelector('input[data-field="amount"]') as HTMLInputElement | null;
      const m = card.querySelector('input[data-field="merchant"]') as HTMLInputElement | null;
      const t = card.querySelector('input[data-field="time"]') as HTMLInputElement | null;
      if (a && a.value !== item.amount) a.value = item.amount;
      if (m && m.value !== item.merchant) m.value = item.merchant;
      if (t && t.value !== item.time) t.value = item.time;
    };
    doWrite(); // 同步写一次
    requestAnimationFrame(() => requestAnimationFrame(doWrite)); // 两帧后再写，对抗重渲染重置
  }

  // ── 批量 OCR FIFO 队列（串行处理，避免 worker 竞态 + 云端并发） ──────
  let ocrQueue: BatchItem[] = [];
  let ocrQueueRunning = false;

  function triggerBatchSelect() { batchInput?.click(); }

  function handleBatchSelect(e: Event) {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    if (files.length === 0) return;
    (e.target as HTMLInputElement).value = '';
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        batchItems = [...batchItems, {
          id,
          imageDataUrl: dataUrl,
          ocrText: '',
          amount: '',
          merchant: '',
          time: new Date().toISOString().slice(0, 16),
          categoryId: 0,
          rawOcrText: '',
          ocrDone: false,
          ocrBusy: true,   // 立即标记为"识别中"，避免在 runBatchItemOCR 跑起来前闪现"识别失败"
          categoryOptions: categories,
          saved: false,
          ocrStatus: 'partial',  // 初始为 partial（等待识别），而非 failed
          expandRaw: false,
          suggestAmount: '',
          suggestMerchant: '',
          suggestTime: '',
        }];
        // 入队，等待串行处理
        const item = batchItems[batchItems.length - 1];
        if (item) enqueueOCR(item);
      };
      reader.readAsDataURL(file);
    }
  }

  function enqueueOCR(item: BatchItem) {
    ocrQueue.push(item);
    if (!ocrQueueRunning) pumpOCRQueue();
  }

  async function pumpOCRQueue() {
    ocrQueueRunning = true;
    while (ocrQueue.length > 0) {
      const item = ocrQueue.shift()!;
      await runBatchItemOCR(item);
    }
    ocrQueueRunning = false;
  }

  async function runBatchItemOCR(item: BatchItem) {
    item.ocrBusy = true;
    ocrError = ''; // 重置上一次识别（单张/批量）留下的错误状态，避免污染本次判断
    try {
      const fullText = await runOCRAndGetText(item.imageDataUrl);
      item.ocrText = fullText;
      console.log('[BATCH OCR] 识别结果长度=', fullText.length, '前100字=', fullText.slice(0, 100));
      if (fullText) {
        const m = detectMerchant(fullText);
        if (m) item.merchant = m;
        const t = parseTime(fullText);
        if (t) item.time = t;
        const a = pickPaidAmount(collectClassifiedAmounts(fullText));
        if (a !== null) item.amount = String(a);
        item.rawOcrText = fullText;
        console.log('[BATCH OCR] 解析结果: amount=', item.amount, 'merchant=', item.merchant, 'time=', item.time);

        // 设置识别状态和建议值
        const hasAmount = item.amount !== '';
        const hasMerchant = item.merchant !== '';
        if (hasAmount && hasMerchant) {
          item.ocrStatus = 'ok';
        } else if (hasAmount || hasMerchant) {
          item.ocrStatus = 'partial';
        } else {
          item.ocrStatus = 'failed';
          item.expandRaw = true; // 失败时自动展开原始文本
        }

        // 生成建议值（即使当前已有值，也存一份供"应用建议"按钮使用）
        item.suggestAmount = item.amount;
        item.suggestMerchant = item.merchant;
        item.suggestTime = item.time;

        // 金额可疑修正（.52/.58/.59 很可能是 .50）
        if (item.amount) {
          const corrected = correctAmountDigits(item.amount);
          if (corrected !== item.amount) {
            item.suggestAmount = corrected;
          }
        }
      } else {
        item.ocrStatus = 'failed';
        item.expandRaw = true;
      }

      // Auto-pick category based on detected name
      // 不阻塞识别结果展示：getCategories 失败/卡住也不影响金额/商户已填入
      const catName = detectCategoryName(fullText || '', item.merchant);
      // 分类加载加 3s 超时兜底，避免 IndexedDB 查询 pending 时卡死整个识别流程
      const catTimeout: Promise<Category[]> = new Promise(resolve =>
        setTimeout(() => resolve([]), 3000));
      try {
        item.categoryOptions = await Promise.race([getCategories(ledgerId), catTimeout]);
      } catch {
        item.categoryOptions = [];
      }
      if (catName && item.categoryOptions.length > 0) {
        const exact = item.categoryOptions.find(c => c.name === catName);
        if (exact) item.categoryId = exact.id;
        else {
          const fuzzy = item.categoryOptions.find(c => catName.includes(c.name) || c.name.includes(catName));
          if (fuzzy) item.categoryId = fuzzy.id;
        }
      }
      item.ocrDone = true;
      // 重渲染后直接写 DOM .value，绕开 Svelte 嵌套属性不响应问题
      batchItems = [...batchItems];
      writeInputs(item);
    } catch {
      item.ocrDone = true;
      item.ocrStatus = 'failed';
      item.expandRaw = true;
      batchItems = [...batchItems];
    } finally {
      item.ocrBusy = false;
    }
  }

  function applySuggestion(item: BatchItem) {
    if (item.suggestAmount) item.amount = item.suggestAmount;
    if (item.suggestMerchant) item.merchant = item.suggestMerchant;
    if (item.suggestTime) item.time = item.suggestTime;
    // 更新状态
    const hasAmount = item.amount !== '';
    const hasMerchant = item.merchant !== '';
    if (hasAmount && hasMerchant) item.ocrStatus = 'ok';
    else if (hasAmount || hasMerchant) item.ocrStatus = 'partial';
    batchItems = [...batchItems];
    writeInputs(item);
  }

  // runOCR without the progress/running state side-effects (batch mode)
  async function runOCRAndGetText(imageDataUrl: string): Promise<string> {
    // 本地 Tesseract（PSM4+PSM11）对小票识别率极低，仅作为兜底。
    // 优先走云端级联（accurate → general），云端成功则完全覆盖本地结果。
    ocrProgress = 0;
    const amountCount = (t: string) => (t.match(/\d+\.\d{2}/g) || []).length;
    let local = await runOCRWithPSM(imageDataUrl, 4).catch(() => '');
    console.log('[BATCH OCR] PSM4 结果长度=', local.length, '前50字=', local.slice(0, 50));
    if (amountCount(local) === 0) {
      const psm11 = await runOCRWithPSM(imageDataUrl, 11).catch(() => '');
      console.log('[BATCH OCR] PSM11 结果长度=', psm11.length, '前50字=', psm11.slice(0, 50));
      if (amountCount(psm11) > amountCount(local)) local = psm11;
    }

    let bestText = local;

    // 云端级联：成功则完全覆盖本地（云端准确率高得多）
    if ($ocrMode !== 'local') {
      try {
        const cloud = await import('$lib/ocr/cloud');
        const hasConfig = await cloud.hasCloudConfig();
        console.log('[BATCH OCR] hasCloudConfig=', hasConfig, 'ocrMode=', $ocrMode);
        if (hasConfig) {
          cloudHasConfig = hasConfig;
          const config = await cloud.getOCRConfig();
          if (config) {
            const imageBase64 = imageDataUrl.split(',')[1];
            const cloudText = await cloud.runCloudOCRCascade(imageBase64, config);
            console.log('[BATCH OCR] 云端级联结果长度=', cloudText?.length ?? 'null', '前100字=', (cloudText||'').slice(0, 100));
            if (cloudText) {
              bestText = cloudText;  // 云端成功 → 完全用云端结果
              cloudQuota = await cloud.getTodayCloudQuota();
            }
            // 云端失败（null）→ 保留本地结果（bestText 不变）
          }
        }
      } catch (e) {
        console.error('[BATCH OCR] 云端级联异常:', e);
        // 异常时保留本地结果
      }
    }

    ocrProgress = 0;
    return bestText;
  }

  function removeBatchItem(id: string) {
    batchItems = batchItems.filter(i => i.id !== id);
  }

  function clearBatch() {
    batchItems = [];
  }

  async function saveSingleBatchItem(item: BatchItem) {
    if (!item.amount || isNaN(parseFloat(item.amount))) return;
    const { createExpense } = await import('$lib/db/expenses');
    // 空商户兜底：识别/手填都没商户时，落到"待整理"分类，方便事后归类
    let catId = item.categoryId;
    if (!item.merchant.trim() && unsortedCategoryId > 0) catId = unsortedCategoryId;
    await createExpense(ledgerId, {
      userId,
      amount: item.amount,
      date: item.time || new Date().toISOString(),
      categoryId: catId,
      merchant: item.merchant || undefined,
      isRefund: false,
    });
    item.saved = true;
    batchItems = [...batchItems];
  }

  async function saveAllBatchItems() {
    if (batchBusy) return;
    batchBusy = true;
    const valid = batchItems.filter(i => i.amount && !isNaN(parseFloat(i.amount)) && !i.saved);
    try {
      for (const item of valid) {
        await saveSingleBatchItem(item);
      }
      batchAllDone = true;
      successCount = valid.length;
    } finally {
      batchBusy = false;
    }
  }
  let previousOcrResult: string | null = null;
  let worker: TesseractWorker | null = null;
  // worker 串行化锁：initWorker 会 terminate 旧 worker，
  // 并发调用（如 PSM 4 + PSM 11 的 Promise.all）会互相杀掉对方的 worker，
  // 导致 "Could not establish connection. Receiving end does not exist."
  let workerLock = Promise.resolve();

  let userId = 0;
  let ledgerId = 0;

  // 分类关键词表 MERCHANT_CATEGORY / CATEGORY_ALIASES 已抽到 $lib/parse/category-keywords 共享（与账单导入复用）

  // 合法 Tesseract LSTM 参数白名单，过滤掉不支持的键以减少噪音警告
  const VALID_TESS_PARAMS = new Set([
    'tessedit_pageseg_mode',
    'tessedit_char_whitelist',
    'tessedit_char_blacklist',
    'preserve_interword_spaces',
    'classify_bln_numeric_mode',
    'min_line_height',
    'textord_tabfind_stretch_factor',
  ]);

  async function initWorker(psm = 4, whitelist = '') {
    // worker 只创建一次，切换 PSM 用 setParameters 而不是 terminate+重建。
    // 反复 terminate+createWorker 会互杀 worker（wasm 实例没释放），导致 recognize 永远 pending。
    if (!worker) {
      try {
        worker = await createWorker('chi_sim+eng', 3, {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              ocrProgress = Math.round(m.progress * 100);
            }
          },
          langPath: '/',
          corePath: '/tesseract-core-lstm.wasm.js',
        });
      } catch (e: any) {
        console.error('Worker init error:', e);
        ocrError = 'OCR 库加载失败，请检查网络后重试';
        return;
      }
    }
    // 只设置 LSTM 模式支持的参数（PSM / whitelist），worker 实例复用
    try {
      const params: Record<string, unknown> = {
        tessedit_pageseg_mode: psm as unknown as Tesseract.PSM,
      };
      if (whitelist) params['tessedit_char_whitelist'] = whitelist;
      await worker.setParameters(params);
    } catch { /* setParameters 失败不影响 recognize */ }
  }

  // Parse a single number-whitelist OCR strip → clean numeric value (or null).
  // The strip OCR is constrained to digits/¥/-/., so noise is minimal.
  function parseAmountFromOCR(text: string): number | null {
    if (!text) return null;
    // 只保留数字、货币符号、逗号、小数点、减号（负号/连字符）
    const clean = text.replace(/[^\d¥￥,.\-−]/g, '');
    // Pattern 1: 带小数的标准金额 — 如 "-7.90", "¥2,390.54", "149.34"
    const m = clean.match(/([+\-−])?\s*[\¥￥]?\s*(\d[\d,]*\.\d{2})/);
    if (m) {
      let val = parseFloat(m[2].replace(/,/g, ''));
      if (!isNaN(val) && val >= 0.01 && val <= 999999) return Math.abs(val);
    }
    // Pattern 2: 纯整数（金额通常 ≥ 0.01 元）
    const m2 = clean.match(/(\d{1,7})\s*$/);
    if (m2) {
      const val = parseFloat(m2[1]);
      if (!isNaN(val) && val >= 1 && val <= 999999) return val;
    }
    // Pattern 3: 千分位数字无小数点 — 如 "2390" → 2390
    const m3 = clean.match(/(\d{1,3}(?:,\d{3})+)/);
    if (m3) {
      const val = parseFloat(m3[1].replace(/,/g, ''));
      if (!isNaN(val) && val >= 1 && val <= 999999) return val;
    }
    return null;
  }

  // 后处理：修正 Tesseract 常见数字混淆
  // 0↔6↔8, 1↔7, 2↔3, 4↔9, 5↔6 等
  function correctAmountDigits(amount: string): string {
    // 金额常见模式：X.XX 或 XX.XX 或 XXX.XX
    // 修正策略：如果小数部分以 2/3/5/6/8/9 结尾，尝试映射到 0
    // 因为 "24.52" 很可能是 "24.50"（Tesseract 常把 0 识别为 2/5/6/8/9）
    const corrected = amount.replace(/\.(\d)(\d)$/, (match, d1, d2) => {
      // 角分位常见混淆映射
      const map: Record<string, string> = {
        '2': '0', '3': '0', '5': '0', '6': '0', '8': '0', '9': '0',
        '4': '0', '7': '0', // 较少见但可能
      };
      // 如果分位是 2/3/5/6/8/9，且角位是 5，极可能是 .50
      if (map[d2] && d1 === '5') return `.5${map[d2]}`;
      // 如果分位是常见混淆，保持原样（让用户手动修改）
      return match;
    });
    return corrected;
  }

  // Classify every amount in the text by its surrounding label:
  // 实付/应付 = actually paid; 原价/订单金额/交易金额 = list price; 优惠/立减 = discount.
  // fulltextBig = ¥ 前缀的大字实付（页面最醒目的那个数，通常是实付）。
  // Handles thousands commas (2,390.63 → 2390.63).
  function collectClassifiedAmounts(text: string): { paid: number[]; list: number[]; discount: number[]; bare: number[]; fulltextBig: number[]; negPaid: number[] } {
    const out = { paid: [] as number[], list: [] as number[], discount: [] as number[], bare: [] as number[], fulltextBig: [] as number[], negPaid: [] as number[] };
    const valid = (v: number) => !isNaN(v) && v >= 0.01 && v <= 999999;
    const push = (arr: number[], m: RegExpExecArray | RegExpMatchArray, group: number) => {
      const v = parseFloat(m[group].replace(/,/g, ''));
      if (valid(v)) arr.push(v);
    };
    for (const line of text.split(/\n/)) {
      if (/^(交易单号|商户单号|卡号)/.test(line.trim())) continue;
      // 路径一：标签后紧跟 ¥/￥/− 符号 — 覆盖"订单金额 ¥15.80"、"实缴 ¥200"等
      for (const m of line.matchAll(/(实付|应付|应扣|实收|实缴|实退|订单金额|交易金额|应还|应缴|合计)\s*[¥￥\-−]?\s*([\d,]+(?:\.?\d{0,2}))\b/g)) push(out.paid, m, 2);
      // 路径二：标签+可选"金额"+冒号 — 覆盖"实缴金额：¥200"、"合计：32.00"等
      for (const m of line.matchAll(/(实付|应付|应扣|实收|实缴|实退|应缴|应还|合计)(?:金额)?\s*[：:]\s*([\d,]+(?:\.?\d{0,2}))\b/g)) push(out.paid, m, 2);
      // 路径三：标签+金额+符号 — 覆盖"实缴金额    ¥200"等
      for (const m of line.matchAll(/(实付|应付|应扣|实收|实缴|实退|应缴|应还|合计)金额\s*[¥￥\-−]?\s*([\d,]+(?:\.?\d{0,2}))\b/g)) push(out.paid, m, 2);
      // 划线原价 / 参考价（被划掉的价格，非实际支付）
      for (const m of line.matchAll(/(原价|零售价|门市价|建议价|市场价)\s*[¥￥\-−]?\s*([\d,]+\.?\d{0,2})\b/g)) push(out.list, m, 2);
      for (const m of line.matchAll(/(优惠|立减|减金|已享|省|已减|满\s*\d+\s*减|红包)\s*[-−]?\s*[¥￥]?\s*([\d,]+(?:\.?\d{0,2}))\b/g)) push(out.discount, m, 2);
    }
    // Standalone ¥ amounts not caught above → bare paid candidates (with optional thousands comma)
    for (const m of text.matchAll(/(?<![¥\d.,])([¥￥]\s*[\d,]+\.?\d{0,2})/g)) {
      const v = parseFloat(m[1].replace(/[¥￥\s]/g, '').replace(/,/g, ''));
      if (valid(v)) out.bare.push(v);
      // ¥ 前缀金额 = 全页大字实付（最醒目那个数）
      out.fulltextBig.push(v);
    }
    // 负号金额（−149.34）= 支出实付，最醒目 → 单独归 negPaid（最高优先级）
    for (const m of text.matchAll(/(?:^|\s)([−\-]\s*\d{1,3}(?:,\d{3})*\.?\d{0,2})\b(?!\s*元)/g)) {
      const v = Math.abs(parseFloat(m[1].replace(/[−\-\s]/g, '').replace(/,/g, '')));
      if (valid(v)) out.negPaid.push(v);
    }
    // Standalone decimals WITH optional thousands comma (skip times), e.g. "2,390.63"
    // Also catch small decimals like "32.00" when preceded by non-digit context
    for (const m of text.matchAll(/(?<![\d.,])(\d{1,3}(?:,\d{3})+\.?\d{0,2}|\d{1,7}\.\d{2})(?!\d)/g)) {
      const before = text.substring(0, m.index!).trim();
      if (/[:：]$/.test(before)) continue;
      const v = parseFloat(m[1].replace(/,/g, ''));
      if (valid(v)) out.bare.push(v);
    }
    // Catch small decimals not matched above (no thousands comma, preceded by ¥/￥/：/label chars)
    for (const m of text.matchAll(/(?:[¥￥]|^|[：:]\s*)(\d{1,3}\.\d{2})\b/g)) {
      const v = parseFloat(m[1]);
      if (valid(v) && !out.bare.includes(v) && !out.fulltextBig.includes(v)) out.bare.push(v);
    }
    // Catch plain integers followed by 元 — e.g. "¥100元" or "100元"
    // 匹配"¥100元"、" 56元"等整数金额（用负向查找替代 \b，避免中文字符边界失效）
    for (const m of text.matchAll(/(?:[¥￥]|\s)(\d{1,6})\s*元(?!\d)/g)) {
      const v = parseFloat(m[1]);
      if (valid(v) && !out.bare.includes(v) && !out.fulltextBig.includes(v)) out.bare.push(v);
    }
    // 跨行标签（原价/优惠 与 ¥ 金额被 OCR 拆成相邻两行）补进 list/discount 池
    mergeCrossLineLabels(text, out);
    out.paid = [...new Set(out.paid)];
    out.list = [...new Set(out.list)];
    out.discount = [...new Set(out.discount)];
    out.bare = [...new Set(out.bare)];
    out.fulltextBig = [...new Set(out.fulltextBig)];
    out.negPaid = [...new Set(out.negPaid)];
    return out;
  }

  // 跨行匹配：OCR 常把"原价"和"￥150.00"拆成相邻两行，逐行正则抓不到。
  // 对整段文本找 原价/优惠 等标签后 60 字符内的 ¥ 金额，归入对应池（合并进 out）。
  function mergeCrossLineLabels(text: string, out: { list: number[]; discount: number[] }) {
    const valid = (v: number) => !isNaN(v) && v >= 0.01 && v <= 999999;
    const amtNear = (label: RegExp, pool: number[]) => {
      for (const m of text.matchAll(label)) {
        const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 60);
        const am = after.match(/[¥￥]\s*([\d,]+(?:\.\d{0,2})?)/);
        if (am) {
          const v = parseFloat(am[1].replace(/,/g, ''));
          if (valid(v)) pool.push(v);
        }
      }
    };
    amtNear(/原价|零售价|门市价|建议价|市场价/g, out.list);
    amtNear(/优惠|立减|减金|已享|已减/g, out.discount);
  }

  // Decide the actual paid amount.
  // `biggestCrop` = the value OCR'd from the TALLEST crop line (the page's biggest
  // font = the 实付, e.g. 抖音 -7.90 / 违章 -149.34). It wins over fulltext labels
  // because the big 实付 font is what Tesseract reliably reads; the 原价/优惠 labels
  // in the small-font text are often mangled.
  //
  // `cleanTextMax` = max of all text-parsed amounts (paid/fulltextBig/list/discount)
  //   BEFORE crops are added to classified.bare. Used for the sanity guard only.
  //   This prevents crop pollution from bypassing the guard.
  function pickPaidAmount(
    classified: { paid: number[]; list: number[]; discount: number[]; bare: number[]; fulltextBig: number[]; negPaid: number[] },
    biggestCrop: number | null = null,
    cleanTextMax: number = 0
  ): number | null {
    // 最高优先：带负号的大字金额（支付类截图里 "-149.34" 就是优惠后实付）
    // 取 negPaid 里的最大值（若有多笔，最大那笔通常就是本单实付）
    if (classified.negPaid.length > 0) {
      return Math.max(...classified.negPaid);
    }
    // Sanity guard: if biggestCrop is absurdly larger than clean text amounts, ignore it
    if (biggestCrop !== null) {
      const isReasonable = cleanTextMax === 0 || biggestCrop <= cleanTextMax * 10 || biggestCrop <= 999;
      if (!isReasonable) {
        console.log('[OCR] biggestCrop', biggestCrop, 'rejected (cleanTextMax=', cleanTextMax + ')');
        biggestCrop = null;
      } else {
        return biggestCrop;
      }
    }
    // 2. Explicit 实付/应付/实缴 label
    if (classified.paid.length > 0) {
      // 有优惠折扣时，paid 池包含原价和折后价 → 取最小值（折后价）
      // 无折扣时，paid 池只有实付 → 取最大值即可
      if (classified.discount.length > 0 || classified.list.length > 0) {
        return Math.min(...classified.paid);
      }
      return Math.max(...classified.paid);
    }
    // 3. 全页 ¥ 大字实付（带 ¥ 或负号的最醒目数字）
    const bigFull = classified.fulltextBig;
    if (bigFull.length > 0) {
      if (classified.list.length > 0 && classified.discount.length > 0) {
        const calc = Math.max(...classified.list) - Math.max(...classified.discount);
        if (calc > 0.01) return calc;
      }
      return Math.max(...bigFull);
    }
    // 4. 原价 − 优惠
    if (classified.list.length > 0 && classified.discount.length > 0) {
      const result = Math.max(...classified.list) - Math.max(...classified.discount);
      if (result > 0.01) return result;
      return Math.max(...classified.discount);
    }
    // 5. 原价 alone → 视为实付（无优惠）
    if (classified.list.length > 0) return Math.max(...classified.list);
    // 6. Crop 裸数字兜底
    const pool = [...classified.bare, ...classified.discount].sort((a, b) => b - a);
    if (pool.length === 0) return null;
    const maxV = pool[0];
    const hasClearStrikethrough = pool.length >= 2 && pool[pool.length - 1] < maxV * 0.4;
    if (hasClearStrikethrough) return pool[1];
    return maxV;
  }

  // One-call convenience: classify + pick
  function parseAmount(text: string): string {
    const classified = collectClassifiedAmounts(text);
    const picked = pickPaidAmount(classified);
    return picked !== null ? String(picked) : '';
  }

  function detectMerchant(text: string): string {
    // Pattern 1: 商户全称 (receipt format) — capture name ending with 公司/中心/局/站 if present
    const m1 = text.match(/商户全称\s*[：:\s]*([一-龥\d]{2,20}(?:公司|中心|局|站)?)/);
    if (m1 && m1[1]) return m1[1].trim();

    // Pattern 2: 四川 prefix for government receipts
    const m2 = text.match(/四川.*?(财政厅|税务局|交警)/);
    if (m2 && m2[1]) return '四川省' + m2[1];

    // Pattern 3: 保险/金融 company names
    const m3 = text.match(/[一-龥]+财产保险|[一-龥]+保险股份/);
    if (m3) return m3[0].trim();

    // Pattern 4: Billing app merchant
    const allLines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const firstLine = allLines[0] || '';
    // If first line is a pure UI page header, skip it when searching
    const isPageHeader = /^(账单|交易记录|付款记录|支出明细|收入明细|订单详情|支付详情|支付宝账单|微信支付账单|云闪付账单)$/.test(firstLine);
    const searchText = isPageHeader ? allLines.slice(1).join('\n') : text;

    // Known UI labels that must never be treated as merchants
    const uiLabels = /(?:^|\n)(?:账单|交易记录|付款记录|支付成功|支付失败|当前状态|商品|商户全称|收单机构|支付方式|交易单号|商户单号|订单金额|交易金额|实付|应付|支付金额|退款|优惠金额|减金|摇优惠|立减金|红包|支付时间|交易时间|乘车时间|联系商家|发起群收款|对订单有疑惑|在此商户的交易|申请电子凭证|商家电话)\s*[：:\s]*/;

    const appPatterns = [
      // Specific platform/brand names first
      /抖音生活服务|美团外卖|饿了么|盒马鲜生/,
      /筱筱(母婴|玩具)|拼拼(玩具|母婴)|拍拍(服饰|母婴)/,
      /高德打车|滴滴出行|哈啰出行/,
      /平安财产|平安保险|中国人保|太平洋保险/,
      // Company name with mandatory suffix (company/institution type)
      /[一-龥]{3,20}(?:公司|中心|局|站|支行|分行|商店|门店|超市|餐厅)/,
    ];
    for (const p of appPatterns) {
      const m = searchText.match(p);
      if (m && m[0].length >= 3) return m[0].trim();
    }
    // If no pattern match, check if the text is purely UI labels
    if (uiLabels.test(searchText)) {
      // Fall back to known payment app names in original text
      const payAppMatch = text.match(/^(支付宝|微信支付|云闪付)/m);
      if (payAppMatch) return payAppMatch[1];
      return '';
    }

    // Fallback: longest category keyword match (>2 chars)
    let bestKeyword = '';
    for (const [keyword, _] of MERCHANT_CATEGORY) {
      if (text.includes(keyword) && keyword.length > 2 && keyword.length > bestKeyword.length) {
        bestKeyword = keyword;
      }
    }
    if (bestKeyword) return bestKeyword;

    // Last resort: find company/institution names ending with 公司/中心/局/站
    const companyMatch = text.match(/[一-龥]{2,20}(?:公司|中心|局|站|支行|分行)/);
    if (companyMatch) return companyMatch[0];

    return bestKeyword;
  }

  // Explicitly read the 交易类别 / 分类 / 消费类别 field value out of the OCR text.
  // The OCR often emits the field as: "交易类别 <值>" or "分类 <值>" or "消费类别 <值>".
  // Returns a category-name candidate (may need fuzzy matching against DB names later).
  function extractExplicitCategory(text: string): string {
    // 交易类别 / 交易分类 / 消费类别 / 消费分类 / 类别 / 分类 / 商品
    // 标签后取 2-6 个汉字，跳过 OCR 噪声（纯数字、单字母、标点）
    const m = text.match(/(?:交易类别|交易分类|消费类别|消费分类|商品类别|商品|类别|分类)\s*[:：]?\s*([一-龥]{2,6})/);
    if (m) {
      const raw = m[1];
      // Filter out common noise labels
      if (/^(交易|消费|商品|类别|分类|账单|记录|详情|金额|时间|商户|订单|类别)$/.test(raw)) return '';
      return raw;
    }
    return '';
  }

  function detectCategoryName(text: string, merchant?: string): string {
    // 1. Explicit 交易类别/分类 field value (OCR 直接写出来的最可靠)
    const explicit = extractExplicitCategory(text);
    if (explicit) {
      // 先用归一化映射表精确匹配
      if (CATEGORY_ALIASES[explicit]) return CATEGORY_ALIASES[explicit];
      // 再精确/模糊匹配现有 MERCHANT_CATEGORY 大类名
      const bigNames = MERCHANT_CATEGORY.map(x => x[1]);
      const exactBig = bigNames.find(b => explicit === b);
      if (exactBig) return explicit;
      // 否则把 explicit 当作关键词搜 MERCHANT_CATEGORY
      const sorted = [...MERCHANT_CATEGORY].sort((a, b) => b[0].length - a[0].length);
      for (const [keyword, catName] of sorted) {
        if (explicit.includes(keyword) || keyword.includes(explicit)) return catName;
      }
      return explicit; // 至少把显式值带回，交给分类匹配模糊命中
    }
    // 2. 商户名 → 分类归一化（优先于全文关键词）
    if (merchant && CATEGORY_ALIASES[merchant]) {
      return CATEGORY_ALIASES[merchant];
    }
    // 3. Keyword match against raw OCR + detected merchant
    const sorted = [...MERCHANT_CATEGORY].sort((a, b) => b[0].length - a[0].length);
    const haystacks = [text, merchant ?? ''];
    for (const [keyword, catName] of sorted) {
      if (haystacks.some(h => h.includes(keyword))) return catName;
    }
    return '';
  }

  function parseTime(text: string): string | null {
    // 把日期和时间拆开各自匹配，再组合。OCR 经常把日期读成乱码但时间干净，
    // 或把时间读清但日期崩掉——只要时间读清就回填，日期崩了用当前月/日兜底。
    const now = new Date();
    const curYear = String(now.getFullYear());
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    const curDay = String(now.getDate()).padStart(2, '0');

    // 1. 时间：HH:MM(:SS)，独立匹配
    const mTime = text.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
    let timePart = '';
    if (mTime) {
      const h = parseInt(mTime[1], 10), mn = parseInt(mTime[2], 10);
      if (h <= 23 && mn <= 59) {
        const hh = String(h).padStart(2, '0');
        const mm = String(mn).padStart(2, '0');
        timePart = mTime[3] ? `${hh}:${mm}:${String(parseInt(mTime[3], 10)).padStart(2, '0')}` : `${hh}:${mm}`;
      }
    }

    // 2. 日期：优先完整 年-月-日，崩了就用 年 + 当前月/日
    let year = curYear, month = curMonth, day = curDay;
    const mDate = text.match(/(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})[日]?/);
    if (mDate) {
      year = mDate[1];
      month = String(parseInt(mDate[2], 10)).padStart(2, '0');
      day = String(parseInt(mDate[3], 10)).padStart(2, '0');
    } else {
      const mYear = text.match(/\b(20\d{2})\b/);
      if (mYear) year = mYear[1];
    }

    // 时间完全没读清才返回 null；datetime-local 不接受秒，统一裁剪到 HH:mm
    if (!timePart) return null;
    timePart = timePart.slice(0, 5); // "HH:mm:ss" → "HH:mm"，"HH:mm" 不变
    return `${year}-${month}-${day}T${timePart}`;
  }

  function preprocessImage(imageDataUrl: string, scale = 3): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d')!;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Contrast enhancement (1.5x)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = imageData.data;
          const contrast = 1.5;
          for (let i = 0; i < d.length; i += 4) {
            d[i]     = Math.min(255, Math.max(0, contrast * (d[i] - 128) + 128));
            d[i + 1] = Math.min(255, Math.max(0, contrast * (d[i + 1] - 128) + 128));
            d[i + 2] = Math.min(255, Math.max(0, contrast * (d[i + 2] - 128) + 128));
          }

          // Otsu adaptive thresholding
          let sum = 0;
          for (let i = 0; i < d.length; i += 4) {
            const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            sum += g;
          }
          const mean = sum / (d.length / 4);
          let varSum = 0;
          for (let i = 0; i < d.length; i += 4) {
            const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            varSum += (g - mean) * (g - mean);
          }
          const stdDev = Math.sqrt(varSum / (d.length / 4));
          const threshold = mean - stdDev;

          for (let i = 0; i < d.length; i += 4) {
            const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            const v = g > threshold ? 255 : 0;
            d[i] = d[i + 1] = d[i + 2] = v;
          }

          ctx.putImageData(imageData, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (e) {
          console.error('Preprocess error:', e);
          resolve(imageDataUrl);
        }
      };
      img.onerror = () => resolve(imageDataUrl);
      img.src = imageDataUrl;
    });
  }

  // 多 PSM 尝试：不同分页模式对账单截图效果不同
  async function runOCRWithPSM(imageDataUrl: string, psm: number): Promise<string> {
    // 串行化：init + preprocess + recognize 全程持有锁，
    // 避免下一次 initWorker 的 terminate 杀掉正在 recognize 的 worker。
    const prev = workerLock;
    const next = prev.then(async () => {
      await initWorker(psm);
      if (ocrError) return '';
      if (!worker) return '';
      const processedUrl = await preprocessImage(imageDataUrl, 3);
      const { data } = await worker!.recognize(processedUrl);
      return data.text.trim();
    }).catch(() => '');
    workerLock = next.then(() => {}, () => {});
    return await next;
  }

  async function runOCR(imageDataUrl: string) {
    ocrError = '';
    ocrRunning = true;
    ocrProgress = 5;
    errorMsg = '';
    cloudOCRError = '';

    // Preload the image ONCE (shared by both detection and preprocessing)
    const img = await loadImage(imageDataUrl);
    if (!img) {
      ocrRunning = false;
      errorMsg = '图片加载失败，请重试';
      return;
    }

    // Step 1: Full-page OCR — 串行 PSM（并发预处理会互杀 worker 导致 pending）
    // PSM 4 单列文本（账单）；PSM 11 稀疏文本（复杂布局）。PSM4 有金额就不跑 PSM11。
    ocrProgress = 10;
    const amountCount = (t: string) => (t.match(/\d+\.\d{2}/g) || []).length;
    let fullText = await runOCRWithPSM(imageDataUrl, 4).catch(() => '');
    if (amountCount(fullText) === 0) {
      const psm11 = await runOCRWithPSM(imageDataUrl, 11).catch(() => '');
      if (amountCount(psm11) > amountCount(fullText)) fullText = psm11;
    }

    // 智能判断是否使用云端：smart 模式下检查额度 + 配置
    let useCloud = false;
    const currentMode = $ocrMode;

    // 检查本地是否已识别到金额
    const localClassified = collectClassifiedAmounts(fullText || '');
    const hasLocalAmount = localClassified.paid.length > 0 || localClassified.fulltextBig.length > 0;

    if (cloudHasConfig) {
      if (currentMode === 'cloud') {
        useCloud = true; // 强制云端
      } else if (currentMode === 'smart') {
        // 智能模式：高精度版优先，额度耗尽自动降级标准版，标准版也耗尽降级本地
        const { getTodayCloudQuota, isCloudQuotaNearlyExhausted } = await import('$lib/ocr/cloud');
        const dualQuota = await getTodayCloudQuota();
        const accurateNearly = await isCloudQuotaNearlyExhausted('accurate_basic');
        const generalNearly = await isCloudQuotaNearlyExhausted('general_basic');
        // 只要高精度版或标准版任一还有额度就使用云端
        if (!accurateNearly || !generalNearly) {
          useCloud = true;
        }
      } else if (currentMode === 'auto') {
        useCloud = !hasLocalAmount; // 自动：本地失败时才用云端
      }
    }

    console.log('[OCR] useCloud=', useCloud, 'mode=', currentMode, 'hasLocalAmount=', hasLocalAmount);

    let cloudText = '';
    if (useCloud) {
      try {
        ocrProgress = 15;
        const config = await (await import('$lib/ocr/cloud')).getOCRConfig();
        if (config) {
          const imageBase64 = imageDataUrl.split(',')[1];
          cloudText = await runCloudOCRCascade(imageBase64, config) ?? '';
          cloudQuota = await (await import('$lib/ocr/cloud')).getTodayCloudQuota();
          if (cloudText) {
            fullText = cloudText;
            console.log('[OCR] 云端级联识别成功');
          } else {
            cloudOCRError = '云端额度已用完或识别失败，已使用本地识别结果';
            console.log('[OCR] 云端级联失败，降级本地');
          }
        }
      } catch (e) {
        cloudOCRError = '云端 OCR 失败: ' + (e as Error).message;
        console.error('[OCR] 云端 OCR 失败:', e);
      }
    }

    // Step 2: Full-page Chinese OCR → merchant / category / time.
    // Harvest labelled amounts (实付/原价/优惠) as the primary amount source.
    let classified = collectClassifiedAmounts(fullText || '');
    if (fullText) {
      const merchant = detectMerchant(fullText);
      const catName = detectCategoryName(fullText, merchant);
      const parsedTime = parseTime(fullText);
      previousOcrResult = fullText;
      if (merchant) ocrMerchant = merchant;
      if (catName) {
        detectedCatName = catName;
        applyCategorySelection();
      }
      if (parsedTime) ocrTime = parsedTime;
    }

    // Step 3: 云端成功时直接用云端的金额结果（Tesseract 本地 crop 精度不如云端，不应覆盖）
    // 云端失败（catch 分支）时 fullText 保持本地结果，Step 3 正常跑本地 crop
    if (!ocrError) {
      const cloudSucceeded = cloudText !== '';
      if (!cloudSucceeded) {
        // 本地 fallback：先算文本解析的干净最大值，供守卫使用
        const cleanTextMax = Math.max(
          ...classified.paid,
          ...classified.fulltextBig,
          ...classified.list,
          ...classified.discount
        );
        const biggest = await pickBiggestFontAmount(img);
        const crops = detectAmountLines(img, 4);
        for (const { canvas } of crops) {
          const amountText = await ocrAmountStrip(canvas);
          const val = parseAmountFromOCR(amountText);
          if (val !== null && !classified.bare.includes(val)) classified.bare.push(val);
        }
        const picked = pickPaidAmount(classified, biggest, cleanTextMax);
        ocrAmount = picked !== null ? String(picked) : '';
        if (picked !== null) console.log('[OCR] 本地金额 →', picked);
      } else {
        // 云端结果：直接用 collectClassifiedAmounts 解析出的金额
        const picked = pickPaidAmount(classified);
        ocrAmount = picked !== null ? String(picked) : '';
        if (picked !== null) console.log('[OCR] 云端金额 →', picked);
      }
    }

    if (!ocrAmount) errorMsg = '未能识别到金额，请手动填写';

    ocrProgress = 85;
    ocrRunning = false;
    ocrProgress = 0;
  }

  function loadImage(src: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // Return up to `n` crop results, each with the OCR value AND the line's font height
  // (in downsampled px). Tallest line first — that's the "biggest" amount.
  interface CropResult { canvas: HTMLCanvasElement; heightPx: number }
  function detectAmountLines(img: HTMLImageElement, n: number): CropResult[] {
    const W = img.width;
    const H = img.height;

    // Downsample for analysis (max 480px wide) to keep it fast
    const ds = document.createElement('canvas');
    const dsW = Math.min(W, 480);
    const dsH = Math.round(H * (dsW / W));
    ds.width = dsW;
    ds.height = dsH;
    const dsCtx = ds.getContext('2d')!;
    dsCtx.drawImage(img, 0, 0, W, H, 0, 0, dsW, dsH);
    const px = dsCtx.getImageData(0, 0, dsW, dsH).data;

    // Per-row dark-pixel count
    const rowDark: number[] = new Array(dsH).fill(0);
    for (let y = 0; y < dsH; y++) {
      let c = 0;
      for (let x = 0; x < dsW; x++) {
        const i = (y * dsW + x) * 4;
        const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        if (g < 110) c++;
      }
      rowDark[y] = c;
    }

    // Find contiguous text lines (runs of rows with enough dark pixels).
    const lines: { top: number; bottom: number; height: number; mass: number; cx: number }[] = [];
    const minDark = Math.max(3, dsW * 0.02);
    let y = 0;
    while (y < dsH) {
      while (y < dsH && rowDark[y] < minDark) y++;
      if (y >= dsH) break;
      const top = y;
      let bottom = y;
      while (bottom + 1 < dsH && rowDark[bottom + 1] >= minDark) bottom++;
      const mass = rowDark.slice(top, bottom + 1).reduce((a, b) => a + b, 0);
      // Estimate the horizontal center of ink on this line
      let cx = Math.floor(dsW / 2);
      if (mass > 0) {
        let sum = 0, cnt = 0;
        for (let yy = top; yy <= bottom; yy++) {
          for (let x = 0; x < dsW; x++) {
            const i = (yy * dsW + x) * 4;
            const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            if (g < 110) { sum += x; cnt++; }
          }
        }
        if (cnt > 0) cx = Math.round(sum / cnt);
      }
      lines.push({ top, bottom, height: bottom - top + 1, mass, cx });
      y = bottom + 1;
    }

    if (lines.length === 0) return [];

    // The amount is a LARGE-font line: its height should be well above the median.
    const heights = lines.map(l => l.height).sort((a, b) => a - b);
    const medianH = heights[Math.floor(heights.length / 2)];
    // Rank: height first (bigger font wins), then centered-ness (amounts are centered), then mass.
    const ranked = lines
      .map(l => ({
        l,
        // Bonus for lines significantly taller than median (real big-font lines)
        score: l.height * 2 + (l.height > medianH * 1.4 ? 20 : 0) + (Math.abs(l.cx - dsW / 2) < dsW * 0.15 ? 5 : 0),
      }))
      .sort((a, b) => b.score - a.score);

    const pick = ranked.slice(0, n).map(r => r.l);

    // Build a crop canvas for each picked line (tallest line first = biggest amount)
    const scale = H / dsH;
    const canvases: { canvas: HTMLCanvasElement; heightPx: number }[] = [];
    for (const best of pick) {
      if (best.height < 4) continue;
      const topOrig = Math.floor(best.top * scale);
      const bottomOrig = Math.ceil((best.bottom + 1) * scale);
      const margin = Math.max(4, Math.floor((bottomOrig - topOrig) * 0.6));
      const cropTop = Math.max(0, topOrig - margin);
      const cropBot = Math.min(H, bottomOrig + margin);

      const canvas = document.createElement('canvas');
      canvas.width = W * 2;
      canvas.height = (cropBot - cropTop) * 2;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, cropTop, W, cropBot - cropTop, 0, 0, canvas.width, canvas.height);

      // Light threshold keeps anti-aliased digit edges intact
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const v = g > 140 ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      ctx.putImageData(id, 0, 0);

      console.log('[OCR] 金额行候选', best.top, best.bottom, 'h=', best.height);
      canvases.push({ canvas, heightPx: best.height });
    }

    return canvases;
  }

  async function ocrAmountStrip(crop: HTMLCanvasElement): Promise<string> {
    await initWorker(7, '-0123456789.¥￥, ');
    if (ocrError) return '';
    const { data } = await worker!.recognize(crop);
    return data.text.trim();
  }

  // Detect the page's largest-font digit blocks via per-row ink clustering,
  // then OCR each block with a DIGIT-WHITELIST PSM-7 pass. Tallest block = the
  // prominent 实付 (抖音 -7.90 / 违章 -149.34 / 云闪付 2,390.63) that full-page
  // Chinese OCR mangles. Returns the tallest block's clean value (or null).
  async function pickBiggestFontAmount(img: HTMLImageElement): Promise<number | null> {
    const W = img.width, H = img.height;
    // Downsample for cheap row-ink analysis
    const ds = document.createElement('canvas');
    const dsW = Math.min(W, 480);
    const dsH = Math.round(H * (dsW / W));
    ds.width = dsW; ds.height = dsH;
    const dctx = ds.getContext('2d')!;
    dctx.drawImage(img, 0, 0, W, H, 0, 0, dsW, dsH);
    const dpx = dctx.getImageData(0, 0, dsW, dsH).data;

    const rowDark = new Array(dsH).fill(0);
    for (let y = 0; y < dsH; y++) {
      let c = 0;
      for (let x = 0; x < dsW; x++) {
        const i = (y * dsW + x) * 4;
        const g = 0.299 * dpx[i] + 0.587 * dpx[i + 1] + 0.114 * dpx[i + 2];
        if (g < 110) c++;
      }
      rowDark[y] = c;
    }
    // Contiguous digit blocks (rows with enough ink)
    const blocks: { top: number; bottom: number; height: number; mass: number }[] = [];
    const minDark = Math.max(3, dsW * 0.02);
    let y = 0;
    while (y < dsH) {
      while (y < dsH && rowDark[y] < minDark) y++;
      if (y >= dsH) break;
      const top = y; let bottom = y;
      while (bottom + 1 < dsH && rowDark[bottom + 1] >= minDark) bottom++;
      const mass = rowDark.slice(top, bottom + 1).reduce((a, b) => a + b, 0);
      blocks.push({ top, bottom, height: bottom - top + 1, mass });
      y = bottom + 1;
    }
    if (blocks.length === 0) return null;
    // The 2 tallest blocks with the most ink (big fonts carry more ink)
    const ranked = [...blocks].sort((a, b) => (b.height * 3 + b.mass / 20) - (a.height * 3 + a.mass / 20));
    const picks = ranked.slice(0, 2).filter(b => b.height >= 4);

    await initWorker(7, '-0123456789.¥￥,');
    if (ocrError) return null;
    const scale = H / dsH;
    let best: number | null = null;
    for (const b of picks) {
      const topOrig = Math.floor(b.top * scale);
      const bottomOrig = Math.ceil((b.bottom + 1) * scale);
      const margin = Math.max(4, Math.floor((bottomOrig - topOrig) * 0.5));
      const y0 = Math.max(0, topOrig - margin);
      const y1 = Math.min(H, bottomOrig + margin);
      const c = document.createElement('canvas');
      c.width = W * 2; c.height = (y1 - y0) * 2;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, y0, W, y1 - y0, 0, 0, c.width, c.height);
      const raw = await ocrAmountStrip(c);
      const v = parseAmountFromOCR(raw);
      console.log('[OCR] 大字块候选 →', raw, '=', v ?? '', '(h=', b.height + ')');
      if (v !== null && (best === null || v > best)) best = v;
    }
    return best;
  }

  function applyOCRResult(text: string) {
    const amount = parseAmount(text);
    if (amount) ocrAmount = amount;

    const merchant = detectMerchant(text);
    if (merchant) ocrMerchant = merchant;

    // Try to parse payment time from OCR text
    const parsedTime = parseTime(text);
    if (parsedTime) ocrTime = parsedTime;

    // Try to find matching category by name
    const catName = detectCategoryName(text, merchant);
    if (catName) {
      const matched = categories.find(c => c.name === catName);
      if (matched) selectedCategory = matched.id;
    }

    previousOcrResult = text;
  }

  // Apply the OCR-detected category (detectedCatName) against the currently
  // loaded `categories`. Safe to call any time — no-op if nothing detected yet.
  function applyCategorySelection() {
    if (!detectedCatName || categories.length === 0) return;
    // DB category names match the MERCHANT_CATEGORY big-category names exactly,
    // so prefer an exact match; fall back to a fuzzy substring match.
    const exact = categories.find(c => c.name === detectedCatName);
    if (exact) {
      selectedCategory = exact.id;
      return;
    }
    const fuzzy = categories.find(c => detectedCatName.includes(c.name) || c.name.includes(detectedCatName));
    if (fuzzy) selectedCategory = fuzzy.id;
  }

  function takePhoto() {
    cameraInput?.click();
  }

  function handleImageSelect(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      selectedImage = reader.result as string;
      ocrAmount = '';
      ocrMerchant = '';
      remark = '';
      previousOcrResult = null;
      errorMsg = '';
      await runOCR(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  onMount(async () => {
    // 加载保存的 OCR 配置（包括模式）
    await loadConfig();
    
    // 详细调试日志
    console.log('[OCR] onMount called, mode=', $ocrMode);
    const initUserId = get(currentUserId);
    const initLedgerId = get(currentLedgerId);
    console.log('[OCR] Initial values: userId=', initUserId, 'ledgerId=', initLedgerId);

    if (initUserId > 0) userId = initUserId;
    if (initLedgerId > 0) {
      ledgerId = initLedgerId;
      console.log('[OCR] Initial ledgerId > 0, calling loadCategoriesNow');
      loadCategoriesNow();
    } else {
      console.log('[OCR] Initial ledgerId is 0, waiting for subscription');
    }

    // 订阅变化
    currentUserId.subscribe(v => {
      console.log('[OCR] currentUserId changed to', v);
      if (v !== userId) userId = v;
    });
    currentLedgerId.subscribe(v => {
      console.log('[OCR] currentLedgerId changed to', v, 'current ledgerId=', ledgerId);
      if (v !== ledgerId && v > 0) {
        ledgerId = v;
        console.log('[OCR] ledgerId updated, calling loadCategoriesNow');
        loadCategoriesNow();
      }
    });

    // 检查云端配置
    (async () => {
      cloudHasConfig = await (await import('$lib/ocr/cloud')).hasCloudConfig();
      if (cloudHasConfig) {
        cloudQuota = await (await import('$lib/ocr/cloud')).getTodayCloudQuota();
      }
    })();
  });

  async function loadCategoriesNow() {
    console.log('[OCR] loadCategoriesNow called, ledgerId=', ledgerId, 'userId=', userId);
    if (ledgerId <= 0) {
      console.log('[OCR] loadCategories skipped: ledgerId=', ledgerId);
      return;
    }
    try {
      const cats = await getCategories(ledgerId);
      console.log('[OCR] categories loaded:', cats.length, cats.map(c => c.name).join(','));
      categories = cats;
      unsortedCategoryId = cats.find(c => c.name === UNSORTED_CATEGORY_NAME)?.id ?? 0;
      if (cats.length > 0 && selectedCategory === 0) {
        selectedCategory = cats[0].id;
      }
      applyCategorySelection();
    } catch (e) {
      console.error('[OCR] loadCategories failed:', e);
      errorMsg = '分类加载失败，请刷新重试';
    }
  }

  // 保留原函数名以兼容其他调用点（如 OCR 结果里直接调 applyCategorySelection）
  async function ensureCategories() { loadCategoriesNow(); }

  async function handleSubmit() {
    errorMsg = '';
    if (!ocrAmount || isNaN(parseFloat(ocrAmount)) || parseFloat(ocrAmount) <= 0) {
      errorMsg = '请输入有效金额';
      return;
    }
    loading = true;
    try {
      // 空商户兜底：识别/手填都没商户时，落到"待整理"分类，方便事后归类
      let catId = selectedCategory;
      if (!ocrMerchant.trim() && unsortedCategoryId > 0) catId = unsortedCategoryId;
      await createExpense(ledgerId, {
        userId,
        amount: ocrAmount,
        date: ocrTime || new Date().toISOString(),
        categoryId: catId,
        merchant: ocrMerchant || undefined,
        remark: remark || undefined,
        isRefund
      });
      success = true;
    } catch {
      errorMsg = '保存失败，请重试';
    } finally {
      loading = false;
    }
  }

  function goBack() { goto('/expenses'); }

  function resetForm() {
    ocrAmount = '';
    ocrTime = new Date().toISOString().slice(0, 16);
    ocrMerchant = '';
    remark = '';
    isRefund = false;
    selectedImage = null;
    previousOcrResult = null;
    errorMsg = '';
    ocrError = '';
  }
</script>

<div class="min-h-screen bg-paper">
  <main class="px-4 py-4 max-w-md mx-auto space-y-4 pb-24">
    {#if success}
      <div class="bg-white rounded-2xl shadow-card p-8 text-center">
        <div class="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-3xl mx-auto mb-4">✅</div>
        <p class="text-xl font-semibold text-ink">记账成功！</p>
        <p class="text-sm text-stone-400 mt-1">¥{centsToYuan(parseFloat(ocrAmount) * 100)}</p>
        <button onclick={goBack} class="mt-6 btn-primary w-full">返回首页</button>
      </div>
    {:else}
      <!-- 拍照按钮 -->
      <div class="bg-white rounded-2xl shadow-card p-4 text-center">
        <button type="button" onclick={takePhoto}
          class="w-full flex flex-col items-center gap-3 cursor-pointer py-4 active:scale-[0.97] transition-transform">
          <div class="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center text-3xl">📸</div>
          <div>
            <p class="font-medium text-ink text-sm">拍摄小票 / 账单</p>
            <p class="text-xs text-stone-400 mt-0.5">点击拍照或从相册选择</p>
          </div>
        </button>
        <button type="button" onclick={triggerBatchSelect}
          class="mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-stone-300 text-stone-500 text-sm hover:border-clay-400 hover:text-clay-600 transition">
          <span>📋 批量录入（一次多张小票）</span>
        </button>
        <input
          id="camera-input"
          bind:this={cameraInput}
          type="file"
          accept="image/*"
          class="hidden"
          onchange={handleImageSelect}
        />
        <input
          id="batch-input"
          bind:this={batchInput}
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          onchange={handleBatchSelect}
        />
        {#if selectedImage}
          <div class="mt-3 relative rounded-xl overflow-hidden">
            <img src={selectedImage} class="w-full h-48 object-cover" alt="预览" />
            {#if ocrRunning}
              <div class="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2">
                <div class="text-white text-sm font-medium">OCR 识别中...</div>
                <div class="w-32 h-1.5 bg-white/30 rounded-full overflow-hidden">
                  <div class="h-full bg-amber-500 rounded-full transition-all" style="width:{ocrProgress}%"></div>
                </div>
              </div>
            {/if}
            <button onclick={() => { selectedImage = null; previousOcrResult = null; ocrAmount = ''; ocrMerchant = ''; errorMsg = ''; }}
              class="absolute top-2 right-2 w-7 h-7 bg-black/50 text-white rounded-full flex items-center justify-center text-sm">
              ✕
            </button>
          </div>
        {/if}
      </div>

      <!-- 批量录入待确认列表 -->
      {#if batchItems.length > 0}
        <div class="bg-white rounded-2xl shadow-card p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <span class="text-sm font-semibold text-ink">待确认（{batchItems.filter(i => !i.saved).length}）</span>
              {#if batchAllDone}
                <span class="ml-2 text-xs text-green-600 font-medium">全部已入账 ✅</span>
              {/if}
            </div>
            <div class="flex gap-2">
              {#if !batchAllDone}
                <button onclick={saveAllBatchItems} disabled={batchBusy}
                  class="px-3 py-1.5 bg-clay-600 text-white text-xs rounded-full font-medium disabled:opacity-40">
                  {batchBusy ? '入账中...' : `一键入账 ${batchItems.filter(i => !i.saved && i.amount).length} 笔`}
                </button>
              {/if}
              <button onclick={clearBatch} class="text-xs text-stone-400 hover:text-red-500">清空</button>
            </div>
          </div>

          {#each batchItems as item, idx (item.id)}
            <div data-item-id={item.id} class="border rounded-xl overflow-hidden {item.saved ? 'border-green-200 bg-green-50/40' :
              item.ocrStatus === 'failed' ? 'border-red-200 bg-red-50/30' :
              item.ocrStatus === 'partial' ? 'border-amber-200 bg-amber-50/30' : 'border-stone-200'}">
              <div class="flex">
                <div class="w-16 shrink-0 flex items-center justify-center bg-stone-100 p-2">
                  <img src={item.imageDataUrl} class="w-14 h-14 object-contain rounded" alt="" />
                </div>
                <div class="flex-1 min-w-0 p-3 space-y-2">
                  <!-- 状态标签行 -->
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] text-stone-400 font-mono">#{idx + 1}</span>
                    {#if item.saved}
                      <span class="text-[10px] text-green-600 font-medium">✅ 已入账</span>
                    {:else if item.ocrBusy}
                      <span class="text-[10px] text-amber-600 animate-pulse">🔍 识别中…</span>
                    {:else if item.ocrStatus === 'failed'}
                      <span class="text-[10px] text-red-500 font-medium">⚠️ 识别失败</span>
                      <button onclick={() => enqueueOCR(item)}
                        class="text-[10px] text-clay-600 hover:underline">重新识别</button>
                    {:else if item.ocrStatus === 'partial'}
                      <span class="text-[10px] text-amber-600 font-medium">⚡ 部分识别</span>
                      <button onclick={() => applySuggestion(item)}
                        class="text-[10px] text-clay-600 hover:underline">应用建议</button>
                    {:else}
                      <span class="text-[10px] text-green-600 font-medium">✅ 识别成功</span>
                    {/if}
                    <button onclick={() => removeBatchItem(item.id)}
                      class="ml-auto text-stone-300 hover:text-red-400 text-sm leading-none">✕</button>
                  </div>

                  <!-- 建议值提示（partial 时显示） -->
                  {#if item.ocrStatus === 'partial' && (item.suggestAmount !== item.amount || item.suggestMerchant !== item.merchant)}
                    <div class="text-[11px] bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 text-amber-700">
                      💡 建议：金额 {item.suggestAmount ? item.suggestAmount : item.amount} · 商户 {item.suggestMerchant || '—'} · 时间 {item.suggestTime ? item.suggestTime.replace('T',' ') : '—'}
                      <button onclick={() => applySuggestion(item)} class="ml-1 underline text-amber-600">应用</button>
                    </div>
                  {/if}

                  <!-- 金额/商户（第一行）+ 时间（第二行）：value 属性 + oninput 写回 item；
                       识别完成后由 writeInputs() 直接写 DOM .value，绕开 Svelte 嵌套属性不响应问题。
                       两行布局，长识别值不被截断。 -->
                  <div class="grid grid-cols-[5rem_1fr] gap-1.5">
                    <input type="text" data-field="amount" value={item.amount}
                      oninput={(e) => { item.amount = (e.currentTarget as HTMLInputElement).value; }}
                      class="input-field !py-1.5 !px-2.5 text-sm font-mono font-semibold" placeholder="金额" />
                    <input type="text" data-field="merchant" value={item.merchant}
                      oninput={(e) => { item.merchant = (e.currentTarget as HTMLInputElement).value; }}
                      class="input-field !py-1.5 !px-2.5 text-sm truncate" placeholder="商户" />
                    <input type="datetime-local" data-field="time" value={item.time}
                      oninput={(e) => { item.time = (e.currentTarget as HTMLInputElement).value; }}
                      class="input-field !py-1.5 !px-2.5 text-xs col-span-2" />
                  </div>

                  <!-- 分类 + 入账 -->
                  <div class="flex items-center gap-2">
                    <select bind:value={item.categoryId}
                      class="input-field !py-1.5 !px-2.5 text-xs flex-1 min-w-0">
                      {#each item.categoryOptions as cat}
                        <option value={cat.id}>{cat.name}</option>
                      {/each}
                    </select>
                    <button onclick={() => saveSingleBatchItem(item)} disabled={!item.amount || item.saved}
                      class="px-3 py-1.5 bg-stone-100 text-stone-600 text-xs rounded-full hover:bg-stone-200 disabled:opacity-30 shrink-0">
                      入账
                    </button>
                  </div>

                  <!-- 原始 OCR 文本折叠区（failed 时自动展开） -->
                  {#if item.rawOcrText}
                    <div>
                      <button onclick={() => { item.expandRaw = !item.expandRaw; batchItems = [...batchItems]; }}
                        class="text-[10px] text-stone-400 hover:text-stone-600">
                        {item.expandRaw ? '▲ 收起原始文本' : '▼ 查看原始 OCR 文本'}
                      </button>
                      {#if item.expandRaw}
                        <p class="mt-1 text-[11px] text-stone-500 font-mono bg-stone-50 rounded-lg p-2 max-h-20 overflow-y-auto whitespace-pre-wrap">
                          {item.rawOcrText}
                        </p>
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <!-- 识别结果显示 -->
      {#if previousOcrResult && !ocrRunning}
        <div class="bg-white rounded-2xl shadow-card p-4">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-sm font-medium text-ink">识别结果</span>
            <span class="text-xs text-stone-400 ml-auto">可点击修改</span>
          </div>

          <!-- 关键字段高亮 -->
          <div class="grid grid-cols-2 gap-2 mb-3">
            <div class="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
              <div class="text-[10px] text-amber-600 font-medium mb-0.5">金额</div>
              <div class="text-base font-mono font-semibold text-amber-700">
                {ocrAmount ? '¥' + ocrAmount : '—'}
              </div>
            </div>
            <div class="rounded-xl bg-clay-50 border border-clay-100 px-3 py-2">
              <div class="text-[10px] text-clay-600 font-medium mb-0.5">商户</div>
              <div class="text-sm font-medium text-clay-700 truncate" title={ocrMerchant}>
                {ocrMerchant || '—'}
              </div>
            </div>
            <div class="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2">
              <div class="text-[10px] text-blue-600 font-medium mb-0.5">时间</div>
              <div class="text-xs font-mono font-medium text-blue-700">
                {ocrTime ? ocrTime.replace('T', ' ') : '—'}
              </div>
            </div>
            <div class="rounded-xl bg-green-50 border border-green-100 px-3 py-2">
              <div class="text-[10px] text-green-600 font-medium mb-0.5">分类</div>
              <div class="text-sm font-medium text-green-700">
                {categories.find(c => c.id === selectedCategory)?.name || '—'}
              </div>
            </div>
          </div>

          <p class="text-xs text-stone-500 leading-relaxed whitespace-pre-wrap max-h-24 overflow-y-auto">{previousOcrResult}</p>
        </div>
      {/if}

      <!-- 云端 OCR 配置入口 -->
      {#if cloudHasConfig}
      <div class="bg-white rounded-2xl shadow-card p-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-sm font-medium text-ink">云端 OCR</span>
          <span class="text-xs text-green-600 font-medium">已配置</span>
          <span class="text-xs bg-clay-100 text-clay-700 px-2 py-0.5 rounded-full">{$ocrMode}</span>
        </div>
        <p class="text-xs text-stone-400 mb-3">
          {$ocrMode === 'smart' ? '智能模式：高精度版优先 → 标准版 → 本地识别，额度耗尽自动降级' :
           $ocrMode === 'cloud' ? '强制云端模式：始终使用云端 OCR（高精度版优先）' :
           '本地识别失败时自动使用云端 OCR（高精度版优先）'}
        </p>
        <!-- 双版本进度条 -->
        <div class="space-y-2.5 mb-3">
          <!-- 高精度版 -->
          <div>
            <div class="flex items-center justify-between text-xs mb-0.5">
              <span class="text-stone-400">高精度版</span>
              <span class={cloudQuota.accurate.quotaExhausted ? 'text-red-500 font-medium' : cloudAccurateRemaining <= 100 ? 'text-amber-600 font-medium' : 'text-stone-400'}>
                {cloudQuota.accurate.quotaExhausted ? '已耗尽' : `${cloudQuota.accurate.count} / 1000 次${cloudAccurateRemaining <= 100 ? ' ⚠️' : ''}`}
              </span>
            </div>
            <div class="w-full h-1 bg-stone-100 rounded-full overflow-hidden">
              <div class="h-full rounded-full {cloudQuota.accurate.quotaExhausted ? 'bg-red-400' : cloudAccurateRemaining <= 100 ? 'bg-amber-400' : 'bg-clay-500'}"
                   style="width:{cloudQuota.accurate.quotaExhausted ? 100 : Math.min(100, cloudQuota.accurate.count / 1000 * 100)}%"></div>
            </div>
          </div>
          <!-- 标准版 -->
          <div>
            <div class="flex items-center justify-between text-xs mb-0.5">
              <span class="text-stone-400">标准版</span>
              <span class={cloudQuota.general.quotaExhausted ? 'text-red-500 font-medium' : cloudGeneralRemaining <= 100 ? 'text-amber-600 font-medium' : 'text-stone-400'}>
                {cloudQuota.general.quotaExhausted ? '已耗尽' : `${cloudQuota.general.count} / 1000 次${cloudGeneralRemaining <= 100 ? ' ⚠️' : ''}`}
              </span>
            </div>
            <div class="w-full h-1 bg-stone-100 rounded-full overflow-hidden">
              <div class="h-full rounded-full {cloudQuota.general.quotaExhausted ? 'bg-red-400' : cloudGeneralRemaining <= 100 ? 'bg-amber-400' : 'bg-clay-500'}"
                   style="width:{cloudQuota.general.quotaExhausted ? 100 : Math.min(100, cloudQuota.general.count / 1000 * 100)}%"></div>
            </div>
          </div>
        </div>
        <a href="/settings#ocr" class="text-sm text-clay-600 font-medium hover:text-clay-700">配置 API Key →</a>
      </div>
      {:else}
      <div class="bg-white rounded-2xl shadow-card p-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-sm font-medium text-ink">云端 OCR</span>
          <span class="text-xs text-stone-400">未配置</span>
        </div>
        <p class="text-xs text-stone-400 mb-3">配置后可在本地识别失败时自动使用云端 OCR</p>
        <a href="/settings#ocr" class="text-sm text-clay-600 font-medium hover:text-clay-700">配置 API Key →</a>
      </div>
      {/if}

      <!-- 错误提示 -->
      {#if ocrError}
        <div class="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">{ocrError}</div>
      {/if}

      <div class="bg-white rounded-2xl shadow-card p-4 space-y-4">
        <div>
          <label for="ocr-amount" class="block text-sm font-medium text-ink mb-1.5">金额（元）</label>
          <input id="ocr-amount" type="number" step="0.01" bind:value={ocrAmount} placeholder="0.00"
            class="input-field text-xl font-mono font-semibold" />
        </div>

        <div>
          <label for="ocr-datetime" class="block text-sm font-medium text-ink mb-1.5">时间</label>
          <input id="ocr-datetime" type="datetime-local" bind:value={ocrTime} class="input-field" />
        </div>

        <div>
          <span class="block text-sm font-medium text-ink mb-2">分类</span>
          {#if categories.length === 0}
            <p class="text-xs text-stone-400 py-2">加载中...</p>
          {:else}
          <div class="grid grid-cols-5 gap-2">
            {#each categories as cat}
              <button type="button" onclick={() => selectedCategory = cat.id}
                class="flex flex-col items-center py-2 rounded-xl border-2 transition-all duration-150
                  {selectedCategory === cat.id ? 'border-clay-600 bg-clay-50' : 'border-stone-100 hover:border-stone-200'}">
                <span class="text-xl leading-none">{cat.icon}</span>
                <span class="text-[10px] text-stone-600 mt-0.5 font-medium">{cat.name}</span>
              </button>
            {/each}
          </div>
          {/if}
        </div>

        <div>
          <label for="ocr-merchant" class="block text-sm font-medium text-ink mb-1.5">商户（选填）</label>
          <input id="ocr-merchant" type="text" bind:value={ocrMerchant} placeholder="如：星巴克" class="input-field" />
        </div>

        <div>
          <label for="ocr-remark" class="block text-sm font-medium text-ink mb-1.5">备注（选填）</label>
          <input id="ocr-remark" type="text" bind:value={remark} placeholder="添加备注" class="input-field" />
        </div>

        <label class="flex items-center gap-3 cursor-pointer py-1">
          <input type="checkbox" bind:checked={isRefund} class="w-5 h-5 rounded border-stone-300 text-clay-600 focus:ring-clay-500" />
          <span class="text-sm text-ink font-medium">这是一笔退款</span>
        </label>

        {#if errorMsg}
          <div class="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-xl">{errorMsg}</div>
        {/if}

        <div class="flex gap-3">
          <button onclick={resetForm}
            class="flex-1 border-2 border-stone-200 text-stone-600 py-3 rounded-full font-medium hover:bg-stone-50 transition">
            重置
          </button>
          <button onclick={handleSubmit} disabled={loading}
            class="flex-1 btn-primary">
            {loading ? '保存中...' : '确认记账'}
          </button>
        </div>
      </div>
    {/if}
  </main>
</div>
