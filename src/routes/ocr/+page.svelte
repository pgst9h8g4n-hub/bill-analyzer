<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { createExpense } from '$lib/db/expenses';
  import { getCategories } from '$lib/db';
  import { centsToYuan } from '$lib/utils/format';
  import type { Expense, Category } from '$lib/db';

  // Parse OCR params from URL
  const urlParams = new URLSearchParams(window.location.search);
  let ocrAmount = urlParams.get('amount') ?? '';
  let ocrTime = urlParams.get('time') ?? new Date().toISOString().slice(0, 16);
  let ocrMerchant = urlParams.get('merchant') ?? '';

  let categories: Category[] = [];
  let currentUserId = 0;
  let selectedCategory = 0;
  let remark = '';
  let isRefund = false;
  let loading = false;
  let success = false;
  let errorMsg = '';

  onMount(async () => {
    const stored = localStorage.getItem('xiaoliuji_session');
    if (stored) {
      try {
        currentUserId = JSON.parse(stored).userId;
      } catch {}
    }
    if (!currentUserId) {
      goto('/login');
      return;
    }
    categories = await getCategories();
    if (categories.length > 0) selectedCategory = categories[0].id;
  });

  async function handleSubmit() {
    if (!ocrAmount || isNaN(parseFloat(ocrAmount))) {
      errorMsg = '金额格式不正确';
      return;
    }
    loading = true;
    errorMsg = '';
    try {
      await createExpense(currentUserId, {
        amount: ocrAmount,
        date: ocrTime || new Date().toISOString(),
        categoryId: selectedCategory,
        merchant: ocrMerchant || undefined,
        remark: remark || undefined,
        isRefund
      });
      success = true;
      // Clear URL params
      window.history.replaceState(null, '', window.location.pathname);
    } catch {
      errorMsg = '保存失败，请重试';
    } finally {
      loading = false;
    }
  }

  function goBack() {
    goto('/expenses');
  }
</script>

<div class="min-h-screen bg-gray-50">
  <nav class="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between"
       style="padding-top: max(12px, env(safe-area-inset-top));">
    <h1 class="text-lg font-bold">确认记账</h1>
    <button onclick={goBack} class="text-sm opacity-80 hover:opacity-100">返回</button>
  </nav>

  <main class="px-4 py-4 max-w-md mx-auto space-y-4">
    {#if success}
      <div class="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
        <div class="text-5xl mb-3">✅</div>
        <p class="text-lg font-semibold text-green-800">记账成功！</p>
        <p class="text-sm text-green-600 mt-1">¥{centsToYuan(parseFloat(ocrAmount) * 100)} 已记录</p>
        <button onclick={goBack}
          class="mt-4 bg-green-600 text-white px-6 py-3 rounded-xl font-medium">
          返回首页
        </button>
      </div>
    {:else}
      <!-- OCR识别结果提示 -->
      {#if ocrAmount}
        <div class="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-lg">📸</span>
            <span class="font-medium text-indigo-800">OCR 识别结果</span>
          </div>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div class="text-indigo-500">金额</div>
              <div class="font-semibold text-indigo-800">¥{centsToYuan(parseFloat(ocrAmount) * 100)}</div>
            </div>
            {#if ocrMerchant}
              <div>
                <div class="text-indigo-500">商户</div>
                <div class="font-medium text-indigo-800">{ocrMerchant}</div>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <div class="bg-white rounded-2xl shadow-sm p-4 space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">金额（元）</label>
          <input type="number" step="0.01" bind:value={ocrAmount}
            placeholder="0.00"
            class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 text-xl font-semibold outline-none" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">时间</label>
          <input type="datetime-local" bind:value={ocrTime}
            class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">分类</label>
          <div class="grid grid-cols-5 gap-2">
            {#each categories as cat}
              <button type="button" onclick={() => selectedCategory = cat.id}
                class="flex flex-col items-center py-2 rounded-xl border-2 transition
                  {selectedCategory === cat.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'}">
                <span class="text-xl">{cat.icon}</span>
                <span class="text-xs text-gray-600 mt-0.5">{cat.name}</span>
              </button>
            {/each}
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">商户（OCR识别）</label>
          <input type="text" bind:value={ocrMerchant} placeholder="商户名称"
            class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">备注（选填）</label>
          <input type="text" bind:value={remark} placeholder="添加备注"
            class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none" />
        </div>

        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" bind:checked={isRefund} class="w-5 h-5 rounded" />
          <span class="text-sm text-gray-700">退款（负数计入统计）</span>
        </label>

        {#if errorMsg}
          <div class="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-xl">{errorMsg}</div>
        {/if}

        <button onclick={handleSubmit} disabled={loading}
          class="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 transition disabled:opacity-50">
          {loading ? '保存中...' : '确认记账'}
        </button>
      </div>
    {/if}
  </main>
</div>
