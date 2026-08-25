<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import * as echarts from 'echarts';
  import {
    getSummary,
    getCategoryStats,
    getDailyTrend,
    type StatSummary,
    type CategoryStat,
    type DailyStat
  } from '$lib/db/stats';
  import { centsToYuan } from '$lib/utils/format';

  let summary: StatSummary = { monthTotal: 0, weekTotal: 0, yesterdayTotal: 0 };
  let categoryStats: CategoryStat[] = [];
  let dailyTrend: DailyStat[] = [];
  let currentUserId = 0;
  let loading = true;

  let pieChart: echarts.ECharts | null = null;
  let lineChart: echarts.ECharts | null = null;

  onMount(async () => {
    const stored = localStorage.getItem('xiaoliuji_session');
    if (stored) {
      try { currentUserId = JSON.parse(stored).userId; } catch {}
    }

    const [sum, cats, trend] = await Promise.all([
      getSummary(currentUserId),
      getCategoryStats(currentUserId, new Date().toISOString().slice(0, 7)),
      getDailyTrend(currentUserId, 7)
    ]);

    summary = sum;
    categoryStats = cats;
    dailyTrend = trend;
    loading = false;

    initCharts();
  });

  function initCharts() {
    const pieDom = document.getElementById('pie-chart');
    if (pieDom) {
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
        if (params.data?.name) {
          goto(`/expenses?category=${encodeURIComponent(params.data.name)}`);
        }
      });
    }

    const lineDom = document.getElementById('line-chart');
    if (lineDom) {
      lineChart = echarts.init(lineDom);
      lineChart.setOption({
        tooltip: {
          trigger: 'axis',
          formatter: (params: any) => {
            const val = params?.[0]?.value ?? 0;
            return `¥${centsToYuan(val)}`;
          }
        },
        grid: { top: 10, right: 10, bottom: 25, left: 45 },
        xAxis: {
          type: 'category',
          data: dailyTrend.map((d: DailyStat) => d.date.slice(5)),
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
          data: dailyTrend.map((d: DailyStat) => d.total),
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
      lineChart.on('click', (params: any) => {
        if (params.dataIndex !== undefined) {
          const date = dailyTrend[params.dataIndex]?.date;
          if (date) goto(`/expenses?startDate=${date}&endDate=${date}`);
        }
      });
    }

    window.addEventListener('resize', () => {
      pieChart?.resize();
      lineChart?.resize();
    });
  }
</script>

<div class="min-h-screen bg-gray-50">
  <nav class="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between"
       style="padding-top: max(12px, env(safe-area-inset-top));">
    <h1 class="text-lg font-bold">统计概览</h1>
  </nav>

  <main class="px-4 py-4 max-w-md mx-auto space-y-4">
    {#if loading}
      <div class="text-center py-12 text-gray-400">
        <div class="text-3xl mb-2">⏳</div>
        <p class="text-sm">加载中...</p>
      </div>
    {:else}
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

      <div class="bg-white rounded-2xl shadow-sm p-4">
        <h2 class="font-semibold text-gray-800 mb-3">分类支出占比</h2>
        <div id="pie-chart" style="width:100%;height:220px;"></div>
        {#if categoryStats.length === 0}
          <div class="text-center py-6 text-gray-400 text-sm">暂无分类数据</div>
        {/if}
      </div>

      <div class="bg-white rounded-2xl shadow-sm p-4">
        <h2 class="font-semibold text-gray-800 mb-3">近7日支出趋势</h2>
        <div id="line-chart" style="width:100%;height:200px;"></div>
      </div>

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
