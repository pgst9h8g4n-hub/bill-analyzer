<script lang="ts">
  import { onMount } from 'svelte';
  import { getBudgets, getCurrentMonthSpending, saveBudget, getCategorySpending, deleteBudget, getBudgetMonths } from '$lib/db/budget';
  import { getCategories } from '$lib/db';
  import { centsToYuan, getCurrentMonth } from '$lib/utils/format';
  import type { Budget, Category } from '$lib/db';
  import { currentUserId, currentLedgerId } from '$lib/session';

  $: userId = $currentUserId;
  $: ledgerId = $currentLedgerId;
  let selectedMonth = getCurrentMonth();  // 默认当前月，可切历史月
  let availableMonths: string[] = [];
  let budgets: Budget[] = [];
  let categories: Category[] = [];
  let spending = 0;
  // 各分类本月实际消费净额，用于分类预算进度条（总支出 spending 仅用于总预算卡）
  let catSpending = new Map<number, number>();

  let showAddForm = false;
  let addLimit = '';
  let addCategoryId = 0;

  async function loadForMonth() {
    if (!ledgerId) return;
    [budgets, categories, spending] = await Promise.all([
      getBudgets(ledgerId, selectedMonth),
      getCategories(ledgerId),
      getCurrentMonthSpending(ledgerId, selectedMonth)
    ]);
    if (categories.length > 0 && !addCategoryId) addCategoryId = categories[0].id;
    await refreshCatSpending();
  }

  onMount(async () => {
    if (!ledgerId) return;
    // 拉可选月份（有预算/消费的月份降序），当前月若不在则置顶
    availableMonths = await getBudgetMonths(ledgerId);
    if (!availableMonths.includes(selectedMonth)) availableMonths = [selectedMonth, ...availableMonths];
    await loadForMonth();
  });

  function pickMonth(m: string) {
    selectedMonth = m;
    loadForMonth();
  }

  async function refreshCatSpending() {
    const ids = [...new Set(budgets.filter(b => b.category_id != null).map(b => b.category_id!))];
    const results = await Promise.all(ids.map(id => getCategorySpending(ledgerId, selectedMonth, id)));
    catSpending = new Map(ids.map((id, i) => [id, results[i]]));
  }

  function openAdd() {
    showAddForm = true;
    addLimit = '';
    addCategoryId = categories[0]?.id ?? 0;
  }

  async function handleSave() {
    if (!addLimit || isNaN(parseFloat(addLimit)) || parseFloat(addLimit) <= 0) return;
    await saveBudget(ledgerId, {
      month: selectedMonth,
      limitCents: Math.round(parseFloat(addLimit) * 100),
      categoryId: addCategoryId || null
    });
    await loadForMonth();
    showAddForm = false;
  }

  // 删除某条预算（总预算 categoryId=null 或分类预算 categoryId>0）
  async function handleDelete(budget: Budget) {
    const label = budget.category_id === null ? '总预算' : `「${categories.find(c => c.id === budget.category_id)?.name ?? '该分类'}」预算`;
    if (!confirm(`确定删除 ${selectedMonth} ${label}？`)) return;
    await deleteBudget(ledgerId, budget.id);
    await loadForMonth();
  }

  function getProgressColor(used: number, limit: number): string {
    const ratio = limit > 0 ? used / limit : 0;
    if (ratio >= 1) return '#DC2626';
    if (ratio >= 0.7) return '#D97706';
    return '#B45309';
  }

  const totalBudget = budgets
    .filter(b => b.category_id === null)
    .reduce((s, b) => s + b.limit_cents, 0);

  $: progress = totalBudget > 0 ? Math.round(spending / totalBudget * 100) : 0;
  $: isOverBudget = spending > totalBudget && totalBudget > 0;
  $: remaining = totalBudget - spending;
</script>

<div class="min-h-screen bg-paper">
  <main class="px-4 py-4 max-w-md mx-auto space-y-4 pb-20">

    <!-- 总预算卡片 -->
    <div class="bg-white rounded-2xl shadow-card p-5">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-semibold text-ink text-base">预算</h2>
          <p class="text-xs text-stone-400 mt-0.5">按月设，可补历史月</p>
        </div>
        <button onclick={openAdd} class="btn-primary py-2 px-4 text-sm leading-none">+ 设置</button>
      </div>

      <!-- 月份选择（可切历史月补设预算 / 看该月消费） -->
      <div class="flex items-center gap-2 mb-4">
        <span class="text-xs text-stone-500 shrink-0">月份</span>
        <select value={selectedMonth} onchange={(e) => pickMonth((e.target as HTMLSelectElement).value)}
          class="input-field text-sm py-2 flex-1 select-arrow">
          {#each availableMonths as m}
            <option value={m}>{m.split('-')[0]}年{parseInt(m.split('-')[1])}月</option>
          {/each}
        </select>
      </div>

      {#if totalBudget > 0}
        <div class="flex items-baseline gap-1.5 mb-2">
          <span class="text-sm text-stone-500">已用</span>
          <span class="text-3xl stat-number" style="font-family:'JetBrains Mono',monospace;color:{getProgressColor(spending, totalBudget)};">
            ¥{centsToYuan(spending)}
          </span>
        </div>
        <div class="text-xs text-stone-400 mb-3">预算 ¥{centsToYuan(totalBudget)}</div>

        <div class="h-2.5 bg-stone-100 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all duration-700"
            style="width: {Math.min(progress, 100)}%; background-color: {getProgressColor(spending, totalBudget)}"></div>
        </div>

        <div class="flex justify-between mt-2 text-sm">
          <span class="{isOverBudget ? 'text-red-600 font-semibold' : 'text-stone-500'}">
            {isOverBudget ? '⚠ 超支 ¥' + centsToYuan(Math.abs(remaining)) : '剩余 ¥' + centsToYuan(Math.max(remaining, 0))}
          </span>
          <span class="text-stone-400">{progress}%</span>
        </div>
        <button onclick={() => handleDelete(budgets.find(b => b.category_id === null)!)}
          class="mt-3 w-full border-2 border-stone-200 text-stone-500 py-2 rounded-full text-sm hover:bg-stone-50 hover:border-stone-300 transition">
          删除总预算
        </button>
      {:else}
        <div class="text-center py-8 text-stone-400">
          <div class="text-3xl mb-2" aria-hidden="true">💰</div>
          <p class="text-sm font-medium text-stone-500">尚未设置月度预算</p>
          <p class="text-xs mt-1">点击右上角「+ 设置」开始预算管理</p>
        </div>
      {/if}
    </div>

    <!-- 分类预算 -->
    {#if budgets.length > 0}
      <div class="bg-white rounded-2xl shadow-card p-4">
        <h2 class="font-semibold text-ink text-base mb-3">分类预算</h2>
        <div class="space-y-3">
          {#each budgets as budget}
            {#if budget.category_id}
              <div class="flex items-start gap-2">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between mb-1.5">
                    <div class="flex items-center gap-2 min-w-0">
                      <div class="w-7 h-7 rounded-lg flex items-center justify-center text-base shrink-0"
                        style="background-color: {categories.find(c => c.id === budget.category_id)?.color ?? '#6b7280'}18;">
                        {categories.find(c => c.id === budget.category_id)?.icon ?? '📝'}
                      </div>
                      <span class="text-sm font-medium text-ink truncate">{categories.find(c => c.id === budget.category_id)?.name ?? '其他'}</span>
                    </div>
                    <span class="text-sm font-mono text-stone-500 shrink-0 ml-2" style="font-family:'JetBrains Mono',monospace;">
                      ¥{centsToYuan(catSpending.get(budget.category_id) ?? 0)} / ¥{centsToYuan(budget.limit_cents)}
                    </span>
                  </div>
                  <div class="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500"
                      style="width: {Math.min(Math.round((catSpending.get(budget.category_id) ?? 0) / (budget.limit_cents || 1) * 100), 100)}%; background-color: {getProgressColor(catSpending.get(budget.category_id) ?? 0, budget.limit_cents)}"></div>
                  </div>
                </div>
                <button type="button" onclick={() => handleDelete(budget)} aria-label="删除该分类预算"
                  class="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 transition rounded-lg shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}
  </main>

  <!-- 弹窗 -->
  {#if showAddForm}
    <div class="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 px-4 py-4 backdrop-blur-sm"
         role="dialog" aria-modal="true" aria-label="设置预算" tabindex="-1"
         onclick={(e) => { if (e.target === e.currentTarget) showAddForm = false; }}
         onkeydown={(e) => { if (e.key === 'Escape') showAddForm = false; }}>
      <div class="bg-paper rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 space-y-4"
           style="box-shadow: 0 -4px 24px rgba(0,0,0,0.15);">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold text-ink text-lg">设置预算</h2>
          <button onclick={() => showAddForm = false} aria-label="关闭" class="p-1.5 text-stone-400 hover:text-ink transition-colors rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <div>
          <label for="budget-limit" class="block text-sm font-medium text-ink mb-1.5">预算金额（元）</label>
          <input id="budget-limit" type="number" step="0.01" bind:value={addLimit} placeholder="如：3000"
            class="input-field text-xl font-mono font-semibold" />
        </div>

        <div>
          <span class="block text-sm font-medium text-ink mb-2 sr-only">预算类型</span>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" onclick={() => addCategoryId = 0}
              class="py-3 rounded-xl border-2 text-sm font-medium transition-all duration-150
                {addCategoryId === 0 ? 'border-clay-600 bg-clay-50 text-clay-700' : 'border-stone-100 text-stone-600 hover:border-stone-200'}">
              总预算
            </button>
            {#each categories as cat}
              <button type="button" onclick={() => addCategoryId = cat.id} aria-label="{cat.name}预算"
                class="py-2.5 rounded-xl border-2 text-sm transition-all duration-150 flex items-center gap-1.5
                  {addCategoryId === cat.id ? 'border-clay-600 bg-clay-50' : 'border-stone-100 hover:border-stone-200'}">
                <span>{cat.icon}</span>
                <span class="font-medium">{cat.name}</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="flex gap-3 pt-1">
          <button onclick={() => showAddForm = false}
            class="flex-1 border-2 border-stone-200 text-stone-600 py-3 rounded-full font-medium hover:bg-stone-50 transition">
            取消
          </button>
          <button onclick={handleSave}
            class="flex-1 btn-primary">
            保存预算
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
