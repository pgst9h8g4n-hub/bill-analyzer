<script lang="ts">
  import { onMount } from 'svelte';
  import { getExpenses } from '$lib/db/expenses';
  import { getCategories } from '$lib/db';
  import { exportCSV, exportJSON, getExpensesForExport } from '$lib/export';
  import { centsToYuan } from '$lib/utils/format';
  import type { Expense, Category } from '$lib/db';
  import { currentUserId } from '$lib/session';
  import { currentLedgerId } from '$lib/session';

  $: userId = $currentUserId;
  $: ledgerId = $currentLedgerId;
  let expenses: Expense[] = [];
  let categories: Category[] = [];
  let loading = true;
  let filterStartDate = '';
  let filterEndDate = '';
  let filterCategoryId = 0;

  onMount(async () => {
    if (!userId) return;
    [expenses, categories] = await Promise.all([
      getExpensesForExport(ledgerId),
      getCategories(ledgerId)
    ]);
    loading = false;
  });

  function getFilteredExpenses(): Expense[] {
    return expenses.filter(e => {
      if (filterCategoryId && e.category_id !== filterCategoryId) return false;
      if (filterStartDate && e.paid_at < filterStartDate) return false;
      if (filterEndDate && e.paid_at > filterEndDate + 'T23:59:59') return false;
      return true;
    });
  }

  async function downloadCSV() {
    const filtered = getFilteredExpenses();
    if (filtered.length === 0) return;
    const csv = await exportCSV(ledgerId, filtered);
    downloadFile(csv, '小六记_消费记录.csv', 'text/csv;charset=utf-8');
  }

  async function downloadJSON() {
    const filtered = getFilteredExpenses();
    if (filtered.length === 0) return;
    const json = await exportJSON(ledgerId, filtered);
    downloadFile(json, '小六记_消费记录.json', 'application/json');
  }

  function downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="min-h-screen bg-paper">
  <main class="px-4 py-4 max-w-md mx-auto space-y-4 pb-20">
    {#if loading}
      <div class="text-center py-12 text-stone-400">
        <div class="text-3xl mb-2" aria-hidden="true">⏳</div>
        <p class="text-sm">加载中...</p>
      </div>
    {:else}
      <!-- 筛选 -->
      <div class="bg-white rounded-2xl shadow-card p-4 space-y-3">
        <h2 class="font-semibold text-ink text-base">筛选条件</h2>
        <div class="flex gap-2">
          <input type="date" bind:value={filterStartDate}
            class="input-field text-sm py-2 flex-1" />
          <input type="date" bind:value={filterEndDate}
            class="input-field text-sm py-2 flex-1" />
        </div>
        <select bind:value={filterCategoryId}
          class="input-field text-sm py-2 appearance-none" style="background-image:url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2378716c%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3e%3cpolyline points=%276 9 12 15 18 9%27%3e%3c/polyline%3e%3c/svg%3e');background-position:right .75rem center;background-size:1rem;">
          <option value="0">全部分类</option>
          {#each categories as cat}
            <option value={cat.id}>{cat.icon} {cat.name}</option>
          {/each}
        </select>
      </div>

      <div class="bg-white rounded-2xl shadow-card p-4">
        <h2 class="font-semibold text-ink text-base mb-1">导出数据</h2>
        <p class="text-sm text-stone-400 mb-4">共 {expenses.length} 条记录，{getFilteredExpenses().length} 条匹配</p>
        <div class="space-y-3">
          <button onclick={downloadCSV}
            class="w-full flex items-center gap-3 px-4 py-4 bg-white border-2 border-stone-100 rounded-2xl hover:border-clay-200 hover:bg-clay-50 transition-all disabled:opacity-50">
            <div class="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-lg shrink-0">📄</div>
            <div class="text-left flex-1">
              <div class="font-medium text-ink">导出 CSV</div>
              <div class="text-xs text-stone-400">Excel 兼容格式，含表头</div>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
          </button>
          <button onclick={downloadJSON}
            class="w-full flex items-center gap-3 px-4 py-4 bg-white border-2 border-stone-100 rounded-2xl hover:border-clay-200 hover:bg-clay-50 transition-all disabled:opacity-50">
            <div class="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-lg shrink-0">🔧</div>
            <div class="text-left flex-1">
              <div class="font-medium text-ink">导出 JSON</div>
              <div class="text-xs text-stone-400">原始数据格式，便于程序处理</div>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
          </button>
        </div>
      </div>

      {#if expenses.length === 0}
        <div class="text-center py-12 bg-white rounded-2xl shadow-soft">
          <div class="text-4xl mb-2" aria-hidden="true">📭</div>
          <p class="text-sm text-stone-500 font-medium">暂无数据可导出</p>
        </div>
      {/if}
    {/if}
  </main>
</div>
