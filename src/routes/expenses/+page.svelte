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
  let searchKeyword = '';  // 关键词搜索（前端过滤商户/备注）
  let appliedCategoryName = '';  // 记录 URL 带过来的分类名，categories 加载后据此筛选

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
    const catName = params.get('category');
    if (catName) appliedCategoryName = decodeURIComponent(catName);
    categories = await getCategories(ledgerId);
    if (categories.length > 0 && filterCategoryId === 0) {
      filterCategoryId = categories[0].id;
    }
    // 应用 URL 带过来的分类筛选：按名称匹配到 id
    if (appliedCategoryName) {
      const match = categories.find(c => c.name === appliedCategoryName);
      if (match) { filterCategoryId = match.id; filterStartDate = ''; filterEndDate = ''; }
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

  // 前端关键词过滤（商户 + 备注），数据量小，无需下推到 IndexedDB
  $: visibleExpenses = searchKeyword.trim()
    ? expenses.filter(e => {
        const kw = searchKeyword.trim().toLowerCase();
        return (e.merchant?.toLowerCase().includes(kw)) || (e.remark?.toLowerCase().includes(kw));
      })
    : expenses;

  // 按月分组 → 月内按天分组。结构：[[month, [ [day, [exp]], ... ]], ...]
  // 月按倒序（新在前），月内天也倒序
  $: groupedByMonth = (() => {
    const byMonth = new Map<string, Expense[]>();
    for (const e of visibleExpenses) {
      const m = e.paid_at.slice(0, 7);
      const arr = byMonth.get(m) ?? [];
      arr.push(e);
      byMonth.set(m, arr);
    }
    const monthKeys = Array.from(byMonth.keys()).sort((a, b) => b.localeCompare(a));
    return monthKeys.map(m => {
      const monthExpenses = byMonth.get(m)!;
      const byDay = new Map<string, Expense[]>();
      for (const e of monthExpenses) {
        const day = e.paid_at.slice(0, 10);
        const arr = byDay.get(day) ?? [];
        arr.push(e);
        byDay.set(day, arr);
      }
      const dayKeys = Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a));
      const days = dayKeys.map(d => [d, byDay.get(d)!] as [string, Expense[]]);
      return [m, days] as [string, Array<[string, Expense[]]>];
    });
  })();

  // 月份标签：今年只显示"10月"，非今年显示"2025年10月"
  function monthLabel(month: string): string {
    const [y, m] = month.split('-');
    const curYear = String(new Date().getFullYear());
    return y === curYear ? `${parseInt(m)}月` : `${y}年${parseInt(m)}月`;
  }

  // 分组后总净合计（用于顶部汇总显示，跟随关键词过滤）
  $: visibleTotal = visibleExpenses.reduce((s, e) => s + (e.is_refund ? -e.amount_cents : e.amount_cents), 0);

  // 分类分布（按当前可见记录聚合，净金额，退款冲减）。按金额降序。
  $: categoryDist = (() => {
    if (visibleExpenses.length === 0) return [];
    const byCat = new Map<number, number>();
    for (const e of visibleExpenses) {
      const val = e.is_refund ? -e.amount_cents : e.amount_cents;
      byCat.set(e.category_id, (byCat.get(e.category_id) ?? 0) + val);
    }
    const sum = Math.abs(visibleTotal);
    return Array.from(byCat.entries())
      .map(([catId, total]) => {
        const info = getCatInfo(catId);
        return {
          id: catId,
          name: info.name,
          icon: info.icon,
          color: info.color,
          total,
          pct: sum > 0 ? Math.abs(total) / sum : 0,
        };
      })
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  })();

  // 点分布条某段 → 筛选到该分类（清空日期/关键词，保留分类）
  function focusCategory(id: number) {
    filterCategoryId = id;
    filterStartDate = '';
    filterEndDate = '';
    searchKeyword = '';
    loadExpenses();
  }

  // 格式化日期标签：今天/昨天/具体日期
  function dayLabel(day: string): string {
    const today = new Date();
    const norm = (d: Date) => d.toISOString().slice(0, 10);
    if (day === norm(today)) return '今天';
    const y = new Date(today); y.setDate(y.getDate() - 1);
    if (day === norm(y)) return '昨天';
    const [, m, d] = day.split('-');
    const week = ['日','一','二','三','四','五','六'][new Date(day).getDay()];
    return `${parseInt(m)}月${parseInt(d)}日 周${week}`;
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
    searchKeyword = '';
    loadExpenses();
  }

  function applyFilters() {
    loadExpenses();
  }

  function getCatInfo(id: number) {
    return categories.find(c => c.id === id) ?? { icon: '📝', color: '#6b7280', name: '其他' };
  }
</script>

<div class="min-h-screen bg-paper">
  <main class="px-4 py-4 max-w-md mx-auto space-y-3 pb-24">

    <!-- 筛选栏 -->
    <div class="bg-white rounded-2xl shadow-card p-4">
      <div class="flex gap-2 mb-3">
        <input type="date" bind:value={filterStartDate}
          onchange={applyFilters} class="input-field text-sm py-2 flex-1" aria-label="开始日期" />
        <input type="date" bind:value={filterEndDate}
          onchange={applyFilters} class="input-field text-sm py-2 flex-1" aria-label="结束日期" />
      </div>
      <div class="flex gap-2 mb-3">
        <select bind:value={filterCategoryId} onchange={applyFilters}
          class="input-field text-sm py-2 flex-1 select-arrow">
          <option value="0">全部分类</option>
          {#each categories as cat}
            <option value={cat.id}>{cat.icon} {cat.name}</option>
          {/each}
        </select>
        <button onclick={clearFilters} class="border-2 border-stone-200 text-stone-500 font-medium rounded-full py-2 px-3 text-sm hover:bg-stone-50 transition shrink-0">清除</button>
      </div>
      <input type="text" bind:value={searchKeyword} placeholder="搜索商户 / 备注"
        class="input-field text-sm py-2 w-full" aria-label="搜索关键词" />
    </div>

    <!-- 汇总（跟随关键词过滤） -->
    {#if !loading && visibleExpenses.length > 0}
      <div class="bg-white rounded-2xl shadow-card p-4 flex items-center justify-between">
        <div>
          <div class="text-xs text-stone-400 mb-0.5">{searchKeyword ? '搜索合计' : '筛选合计'}</div>
          <div class="flex items-baseline gap-1">
            <span class="text-sm text-clay-600">¥</span>
            <span class="stat-number text-2xl" style="font-family:'JetBrains Mono',monospace;color:#B45309;">{centsToYuan(visibleTotal)}</span>
          </div>
        </div>
        <div class="text-right">
          <div class="text-xs text-stone-400">共 {visibleExpenses.length} 笔</div>
        </div>
      </div>

      <!-- 分类分布条（点段筛选到该分类） -->
      {#if categoryDist.length > 1}
        <div class="bg-white rounded-2xl shadow-card p-4">
          <div class="text-xs font-medium text-stone-400 mb-2">分类占比</div>
          <div class="flex h-3 rounded-full overflow-hidden gap-px bg-stone-100">
            {#each categoryDist as c (c.id)}
              <button type="button"
                onclick={() => focusCategory(c.id)}
                class="h-3 transition-all first:rounded-l-full last:rounded-r-full hover:opacity-80"
                style="flex: {c.pct} 0 0%;background-color:{c.color};min-width:3px;"
                aria-label={`筛选到${c.name}`}></button>
            {/each}
          </div>
          <div class="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5">
            {#each categoryDist as c (c.id)}
              <button type="button" onclick={() => focusCategory(c.id)}
                class="flex items-center gap-1 text-[11px] text-stone-500 hover:text-ink transition-colors">
                <span class="w-2 h-2 rounded-full shrink-0" style="background-color:{c.color};"></span>
                {c.icon} {c.name}
                <span class="font-mono" style="font-family:'JetBrains Mono',monospace;color:#78716C;">
                  {Math.round(c.pct * 100)}%
                </span>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    {/if}

    <!-- 加载状态 -->
    {#if loading}
      <div class="text-center py-16 text-stone-400">
        <p class="text-sm">加载中...</p>
      </div>
    {/if}

    <!-- 按天分组列表 -->
    {#if !loading}
      {#if visibleExpenses.length === 0}
        <div class="text-center py-16 bg-white rounded-2xl shadow-soft">
          <div class="text-4xl mb-3" aria-hidden="true">📒</div>
          <p class="text-base font-medium text-stone-500">{searchKeyword ? '没有匹配的记录' : '暂无消费记录'}</p>
          <p class="text-sm mt-1 text-stone-400">{searchKeyword ? '换个关键词试试' : '点击右下角按钮开始记账'}</p>
        </div>
      {:else}
        {#each groupedByMonth as [month, days] (month)}
          <div>
            <!-- 月份分组头 + 当月合计 -->
            <div class="flex items-center justify-between px-1 pt-3 pb-1.5 sticky top-0 bg-paper z-20">
              <div class="flex items-center gap-2">
                <span class="text-sm font-bold text-ink">{monthLabel(month)}</span>
                <span class="text-[10px] text-stone-300">
                  {days.reduce((s, [, de]) => s + de.length, 0)} 笔
                </span>
              </div>
              <span class="font-mono text-sm font-semibold"
                style="font-family:'JetBrains Mono',monospace;color:#B45309;">
                {centsToYuan(days.reduce((s, [, de]) => s + de.reduce((ss, e) => ss + (e.is_refund ? -e.amount_cents : e.amount_cents), 0), 0))}
              </span>
            </div>

            <!-- 该月下的各天 -->
            {#each days as [day, dayExpenses] (month + day)}
              <!-- 日期分组头 + 当日小计 -->
              <div class="flex items-center justify-between px-1 py-1.5 sticky top-8 bg-paper z-10">
                <span class="text-xs font-semibold text-stone-500">{dayLabel(day)}</span>
                <span class="font-mono text-xs"
                  style="font-family:'JetBrains Mono',monospace;color:#78716C;">
                  {centsToYuan(dayExpenses.reduce((s, e) => s + (e.is_refund ? -e.amount_cents : e.amount_cents), 0))}
                </span>
              </div>
              <div class="bg-white rounded-2xl shadow-soft overflow-hidden divide-y divide-stone-100">
                {#each dayExpenses as expense (expense.id)}
                  <div class="p-3.5 flex items-center gap-3 active:bg-stone-50 transition-colors">
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
                        {#if expense.merchant && expense.remark}
                          {expense.merchant} · {expense.remark}
                        {:else}
                          {(expense.merchant ?? expense.remark ?? '—')}
                        {/if}
                        <span class="text-stone-300"> · {expense.paid_at.slice(11, 16)}</span>
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
              </div>
            {/each}
          </div>
        {/each}
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
