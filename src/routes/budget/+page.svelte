<script lang="ts">
  import { onMount } from 'svelte';
  import {
    getBudgets,
    getCurrentMonthSpending,
    saveBudget
  } from '$lib/db/budget';
  import { getCategories } from '$lib/db';
  import { centsToYuan, getCurrentMonth } from '$lib/utils/format';
  import type { Budget, Category } from '$lib/db';
  import { currentUserId } from '$lib/session';

  $: userId = $currentUserId;
  let currentMonth = getCurrentMonth();
  let budgets: Budget[] = [];
  let categories: Category[] = [];
  let spending = 0;

  let showAddForm = false;
  let addLimit = '';
  let addCategoryId = 0;

  onMount(async () => {
    if (!userId) return;
    [budgets, categories, spending] = await Promise.all([
      getBudgets(userId, currentMonth),
      getCategories(),
      getCurrentMonthSpending(userId, currentMonth)
    ]);
    if (categories.length > 0) addCategoryId = categories[0].id;
  });

  function openAdd() {
    showAddForm = true;
    addLimit = '';
    addCategoryId = categories[0]?.id ?? 0;
  }

  async function handleSave() {
    if (!addLimit || isNaN(parseFloat(addLimit)) || parseFloat(addLimit) <= 0) return;
    await saveBudget(userId, {
      month: currentMonth,
      limitCents: Math.round(parseFloat(addLimit) * 100),
      categoryId: addCategoryId || null
    });
    budgets = await getBudgets(userId, currentMonth);
    spending = await getCurrentMonthSpending(userId, currentMonth);
    showAddForm = false;
  }

  function getProgressColor(used: number, limit: number): string {
    const ratio = limit > 0 ? used / limit : 0;
    if (ratio >= 1) return '#ef4444';
    if (ratio >= 0.7) return '#f59e0b';
    return '#22c55e';
  }

  const totalBudget = budgets
    .filter(b => b.category_id === null)
    .reduce((s, b) => s + b.limit_cents, 0);

  $: progress = totalBudget > 0 ? Math.round(spending / totalBudget * 100) : 0;
  $: isOverBudget = spending > totalBudget && totalBudget > 0;
  $: remaining = totalBudget - spending;
</script>

<div class="min-h-screen bg-gray-50">
  <main class="px-4 py-4 max-w-md mx-auto space-y-4">
    <div class="bg-white rounded-2xl shadow-sm p-5">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-semibold text-gray-800">本月预算</h2>
        <span class="text-sm text-gray-500">{currentMonth}</span>
      </div>

      {#if totalBudget > 0}
        <div class="flex items-baseline gap-1 mb-2">
          <span class="text-3xl font-bold" style="color: {getProgressColor(spending, totalBudget)}">
            ¥{centsToYuan(spending)}
          </span>
          <span class="text-sm text-gray-400"> / ¥{centsToYuan(totalBudget)}</span>
        </div>
        <div class="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500"
            style="width: {Math.min(progress, 100)}%; background-color: {getProgressColor(spending, totalBudget)}"></div>
        </div>
        <div class="flex justify-between mt-2 text-sm">
          <span class="{isOverBudget ? 'text-red-600 font-medium' : 'text-gray-500'}">
            {isOverBudget ? '⚠️ 已超支 ¥' + centsToYuan(Math.abs(remaining)) : '剩余 ¥' + centsToYuan(Math.max(remaining, 0))}
          </span>
          <span class="text-gray-400">{progress}%</span>
        </div>
      {:else}
        <div class="text-center py-6 text-gray-400">
          <div class="text-3xl mb-2">💰</div>
          <p class="text-sm">尚未设置月度预算</p>
          <p class="text-xs mt-1">点击右上角添加总预算</p>
        </div>
      {/if}
    </div>

    {#if budgets.length > 0}
      <div class="bg-white rounded-2xl shadow-sm p-4">
        <h2 class="font-semibold text-gray-800 mb-3">分类预算</h2>
        <div class="space-y-3">
          {#each budgets as budget}
            <div class="flex items-center gap-3">
              {#if budget.category_id}
                <div class="w-8 h-8 rounded-lg flex items-center justify-center text-lg shrink-0"
                  style="background-color: {categories.find(c => c.id === budget.category_id)?.color ?? '#6b7280'}20">
                  {categories.find(c => c.id === budget.category_id)?.icon ?? '📝'}
                </div>
                <div class="flex-1">
                  <div class="flex justify-between text-sm mb-1">
                    <span class="text-gray-700">{categories.find(c => c.id === budget.category_id)?.name ?? '其他'}</span>
                    <span class="text-gray-500">¥{centsToYuan(budget.limit_cents)}</span>
                  </div>
                  <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all"
                      style="width: {Math.min(Math.round(spending / (budget.limit_cents || 1) * 100), 100)}%; background-color: {getProgressColor(spending, budget.limit_cents)}"></div>
                  </div>
                </div>
              {:else}
                <div class="flex-1">
                  <div class="flex justify-between text-sm">
                    <span class="text-gray-700 font-medium">总预算</span>
                    <span class="text-gray-500">¥{centsToYuan(budget.limit_cents)}</span>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </main>

  {#if showAddForm}
    <div class="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 px-4 py-4">
      <div class="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 space-y-4">
        <h2 class="font-semibold text-gray-800 text-lg">设置预算</h2>
        <div>
          <label for="budget-limit" class="block text-sm font-medium text-gray-700 mb-1">预算金额（元）</label>
          <input id="budget-limit" type="number" step="0.01" bind:value={addLimit} placeholder="如：3000"
            class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 text-lg font-semibold outline-none" />
        </div>
        <div>
          <label for="budget-type" class="block text-sm font-medium text-gray-700 mb-1">预算类型</label>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" onclick={() => addCategoryId = 0}
              class="py-3 rounded-xl border-2 text-sm font-medium transition
                {addCategoryId === 0 ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-100 text-gray-600'}">
              总预算
            </button>
            {#each categories as cat}
              <button type="button" onclick={() => addCategoryId = cat.id}
                class="py-3 rounded-xl border-2 text-sm transition
                  {addCategoryId === cat.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100'}">
                {cat.icon} {cat.name}
              </button>
            {/each}
          </div>
        </div>
        <div class="flex gap-3 pt-2">
          <button onclick={() => showAddForm = false}
            class="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-medium">取消</button>
          <button onclick={handleSave}
            class="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700">
            保存预算
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
