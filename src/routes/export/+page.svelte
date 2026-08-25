<script lang="ts">
  import { onMount } from 'svelte';
  import { getExpenses } from '$lib/db/expenses';
  import { getCategories } from '$lib/db';
  import { exportCSV, exportJSON, getExpensesForExport } from '$lib/export';
  import { centsToYuan } from '$lib/utils/format';
  import type { Expense } from '$lib/db';

  let expenses: Expense[] = [];
  let currentUserId = 0;
  let loading = true;

  onMount(async () => {
    const stored = localStorage.getItem('xiaoliuji_session');
    if (stored) {
      try { currentUserId = JSON.parse(stored).userId; } catch {}
    }
    expenses = await getExpensesForExport(currentUserId);
    loading = false;
  });

  async function downloadCSV() {
    const csv = await exportCSV(currentUserId, expenses);
    downloadFile(csv, '小六记_消费记录.csv', 'text/csv;charset=utf-8');
  }

  async function downloadJSON() {
    const json = await exportJSON(currentUserId, expenses);
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
  <nav class="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between"
       style="padding-top: max(12px, env(safe-area-inset-top));">
    <h1 class="text-lg font-bold">数据导出</h1>
  </nav>

  <main class="px-4 py-4 max-w-md mx-auto space-y-4">
    {#if loading}
      <div class="text-center py-12 text-gray-400">
        <div class="text-3xl mb-2">⏳</div>
        <p class="text-sm">加载中...</p>
      </div>
    {:else}
      <div class="bg-white rounded-2xl shadow-sm p-4">
        <h2 class="font-semibold text-gray-800 mb-2">导出数据</h2>
        <p class="text-sm text-gray-500 mb-4">共 {expenses.length} 条消费记录</p>
        <div class="space-y-3">
          <button onclick={downloadCSV}
            class="w-full flex items-center gap-3 px-4 py-4 bg-green-50 hover:bg-green-100 rounded-xl transition">
            <span class="text-2xl">📄</span>
            <div class="text-left">
              <div class="font-medium text-gray-800">导出 CSV</div>
              <div class="text-xs text-gray-500">Excel 兼容格式，含表头</div>
            </div>
          </button>
          <button onclick={downloadJSON}
            class="w-full flex items-center gap-3 px-4 py-4 bg-blue-50 hover:bg-blue-100 rounded-xl transition">
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
