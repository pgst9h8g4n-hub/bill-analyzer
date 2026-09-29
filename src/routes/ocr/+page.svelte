<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { createExpense } from '$lib/db/expenses';
  import { getCategories } from '$lib/db';
  import { centsToYuan } from '$lib/utils/format';
  import type { Category } from '$lib/db';
  import { currentUserId, currentLedgerId } from '$lib/session';
  import { createWorker, type Worker as TesseractWorker } from 'tesseract.js';
  import { get } from 'svelte/store';

  let ocrAmount = '';
  let ocrTime = new Date().toISOString().slice(0, 16);
  let ocrMerchant = '';
  let selectedCategory = 0;
  let detectedCatName = ''; // OCR 检测到的大类名，分类加载完后回填
  let remark = '';
  let isRefund = false;
  let loading = false;
  let success = false;
  let errorMsg = '';
  let ocrProgress = 0;
  let ocrRunning = false;
  let ocrError = '';
  let categories: Category[] = [];
  let selectedImage: string | null = null;
  let cameraInput: HTMLInputElement | undefined;
  let previousOcrResult: string | null = null;
  let worker: TesseractWorker | null = null;
  let debugText = '';
  const _OCR_DEBUG_PH = '粘贴OCR识别出的文字，然后点一键应用测试解析效果';
  let manualApply = false;

  let userId = 0;
  let ledgerId = 0;

  // 更精确的商户/分类关键词排序：长词优先、具体优先于泛化
  // 规则顺序：越具体的越靠前，支付平台/泛词放最后
  const MERCHANT_CATEGORY: [string, string][] = [
    // ── 平台/品牌（最长最具体，优先）──────────────────────
    ['抖音生活服务', '购物'], ['美团外卖', '餐饮'], ['饿了么', '餐饮'], ['盒马鲜生', '购物'],
    ['麦当劳', '餐饮'], ['肯德基', '餐饮'], ['星巴克', '餐饮'], ['瑞幸', '餐饮'],
    ['喜茶', '餐饮'], ['奈雪', '餐饮'], ['奶茶', '餐饮'], ['咖啡', '餐饮'], ['汉堡', '餐饮'],
    ['高德打车', '交通'], ['滴滴出行', '交通'], ['滴滴', '交通'], ['哈啰出行', '交通'],
    ['淘宝', '购物'], ['天猫', '购物'], ['拼多多', '购物'], ['京东', '购物'],
    ['唯品会', '购物'], ['得物', '购物'], ['网易严选', '购物'],
    ['爱奇艺', '娱乐'], ['腾讯视频', '娱乐'], ['优酷', '娱乐'], ['B站', '娱乐'], ['哔哩哔哩', '娱乐'],
    ['美团', '餐饮'], ['大众点评', '餐饮'], ['大众', '餐饮'],
    // ── 金融/保险/行政（泛词兜底）─────────────────────────
    ['支付宝', '其他'], ['微信支付', '其他'], ['云闪付', '其他'],
    ['交通违章', '交通'], ['交通罚款', '其他'], ['交警', '交通'], ['交管12123', '其他'],
    ['车险', '其他'], ['平安保险', '其他'], ['人保', '其他'], ['太平洋保险', '其他'],
    ['财产保险', '其他'], ['社会保险', '其他'], ['公积金', '其他'], ['社保', '其他'],
    ['非税收入', '其他'], ['税务局', '其他'], ['财政局', '其他'],
    // ── 交通 ──────────────────────────────────────────────
    ['地铁', '交通'], ['公交', '交通'], ['共享单车', '交通'], ['摩拜', '交通'], ['哈啰', '交通'],
    ['加油', '交通'], ['中石化', '交通'], ['中石油', '交通'], ['停车', '交通'],
    ['火车票', '交通'], ['飞机票', '交通'], ['高铁', '交通'], ['民航', '交通'],
    ['打车', '交通'], ['网约车', '交通'],
    // ── 餐饮 ──────────────────────────────────────────────
    ['餐厅', '餐饮'], ['火锅', '餐饮'], ['烧烤', '餐饮'], [' pizza', '餐饮'],
    // ── 购物 ──────────────────────────────────────────────
    ['超市', '购物'], ['沃尔玛', '购物'], ['便利店', '购物'], ['罗森', '购物'], ['711', '购物'],
    ['服装', '购物'], ['服饰', '购物'], ['鞋子', '购物'], ['鞋', '购物'],
    ['化妆品', '购物'], ['美妆', '购物'], ['护肤品', '购物'],
    ['数码', '购物'], ['电子产品', '购物'], ['手机', '购物'],
    // ── 娱乐 ──────────────────────────────────────────────
    ['电影', '娱乐'], ['电影院', '娱乐'], ['游戏', '娱乐'], ['充值', '娱乐'],
    ['KTV', '娱乐'], ['按摩', '娱乐'], ['SPA', '娱乐'],
    // ── 医疗 ──────────────────────────────────────────────
    ['医院', '医疗'], ['药店', '医疗'], ['门诊', '医疗'], ['牙科', '医疗'], ['体检', '医疗'],
    // ── 住房 ──────────────────────────────────────────────
    ['房租', '住房'], ['物业费', '住房'], ['物业', '住房'], ['水电费', '住房'],
    ['水费', '住房'], ['电费', '住房'], ['燃气费', '住房'], ['暖气费', '住房'],
    ['房贷', '住房'], ['月供', '住房'],
    // ── 通讯 ──────────────────────────────────────────────
    ['话费', '通讯'], ['流量费', '通讯'], ['宽带', '通讯'],
    // ── 教育 ──────────────────────────────────────────────
    ['学费', '教育'], ['培训', '教育'], ['课程', '教育'], ['教材', '教育'],
    // ── 泛词兜底（所有其他未匹配）──────────────────────────
    ['保险', '其他'], ['金融', '其他'], ['银行', '其他'], ['消费', '其他'],
    ['还款', '其他'], ['分期', '其他'],
  ];

  // ── 分类名称归一化映射 ───────────────────────────────────────
  // 把 OCR 可能识别出的各类名称统一映射到标准分类名
  const CATEGORY_ALIASES: Record<string, string> = {
    // 餐饮相关
    '餐饮': '餐饮', '饮食': '餐饮', '伙食': '餐饮', '吃饭': '餐饮', '三餐': '餐饮',
    '外卖': '餐饮', '早餐': '餐饮', '午餐': '餐饮', '晚餐': '餐饮', '宵夜': '餐饮',
    // 交通相关
    '交通': '交通', '出行': '交通', '通勤': '交通', '旅途': '交通', '旅行': '交通',
    '车': '交通', '油费': '交通', '停车费': '交通', '过路费': '交通', '高速费': '交通',
    // 购物相关
    '购物': '购物', '网购': '购物', '电商': '购物', '零售': '购物',
    '购物消费': '购物', '购买商品': '购物', '商品': '购物',
    // 娱乐相关
    '娱乐': '娱乐', '休闲': '娱乐', '玩乐': '娱乐', '娱悦': '娱乐',
    '文体': '娱乐', '兴趣爱好': '娱乐', '运动': '娱乐',
    // 医疗相关
    '医疗': '医疗', '健康': '医疗', '保健': '医疗', '医药': '医疗',
    '药品': '医疗', '看病': '医疗', '就诊': '医疗',
    // 住房相关
    '住房': '住房', '居住': '住房', '房': '住房', '房产': '住房',
    '房租': '住房', '房贷': '住房', '物业费': '住房',
    // 通讯相关
    '通讯': '通讯', '通信': '通讯', '手机': '通讯', '电话': '通讯', '网络': '通讯', '网费': '通讯',
    // 教育相关
    '教育': '教育', '学习': '教育', '培训': '教育', '学费': '教育',
    // 其他
    '其他': '其他', '杂项': '其他', '日常': '其他', '生活': '其他',
  };

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
    if (worker) { await worker.terminate(); worker = null; }
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
      // 只设置 LSTM 模式支持的参数
      const params: Record<string, unknown> = {};
      params['tessedit_pageseg_mode'] = psm as unknown as Tesseract.PSM;
      if (whitelist) params['tessedit_char_whitelist'] = whitelist;
      await worker.setParameters(params);
    } catch (e: any) {
      console.error('Worker init error:', e);
      ocrError = 'OCR 库加载失败，请检查网络后重试';
    }
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

  // Classify every amount in the text by its surrounding label:
  // 实付/应付 = actually paid; 原价/订单金额/交易金额 = list price; 优惠/立减 = discount.
  // fulltextBig = ¥ 前缀的大字实付（页面最醒目的那个数，通常是实付）。
  // Handles thousands commas (2,390.63 → 2390.63).
  function collectClassifiedAmounts(text: string): { paid: number[]; list: number[]; discount: number[]; bare: number[]; fulltextBig: number[] } {
    const out = { paid: [] as number[], list: [] as number[], discount: [] as number[], bare: [] as number[], fulltextBig: [] as number[] };
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
    // 负号金额（−149.34）= 支出实付，最醒目
    for (const m of text.matchAll(/(?:^|\s)([−\-]\s*\d{1,3}(?:,\d{3})*\.?\d{0,2})\b(?!\s*元)/g)) {
      const v = Math.abs(parseFloat(m[1].replace(/[−\-\s]/g, '').replace(/,/g, '')));
      if (valid(v)) out.fulltextBig.push(v);
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
    out.paid = [...new Set(out.paid)];
    out.list = [...new Set(out.list)];
    out.discount = [...new Set(out.discount)];
    out.bare = [...new Set(out.bare)];
    out.fulltextBig = [...new Set(out.fulltextBig)];
    return out;
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
    classified: { paid: number[]; list: number[]; discount: number[]; bare: number[]; fulltextBig: number[] },
    biggestCrop: number | null = null,
    cleanTextMax: number = 0
  ): number | null {
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

    // 时间完全没读清才返回 null
    if (!timePart) return null;
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

  async function runOCR(imageDataUrl: string) {
    ocrError = '';
    ocrRunning = true;
    ocrProgress = 5;
    errorMsg = '';

    // Preload the image ONCE (shared by both detection and preprocessing)
    const img = await loadImage(imageDataUrl);
    if (!img) {
      ocrRunning = false;
      errorMsg = '图片加载失败，请重试';
      return;
    }

    // Step 1: Full-page OCR (single PSM pass) — the amount is reliably in the text,
    // and we need it for merchant / time / category too.
    ocrProgress = 10;
    const processedUrl = await preprocessImage(imageDataUrl, 3);
    await initWorker(4);
    let fullText = '';
    if (!ocrError) {
      const { data } = await worker!.recognize(processedUrl);
      fullText = data.text.trim();
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

    // Step 3: Locate the biggest-font numeric word directly (via Tesseract word
    // bboxes) and re-OCR just that word at 3× for a clean digit read. This targets
    // the page's prominent 实付 (抖音 -7.90 / 违章 -149.34 / 云闪付 2,390.63) which
    // full-page text mangles. Also keep crop-line OCR values as a secondary pool.
    if (!ocrError) {
      // 先算文本解析的干净最大值，供守卫使用（必须在 crop 污染 bare 之前）
      const cleanTextMax = Math.max(
        ...classified.paid,
        ...classified.fulltextBig,
        ...classified.list,
        ...classified.discount
      );
      const biggest = await pickBiggestFontAmount(img);
      // Secondary: line-crop values (smaller font lines like 订单号 can still leak in)
      const crops = detectAmountLines(img, 4);
      for (const { canvas } of crops) {
        const amountText = await ocrAmountStrip(canvas);
        const val = parseAmountFromOCR(amountText);
        if (val !== null && !classified.bare.includes(val)) classified.bare.push(val);
      }
      const picked = pickPaidAmount(classified, biggest, cleanTextMax);
      ocrAmount = picked !== null ? String(picked) : '';
      if (picked !== null) console.log('[OCR] 最终金额 →', picked);
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

  onMount(() => {
    // 详细调试日志
    console.log('[OCR] onMount called');
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
      await createExpense(ledgerId, {
        userId,
        amount: ocrAmount,
        date: ocrTime || new Date().toISOString(),
        categoryId: selectedCategory,
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

  function applyDebugText() {
    const text = debugText;
    if (!text) return;
    const amount = parseAmount(text);
    if (amount) ocrAmount = amount;
    const merchant = detectMerchant(text);
    if (merchant) ocrMerchant = merchant;
    const parsedTime = parseTime(text);
    if (parsedTime) ocrTime = parsedTime;
    const catName = detectCategoryName(text, merchant);
    if (catName) {
      const matched = categories.find(c => c.name === catName);
      if (matched) selectedCategory = matched.id;
    }
    previousOcrResult = text;
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
        <input
          id="camera-input"
          bind:this={cameraInput}
          type="file"
          accept="image/*"
          class="hidden"
          onchange={handleImageSelect}
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

      <!-- 识别结果显示 -->
      {#if previousOcrResult && !ocrRunning}
        <div class="bg-white rounded-2xl shadow-card p-4">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-sm font-medium text-ink">识别结果</span>
            <span class="text-xs text-stone-400 ml-auto">可点击修改</span>
          </div>
          <p class="text-xs text-stone-500 leading-relaxed whitespace-pre-wrap max-h-24 overflow-y-auto">{previousOcrResult}</p>
        </div>
      {/if}

      <!-- 手动输入 OCR 文字调试 -->
      <div class="bg-white rounded-2xl shadow-card p-4 space-y-3">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-ink">手动输入 OCR 文字（调试用）</span>
          <button type="button" onclick={() => { applyDebugText(); manualApply = true; }}
            class="ml-auto px-3 py-1 bg-clay-600 text-white text-xs rounded-full hover:bg-clay-700 transition">
            一键应用
          </button>
        </div>
        <textarea bind:value={debugText} rows="6"
          placeholder={_OCR_DEBUG_PH}
          class="input-field text-xs font-mono resize-none"></textarea>
        {#if debugText}
          <div class="text-xs text-stone-500">
            金额: <span class="font-mono font-semibold text-ink">{parseAmount(debugText) || '(未找到)'}</span>
            · 商户: <span class="font-mono font-semibold text-ink">{detectMerchant(debugText) || '(未找到)'}</span>
            · 分类: <span class="font-mono font-semibold text-ink">{detectCategoryName(debugText) || '(未找到)'}</span>
            · 时间: <span class="font-mono font-semibold text-ink">{parseTime(debugText) || '(未找到)'}</span>
          </div>
        {/if}
      </div>

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
