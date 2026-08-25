<script lang="ts">
  import { onMount } from 'svelte';
  import { getExpenses } from '$lib/db/expenses';
  import { getCategories } from '$lib/db';
  import { exportCSV, exportJSON, getExpensesForExport } from '$lib/export';
  import { centsToYuan } from '$lib/utils/format';
  import type { Expense, Category } from '$lib/db';
  import { currentUserId } from '$lib/session';

  $: userId = $currentUserId;
  let expenses: Expense[] = [];
  let categories: Category[] = [];
  let loading = true;
  let filterStartDate = '';
  let filterEndDate = '';
  let filterCategoryId = 0;

  onMount(async () => {
    if (!userId) return;
    [expenses, categories] = await Promise.all([
      getExpensesForExport(userId),
      getCategories()
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
    const csv = await exportCSV(userId, filtered);
    downloadFile(csv, '小六记_消费记录.csv', 'text/csv;charset=utf-8');
  }

  async function downloadJSON() {
    const filtered = getFilteredExpenses();
    if (filtered.length === 0) return;
    const json = await exportJSON(userId, filtered);
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

<div class="min-h-screen bg-gray-50">
  <main class="px-4 py-4 max-w-md mx-auto space-y-4">
    {#if loading}
      <div class="text-center py-12 text-gray-400">
        <div class="text-3xl mb-2">⏳</div>
        <p class="text-sm">加载中...</p>
      </div>
    {:else}
      <!-- 筛选 -->
      <div class="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <h2 class="font-semibold text-gray-800">筛选条件</h2>
        <div class="flex gap-2">
          <input type="date" bind:value={filterStartDate}
            class="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-500" />
          <input type="date" bind:value={filterEndDate}
            class="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-500" />
        </div>
        <select bind:value={filterCategoryId}
          class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-500">
          <option value="0">全部分类</option>
          {#each categories as cat}
            <option value={cat.id}>{cat.icon} {cat.name}</option>
          {/each}
        </select>
      </div>

      <div class="bg-white rounded-2xl shadow-sm p-4">
        <h2 class="font-semibold text-gray-800 mb-2">导出数据</h2>
        <p class="text-sm text-gray-500 mb-4">共 {expenses.length} 条记录，{getFilteredExpenses().length} 条匹配</p>
        <div class="space-y-3">
          <button onclick={downloadCSV}
            class="w-full flex items-center gap-3 px-4 py-4 bg-green-50 hover:bg-green-100 rounded-xl transition disabled:opacity-50">
            <span class="text-2xl">📄</span>
            <div class="text-left">
              <div class="font-medium text-gray-800">导出 CSV</div>
              <div class="text-xs text-gray-500">Excel 兼容格式，含表头</div>
            </div>
          </button>
          <button onclick={downloadJSON}
            class="w-full flex items-center gap-3 px-4 py-4 bg-blue-50 hover:bg-blue-100 rounded-xl transition disabled:opacity-50">
            <span class="text-2xl">🔧</span>
            <div class="text-left">
              <div class="font-medium text-gray-800">导出 JSON</div>
              <div class="text-xs text-gray-500">原始数据格式，便于程序处理</div>
            </div>
          </button>
        </div>
      </div>

      {#if expenses.length === 0}
        <div class="text-center py-12 text-gray-400">
          <div class="text-4xl mb-2">📭</div>
          <p class="text-sm">暂无数据可导出</p>
        </div>
      {/if}
    {/if}
  </main>
</div>
