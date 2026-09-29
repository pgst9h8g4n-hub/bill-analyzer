<script lang="ts">
  import { onMount } from 'svelte';
  import { currentLedgerId } from '$lib/session';
  import { goto } from '$app/navigation';
  import * as echarts from 'echarts';
  import {
    getSummary,
    getCategoryStats,
    getDailyTrend,
    getMonthlyTrend,
    type StatSummary,
    type CategoryStat,
    type DailyStat
  } from '$lib/db/stats';
  import { centsToYuan } from '$lib/utils/format';
  import { get } from 'svelte/store';

  let userId = 0;
  let ledgerId = 0;
  let summary: StatSummary = { monthTotal: 0, weekTotal: 0, yesterdayTotal: 0 };
  let categoryStats: CategoryStat[] = [];
  let dailyTrend: DailyStat[] = [];
  let monthlyTrend: DailyStat[] = [];
  let loading = true;
  let viewMode = 'month' as 'week' | 'month';

  let pieChart: echarts.ECharts | null = null;
  let trendChart: echarts.ECharts | null = null;

  onMount(() => {
    const initLedgerId = get(currentLedgerId);
    if (initLedgerId > 0) ledgerId = initLedgerId;
    currentLedgerId.subscribe(v => {
      if (v !== ledgerId && v > 0) { ledgerId = v; loadData(); }
    });
    loadData();
  });

  async function loadData() {
    if (!ledgerId) return;
    loading = true;
    const [sum, cats, trend, monthTrend] = await Promise.all([
      getSummary(ledgerId),
      getCategoryStats(ledgerId, new Date().toISOString().slice(0, 7)),
      getDailyTrend(ledgerId, 7),
      getMonthlyTrend(ledgerId, 12)
    ]);
    summary = sum;
    categoryStats = cats;
    dailyTrend = trend;
    monthlyTrend = monthTrend;
    loading = false;
    initCharts();
  }

  function initCharts() {
    const accentColor = '#B45309';
    const accentLight = 'rgba(180,83,9,0.12)';

    // 饼图
    const pieDom = document.getElementById('pie-chart');
    if (pieDom) {
      pieChart?.dispose();
      pieChart = echarts.init(pieDom);
      pieChart.setOption({
        tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
        legend: { bottom: '5%', textStyle: { fontSize: 11, color: '#78716C' } },
        series: [{
          type: 'pie',
          radius: ['42%', '72%'],
          center: ['50%', '45%'],
          data: categoryStats.map(s => ({
            name: s.category.name,
            value: s.total,
            itemStyle: { color: s.category.color }
          })),
          label: { show: false },
          emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.2)' } }
        }]
      });
      pieChart.on('click', (params: any) => {
        const name = params?.data?.name as string | undefined;
        if (name) goto(`/expenses?category=${encodeURIComponent(name)}`);
      });
    }

    // 趋势图
    const trendDom = document.getElementById('trend-chart');
    if (trendDom) {
      trendChart?.dispose();
      trendChart = echarts.init(trendDom);
      const isMonth = viewMode === 'month';
      const data = isMonth ? monthlyTrend : dailyTrend;
      const xAxisLabel = data.map(d => d.date.slice(5));

      trendChart.setOption({
        tooltip: {
          trigger: 'axis',
          formatter: (params: unknown) => {
            const arr = params as { value?: number }[];
            return `¥${centsToYuan(arr?.[0]?.value ?? 0)}`;
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
            formatter: (v: number) => v >= 100 ? `¥${(v / 100).toFixed(0)}` : '¥0'
          }
        },
        series: [{
          data: data.map(d => d.total),
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
      });

      trendChart.on('click', (params: { dataIndex?: number }) => {
        if (params.dataIndex !== undefined) {
          const date = data[params.dataIndex]?.date;
          if (date) {
            if (isMonth) {
              goto(`/expenses?startDate=${date}-01&endDate=${date}-31`);
            } else {
              goto(`/expenses?startDate=${date}&endDate=${date}`);
            }
          }
        }
      });
    }

    window.addEventListener('resize', () => {
      pieChart?.resize();
      trendChart?.resize();
    });
  }

  function switchView(mode: 'week' | 'month') {
    viewMode = mode;
    initCharts();
  }
</script>

<div class="min-h-screen bg-paper">
  <main class="px-4 py-4 max-w-md mx-auto space-y-4 pb-20">
    {#if loading}
      <div class="text-center py-12 text-stone-400">
        <div class="text-3xl mb-2" aria-hidden="true">⏳</div>
        <p class="text-sm">加载中...</p>
      </div>
    {:else}
      <!-- 三卡汇总 -->
      <div class="grid grid-cols-3 gap-2.5">
        <div class="bg-white rounded-2xl shadow-soft p-3.5 text-center">
          <div class="text-[10px] text-stone-400 mb-1 font-medium uppercase tracking-wide">本月</div>
          <div class="flex items-baseline justify-center gap-0.5">
            <span class="text-xs text-clay-600">¥</span>
            <span class="stat-number text-lg" style="font-family:'JetBrains Mono',monospace;color:#B45309;">{centsToYuan(summary.monthTotal)}</span>
          </div>
        </div>
        <div class="bg-white rounded-2xl shadow-soft p-3.5 text-center">
          <div class="text-[10px] text-stone-400 mb-1 font-medium uppercase tracking-wide">本周</div>
          <div class="flex items-baseline justify-center gap-0.5">
            <span class="text-xs text-amber-600">¥</span>
            <span class="stat-number text-lg" style="font-family:'JetBrains Mono',monospace;color:#D97706;">{centsToYuan(summary.weekTotal)}</span>
          </div>
        </div>
        <div class="bg-white rounded-2xl shadow-soft p-3.5 text-center">
          <div class="text-[10px] text-stone-400 mb-1 font-medium uppercase tracking-wide">昨日</div>
          <div class="flex items-baseline justify-center gap-0.5">
            <span class="text-xs text-purple-600">¥</span>
            <span class="stat-number text-lg" style="font-family:'JetBrains Mono',monospace;color:#7C3AED;">{centsToYuan(summary.yesterdayTotal)}</span>
          </div>
        </div>
      </div>

      <!-- 趋势图 -->
      <div class="bg-white rounded-2xl shadow-card p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-ink text-base">
            {viewMode === 'month' ? '月度支出趋势' : '每日支出趋势'}
          </h2>
          <div class="flex bg-stone-100 rounded-full p-0.5">
            <button
              onclick={() => switchView('week')}
              class="px-3 py-1 text-xs font-medium rounded-full transition-all duration-150
                {viewMode === 'week' ? 'bg-white text-clay-600 shadow-sm' : 'text-stone-500'}">
              日
            </button>
            <button
              onclick={() => switchView('month')}
              class="px-3 py-1 text-xs font-medium rounded-full transition-all duration-150
                {viewMode === 'month' ? 'bg-white text-clay-600 shadow-sm' : 'text-stone-500'}">
              月
            </button>
          </div>
        </div>
        <div id="trend-chart" style="width:100%;height:200px;"></div>
      </div>

      <!-- 分类饼图 -->
      <div class="bg-white rounded-2xl shadow-card p-4">
        <h2 class="font-semibold text-ink text-base mb-3">分类支出占比</h2>
        <div id="pie-chart" style="width:100%;height:220px;"></div>
        {#if categoryStats.length === 0}
          <div class="text-center py-8 text-stone-400 text-sm">暂无分类数据</div>
        {/if}
      </div>

      <!-- 分类明细 -->
      {#if categoryStats.length > 0}
        <div class="bg-white rounded-2xl shadow-card p-4">
          <h2 class="font-semibold text-ink text-base mb-3">分类明细</h2>
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
                    <span class="font-mono text-sm font-semibold text-ink" style="font-family:'JetBrains Mono',monospace;">¥{centsToYuan(stat.total)}</span>
                  </div>
                  <div class="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500"
                      style="width: {summary.monthTotal > 0 ? Math.abs(stat.total / summary.monthTotal * 100) : 0}%; background-color: {stat.category.color}"></div>
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
