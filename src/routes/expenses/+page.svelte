<script lang="ts">
  import { onMount } from 'svelte';
  import { getExpenses, deleteExpense } from '$lib/db/expenses';
  import { getCategories } from '$lib/db';
  import { centsToYuan } from '$lib/utils/format';
  import type { Expense, Category } from '$lib/db';
  import { currentUserId, currentLedgerId } from '$lib/session';

  $: userId = $currentUserId;
  $: ledgerId = $currentLedgerId;
  let expenses: Expense[] = [];
  let categories: Category[] = [];
  let loading = true;

  let filterStartDate = '';
  let filterEndDate = '';
  let filterCategoryId = 0;

  let showForm = false;
  let editingId: number | null = null;
  let formAmount = '';
  let formDate = '';
  let formCategoryId = 0;
  let formMerchant = '';
  let formRemark = '';
  let formIsRefund = false;
  let formError = '';

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('startDate')) filterStartDate = params.get('startDate')!;
    if (params.get('endDate')) filterEndDate = params.get('endDate')!;
    if (params.get('category')) {
      const catName = decodeURIComponent(params.get('category')!);
      // Will apply filter after categories load
    }
    categories = await getCategories(ledgerId);
    if (categories.length > 0 && filterCategoryId === 0) {
      filterCategoryId = categories[0].id;
    }
    await loadExpenses();
    loading = false;
  });

  // Reload expenses when user/ledger/filter changes
  $: if (userId > 0 && ledgerId > 0) {
    loadExpenses();
  }

  async function loadExpenses() {
    if (!ledgerId || ledgerId <= 0) return;
    expenses = await getExpenses(ledgerId, {
      startDate: filterStartDate || undefined,
      endDate: filterEndDate || undefined,
      categoryId: filterCategoryId || undefined
    });
    loading = false;
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
    if (!formDate) { formError = '请选择日期时间'; return; }
    if (!formCategoryId) { formError = '请选择分类'; return; }

    try {
      const { createExpense, updateExpense: updateExp } = await import('$lib/db/expenses');
      if (editingId) {
        await updateExp(editingId, {
          amount: formAmount,
          date: formDate,
          categoryId: formCategoryId,
          merchant: formMerchant || undefined,
          remark: formRemark || undefined,
          isRefund: formIsRefund
        });
      } else {
        await createExpense(ledgerId, {
          userId,
          amount: formAmount,
          date: formDate,
          categoryId: formCategoryId,
          merchant: formMerchant || undefined,
          remark: formRemark || undefined,
          isRefund: formIsRefund
        });
      }
      showForm = false;
      editingId = null;
      await loadExpenses();
    } catch {
      formError = '保存失败，请重试';
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('确定删除这笔消费？')) return;
    await deleteExpense(id);
    await loadExpenses();
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

  function getCatInfo(id: number) {
    return categories.find(c => c.id === id) ?? { icon: '📝', color: '#6b7280', name: '其他' };
  }

  $: filteredTotal = expenses.reduce((s, e) => s + (e.is_refund ? -e.amount_cents : e.amount_cents), 0);
</script>

<div class="min-h-screen bg-paper">
  <main class="px-4 py-4 max-w-md mx-auto space-y-3 pb-24">

    <!-- 筛选栏 -->
    <div class="bg-white rounded-2xl shadow-card p-4">
      <div class="flex gap-2 mb-3">
        <input type="date" bind:value={filterStartDate}
          class="input-field text-sm py-2 flex-1" />
        <input type="date" bind:value={filterEndDate}
          class="input-field text-sm py-2 flex-1" />
      </div>
      <div class="flex gap-2">
        <select bind:value={filterCategoryId}
          class="input-field text-sm py-2 flex-1 appearance-none"
          style="background-image:url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2378716c%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3e%3cpolyline points=%276 9 12 15 18 9%27%3e%3c/polyline%3e%3c/svg%3e');background-position:right .75rem center;background-size:1rem;">
          <option value="0">全部分类</option>
          {#each categories as cat}
            <option value={cat.id}>{cat.icon} {cat.name}</option>
          {/each}
        </select>
        <button onclick={applyFilters} class="btn-primary py-2 px-4 text-sm">筛选</button>
        <button onclick={clearFilters} class="border-2 border-stone-200 text-stone-500 font-medium rounded-full py-2 px-3 text-sm hover:bg-stone-50 transition">清除</button>
      </div>
    </div>

    <!-- 汇总 -->
    {#if !loading && expenses.length > 0}
      <div class="bg-white rounded-2xl shadow-card p-4 flex items-center justify-between">
        <div>
          <div class="text-xs text-stone-400 mb-0.5">筛选合计</div>
          <div class="flex items-baseline gap-1">
            <span class="text-sm text-clay-600">¥</span>
            <span class="stat-number text-2xl" style="font-family:'JetBrains Mono',monospace;color:#B45309;">{centsToYuan(filteredTotal)}</span>
          </div>
        </div>
        <div class="text-right">
          <div class="text-xs text-stone-400">共 {expenses.length} 笔</div>
        </div>
      </div>
    {/if}

    <!-- 加载状态 -->
    {#if loading}
      <div class="text-center py-16 text-stone-400">
        <p class="text-sm">加载中...</p>
      </div>
    {/if}

    <!-- 列表 -->
    {#if !loading}
      {#each expenses as expense (expense.id)}
        <div class="bg-white rounded-2xl shadow-soft p-3.5 flex items-center gap-3 active:bg-stone-50 transition-colors">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
            style="background-color: {getCatInfo(expense.category_id).color}18; color: {getCatInfo(expense.category_id).color};">
            {getCatInfo(expense.category_id).icon}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium text-ink text-sm">{getCatInfo(expense.category_id).name}</span>
              {#if expense.is_refund}
                <span class="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">退款</span>
              {/if}
            </div>
            <div class="text-xs text-stone-400 truncate mt-0.5">
              {(expense.merchant ?? expense.remark ?? '—')} · {expense.paid_at.slice(0, 16).replace('T', ' ')}
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="font-mono font-semibold text-sm"
              style={expense.is_refund ? 'color:#16A34A;font-family:"JetBrains Mono",monospace;' : 'color:#1C1917;font-family:"JetBrains Mono",monospace;'}>
              {expense.is_refund ? '-' : ''}¥{centsToYuan(expense.amount_cents)}
            </div>
            <div class="flex gap-1 mt-1.5 justify-end">
              <button type="button" onclick={() => openEdit(expense)} aria-label="编辑" class="p-1.5 text-stone-400 hover:text-clay-600 transition-colors rounded-lg hover:bg-clay-50">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
              </button>
              <button type="button" onclick={() => handleDelete(expense.id)} aria-label="删除" class="p-1.5 text-stone-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
        </div>
      {/each}

      {#if expenses.length === 0}
        <div class="text-center py-16 bg-white rounded-2xl shadow-soft">
          <div class="text-4xl mb-3" aria-hidden="true">📒</div>
          <p class="text-base font-medium text-stone-500">暂无消费记录</p>
          <p class="text-sm mt-1 text-stone-400">点击右下角按钮开始记账</p>
        </div>
      {/if}
    {/if}
  </main>

  <!-- 浮动添加按钮 -->
  <button onclick={openAdd} aria-label="添加消费"
    class="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-clay-600 text-white shadow-lg flex items-center justify-center text-2xl z-40 active:scale-95 transition-transform"
    style="box-shadow: 0 4px 16px rgba(180,83,9,0.4);">
    +
  </button>

  <!-- 弹窗 -->
  {#if showForm}
    <div class="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 px-0 py-0 backdrop-blur-sm"
         role="dialog" aria-modal="true" aria-label={editingId ? '编辑消费记录' : '添加消费记录'} tabindex="-1"
         onclick={(e) => { if (e.target === e.currentTarget) { showForm = false; editingId = null; } }}
         onkeydown={(e) => { if (e.key === 'Escape') { showForm = false; editingId = null; } }}>
      <div class="bg-paper rounded-t-3xl sm:rounded-2xl w-full max-w-md p-5 pb-8 space-y-4 max-h-[85vh] overflow-y-auto"
           style="box-shadow: 0 -4px 24px rgba(0,0,0,0.15);">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold text-ink text-lg">{editingId ? '编辑记录' : '添加消费'}</h2>
          <button onclick={() => { showForm = false; editingId = null; }} aria-label="关闭" class="p-1.5 text-stone-400 hover:text-ink transition-colors rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        {#if formError}
          <div class="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-xl">{formError}</div>
        {/if}

        <div>
          <label for="expense-amount" class="block text-sm font-medium text-ink mb-1.5">金额（元）</label>
          <input id="expense-amount" type="number" step="0.01" bind:value={formAmount} placeholder="0.00"
            class="input-field text-xl font-mono font-semibold" />
        </div>

        <div>
          <label for="expense-datetime" class="block text-sm font-medium text-ink mb-1.5">时间</label>
          <input id="expense-datetime" type="datetime-local" bind:value={formDate}
            class="input-field" />
        </div>

        <div>
          <span class="block text-sm font-medium text-ink mb-2">分类</span>
          {#if categories.length === 0}
            <p class="text-xs text-stone-400 py-2">加载中...</p>
          {:else}
          <div class="grid grid-cols-5 gap-2" role="radiogroup">
            {#each categories as cat}
              <button type="button" onclick={() => formCategoryId = cat.id}
                class="flex flex-col items-center py-2 rounded-xl border-2 transition-all duration-150
                  {formCategoryId === cat.id ? 'border-clay-600 bg-clay-50' : 'border-stone-100 hover:border-stone-200'}">
                <span class="text-xl leading-none">{cat.icon}</span>
                <span class="text-[10px] text-stone-600 mt-0.5 font-medium">{cat.name}</span>
              </button>
            {/each}
          </div>
          {/if}
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="expense-merchant" class="block text-sm font-medium text-ink mb-1.5">商户（选填）</label>
            <input id="expense-merchant" type="text" bind:value={formMerchant} placeholder="如：星巴克"
              class="input-field" />
          </div>
          <div>
            <label for="expense-remark" class="block text-sm font-medium text-ink mb-1.5">备注（选填）</label>
            <input type="text" bind:value={formRemark} placeholder="备注"
              class="input-field" />
          </div>
        </div>

        <label class="flex items-center gap-3 cursor-pointer py-1">
          <input type="checkbox" bind:checked={formIsRefund} class="w-5 h-5 rounded border-stone-300 text-clay-600 focus:ring-clay-500" />
          <span class="text-sm text-ink font-medium">这是一笔退款</span>
        </label>

        <div class="flex gap-3 pt-1">
          <button onclick={() => { showForm = false; editingId = null; }}
            class="flex-1 border-2 border-stone-200 text-stone-600 py-3 rounded-full font-medium hover:bg-stone-50 transition">
            取消
          </button>
          <button onclick={handleSubmit}
            class="flex-1 btn-primary">
            {editingId ? '保存修改' : '确认记账'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
