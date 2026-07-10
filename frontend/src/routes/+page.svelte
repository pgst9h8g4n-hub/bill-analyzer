<script lang="ts">
  import Layout from '$lib/components/Layout.svelte';
  import { getStats, formatAmount, getPlatformLabel, getPlatformColor } from '$lib/api';
  import { supabase } from '$lib/supabase';

  let userId = $state('');
  let userName = $state('');

  async function loadUser() {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      userId = data.session.user.id;
      userName = data.session.user.user_metadata?.name || data.session.user.email?.split('@')[0] || '用户';
    }
  }
  loadUser();

  let stats = $state<any>(null);
  let loading = $state(true);
  let error = $state('');

  // 饼图颜色
  function getCategoryColor(index: number): string {
    const colors = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#64748b'];
    return colors[index % colors.length];
  }

  // 饼图扇区数据
  let pieSlices: any[] = $state([]);
  $effect(() => {
    if (stats?.by_category) {
      let cumulative = 0;
      pieSlices = stats.by_category.map((cat: any, i: number) => {
        const start = cumulative;
        cumulative += cat.percentage;
        return { ...cat, start, color: getCategoryColor(i) };
      });
    }
  });

  // 加载数据
  async function loadData() {
    if (!userId) { loading = false; return; }
    try {
      stats = await getStats(userId);
    } catch (e: any) {
      error = e.message || '加载失败';
    } finally {
      loading = false;
    }
  }

  // 用户加载后自动加载数据
  $effect(() => { if (userId) loadData(); });
</script>

<Layout currentPage="dashboard" userName={userName} userId={userId}>
  <div class="dashboard">
    <div class="page-header">
      <h2>总览仪表盘</h2>
      <p class="subtitle">消费账单一览</p>
    </div>

    {#if loading}
      <div class="loading">加载中...</div>
    {:else if error}
      <div class="error-box">{error}</div>
    {:else if stats}
      <!-- 统计卡片 -->
      <div class="stats-grid">
        <div class="stat-card primary">
          <div class="stat-value">{formatAmount(stats.expense_amount)}</div>
          <div class="stat-label">总支出</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{stats.record_count}</div>
          <div class="stat-label">总笔数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{formatAmount(stats.avg_daily)}</div>
          <div class="stat-label">日均支出</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{formatAmount(stats.max_single)}</div>
          <div class="stat-label">最大单笔</div>
        </div>
      </div>

      <!-- 两列布局 -->
      <div class="content-grid">
        <!-- 分类占比 -->
        <div class="card">
          <h3 class="card-title">消费分类占比</h3>
          <div class="pie-chart">
            {#if pieSlices.length > 0}
              <svg viewBox="0 0 200 200" class="pie-svg">
                {#each pieSlices as slice}
                  <circle
                    cx="100" cy="100" r="80"
                    fill="none"
                    stroke={slice.color}
                    stroke-width="40"
                    stroke-dasharray={`${slice.percentage * 2.513} ${251.3 - slice.percentage * 2.513}`}
                    stroke-dashoffset={-slice.start * 2.513}
                    transform="rotate(-90 100 100)"
                  />
                {/each}
              </svg>
            {/if}
          </div>
          <div class="legend">
            {#each pieSlices as slice}
              <div class="legend-item">
                <span class="legend-dot" style="--dot-color: {slice.color}"></span>
                <span class="legend-name">{slice.category_name}</span>
                <span class="legend-pct">{slice.percentage.toFixed(1)}%</span>
              </div>
            {/each}
          </div>
        </div>

        <!-- 月度趋势 -->
        <div class="card">
          <h3 class="card-title">月度支出趋势</h3>
          <div class="bar-chart">
            {#if stats.by_month.length > 0}
              {#each stats.by_month as month}
                <div class="bar-row">
                  <span class="bar-label">{month.month}</span>
                  <div class="bar-track">
                    <div
                      class="bar-fill"
                      style="width: {(month.amount / (stats.expense_amount || 1)) * 100}%"
                    ></div>
                  </div>
                  <span class="bar-value">{formatAmount(month.amount)}</span>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      </div>

      <!-- 平台对比 -->
      <div class="card">
        <h3 class="card-title">平台对比</h3>
        <div class="platform-grid">
          {#each stats.by_platform as plat}
            <div class="platform-card">
              <div class="platform-icon" style="background: {getPlatformColor(plat.platform)}20; color: {getPlatformColor(plat.platform)}">
                {getPlatformLabel(plat.platform).charAt(0)}
              </div>
              <div class="platform-info">
                <div class="platform-name">{getPlatformLabel(plat.platform)}</div>
                <div class="platform-stats">
                  <span>{plat.count} 笔</span>
                  <span class="sep">·</span>
                  <span>{formatAmount(plat.amount)}</span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</Layout>

<style>
  .dashboard { max-width: 100%; }
  .page-header { margin-bottom: 24px; }
  .page-header h2 { font-size: 20px; color: #1e293b; margin-bottom: 4px; }
  .subtitle { color: #64748b; font-size: 14px; }
  .loading, .error-box { text-align: center; padding: 40px; color: #64748b; }
  .error-box { color: #dc2626; background: #fef2f2; border-radius: 8px; padding: 20px; }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .stat-card {
    background: #fff;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .stat-card.primary {
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: #fff;
  }

  .stat-card.primary .stat-label { color: rgba(255,255,255,0.8); }
  .stat-value { font-size: 24px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
  .stat-label { font-size: 13px; color: #64748b; }

  .content-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 24px;
  }

  @media (max-width: 900px) { .content-grid { grid-template-columns: 1fr; } }

  .card {
    background: #fff;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    margin-bottom: 20px;
  }

  .card-title {
    font-size: 15px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 16px;
  }

  .pie-chart { display: flex; justify-content: center; margin-bottom: 16px; }
  .pie-svg { width: 180px; height: 180px; }

  .legend { display: flex; flex-wrap: wrap; gap: 8px; }
  .legend-item {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; color: #475569;
  }
  .legend-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--dot-color);
    flex-shrink: 0;
  }
  .legend-pct { font-weight: 600; color: #1e293b; }

  .bar-chart { display: flex; flex-direction: column; gap: 10px; }
  .bar-row { display: flex; align-items: center; gap: 10px; }
  .bar-label { font-size: 12px; color: #64748b; width: 50px; flex-shrink: 0; }
  .bar-track {
    flex: 1; height: 20px; background: #f1f5f9;
    border-radius: 4px; overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #6366f1, #8b5cf6);
    border-radius: 4px;
    transition: width 0.5s ease;
  }
  .bar-value {
    font-size: 12px; font-weight: 600; color: #1e293b;
    width: 70px; text-align: right; flex-shrink: 0;
  }

  .platform-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
  }

  .platform-card {
    display: flex; align-items: center; gap: 12px;
    padding: 12px; background: #f8fafc; border-radius: 8px;
  }

  .platform-icon {
    width: 40px; height: 40px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 16px; flex-shrink: 0;
  }

  .platform-name { font-size: 14px; font-weight: 600; color: #1e293b; }
  .platform-stats { font-size: 12px; color: #64748b; margin-top: 2px; }
  .platform-stats .sep { margin: 0 4px; }

  @media (max-width: 768px) {
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .stat-value { font-size: 20px; }
  }
</style>
