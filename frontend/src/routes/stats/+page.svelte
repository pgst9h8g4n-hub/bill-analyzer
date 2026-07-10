<script lang="ts">
  import Layout from '$lib/components/Layout.svelte';
  import { getStats, formatAmount, getPlatformLabel, getPlatformColor } from '$lib/api';
  import { onMount } from 'svelte';

  let { userId = '' } = $props();

  let stats = $state<any>(null);
  let loading = $state(true);
  let error = $state('');

  onMount(async () => {
    if (!userId) { loading = false; return; }
    try { stats = await getStats(userId); }
    catch (e: any) { error = e.message; }
    finally { loading = false; }
  });

  function formatMonth(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit' });
  }
</script>

<Layout currentPage="stats" userId={userId}>
  <div class="page">
    <div class="page-header">
      <h2>统计报表</h2>
      <p class="subtitle">多维度消费数据分析</p>
    </div>

    {#if loading}
      <div class="empty-state">加载中...</div>
    {:else if error}
      <div class="error-box">{error}</div>
    {:else if stats}
      <div class="overview-grid">
        <div class="overview-card">
          <div class="ov-label">总支出</div>
          <div class="ov-value">{formatAmount(stats.expense_amount)}</div>
        </div>
        <div class="overview-card">
          <div class="ov-label">总笔数</div>
          <div class="ov-value">{stats.record_count}</div>
        </div>
        <div class="overview-card">
          <div class="ov-label">日均支出</div>
          <div class="ov-value">{formatAmount(stats.avg_daily)}</div>
        </div>
        <div class="overview-card">
          <div class="ov-label">最大单笔</div>
          <div class="ov-value">{formatAmount(stats.max_single)}</div>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">🏆 分类支出排行</h3>
        {#if stats.by_category.length > 0}
          <div class="rank-list">
            {#each [...stats.by_category].sort((a: any, b: any) => b.amount - a.amount) as item, i}
              <div class="rank-item">
                <span class="rank-num {i < 3 ? 'top' : ''}">{i + 1}</span>
                <div class="rank-bar">
                  <div class="rank-info">
                    <span class="rank-name">{item.category_name}</span>
                    <span class="rank-pct">{item.percentage.toFixed(1)}%</span>
                  </div>
                  <div class="rank-track">
                    <div class="rank-fill" style="width: {item.percentage}%"></div>
                  </div>
                </div>
                <span class="rank-amount">{formatAmount(item.amount)}</span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty-state">暂无分类数据</div>
        {/if}
      </div>

      <div class="card">
        <h3 class="card-title">📅 月度支出趋势</h3>
        {#if stats.by_month.length > 0}
          <div class="month-chart">
            {#each stats.by_month as m}
              <div class="month-bar">
                <span class="month-label">{m.month}</span>
                <div class="month-track">
                  <div class="month-fill" style="width: {(m.amount / (stats.expense_amount / 12)) * 100}%"></div>
                </div>
                <span class="month-amount">{formatAmount(m.amount)}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="card">
        <h3 class="card-title">💳 平台对比</h3>
        <div class="platform-grid">
          {#each stats.by_platform as plat}
            <div class="platform-stat-card">
              <div class="platform-stat-icon" style="background: {getPlatformColor(plat.platform)}20; color: {getPlatformColor(plat.platform)}">
                {getPlatformLabel(plat.platform)}
              </div>
              <div class="platform-stat-info">
                <div class="platform-stat-amount">{formatAmount(plat.amount)}</div>
                <div class="platform-stat-detail">{plat.count} 笔 · 占比 {stats.expense_amount > 0 ? (plat.amount / stats.expense_amount * 100).toFixed(1) : 0}%</div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="empty-state"><p>请先登录并上传账单数据</p></div>
    {/if}
  </div>
</Layout>

<style>
  .page-header { margin-bottom: 24px; }
  .page-header h2 { font-size: 20px; margin: 0 0 4px; }
  .subtitle { color: #64748b; font-size: 14px; margin: 0; }
  .error-box { background: #fef2f2; color: #dc2626; padding: 16px; border-radius: 8px; text-align: center; }
  .empty-state { text-align: center; padding: 20px; color: #94a3b8; }

  .overview-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
  @media (max-width: 768px) { .overview-grid { grid-template-columns: repeat(2, 1fr); } }

  .overview-card { background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }
  .ov-label { font-size: 12px; color: #94a3b8; margin-bottom: 4px; }
  .ov-value { font-size: 20px; font-weight: 700; color: #1e293b; }

  .card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; }
  .card-title { font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 16px; }

  .rank-list { display: flex; flex-direction: column; gap: 12px; }
  .rank-item { display: flex; align-items: center; gap: 10px; }
  .rank-num { width: 24px; height: 24px; border-radius: 6px; background: #f1f5f9; color: #64748b; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
  .rank-num.top { background: #fef3c7; color: #d97706; }
  .rank-bar { flex: 1; min-width: 0; }
  .rank-info { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
  .rank-name { color: #1e293b; font-weight: 500; }
  .rank-pct { color: #64748b; }
  .rank-track { height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
  .rank-fill { height: 100%; background: linear-gradient(90deg, #6366f1, #8b5cf6); border-radius: 3px; }
  .rank-amount { font-size: 13px; font-weight: 600; color: #1e293b; width: 80px; text-align: right; flex-shrink: 0; }

  .month-chart { display: flex; flex-direction: column; gap: 10px; }
  .month-bar { display: flex; align-items: center; gap: 10px; }
  .month-label { font-size: 12px; color: #64748b; width: 50px; flex-shrink: 0; }
  .month-track { flex: 1; height: 24px; background: #f1f5f9; border-radius: 4px; overflow: hidden; position: relative; }
  .month-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #6366f1); border-radius: 4px; max-width: 100%; min-width: 0; }
  .month-amount { font-size: 12px; font-weight: 600; color: #1e293b; width: 70px; text-align: right; flex-shrink: 0; }

  .platform-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .platform-stat-card { display: flex; align-items: center; gap: 12px; padding: 14px; background: #f8fafc; border-radius: 10px; }
  .platform-stat-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
  .platform-stat-amount { font-size: 16px; font-weight: 700; color: #1e293b; }
  .platform-stat-detail { font-size: 11px; color: #94a3b8; margin-top: 2px; }
</style>
