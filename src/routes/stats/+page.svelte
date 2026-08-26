<script lang="ts">
  import { currentUserId } from '$lib/session';
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

  $: userId = $currentUserId;
  let summary: StatSummary = { monthTotal: 0, weekTotal: 0, yesterdayTotal: 0 };
  let categoryStats: CategoryStat[] = [];
  let dailyTrend: DailyStat[] = [];
  let monthlyTrend: DailyStat[] = [];
  let loading = true;
  let viewMode = 'month' as 'week' | 'month';

  let pieChart: echarts.ECharts | null = null;
  let trendChart: echarts.ECharts | null = null;

  async function loadData() {
    if (!userId) return;
    loading = true;
    const [sum, cats, trend, monthTrend] = await Promise.all([
      getSummary(userId),
      getCategoryStats(userId, new Date().toISOString().slice(0, 7)),
      getDailyTrend(userId, 7),
      getMonthlyTrend(userId, 12)
    ]);
    summary = sum;
    categoryStats = cats;
    dailyTrend = trend;
    monthlyTrend = monthTrend;
    loading = false;
    initCharts();
  }

  function initCharts() {
    // 饼图
    const pieDom = document.getElementById('pie-chart');
    if (pieDom) {
      pieChart?.dispose();
      pieChart = echarts.init(pieDom);
      pieChart.setOption({
        tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
        legend: { bottom: '5%', textStyle: { fontSize: 11 } },
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '45%'],
          data: categoryStats.map(s => ({
            name: s.category.name,
            value: s.total,
            itemStyle: { color: s.category.color }
          })),
          label: { show: false },
          emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } }
        }]
      });
      pieChart.on('click', (params: any) => {
        const name = params?.data?.name as string | undefined;
        if (name) goto(`/expenses?category=${encodeURIComponent(name)}`);
      });
    }

    // 趋势图（日/月切换）
    const trendDom = document.getElementById('trend-chart');
    if (trendDom) {
      trendChart?.dispose();
      trendChart = echarts.init(trendDom);
      const isMonth = viewMode === 'month';
      const data = isMonth ? monthlyTrend : dailyTrend;
      const xAxisLabel = isMonth
        ? data.map(d => d.date.slice(5))
        : data.map(d => d.date.slice(5));

      trendChart.setOption({
        tooltip: {
          trigger: 'axis',
          formatter: (params: unknown) => {
            const arr = params as { value?: number }[];
            return `¥${centsToYuan(arr?.[0]?.value ?? 0)}`;
          }
        },
        grid: { top: 10, right: 10, bottom: 25, left: 45 },
        xAxis: {
          type: 'category',
          data: xAxisLabel,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: '#9ca3af', fontSize: 10 }
        },
        yAxis: {
          type: 'value',
          splitLine: { lineStyle: { color: '#f3f4f6' } },
          axisLabel: {
            color: '#9ca3af',
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
          lineStyle: { color: '#6366f1', width: 2 },
          itemStyle: { color: '#6366f1' },
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(99,102,241,0.2)' },
                { offset: 1, color: 'rgba(99,102,241,0)' }
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

  $: if (userId > 0 && !loading) {
    loadData();
  }
</script>

<div class="min-h-screen bg-gray-50">
  <main class="px-4 py-4 max-w-md mx-auto space-y-4">
    {#if loading}
      <div class="text-center py-12 text-gray-400">
        <div class="text-3xl mb-2">⏳</div>
        <p class="text-sm">加载中...</p>
      </div>
    {:else}
      <!-- 汇总卡片 -->
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-white rounded-2xl shadow-sm p-4 text-center">
          <div class="text-xs text-gray-400 mb-1">本月</div>
          <div class="text-lg font-bold text-indigo-600">¥{centsToYuan(summary.monthTotal)}</div>
        </div>
        <div class="bg-white rounded-2xl shadow-sm p-4 text-center">
          <div class="text-xs text-gray-400 mb-1">本周</div>
          <div class="text-lg font-bold text-blue-600">¥{centsToYuan(summary.weekTotal)}</div>
        </div>
        <div class="bg-white rounded-2xl shadow-sm p-4 text-center">
          <div class="text-xs text-gray-400 mb-1">昨日</div>
          <div class="text-lg font-bold text-purple-600">¥{centsToYuan(summary.yesterdayTotal)}</div>
        </div>
      </div>

      <!-- 趋势图 + 视图切换 -->
      <div class="bg-white rounded-2xl shadow-sm p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-gray-800">
            {viewMode === 'month' ? '月度支出趋势（近12月）' : '每日支出趋势（近7日）'}
          </h2>
          <div class="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onclick={() => switchView('week')}
              class="px-3 py-1 text-xs font-medium rounded-md transition
                {viewMode === 'week' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}">
              日
            </button>
            <button
              onclick={() => switchView('month')}
              class="px-3 py-1 text-xs font-medium rounded-md transition
                {viewMode === 'month' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}">
              月
            </button>
          </div>
        </div>
        <div id="trend-chart" style="width:100%;height:200px;"></div>
      </div>

      <!-- 分类饼图 -->
      <div class="bg-white rounded-2xl shadow-sm p-4">
        <h2 class="font-semibold text-gray-800 mb-3">分类支出占比</h2>
        <div id="pie-chart" style="width:100%;height:220px;"></div>
        {#if categoryStats.length === 0}
          <div class="text-center py-6 text-gray-400 text-sm">暂无分类数据</div>
        {/if}
      </div>

      <!-- 分类明细 -->
      {#if categoryStats.length > 0}
        <div class="bg-white rounded-2xl shadow-sm p-4">
          <h2 class="font-semibold text-gray-800 mb-3">分类明细</h2>
          <div class="space-y-2">
            {#each categoryStats as stat}
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center text-lg shrink-0"
                  style="background-color: {stat.category.color}20">
                  {stat.category.icon}
                </div>
                <div class="flex-1">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium text-gray-700">{stat.category.name}</span>
                    <span class="text-sm font-semibold text-gray-800">¥{centsToYuan(stat.total)}</span>
                  </div>
                  <div class="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all"
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
