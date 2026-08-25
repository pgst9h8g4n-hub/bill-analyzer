<script lang="ts">
  import { currentUserId } from '$lib/session';
  import { getSummary } from '$lib/db/stats';
  import { getExpenses } from '$lib/db/expenses';
  import { centsToYuan } from '$lib/utils/format';
  import type { Expense } from '$lib/db';

  $: userId = $currentUserId;
  let summary = { monthTotal: 0, weekTotal: 0, yesterdayTotal: 0 };
  let recentExpenses: Expense[] = [];

  $: if (userId > 0) {
    getSummary(userId).then(s => summary = s);
    getExpenses(userId, { startDate: new Date().toISOString().slice(0, 10) }).then(exps => {
      recentExpenses = exps.slice(0, 5);
    }).catch(() => {});
  }
</script>

<div class="min-h-screen bg-gray-50 flex flex-col">
  <main class="flex-1 px-4 py-4 overflow-auto">
    <div class="max-w-md mx-auto space-y-4">
      <!-- 欢迎卡片 -->
      <div class="bg-white rounded-2xl shadow-sm p-5">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-lg">👤</div>
          <div>
            <div class="font-semibold text-gray-800">📒 小六记</div>
            <div class="text-xs text-gray-400">记录每一笔消费，掌控生活支出</div>
          </div>
        </div>
        <div class="flex gap-2">
          <a href="/categories" class="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-medium py-2.5 rounded-xl text-center transition">
            📂 管理分类
          </a>
          <a href="/settings" class="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm font-medium py-2.5 rounded-xl text-center transition">
            ⚙️ 设置
          </a>
        </div>
      </div>

      <!-- 本月概览 -->
      <div class="bg-white rounded-2xl shadow-sm p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-gray-800">本月概览</h2>
          <span class="text-xs text-gray-400">2026年8月</span>
        </div>
        <div class="text-3xl font-bold text-indigo-600">¥{centsToYuan(summary.monthTotal)}</div>
        <p class="text-xs text-gray-400 mt-1">本月总支出</p>
      </div>

      <!-- 快捷操作 -->
      <div class="grid grid-cols-3 gap-3">
        <a href="/ocr" class="bg-white rounded-xl p-4 text-center shadow-sm block">
          <div class="text-2xl mb-1">📸</div>
          <div class="text-xs text-gray-600">拍照记账</div>
        </a>
        <a href="/expenses" class="bg-white rounded-xl p-4 text-center shadow-sm block">
          <div class="text-2xl mb-1">📝</div>
          <div class="text-xs text-gray-600">手动录入</div>
        </a>
        <a href="/stats" class="bg-white rounded-xl p-4 text-center shadow-sm block">
          <div class="text-2xl mb-1">📊</div>
          <div class="text-xs text-gray-600">统计报表</div>
        </a>
      </div>

      <!-- 最近消费 -->
      <div class="bg-white rounded-2xl shadow-sm p-4">
        <h2 class="font-semibold text-gray-800 mb-3">最近消费</h2>
        {#if recentExpenses.length > 0}
          <div class="space-y-2">
            {#each recentExpenses as expense}
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center text-lg shrink-0"
                  style="background-color: #{expense.category_id}; opacity: 0.15">
                  📝
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-800 truncate">{expense.merchant ?? '—'}</div>
                  <div class="text-xs text-gray-400">{expense.paid_at.slice(0, 16).replace('T', ' ')}</div>
                </div>
                <div class="font-semibold text-gray-800">¥{centsToYuan(expense.amount_cents)}</div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center py-6 text-gray-400">
            <div class="text-3xl mb-2">📭</div>
            <p class="text-sm">还没有消费记录</p>
            <p class="text-xs mt-1">开始记账吧！</p>
          </div>
        {/if}
      </div>
    </div>
  </main>
</div>
