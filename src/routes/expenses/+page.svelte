<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    getExpenses,
    createExpense,
    updateExpense,
    deleteExpense,
    getCategories,
    type ExpenseFormData
  } from './+page.server';
  import type { Expense, Category } from '$lib/db';
  import { centsToYuan } from '$lib/utils/format';

  const dispatch = createEventDispatcher();

  let expenses: Expense[] = [];
  let categories: Category[] = [];
  let currentUserId = 0;

  // Filters
  let filterStartDate = '';
  let filterEndDate = '';
  let filterCategoryId = 0;

  // Add/Edit modal
  let showForm = false;
  let editingId: number | null = null;
  let formAmount = '';
  let formDate = new Date().toISOString().slice(0, 16);
  let formCategoryId = 0;
  let formMerchant = '';
  let formRemark = '';
  let formIsRefund = false;
  let formError = '';

  // Delete confirm
  let deletingId: number | null = null;

  onMount(async () => {
    const stored = localStorage.getItem('xiaoliuji_session');
    if (stored) {
      try {
        currentUserId = JSON.parse(stored).userId;
      } catch {}
    }
    categories = await getCategories();
    if (categories.length > 0) formCategoryId = categories[0].id;
    await loadExpenses();
  });

  async function loadExpenses() {
    expenses = await getExpenses(currentUserId, {
      startDate: filterStartDate || undefined,
      endDate: filterEndDate || undefined,
      categoryId: filterCategoryId || undefined
    });
  }

  function openAdd() {
    editingId = null;
    formAmount = '';
    formDate = new Date().toISOString().slice(0, 16);
    formCategoryId = categories[0]?.id ?? 0;
    formMerchant = '';
    formRemark = '';
    formIsRefund = false;
    formError = '';
    showForm = true;
  }

  function openEdit(expense: Expense) {
    editingId = expense.id;
    formAmount = centsToYuan(expense.amount_cents);
    formDate = expense.paid_at.slice(0, 16);
    formCategoryId = expense.category_id;
    formMerchant = expense.merchant ?? '';
    formRemark = expense.remark ?? '';
    formIsRefund = expense.is_refund;
    formError = '';
    showForm = true;
  }

  async function handleSubmit() {
    formError = '';
    if (!formAmount || isNaN(parseFloat(formAmount)) || parseFloat(formAmount) <= 0) {
      formError = '请输入有效金额';
      return;
    }
    if (!formDate) {
      formError = '请选择日期时间';
      return;
    }
    if (!formCategoryId) {
      formError = '请选择分类';
      return;
    }

    const data: ExpenseFormData = {
      amount: formAmount,
      date: formDate,
      categoryId: formCategoryId,
      merchant: formMerchant || undefined,
      remark: formRemark || undefined,
      isRefund: formIsRefund
    };

    try {
      if (editingId) {
        await updateExpense(editingId, data);
      } else {
        await createExpense(currentUserId, data);
      }
      showForm = false;
      editingId = null;
      await loadExpenses();
    } catch {
      formError = '保存失败，请重试';
    }
  }

  async function handleDelete(id: number) {
    deletingId = id;
    try {
      await deleteExpense(id);
      await loadExpenses();
    } finally {
      deletingId = null;
    }
  }

  function clearFilters() {
    filterStartDate = '';
    filterEndDate = '';
    filterCategoryId = 0;
    loadExpenses();
  }

  function applyFilters() {
    loadExpenses();
  }

  function getCatIcon(id: number): string {
    return categories.find(c => c.id === id)?.icon ?? '📝';
  }

  function getCatColor(id: number): string {
    return categories.find(c => c.id === id)?.color ?? '#6b7280';
  }

  function getCatName(id: number): string {
    return categories.find(c => c.id === id)?.name ?? '其他';
  }
</script>

<div class="min-h-screen bg-gray-50">
  <nav class="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between"
       style="padding-top: max(12px, env(safe-area-inset-top));">
    <h1 class="text-lg font-bold">消费明细</h1>
    <button onclick={openAdd}
      class="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm font-medium transition">
      + 记账
    </button>
  </nav>

  <main class="px-4 py-4 max-w-md mx-auto space-y-3">
    <!-- 筛选栏 -->
    <div class="bg-white rounded-2xl shadow-sm p-4">
      <div class="flex gap-2 mb-3">
        <input type="date" bind:value={filterStartDate}
          class="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-500"
          placeholder="开始日期" />
        <input type="date" bind:value={filterEndDate}
          class="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-500"
          placeholder="结束日期" />
      </div>
      <div class="flex gap-2">
        <select bind:value={filterCategoryId}
          class="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-500">
          <option value="0">全部分类</option>
          {#each categories as cat}
            <option value={cat.id}>{cat.icon} {cat.name}</option>
          {/each}
        </select>
        <button onclick={applyFilters} class="px-4 bg-indigo-600 text-white rounded-lg text-sm font-medium">筛选</button>
        <button onclick={clearFilters} class="px-3 bg-gray-100 text-gray-600 rounded-lg text-sm">清除</button>
      </div>
    </div>

    <!-- 汇总卡片 -->
    {#if expenses.length > 0}
      <div class="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between">
        <div>
          <div class="text-xs text-gray-400">筛选合计</div>
          <div class="text-2xl font-bold text-indigo-600">
            ¥{centsToYuan(expenses.reduce((s, e) => s + (e.is_refund ? -e.amount_cents : e.amount_cents), 0))}
          </div>
        </div>
        <div class="text-right">
          <div class="text-xs text-gray-400">共 {expenses.length} 笔</div>
        </div>
      </div>
    {/if}

    <!-- 列表 -->
    {#each expenses as expense (expense.id)}
      <div class="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
          style="background-color: {getCatColor(expense.category_id)}20">
          {getCatIcon(expense.category_id)}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium text-gray-800">{getCatName(expense.category_id)}</span>
            {#if expense.is_refund}
              <span class="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">退款</span>
            {/if}
          </div>
          <div class="text-xs text-gray-400 truncate">
            {expense.merchant ?? expense.remark ?? '—'} · {expense.paid_at.slice(0, 16).replace('T', ' ')}
          </div>
        </div>
        <div class="text-right shrink-0">
          <div class="font-semibold {expense.is_refund ? 'text-green-600' : 'text-gray-800'}">
            {expense.is_refund ? '-' : ''}¥{centsToYuan(expense.amount_cents)}
          </div>
          <div class="flex gap-1 mt-1 justify-end">
            <button type="button" onclick={() => openEdit(expense)} title="编辑"
              class="p-1 text-gray-400 hover:text-indigo-600 transition">✏️</button>
            <button type="button" onclick={() => handleDelete(expense.id)} title="删除"
              class="p-1 text-gray-400 hover:text-red-600 transition">🗑️</button>
          </div>
        </div>
      </div>
    {/each}

    {#if expenses.length === 0}
      <div class="text-center py-16 text-gray-400">
        <div class="text-5xl mb-3">📭</div>
        <p class="text-base font-medium">暂无消费记录</p>
        <p class="text-sm mt-1">点击右下角「记账」开始记录</p>
      </div>
    {/if}
  </main>

  <!-- 添加/编辑弹窗 -->
  {#if showForm}
    <div class="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 px-4 py-4">
      <div class="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 space-y-4 animate-slide-up">
        <h2 class="font-semibold text-gray-800 text-lg">{editingId ? '编辑记录' : '添加消费'}</h2>

        {#if formError}
          <div class="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-xl">{formError}</div>
        {/if}

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">金额（元）</label>
          <input type="number" step="0.01" bind:value={formAmount} placeholder="0.00"
            class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 text-xl font-semibold outline-none" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">时间</label>
          <input type="datetime-local" bind:value={formDate}
            class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">分类</label>
          <div class="grid grid-cols-5 gap-2">
            {#each categories as cat}
              <button type="button" onclick={() => formCategoryId = cat.id}
                class="flex flex-col items-center py-2 rounded-xl border-2 transition
                  {formCategoryId === cat.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'}">
                <span class="text-xl">{cat.icon}</span>
                <span class="text-xs text-gray-600 mt-0.5">{cat.name}</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="flex gap-3">
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 mb-1">商户（选填）</label>
            <input type="text" bind:value={formMerchant} placeholder="如：星巴克"
              class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none" />
          </div>
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 mb-1">备注（选填）</label>
            <input type="text" bind:value={formRemark} placeholder="备注"
              class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none" />
          </div>
        </div>

        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" bind:checked={formIsRefund} class="w-5 h-5 rounded" />
          <span class="text-sm text-gray-700">退款（负数计入统计）</span>
        </label>

        <div class="flex gap-3 pt-2">
          <button onclick={() => { showForm = false; editingId = null; }}
            class="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-medium">取消</button>
          <button onclick={handleSubmit}
            class="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700">
            {editingId ? '保存修改' : '确认记账'}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <style>
    @keyframes slide-up {
      from { transform: translateY(100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .animate-slide-up {
      animation: slide-up 0.2s ease-out;
    }
  </style>
</div>
