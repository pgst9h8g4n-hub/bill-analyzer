<script lang="ts">
  import { onMount } from 'svelte';
  import { getExpenses, deleteExpense } from '$lib/db/expenses';
  import { getCategories, UNSORTED_CATEGORY_NAME } from '$lib/db';
  import { expenseSigned, isConsumptionScope, isIncome, isNeutral, isRefund, subTypeLabel, incomeReduce, neutralStats } from '$lib/db/expense-math';
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
  let hideRefunds = false;  // 隐藏退款（净消费视图）
  let showOnlyExpense = false;  // 只看支出/消费（隐藏 收入 与 中性转账/还款/理财）

  let showForm = false;
  let editingId: number | null = null;
  let formAmount = '';
  let formDate = '';
  let formCategoryId = 0;
  let formMerchant = '';
  let formRemark = '';
  let formIsRefund = false;
  let formError = '';

  // 次要筛选项（退款折叠 / 只看支出 / 每页条数）默认收起，主界面只露「分类+搜索」和「日期+清除」两行，
  // 点开「更多筛选」再展开，减少进页时的滚动量
  let showMoreFilters = false;

  // 每页条数分页（10/15/20/50），作用在当前展示的扁平记录序列上
  let pageSize = 10;
  let page = 1;

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('startDate')) filterStartDate = params.get('startDate')!;
    if (params.get('endDate')) filterEndDate = params.get('endDate')!;
    const catName = params.get('category');
    if (catName) appliedCategoryName = decodeURIComponent(catName);
    categories = await getCategories(ledgerId);
    // 仅当 URL 带分类参数时才预选；否则默认"全部分类"（filterCategoryId=0），显示全部记录
    if (appliedCategoryName) {
      const match = categories.find(c => c.name === appliedCategoryName);
      if (match) { filterCategoryId = match.id; filterStartDate = ''; filterEndDate = ''; }
    }
    await loadExpenses();
    loading = false;
  });

  // Reload expenses when user/ledger changes
  $: if (userId > 0 && ledgerId > 0) {
    // 同步刷新分类（onMount 时 ledger 可能尚未就绪，需随 session 重读）
    getCategories(ledgerId).then(cats => {
      categories = cats;
      // 仅当 URL 带分类参数时才预选，否则保持"全部分类"
      if (appliedCategoryName) {
        const match = cats.find(c => c.name === appliedCategoryName);
        if (match && filterCategoryId === 0) filterCategoryId = match.id;
      }
      loadExpenses();
    });
  }

  // "全部分类" 的 option value 是字符串 "0"（select 选项全走字符串），
  // 切到具体分类是 number，切回"全部分类"是字符串 "0"（truthy，会误传 DB）。
  // 归一：0 / "0" / undefined 都视为"全部"。
  function normalizedCategoryId(): number | undefined {
    const v = filterCategoryId;
    return (v === 0 || v === undefined) ? undefined : (typeof v === 'number' ? v : Number(v) || undefined);
  }

  async function loadExpenses() {
    if (!ledgerId || ledgerId <= 0) return;
    expenses = await getExpenses(ledgerId, {
      startDate: filterStartDate || undefined,
      endDate: filterEndDate || undefined,
      categoryId: normalizedCategoryId()
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

  // 退款折叠：隐藏退款后列表/合计/分布条都基于非退款记录（净消费视图）
  $: listExpenses = (() => {
    let list = hideRefunds
      ? visibleExpenses.filter(e => normSubTypeOf(e) !== 'refund')
      : visibleExpenses;
    if (showOnlyExpense) {
      list = list.filter(e => normDirOf(e) === 'expense' || normSubTypeOf(e) === 'refund');
    }
    return list;
  })();

  // 规范化方向/子类型（老数据兜底）
  function normDirOf(e: Expense): 'expense' | 'income' | 'neutral' { return e.direction ?? 'expense'; }
  function normSubTypeOf(e: Expense): string { return e.subType ?? 'consumption'; }

  // 退款笔数（用于开关节点显示，基于当前关键词过滤）
  $: refundCount = visibleExpenses.filter(e => normSubTypeOf(e) === 'refund').length;

  // 三分汇总：消费净额（= 消费 − 退款冲抵）/ 收入 / 中性笔数+金额 / 退款合计（单列，冲减消费）
  $: summary = (() => {
    const scope = listExpenses;
    const consume = scope.reduce((s, e) => s + (isConsumptionScope(e) ? expenseSigned(e) : 0), 0);
    const income = incomeReduce(scope);
    const neutral = neutralStats(scope);
    // 退款合计（退款是中性，单独统计用于展示"消费 − 退款"）
    const refund = scope.reduce((s, e) => s + (isRefund(e) ? e.amount_cents : 0), 0);
    return { consume, income, neutral, refund };
  })();

  // 月份标签：今年只显示"10月"，非今年显示"2025年10月"
  function monthLabel(month: string): string {
    const [y, m] = month.split('-');
    const curYear = String(new Date().getFullYear());
    return y === curYear ? `${parseInt(m)}月` : `${y}年${parseInt(m)}月`;
  }

  // 分组后消费净额合计（用于顶部汇总显示，跟随关键词过滤 + 退款折叠）
  $: visibleTotal = listExpenses.reduce((s, e) => s + (isConsumptionScope(e) ? expenseSigned(e) : 0), 0);

  // 分类分布（按当前可见记录聚合，仅消费口径，净金额退款冲减）。按金额降序。
  $: categoryDist = (() => {
    if (listExpenses.length === 0) return [];
    const byCat = new Map<number, number>();
    for (const e of listExpenses) {
      const val = isConsumptionScope(e) ? expenseSigned(e) : 0;
      if (val === 0) continue;
      byCat.set(e.category_id, (byCat.get(e.category_id) ?? 0) + val);
    }
    const sum = Math.abs(visibleTotal);
    return Array.from(byCat.entries())
      .filter(([, total]) => total !== 0)
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

  // 分类是否"生效"（选中了某个真实分类；"全部分类"的 0/"0" 不算）
  $: hasCategoryFilter = normalizedCategoryId() !== undefined;
  // 切筛选时重置分页（折叠机制已移除，改由全量分页承载"看历史"诉求）

  // ── 每页 N 条 真分页 ──
  // 分页基于【全量】记录（listExpenses，倒序新在前），不受月份/天折叠影响，
  // 这样"全部分类 254 条 / 每页 50"=6 页，折叠只决定某页内的天是否展开、不影响页数。
  $: flatExpenses = [...listExpenses].sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  $: totalPages = Math.max(1, Math.ceil(flatExpenses.length / pageSize));
  // 页码越界（缩小 pageSize / 切筛选后）回退到第 1 页
  $: if (page > totalPages) page = 1;
  // 切筛选时一并重置分页
  $: if (filterStartDate || filterEndDate || hasCategoryFilter || searchKeyword || hideRefunds || showOnlyExpense) {
    page = 1;
  }
  // 本页记录 + 每行的渲染信息（是否本页首条、当月/当天小计）
  $: pagedRecords = (() => {
    type Row = {
      expense: Expense;
      isMonthHead: boolean;   // 本页里某月份的第一条 → 渲染月份头（未折叠时）
      monthTotal: number | null;
      isDayHead: boolean;     // 本页里某天的第一条 → 渲染天头
      dayTotal: number | null;
    };
    const slice = flatExpenses.slice((page - 1) * pageSize, page * pageSize);
    if (slice.length === 0) return [] as Row[];
    // 本页记录所属的月份/天集合 + 全量小计（小计=该月/该天在【全量】里的消费净额，不受分页影响）
    const dayTotals = new Map<string, number>();
    const monthTotals = new Map<string, number>();
    for (const e of listExpenses) {
      const m = e.paid_at.slice(0, 7);
      const d = e.paid_at.slice(0, 10);
      const v = isConsumptionScope(e) ? expenseSigned(e) : 0;
      dayTotals.set(d, (dayTotals.get(d) ?? 0) + v);
      monthTotals.set(m, (monthTotals.get(m) ?? 0) + v);
    }
    const seenMonth = new Set<string>();
    const seenDay = new Set<string>();
    return slice.map(e => {
      const m = e.paid_at.slice(0, 7);
      const d = e.paid_at.slice(0, 10);
      const isMonthHead = !seenMonth.has(m);
      const isDayHead = !seenDay.has(d);
      if (isMonthHead) seenMonth.add(m);
      if (isDayHead) seenDay.add(d);
      return {
        expense: e,
        isMonthHead,
        monthTotal: isMonthHead ? (monthTotals.get(m) ?? 0) : null,
        isDayHead,
        dayTotal: isDayHead ? (dayTotals.get(d) ?? 0) : null
      };
    });
  })();

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

  // 编辑弹窗打开时，若当前记录属于"待整理"兜底分类，提示用户重新归类
  $: editingUnsorted = showForm && categories.some(c => c.name === UNSORTED_CATEGORY_NAME && c.id === formCategoryId);

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

  // 记录所属的月份/天键（用于扁平列表里判断是否渲染月份头/天头）
  function currentMonthOf(row: { expense: Expense }): string { return row.expense.paid_at.slice(0, 7); }
  function currentDayOf(row: { expense: Expense }): string { return row.expense.paid_at.slice(0, 10); }
</script>

<div class="min-h-screen bg-paper">
  <main class="px-4 py-4 max-w-md mx-auto space-y-3 pb-24">

    <!-- 筛选栏（紧凑：默认只露 分类+搜索 / 日期+清除，次要项收进「更多筛选」） -->
    <div class="bg-white rounded-2xl shadow-card p-4">
      <!-- 行 1：分类 + 搜索 -->
      <div class="flex gap-2">
        <select bind:value={filterCategoryId} onchange={applyFilters}
          class="input-field text-sm py-2 flex-1 select-arrow">
          <option value="0">全部分类</option>
          {#each categories as cat}
            <option value={cat.id}>{cat.icon} {cat.name}</option>
          {/each}
        </select>
        <input type="text" bind:value={searchKeyword} placeholder="搜索商户 / 备注"
          class="input-field text-sm py-2 flex-1" aria-label="搜索关键词" />
      </div>
      <!-- 行 2：日期区间 + 清除 -->
      <div class="flex gap-2 mt-2">
        <input type="date" bind:value={filterStartDate}
          onchange={applyFilters} class="input-field text-sm py-2 flex-1 min-w-0" aria-label="开始日期" />
        <input type="date" bind:value={filterEndDate}
          onchange={applyFilters} class="input-field text-sm py-2 flex-1 min-w-0" aria-label="结束日期" />
        <button onclick={clearFilters} class="border-2 border-stone-200 text-stone-500 font-medium rounded-lg py-2 px-3 text-sm hover:bg-stone-50 transition shrink-0">清除</button>
      </div>

      <!-- 次要项：默认收起 -->
      <button type="button" onclick={() => showMoreFilters = !showMoreFilters}
        class="mt-2.5 w-full flex items-center justify-center gap-1 text-xs text-stone-400 hover:text-ink transition">
        {showMoreFilters ? '收起更多筛选' : '更多筛选'}
        <span class="transition-transform {showMoreFilters ? 'rotate-180' : ''}" aria-hidden="true">⌄</span>
      </button>
      {#if showMoreFilters}
        <div class="mt-2.5 space-y-2">
          <!-- 退款折叠开关 -->
          <label class="flex items-center gap-2.5 cursor-pointer select-none">
            <input type="checkbox" bind:checked={hideRefunds}
              class="w-4 h-4 rounded border-stone-300 text-clay-600 focus:ring-clay-500" />
            <span class="text-xs text-stone-500 font-medium">隐藏退款</span>
            {#if refundCount > 0}
              <span class="text-[11px] text-stone-400 ml-auto">共 {refundCount} 笔退款</span>
            {/if}
          </label>
          <!-- 只看支出 -->
          <label class="flex items-center gap-2.5 cursor-pointer select-none">
            <input type="checkbox" bind:checked={showOnlyExpense}
              class="w-4 h-4 rounded border-stone-300 text-clay-600 focus:ring-clay-500" />
            <span class="text-xs text-stone-500 font-medium">只看消费支出</span>
          </label>
          <!-- 每页条数 -->
          <div class="flex items-center gap-2">
            <span class="text-xs text-stone-400 shrink-0">每页</span>
            <select bind:value={pageSize} onchange={() => { page = 1; }}
              class="input-field text-xs py-1.5 w-24 select-arrow">
              <option value="10">10 条</option>
              <option value="15">15 条</option>
              <option value="20">20 条</option>
              <option value="50">50 条</option>
            </select>
          </div>
        </div>
      {/if}
    </div>

    <!-- 三分汇总（跟随关键词过滤 + 退款折叠 + 只看支出） -->
    {#if !loading && listExpenses.length > 0}
      <div class="bg-white rounded-2xl shadow-card p-4 space-y-2.5">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-xs text-stone-400 mb-0.5">
              {showOnlyExpense ? '消费净额' : (searchKeyword ? '搜索·消费净额' : '消费净额')}
              {#if hideRefunds}（已隐藏退款）{/if}
            </div>
            <div class="flex items-baseline gap-1">
              <span class="text-sm text-clay-600">¥</span>
              <span class="stat-number text-2xl" style="font-family:'JetBrains Mono',monospace;color:#B45309;">{centsToYuan(Math.abs(summary.consume))}</span>
            </div>
          </div>
          <div class="text-right">
            <div class="text-xs text-stone-400">共 {listExpenses.length} 笔</div>
          </div>
        </div>
        {#if summary.income > 0}
          <div class="flex items-center justify-between border-t border-stone-100 pt-2.5">
            <div class="text-xs text-stone-400">收入合计</div>
            <div class="flex items-baseline gap-1">
              <span class="text-sm text-green-600">+</span>
              <span class="font-mono text-base font-semibold text-green-600" style="font-family:'JetBrains Mono',monospace;">¥{centsToYuan(summary.income)}</span>
            </div>
          </div>
        {/if}
        {#if summary.neutral.count > 0}
          <div class="flex items-center justify-between border-t border-stone-100 pt-2.5">
            <div class="text-xs text-stone-400">中性交易（{summary.neutral.count} 笔，不计入消费/收入）</div>
            <div class="font-mono text-xs text-stone-400" style="font-family:'JetBrains Mono',monospace;">¥{centsToYuan(summary.neutral.total)}</div>
          </div>
        {/if}
        {#if summary.refund > 0}
          <div class="flex items-center justify-between border-t border-stone-100 pt-2.5">
            <div class="text-xs text-amber-600">退款合计（已冲减消费净额）</div>
            <div class="font-mono text-xs text-amber-600" style="font-family:'JetBrains Mono',monospace;">−¥{centsToYuan(summary.refund)}</div>
          </div>
        {/if}
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
      {#if listExpenses.length === 0}
        <div class="text-center py-16 bg-white rounded-2xl shadow-soft">
          <div class="text-4xl mb-3" aria-hidden="true">📒</div>
          <p class="text-base font-medium text-stone-500">
            {hideRefunds ? '没有非退款记录' : (searchKeyword ? '没有匹配的记录' : '暂无消费记录')}
          </p>
          <p class="text-sm mt-1 text-stone-400">
            {hideRefunds ? '取消隐藏退款可看到全部' : (searchKeyword ? '换个关键词试试' : '点击右下角按钮开始记账')}
          </p>
        </div>
      {:else}
        <!-- 全量计数（从筛选区移到列表上方，不挤占主界面） -->
        <div class="text-[11px] text-stone-400 px-1" style="font-family:'JetBrains Mono',monospace;">
          全部 {listExpenses.length} 条 · 本页 {Math.min(pageSize, Math.max(0, flatExpenses.length - (page - 1) * pageSize))} / 共 {totalPages} 页
        </div>
        <!-- 扁平记录分页列表：月份/天分组头只在首条渲染，按 pageSize 切片 -->
        {#if pagedRecords.length === 0}
          <div class="text-center py-8 bg-white rounded-2xl shadow-soft text-sm text-stone-400">本页无记录</div>
        {:else}
          <div class="space-y-2">
            {#each pagedRecords as row (row.expense.id)}
              <!-- 月份分组头（该月首条记录）：静态标题 -->
              {#if row.isMonthHead}
                {@const m = currentMonthOf(row)}
                <div class="w-full flex items-center justify-between px-1 pt-2 pb-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-bold text-ink">{monthLabel(m)}</span>
                  </div>
                  {#if row.monthTotal !== null}
                    <span class="font-mono text-sm font-semibold"
                      style="font-family:'JetBrains Mono',monospace;color:#B45309;">
                      {centsToYuan(row.monthTotal)}
                    </span>
                  {/if}
                </div>
              {/if}
              <!-- 天分组头（该天首条记录）+ 当日小计 -->
              {#if row.isDayHead}
                <div class="flex items-center justify-between px-1 py-1">
                  <span class="text-xs font-semibold text-stone-500">{dayLabel(currentDayOf(row))}</span>
                  <span class="font-mono text-xs"
                    style="font-family:'JetBrains Mono',monospace;color:#78716C;">
                    {centsToYuan(row.dayTotal ?? 0)}
                  </span>
                </div>
              {/if}
              <!-- 单条记录 -->
                <div class="bg-white rounded-2xl shadow-soft overflow-hidden divide-y divide-stone-100">
                  <div class="p-3.5 flex items-center gap-3 active:bg-stone-50 transition-colors"
                    class:list={[isNeutral(row.expense) ? 'opacity-55' : '']}>
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                      style="background-color: {getCatInfo(row.expense.category_id).color}18; color: {getCatInfo(row.expense.category_id).color};">
                      {getCatInfo(row.expense.category_id).icon}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="font-medium text-ink text-sm">{getCatInfo(row.expense.category_id).name}</span>
                        {#if isIncome(row.expense)}
                          <span class="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">收入</span>
                        {:else if isRefund(row.expense)}
                          <span class="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">退款</span>
                        {:else if subTypeLabel(row.expense)}
                          <span class="text-[10px] bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full font-medium">{subTypeLabel(row.expense)}</span>
                        {/if}
                      </div>
                      <div class="text-xs text-stone-400 truncate mt-0.5">
                        {#if row.expense.merchant && row.expense.remark}
                          {row.expense.merchant} · {row.expense.remark}
                        {:else}
                          {(row.expense.merchant ?? row.expense.remark ?? '—')}
                        {/if}
                        <span class="text-stone-300"> · {row.expense.paid_at.slice(11, 16)}</span>
                      </div>
                    </div>
                    <div class="text-right shrink-0">
                      <div class="font-mono font-semibold text-sm"
                        style={isIncome(row.expense)
                          ? 'color:#16A34A;font-family:"JetBrains Mono",monospace;'
                          : (isRefund(row.expense) ? 'color:#D97706;font-family:"JetBrains Mono",monospace;'
                          : (isNeutral(row.expense) ? 'color:#A8A29E;font-family:"JetBrains Mono",monospace;' : 'color:#1C1917;font-family:"JetBrains Mono",monospace;'))}>
                        {isIncome(row.expense) ? '+' : (isRefund(row.expense) ? '−' : (isNeutral(row.expense) ? '·' : '−'))}¥{centsToYuan(row.expense.amount_cents)}
                      </div>
                      <div class="flex gap-1 mt-1.5 justify-end">
                        <button type="button" onclick={() => openEdit(row.expense)} aria-label="编辑" class="p-1.5 text-stone-400 hover:text-clay-600 transition-colors rounded-lg hover:bg-clay-50">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                        </button>
                        <button type="button" onclick={() => handleDelete(row.expense.id)} aria-label="删除" class="p-1.5 text-stone-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
            {/each}
          </div>

          <!-- 分页控件 -->
          <div class="flex items-center justify-between py-3">
            <button type="button" disabled={page <= 1}
              onclick={() => { if (page > 1) { page--; window.scrollTo({ top: 0, behavior: 'smooth' }); } }}
              class="px-4 py-2 rounded-full text-sm font-medium transition
                {page <= 1 ? 'bg-stone-100 text-stone-300 cursor-not-allowed' : 'bg-white text-clay-600 shadow-soft hover:bg-stone-50'}">
              上页
            </button>
            <span class="text-xs text-stone-500" style="font-family:'JetBrains Mono',monospace;">{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages}
              onclick={() => { if (page < totalPages) { page++; window.scrollTo({ top: 0, behavior: 'smooth' }); } }}
              class="px-4 py-2 rounded-full text-sm font-medium transition
                {page >= totalPages ? 'bg-stone-100 text-stone-300 cursor-not-allowed' : 'bg-white text-clay-600 shadow-soft hover:bg-stone-50'}">
              下页
            </button>
          </div>
        {/if}
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

        {#if editingUnsorted}
          <div class="bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-2.5 rounded-xl">
            这笔暂未归类（"待整理"），请选择真实分类后保存。
          </div>
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
                  {formCategoryId === cat.id ? 'border-clay-600 bg-clay-50' : 'border-stone-100 hover:border-stone-200'}
                  {cat.name === UNSORTED_CATEGORY_NAME ? '!border-amber-300 !bg-amber-50' : ''}">
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
