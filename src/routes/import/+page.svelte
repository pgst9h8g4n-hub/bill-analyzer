<script lang="ts">
  import { onMount } from 'svelte';
  import { getCategories, getUnsortedCategoryId, getTransferCategoryId } from '$lib/db';
  import { importExpenses } from '$lib/db/expenses';
  import type { Category } from '$lib/db';
  import { parseBillFile, detectSource } from '$lib/parse';
  import { categoryForRecord } from '$lib/parse/types';
  import type { ParsedRecord } from '$lib/parse/types';
  import { subTypeLabel, isIncome, isNeutral, isRefund } from '$lib/db/expense-math';
  import { currentUserId, currentLedgerId } from '$lib/session';
  import { centsToYuan } from '$lib/utils/format';

  $: userId = $currentUserId;
  $: ledgerId = $currentLedgerId;

  let categories: Category[] = [];
  let unsortedId = 0;
  let transferId = 0;

  let fileName = '';
  let source: 'alipay' | 'wechat' | 'douyin' = 'alipay';
  let records: ParsedRecord[] = [];
  let excluded = new Set<number>();

  let parsing = false;
  let importError = '';
  let importMsg = '';
  let done = false;

  $: shownRecords = records.filter((_, i) => !excluded.has(i));
  $: importCount = shownRecords.length;
  $: importTotal = shownRecords.reduce((s, r) => s + r.amount_cents, 0);

  async function loadCats() {
    if (!ledgerId) return;
    categories = await getCategories(ledgerId);
    unsortedId = categories.find(c => c.name === '待整理')?.id ?? 0;
    transferId = categories.find(c => c.name === '转账')?.id ?? 0;
    if (unsortedId === 0) unsortedId = await getUnsortedCategoryId(ledgerId);
    if (transferId === 0) transferId = await getTransferCategoryId(ledgerId);
  }

  function handleFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    fileName = file.name;
    const kind = detectSource(file);
    if (kind === 'unknown') {
      importError = '无法识别文件来源，请上传支付宝 CSV、微信 xlsx 或抖音 PDF';
      records = [];
      return;
    }
    source = kind;
    importError = '';
    importMsg = '';
    done = false;
    excluded = new Set();
    parsing = true;
    parseBillFile(file)
      .then(res => {
        records = res.records;
        source = res.source as 'alipay' | 'wechat' | 'douyin';
      })
      .catch(err => { importError = err?.message || '解析失败'; records = []; })
      .finally(() => { parsing = false; });
  }

  function toggleExclude(i: number) {
    if (excluded.has(i)) excluded.delete(i); else excluded.add(i);
  }

  async function doImport() {
    importMsg = '';
    importError = '';
    if (shownRecords.length === 0) { importError = '没有可导入的记录'; return; }
    try {
      // 现场读一次分类，避免依赖可能陈旧的响应式闭包变量（onMount 时 ledger 未就绪会拿到空列表）
      const freshCats = await getCategories(ledgerId);
      const freshUnsorted = freshCats.find(c => c.name === '待整理')?.id ?? await getUnsortedCategoryId(ledgerId);
      const freshTransfer = freshCats.find(c => c.name === '转账')?.id ?? await getTransferCategoryId(ledgerId);
      const { importExpenses: imp } = await import('$lib/db/expenses');
      const written = await imp(ledgerId, userId, shownRecords.map(r => ({
        paid_at: r.paid_at,
        amount_cents: r.amount_cents,
        category_id: categoryForRecord(r, freshCats, freshUnsorted, freshTransfer),
        merchant: r.merchant,
        remark: r.remark,
        direction: r.direction,
        subType: r.subType
      })));
      done = true;
      importMsg = `成功导入 ${written} 笔记录`;
      records = [];
      excluded = new Set();
      fileName = '';
    } catch {
      importError = '导入失败，请重试';
    }
  }

  function dirLabel(r: ParsedRecord): string {
    if (isRefund(r as any)) return '退款';
    if (isIncome(r as any)) return '收入';
    if (isNeutral(r as any)) return '中性';
    return '支出';
  }

  function subLabel(r: ParsedRecord): string {
    switch (r.subType) {
      case 'transfer': return '转账';
      case 'repay': return '还款';
      case 'refund': return '退款';
      case 'redpacket': return '红包';
      case 'fund_return': return '理财';
      default: return '';
    }
  }

  onMount(() => { loadCats(); });
  $: if (userId > 0 && ledgerId > 0) loadCats();
</script>

<div class="min-h-screen bg-paper">
  <main class="px-4 py-4 max-w-md mx-auto space-y-3 pb-24">

    <!-- 标题 -->
    <div class="flex items-center gap-3">
      <a href="/" class="w-9 h-9 rounded-full bg-white shadow-card flex items-center justify-center text-ink shrink-0">←</a>
      <h1 class="font-semibold text-ink text-lg">导入账单</h1>
    </div>

    <!-- 文件选择 -->
    <div class="bg-white rounded-2xl shadow-card p-4 space-y-3">
      <div class="text-sm font-medium text-ink">选择账单文件</div>
      <label class="block">
        <div class="border-2 border-dashed border-stone-300 rounded-xl p-6 text-center cursor-pointer hover:border-clay-400 transition">
          {#if fileName}
            <div class="text-2xl mb-1" aria-hidden="true">📄</div>
            <div class="text-sm text-ink truncate">{fileName}</div>
          {:else}
            <div class="text-2xl mb-1" aria-hidden="true">📂</div>
            <div class="text-sm text-stone-500">点击选择文件</div>
            <div class="text-xs text-stone-400 mt-1">支付宝 .csv（GBK） / 微信 .xlsx / 抖音 .pdf</div>
          {/if}
        </div>
        <input type="file" accept=".csv,.xlsx,.pdf" onchange={handleFile} class="hidden" />
      </label>
      {#if parsing}
        <div class="text-xs text-stone-400 text-center">正在解析…</div>
      {/if}
      {#if importError}
        <div class="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{importError}</div>
      {/if}
    </div>

    <!-- 预览 -->
    {#if records.length > 0}
      <div class="bg-white rounded-2xl shadow-card p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div class="text-sm font-medium text-ink">解析结果</div>
          <div class="text-xs text-stone-400">{importCount} 笔 / 合计 ¥{centsToYuan(importTotal)}</div>
        </div>

        <div class="text-xs text-stone-400 leading-relaxed">
          将导入 {importCount} 笔。收入（红包/转账/理财收益）记入收入合计，记正；退款冲减消费合计（单列黄色）；中性交易（转账卡/还款）不入消费/收入汇总，明细里灰色弱化。
        </div>

        <div class="max-h-72 overflow-auto divide-y divide-stone-100">
          {#each records as r, i}
            {#if !excluded.has(i)}
              <div class="flex items-center gap-2 py-2">
                <input type="checkbox" checked onchange={() => toggleExclude(i)}
                  class="w-4 h-4 rounded border-stone-300 text-clay-600 focus:ring-clay-500 shrink-0"
                  aria-label={i.toString()} />
                <div class="flex-1 min-w-0">
                  <div class="text-sm text-ink truncate">{r.merchant || subLabel(r) || r.remark || '—'}</div>
                  <div class="text-[11px] text-stone-400">{r.paid_at.replace('T', ' ')} · {dirLabel(r)}{subLabel(r) ? ' · ' + subLabel(r) : ''}</div>
                </div>
                <div class="text-sm font-mono shrink-0" style={isIncome(r as any) ? 'color:#16A34A;' : isRefund(r as any) ? 'color:#D97706;' : 'color:inherit;'}>
                  {isRefund(r as any) ? '−' : isIncome(r as any) ? '+' : '−'}¥{centsToYuan(r.amount_cents)}
                </div>
              </div>
            {/if}
          {/each}
        </div>

        <button onclick={doImport} class="w-full bg-clay-600 text-white rounded-xl py-3 font-medium text-sm active:scale-[0.98] transition">
          确认导入 {importCount} 笔
        </button>
        {#if importMsg}
          <div class="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2 text-center">{importMsg} <a href="/expenses" class="underline">去查看明细</a></div>
        {/if}
      </div>
    {/if}

  </main>
</div>
