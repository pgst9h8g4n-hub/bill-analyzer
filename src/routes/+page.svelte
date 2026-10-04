<script lang="ts">
  import { currentUserId, currentLedgerId } from '$lib/session';
  import { getSummary, getRecentExpenses } from '$lib/db/stats';
  import { getCategories } from '$lib/db';
  import { createExpense } from '$lib/db/expenses';
  import { centsToYuan, getCurrentMonth } from '$lib/utils/format';
  import type { Expense, Category } from '$lib/db';

  $: userId = $currentUserId;
  $: ledgerId = $currentLedgerId;
  let summary = { monthTotal: 0, weekTotal: 0, yesterdayTotal: 0 };
  let recentExpenses: Expense[] = [];
  let categories: Category[] = [];
  let currentMonthLabel = '';

  // 手动录入（首页内联，结果落明细页）
  let showForm = false;
  let formAmount = '';
  let formCategoryId = 0;
  let formMerchant = '';
  let formRemark = '';
  let formDate = '';
  let formSaving = false;
  let formSavedMsg = '';

  function openForm() {
    formAmount = '';
    formCategoryId = categories[0]?.id ?? 0;
    formMerchant = '';
    formRemark = '';
    formDate = todayStr();
    formSavedMsg = '';
    showForm = true;
  }

  function todayStr(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  async function handleSave() {
    if (!ledgerId || !userId) return;
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) return;
    if (!formCategoryId) return;
    formSaving = true;
    try {
      await createExpense(ledgerId, {
        userId,
        amount: formAmount,
        categoryId: formCategoryId,
        merchant: formMerchant.trim(),
        remark: formRemark.trim(),
        date: formDate,
        isRefund: false,
        direction: 'expense',
        subType: 'consumption'
      });
      formSavedMsg = '已保存，明细页可查看';
      // 刷新本月支出与最近消费
      getSummary(ledgerId).then(s => summary = s).catch(() => {});
      getRecentExpenses(ledgerId, 5).then(exps => { recentExpenses = exps; }).catch(() => {});
      // 稍后自动收起
      setTimeout(() => { showForm = false; formSavedMsg = ''; }, 1200);
    } catch {
      formSavedMsg = '保存失败，请重试';
    } finally {
      formSaving = false;
    }
  }

  $: if (userId > 0 && ledgerId > 0) {
    const now = new Date();
    currentMonthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;

    getSummary(ledgerId).then(s => summary = s).catch(() => {});
    getRecentExpenses(ledgerId, 5).then(exps => {
      recentExpenses = exps;
    }).catch(() => {});
    getCategories(ledgerId).then(cs => {
      categories = cs;
    }).catch(() => {});
  }
</script>

<div class="min-h-screen bg-paper flex flex-col">
  <main class="flex-1 px-4 py-4 overflow-auto pb-20">
    <div class="max-w-md mx-auto space-y-4">

      <!-- 本月支出徽章 -->
      <div class="relative overflow-hidden rounded-2xl bg-clay-600 px-5 pt-5 pb-6 text-white">
        <div class="absolute top-0 right-0 w-32 h-32 bg-clay-500 rounded-full -translate-y-10 translate-x-8 opacity-40" aria-hidden="true"></div>
        <div class="absolute bottom-0 left-8 w-16 h-16 bg-clay-400 rounded-full translate-y-6 opacity-30" aria-hidden="true"></div>
        <div class="relative">
          <div class="text-xs font-medium text-clay-200 tracking-wide uppercase">{currentMonthLabel}</div>
          <div class="flex items-baseline gap-1 mt-1">
            <span class="text-sm text-clay-200">¥</span>
            <span class="stat-number text-4xl" style="font-family: 'JetBrains Mono', 'SF Mono', monospace;">{centsToYuan(summary.monthTotal)}</span>
          </div>
          <div class="text-sm text-clay-200 mt-1">本月总支出</div>
        </div>
      </div>

      <!-- 快捷操作（4 等分铺满整行；用 flex+flex-1，不依赖 grid-cols-4 生成类） -->
      <div class="flex gap-2.5">
        <a href="/ocr" class="flex-1 min-w-0 bg-white rounded-2xl shadow-soft p-2.5 text-center block active:scale-[0.97] transition-transform">
          <div class="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-xl mx-auto mb-2" aria-hidden="true">📸</div>
          <div class="text-xs font-medium text-ink">拍照记账</div>
          <div class="text-[10px] text-stone-400 mt-0.5">OCR识别</div>
        </a>
        <button type="button" onclick={openForm}
          class="flex-1 min-w-0 bg-white rounded-2xl shadow-soft p-2.5 text-center block active:scale-[0.97] transition-transform">
          <div class="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-xl mx-auto mb-2" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m5 12 7-7 7 7"/></svg>
          </div>
          <div class="text-xs font-medium text-ink">手动录入</div>
          <div class="text-[10px] text-stone-400 mt-0.5">添加记录</div>
        </button>
        <a href="/import" class="flex-1 min-w-0 bg-white rounded-2xl shadow-soft p-2.5 text-center block active:scale-[0.97] transition-transform">
          <div class="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-2" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/><path d="M12 11v6"/><path d="m9 14 3 3 3-3"/></svg>
          </div>
          <div class="text-xs font-medium text-ink">导入账单</div>
          <div class="text-[10px] text-stone-400 mt-0.5">支付宝/微信/抖音</div>
        </a>
        <a href="/stats" class="flex-1 min-w-0 bg-white rounded-2xl shadow-soft p-2.5 text-center block active:scale-[0.97] transition-transform">
          <div class="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center mx-auto mb-2" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>
          </div>
          <div class="text-xs font-medium text-ink">统计报表</div>
          <div class="text-[10px] text-stone-400 mt-0.5">数据分析</div>
        </a>
      </div>

      <!-- 最近消费 -->
      <div class="bg-white rounded-2xl shadow-card p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-ink text-base">最近消费</h2>
          <a href="/expenses" class="text-xs text-clay-600 font-medium hover:text-clay-700 transition-colors">查看全部 →</a>
        </div>
        {#if recentExpenses.length > 0}
          <div class="space-y-2.5">
            {#each recentExpenses as expense}
              {#each categories as cat (cat.id)}
                {#if cat.id === expense.category_id}
                  <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                      style="background-color: {cat.color}18; color: {cat.color};">
                      {cat.icon}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-medium text-ink truncate">
                        {expense.merchant ?? cat.name}
                      </div>
                      <div class="text-xs text-stone-400">
                        {expense.paid_at.slice(0, 16).replace('T', ' ')}
                      </div>
                    </div>
                    <div class="font-mono font-semibold text-ink text-sm shrink-0"
                      style={expense.is_refund ? 'color:#16A34A;font-family:"JetBrains Mono",monospace;' : ''}>
                      {expense.is_refund ? '-' : ''}¥{centsToYuan(expense.amount_cents)}
                    </div>
                  </div>
                {/if}
              {/each}
            {/each}
          </div>
        {:else}
          <div class="text-center py-8 text-stone-400">
            <div class="text-3xl mb-2" aria-hidden="true">📒</div>
            <p class="text-sm font-medium text-stone-500">还没有消费记录</p>
            <p class="text-xs mt-1">点击上方开始记账吧</p>
          </div>
        {/if}
      </div>

    </div>
  </main>

  <!-- 手动录入弹窗（首页内联，结果落明细页） -->
  {#if showForm}
    <div class="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 px-4 py-4 backdrop-blur-sm"
         role="dialog" aria-modal="true" aria-label="手动录入" tabindex="-1"
         onclick={(e) => { if (e.target === e.currentTarget) showForm = false; }}
         onkeydown={(e) => { if (e.key === 'Escape') showForm = false; }}>
      <div class="bg-paper rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold text-ink text-lg">手动录入</h2>
          <button onclick={() => showForm = false} aria-label="关闭" class="p-1.5 text-stone-400 hover:text-ink transition-colors rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <div>
          <label for="home-amount" class="block text-sm font-medium text-ink mb-1.5">金额（元）</label>
          <input id="home-amount" type="number" inputmode="decimal" step="0.01" min="0" bind:value={formAmount}
            placeholder="如：38.50" class="input-field text-xl font-mono font-semibold" />
        </div>

        <div>
          <label class="block text-sm font-medium text-ink mb-2">分类</label>
          <div class="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
            {#each categories as cat (cat.id)}
              <button type="button" onclick={() => formCategoryId = cat.id}
                class="py-2 rounded-lg border text-sm flex items-center justify-center gap-1
                  {formCategoryId === cat.id ? 'border-clay-600 bg-clay-50 text-clay-700' : 'border-stone-200 text-stone-600 hover:border-stone-300'}">
                <span aria-hidden="true">{cat.icon}</span>
                <span class="truncate">{cat.name}</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="home-merchant" class="block text-sm font-medium text-ink mb-1.5">商户（可选）</label>
            <input id="home-merchant" type="text" bind:value={formMerchant} placeholder="如：美团" class="input-field text-sm" />
          </div>
          <div>
            <label for="home-date" class="block text-sm font-medium text-ink mb-1.5">日期</label>
            <input id="home-date" type="date" bind:value={formDate} class="input-field text-sm" />
          </div>
        </div>

        <div>
          <label for="home-remark" class="block text-sm font-medium text-ink mb-1.5">备注（可选）</label>
          <input id="home-remark" type="text" bind:value={formRemark} placeholder="备注" class="input-field text-sm" />
        </div>

        <div class="flex gap-3 pt-1">
          <button onclick={() => showForm = false}
            class="flex-1 border-2 border-stone-200 text-stone-600 py-3 rounded-full font-medium hover:bg-stone-50 transition">
            取消
          </button>
          <button onclick={handleSave} disabled={formSaving}
            class="flex-1 btn-primary disabled:opacity-50">
            {formSaving ? '保存中…' : '保存'}
          </button>
        </div>
        {#if formSavedMsg}
          <p class="text-center text-xs {formSavedMsg === '已保存，明细页可查看' ? 'text-emerald-600' : 'text-red-500'}">{formSavedMsg}</p>
        {/if}
      </div>
    </div>
  {/if}
</div>
