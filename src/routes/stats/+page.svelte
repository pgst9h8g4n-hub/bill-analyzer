<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { currentLedgerId } from '$lib/session';
  import { goto } from '$app/navigation';
  import * as echarts from 'echarts';
  import {
    getPeriodSummary,
    getPeriodCategoryStats,
    getPeriodTrend,
    getPeriodTopExpenses,
    getBudgetVsActual,
    getAvailableYears,
    getAvailableMonths,
    monthsOf,
    getPeriodConsumptionDays,
    type StatSummary,
    type CategoryStat,
    type DailyStat,
    type BudgetVsActual,
    type TopExpense
  } from '$lib/db/stats';
  import { centsToYuan } from '$lib/utils/format';
  import { get } from 'svelte/store';

  let userId = 0;
  let ledgerId = 0;
  let summary: StatSummary = { monthTotal: 0, weekTotal: 0, yesterdayTotal: 0, currentMonth: '', monthIncome: 0, monthNeutralCount: 0, monthNeutralTotal: 0, monthRefund: 0 };
  let categoryStats: CategoryStat[] = [];
  let trend: DailyStat[] = [];
  let budgetVsActual: BudgetVsActual[] = [];
  let topExpenses: TopExpense[] = [];
  let loading = true;

  // 周期选择：'year' 看整年（逐月趋势 + 全年汇总），'month' 看单月（逐天趋势 + 当月汇总）
  let periodMode: 'year' | 'month' = 'month';
  let selectedYear = '';   // 'YYYY'
  let selectedMonth = '';  // 'YYYY-MM'
  let availableYears: string[] = [];
  let availableMonths: string[] = [];

  // 趋势图横轴刻度（年=12月，月=当月各天）
  let trendBuckets: string[] = [];
  let isYearPeriod = false;

  function currentPeriod(): string {
    return periodMode === 'year' ? selectedYear : selectedMonth;
  }

  // 消费净额在数据层里记为负数（expenseSigned），图表/占比展示统一取绝对值（正值），
  // 否则趋势图纵轴全 0、环形图只显示最大负值的两三个分类。
  function toPositive(v: number): number {
    return Math.abs(v);
  }

  // 标签：年→'2026年'；月→'5月'（非今年加年份）
  function periodLabel(): string {
    if (periodMode === 'year') return `${selectedYear}年`;
    if (!selectedMonth) return '';
    const [y, m] = selectedMonth.split('-');
    const curYear = String(new Date().getFullYear());
    return y === curYear ? `${parseInt(m)}月` : `${y}年${parseInt(m)}月`;
  }

  // "本周/昨日"是系统当前日期的口径，只有当所选月=系统当前月（且月模式）时才有意义；
  // 年模式 / 历史月 → 隐藏这两卡，避免"切周期不变"的错觉。
  let showWeekYesterday = false;
  $: {
    const sys = new Date();
    const sysMonth = `${sys.getFullYear()}-${String(sys.getMonth() + 1).padStart(2, '0')}`;
    showWeekYesterday = periodMode === 'month' && selectedMonth === sysMonth;
  }

  onMount(async () => {
    const initLedgerId = get(currentLedgerId);
    if (initLedgerId > 0) ledgerId = initLedgerId;
    // 先拉可选周期（年/月列表），再定默认选中值（默认最新月）
    await refreshPeriods();
    currentLedgerId.subscribe(async v => {
      if (v > 0) {
        if (v !== ledgerId) ledgerId = v;
        await refreshPeriods();
        await loadData();
      }
    });
    if (initLedgerId > 0) await loadData();
  });

  // 拉可用年/月，并保证 selectedYear/selectedMonth 落在有效范围内（默认最新月）
  async function refreshPeriods() {
    const [ys, ms] = await Promise.all([
      getAvailableYears(ledgerId),
      getAvailableMonths(ledgerId)
    ]);
    availableYears = ys;
    availableMonths = ms;
    if (ys.length && !ys.includes(selectedYear)) selectedYear = ys[0]; // 最新年
    // 月模式：默认该年最新月；若已有跨年选择则保留在可用范围内
    if (ms.length && !ms.includes(selectedMonth)) {
      selectedMonth = ms[0];
    }
    if (!selectedMonth && ms.length) selectedMonth = ms[0];
    if (periodMode === 'year' && !selectedYear && ys.length) selectedYear = ys[0];
  }

  let lastLoadedPeriod = '';

  // 切换周期时强制重新查（空串=未加载/需加载；相同周期=可跳过）
  function periodKey(): string {
    return `${periodMode}:${currentPeriod()}`;
  }

  async function loadData() {
    if (!ledgerId) return;
    const key = periodKey();
    if (key === lastLoadedPeriod) return;
    const period = currentPeriod();
    lastLoadedPeriod = key;
    loading = true;
    isYearPeriod = periodMode === 'year';
    // 年模式横轴=12 个月；月模式横轴=当月"有数据的各天"（稀疏，避免全月 31 天大部分贴 0 看着没数据）
    trendBuckets = isYearPeriod ? monthsOf(selectedYear) : await getPeriodConsumptionDays(ledgerId, period);

    const [sum, cats, tr, bva, top] = await Promise.all([
      getPeriodSummary(ledgerId, period),
      getPeriodCategoryStats(ledgerId, period),
      getPeriodTrend(ledgerId, period, trendBuckets),
      // 预算是"按月"设的，年模式不显示（预算对照卡仅月模式）
      isYearPeriod ? Promise.resolve([]) : getBudgetVsActual(ledgerId, selectedMonth),
      getPeriodTopExpenses(ledgerId, period, 5)
    ]);
    summary = sum;
    categoryStats = cats;
    trend = tr;
    budgetVsActual = bva;
    topExpenses = top;
    loading = false;
    await tick();
    initCharts();
    setTimeout(initCharts, 60);
  }

  // 周期切换：重置周期到该模式的最新项，清 lastLoadedPeriod 强制重查
  function setPeriodMode(mode: 'year' | 'month') {
    if (mode === periodMode) return;
    periodMode = mode;
    if (mode === 'year' && !availableYears.includes(selectedYear)) {
      selectedYear = availableYears[0] ?? '';
    }
    if (mode === 'month' && !availableMonths.includes(selectedMonth)) {
      selectedMonth = availableMonths[0] ?? '';
    }
    lastLoadedPeriod = '';
    loadData();
  }

  // 选某年
  function pickYear(y: string) {
    selectedYear = y;
    lastLoadedPeriod = '';
    loadData();
  }

  // 选某月（切到月模式并载入）
  function pickMonth(m: string) {
    periodMode = 'month';
    selectedMonth = m;
    lastLoadedPeriod = '';
    loadData();
  }

  // 默认"最新月"
  function goLatestMonth() {
    periodMode = 'month';
    selectedMonth = availableMonths[0] ?? '';
    lastLoadedPeriod = '';
    loadData();
  }

  let pieChart: echarts.ECharts | null = null;
  let trendChart: echarts.ECharts | null = null;
  let resizeBound = false;

  function initCharts() {
    const accentColor = '#B45309';

    // 饼图。容器永久挂载，尺寸就绪。已有非 0 尺寸实例则复用（不重 init，避免"已初始化"警告）；
    // 0 尺寸实例（页面曾隐藏时 init 失败）dispose 后重 init。
    const pieDom = document.getElementById('pie-chart');
    if (pieChart && pieChart.getWidth() > 0) {
      /* reuse existing instance */
    } else {
      if (pieChart) pieChart.dispose();
      pieChart = pieDom ? echarts.init(pieDom) : null;
    }
    if (pieChart) {
      pieChart.setOption({
        notMerge: true,   // 切周期时分类变，必须不合并，否则旧分类残留
        tooltip: {
          trigger: 'item',
          formatter: (p: any) => `${p.name}: ¥${(p.value / 100).toFixed(2)} (${p.percent}%)`
        },
        legend: {
          // 右侧竖排，避免底部图例被环体/标题遮挡（窄屏下 bottom 图例会压住标题）
          orient: 'vertical',
          right: 0,
          top: 'middle',
          itemWidth: 8,
          itemHeight: 8,
          itemGap: 6,
          textStyle: { fontSize: 11, color: '#78716C' }
        },
        series: [{
          type: 'pie',
          // 环往左挪，给右侧图例留位
          radius: ['40%', '68%'],
          center: ['38%', '50%'],
          // value 仍传"分"（toPositive(total)），与 tooltip/legend 的 /100 一致
          data: categoryStats.map(s => ({
            name: s.category.name,
            value: toPositive(s.total),
            itemStyle: { color: s.category.color }
          })),
          label: { show: false },
          emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.2)' } }
        }]
      }, { notMerge: true });
      pieChart.off('click');
      pieChart.on('click', (params: any) => {
        const name = params?.data?.name as string | undefined;
        if (name) goto(`/expenses?category=${encodeURIComponent(name)}`);
      });
    }

    // 趋势图（横轴：年=12个月 / 月=当月各天；点一点进明细页对应周期）
    const trendDom = document.getElementById('trend-chart');
    if (trendChart && trendChart.getWidth() > 0) {
      /* reuse existing instance */
    } else {
      if (trendChart) trendChart.dispose();
      trendChart = trendDom ? echarts.init(trendDom) : null;
    }
    if (trendChart) {
      const xAxisLabel = trend.map(d => isYearPeriod ? d.date.slice(5) : d.date.slice(8));

      trendChart.setOption({
        notMerge: true,   // 切周期时横轴刻度/数据全变，必须不合并
        tooltip: {
          trigger: 'axis',
          formatter: (params: unknown) => {
            const arr = params as { value?: number }[];
            const cents = toPositive(arr?.[0]?.value ?? 0); // 仍是"分"
            return `¥${(cents / 100).toFixed(2)}`;
          }
        },
        grid: { top: 10, right: 12, bottom: 28, left: 44 },
        xAxis: {
          type: 'category',
          data: xAxisLabel,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: '#a8a29e', fontSize: 10 }
        },
        yAxis: {
          type: 'value',
          splitLine: { lineStyle: { color: '#f5f5f4', dashOffset: 4 } },
          axisLabel: {
            color: '#a8a29e',
            fontSize: 10,
            // v 单位是"分"，/100 转元；0 也显示 ¥0 占位避免留白
            formatter: (v: number) => `¥${(v / 100).toFixed(0)}`
          }
        },
        series: [{
          // data 用"分"（toPositive(total)），与 y 轴 /100 口径一致
          data: trend.map(d => toPositive(d.total)),
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { color: accentColor, width: 2.5 },
          itemStyle: { color: accentColor, borderWidth: 2, borderColor: '#fff' },
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(180,83,9,0.18)' },
                { offset: 1, color: 'rgba(180,83,9,0)' }
              ]
            }
          }
        }]
      }, { notMerge: true });

      trendChart.off('click');
      trendChart.on('click', (params: { dataIndex?: number }) => {
        if (params.dataIndex !== undefined) {
          const date = trend[params.dataIndex]?.date;
          if (date) {
            if (isYearPeriod) {
              // 点在某个"月"上 → 看该月明细（整月）
              goto(`/expenses?startDate=${date}-01&endDate=${date}-31`);
            } else {
              // 点在某个"天"上 → 看该天明细
              goto(`/expenses?startDate=${date}&endDate=${date}`);
            }
          }
        }
      });
    }

    // resize 监听只挂一次
    if (!resizeBound) {
      resizeBound = true;
      window.addEventListener('resize', () => {
        pieChart?.resize();
        trendChart?.resize();
      });
    }
  }
</script>

<div class="min-h-screen bg-paper">
  <main class="px-4 py-4 max-w-md mx-auto space-y-4 pb-20">
    <!-- 周期选择器：年/月 切换 + 下拉 -->
    <div class="bg-white rounded-2xl shadow-card p-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-semibold text-ink text-base">统计周期</h2>
        <div class="flex bg-stone-100 rounded-full p-0.5">
          <button
            onclick={() => setPeriodMode('month')}
            class="px-3 py-1 text-xs font-medium rounded-full transition-all duration-150
              {periodMode === 'month' ? 'bg-white text-clay-600 shadow-sm' : 'text-stone-500'}">
            按单月
          </button>
          <button
            onclick={() => setPeriodMode('year')}
            class="px-3 py-1 text-xs font-medium rounded-full transition-all duration-150
              {periodMode === 'year' ? 'bg-white text-clay-600 shadow-sm' : 'text-stone-500'}">
            按全年
          </button>
        </div>
      </div>

      {#if periodMode === 'month'}
        <div class="flex items-center gap-2">
          <span class="text-sm text-stone-500 shrink-0">月份</span>
          <select
            value={selectedMonth}
            onchange={(e) => pickMonth((e.target as HTMLSelectElement).value)}
            class="flex-1 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1.5 text-sm text-ink">
            <option value="">— 选择月份 —</option>
            {#each availableMonths as m}
              <option value={m}>{m.split('-')[0]}年{parseInt(m.split('-')[1])}月</option>
            {/each}
          </select>
        </div>
        <button onclick={() => goLatestMonth()} class="mt-2 text-xs text-clay-600 font-medium">跳到最新消费月 →</button>
      {:else}
        <div class="flex items-center gap-2">
          <span class="text-sm text-stone-500 shrink-0">年份</span>
          <select
            value={selectedYear}
            onchange={(e) => pickYear((e.target as HTMLSelectElement).value)}
            class="flex-1 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1.5 text-sm text-ink">
            <option value="">— 选择年份 —</option>
            {#each availableYears as y}
              <option value={y}>{y}年</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>

    {#if loading}
      <div class="text-center py-12 text-stone-400">
        <div class="text-3xl mb-2" aria-hidden="true">⏳</div>
        <p class="text-sm">加载中...</p>
      </div>
    {:else}
      <!-- 周期消费汇总（本期；本周/昨日仅在"月模式且当前系统月"时显示） -->
      <div class="grid grid-cols-{showWeekYesterday ? 3 : 1} gap-2.5">
        <div class="bg-white rounded-2xl shadow-soft p-3.5 text-center {showWeekYesterday ? '' : 'col-span-full'}">
          <div class="text-[10px] text-stone-400 mb-1 font-medium uppercase tracking-wide">{periodLabel() || '本期'}</div>
          <div class="flex items-baseline justify-center gap-0.5">
            <span class="text-xs text-clay-600">¥</span>
            <span class="stat-number text-lg" style="font-family:'JetBrains Mono',monospace;color:#B45309;">{centsToYuan(toPositive(summary.monthTotal))}</span>
          </div>
        </div>
        {#if showWeekYesterday}
        <div class="bg-white rounded-2xl shadow-soft p-3.5 text-center">
          <div class="text-[10px] text-stone-400 mb-1 font-medium uppercase tracking-wide">本周</div>
          <div class="flex items-baseline justify-center gap-0.5">
            <span class="text-xs text-amber-600">¥</span>
            <span class="stat-number text-lg" style="font-family:'JetBrains Mono',monospace;color:#D97706;">{centsToYuan(toPositive(summary.weekTotal))}</span>
          </div>
        </div>
        <div class="bg-white rounded-2xl shadow-soft p-3.5 text-center">
          <div class="text-[10px] text-stone-400 mb-1 font-medium uppercase tracking-wide">昨日</div>
          <div class="flex items-baseline justify-center gap-0.5">
            <span class="text-xs text-purple-600">¥</span>
            <span class="stat-number text-lg" style="font-family:'JetBrains Mono',monospace;color:#7C3AED;">{centsToYuan(toPositive(summary.yesterdayTotal))}</span>
          </div>
        </div>
        {/if}
      </div>

      <!-- 收入/中性/退款 小卡（周期口径） -->
      <div class="grid grid-cols-3 gap-2.5">
        <div class="bg-white rounded-2xl shadow-soft p-3 text-center">
          <div class="text-[10px] text-stone-400 mb-1 font-medium">{periodLabel() || '本期'}收入</div>
          <div class="flex items-baseline justify-center gap-0.5">
            <span class="text-xs text-emerald-600">¥</span>
            <span class="text-base font-semibold text-emerald-600" style="font-family:'JetBrains Mono',monospace;">{centsToYuan(summary.monthIncome)}</span>
          </div>
        </div>
        <div class="bg-white rounded-2xl shadow-soft p-3 text-center">
          <div class="text-[10px] text-stone-400 mb-1 font-medium">中性交易</div>
          <div class="flex items-baseline justify-center gap-0.5">
            <span class="text-base font-semibold text-stone-500" style="font-family:'JetBrains Mono',monospace;">{summary.monthNeutralCount}</span>
            <span class="text-[10px] text-stone-400">笔</span>
          </div>
        </div>
        <div class="bg-white rounded-2xl shadow-soft p-3 text-center">
          <div class="text-[10px] text-stone-400 mb-1 font-medium">退款冲抵</div>
          <div class="flex items-baseline justify-center gap-0.5">
            <span class="text-xs text-amber-600">−¥</span>
            <span class="text-base font-semibold text-amber-600" style="font-family:'JetBrains Mono',monospace;">{centsToYuan(summary.monthRefund)}</span>
          </div>
        </div>
      </div>

      <!-- 预算 vs 实际（仅单月周期；预算按月设） -->
      {#if periodMode === 'month' && budgetVsActual.length > 0}
        <div class="bg-white rounded-2xl shadow-card p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="font-semibold text-ink text-base">预算对照 · {periodLabel()}</h2>
            <button onclick={() => goto('/budget')} class="text-xs text-clay-600 font-medium">管理预算 →</button>
          </div>
          <div class="space-y-3">
            {#each budgetVsActual as bva}
              <div>
                <div class="flex items-center justify-between mb-1">
                  <div class="flex items-center gap-2">
                    {#if bva.categoryId === null}
                      <span class="text-sm font-medium text-ink">总预算</span>
                    {:else}
                      <span class="text-base">{bva.category?.icon}</span>
                      <span class="text-sm font-medium text-ink">{bva.category?.name ?? '其他'}</span>
                    {/if}
                  </div>
                  <span class="text-xs font-mono text-stone-500" style="font-family:'JetBrains Mono',monospace;">
                    ¥{centsToYuan(bva.actual)} / ¥{centsToYuan(bva.limit)}
                  </span>
                </div>
                <div class="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-500"
                    style="width: {Math.min(bva.ratio * 100, 100)}%; background-color: {bva.over ? '#DC2626' : bva.ratio >= 0.7 ? '#D97706' : '#B45309'}"></div>
                </div>
                {#if bva.over}
                  <div class="text-[11px] text-red-600 mt-1 font-medium">超支 ¥{centsToYuan(bva.actual - bva.limit)}</div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- 周期 TOP 消费 -->
      {#if topExpenses.length > 0}
        <div class="bg-white rounded-2xl shadow-card p-4">
          <h2 class="font-semibold text-ink text-base mb-3">{periodLabel() || '本期'}大额消费 TOP{topExpenses.length}</h2>
          <div class="space-y-2.5">
            {#each topExpenses as t, i}
              <div class="flex items-center gap-2.5">
                <div class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0
                  {i === 0 ? 'bg-clay-600 text-white' : 'bg-stone-100 text-stone-500'}"
                  style="font-family:'JetBrains Mono',monospace;">{i + 1}</div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-ink truncate">{t.merchant || t.category?.name || '未分类消费'}</div>
                  <div class="text-[11px] text-stone-400">{t.paid_at.slice(5)} · {t.category?.name ?? '未分类'}</div>
                </div>
                <span class="text-sm font-semibold text-ink shrink-0" style="font-family:'JetBrains Mono',monospace;">¥{centsToYuan(t.amount)}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

    {/if}

    <!-- 趋势图 + 饼图：容器永久挂载（固定高度），不在 loading 时卸载，
         否则 echarts.init 拿到 0 尺寸容器画不出。数据到位后才在 initCharts 填充。 -->
    <div class="bg-white rounded-2xl shadow-card p-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-semibold text-ink text-base">
          {periodMode === 'year' ? '全年月度趋势' : '当月每日趋势'} · {periodLabel()}
        </h2>
      </div>
      <div id="trend-chart" style="width:100%;height:200px;"></div>
    </div>

    <!-- 分类饼图 -->
    <div class="bg-white rounded-2xl shadow-card p-4">
      <h2 class="font-semibold text-ink text-base mb-3">分类支出占比 · {periodLabel()}</h2>
      <div id="pie-chart" style="width:100%;height:220px;"></div>
      {#if !loading && categoryStats.length === 0}
        <div class="text-center py-8 text-stone-400 text-sm">暂无分类数据</div>
      {/if}
    </div>

    {#if !loading}
      <!-- 分类明细 -->
      {#if categoryStats.length > 0}
        <div class="bg-white rounded-2xl shadow-card p-4">
          <h2 class="font-semibold text-ink text-base mb-3">分类明细 · {periodLabel()}</h2>
          <div class="space-y-3">
            {#each categoryStats as stat}
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0"
                  style="background-color: {stat.category.color}18;">
                  {stat.category.icon}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium text-ink">{stat.category.name}</span>
                    <span class="font-mono text-sm font-semibold text-ink" style="font-family:'JetBrains Mono',monospace;">¥{centsToYuan(toPositive(stat.total))}</span>
                  </div>
                  <div class="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500"
                      style="width: {Math.abs(summary.monthTotal) > 0 ? Math.abs(stat.total / summary.monthTotal * 100) : 0}%; background-color: {stat.category.color}"></div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </main>
</div>
