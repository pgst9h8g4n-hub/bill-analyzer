<script lang="ts">
  import Layout from '$lib/components/Layout.svelte';
  import { getRecords, formatAmount, formatShortDate, getPlatformLabel, getPlatformColor } from '$lib/api';
  import { supabase } from '$lib/supabase';
  import type { BillRecord } from '$lib/api';

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

  let records = $state<BillRecord[]>([]);
  let total = $state(0);
  let totalPages = $state(1);
  let page = $state(1);
  const pageSize = 30;
  let loading = $state(true);
  let error = $state('');

  let filterPlatform = $state('');
  let filterStartDate = $state('');
  let filterEndDate = $state('');

  async function loadRecords() {
    if (!userId) { loading = false; return; }
    loading = true;
    try {
      const params: any = { user_id: userId, page, page_size: pageSize };
      if (filterPlatform) params.platform = filterPlatform;
      if (filterStartDate) params.start_date = filterStartDate;
      if (filterEndDate) params.end_date = filterEndDate;

      const result = await getRecords(params);
      records = result.data;
      total = result.total;
      totalPages = result.total_pages;
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  // 用户加载后自动加载记录
  $effect(() => { if (userId) loadRecords(); });

  function goTo(p: number) {
    page = p;
    loadRecords();
  }
</script>

<Layout currentPage="records" userName={userName} userId={userId}>
  <div class="page">
    <div class="page-header">
      <h2>账单记录</h2>
      <p class="subtitle">共 {total} 笔交易</p>
    </div>

    <div class="filters">
      <select bind:value={filterPlatform} onchange={loadRecords}>
        <option value="">全部平台</option>
        <option value="alipay">支付宝</option>
        <option value="wechat">微信</option>
        <option value="douyin">抖音</option>
      </select>
      <input type="date" bind:value={filterStartDate} onchange={loadRecords} />
      <input type="date" bind:value={filterEndDate} onchange={loadRecords} />
      <button class="reset-btn" onclick={() => { filterPlatform = ''; filterStartDate = ''; filterEndDate = ''; page = 1; loadRecords(); }}>重置</button>
    </div>

    {#if loading}
      <div class="empty-state">加载中...</div>
    {:else if error}
      <div class="error-box">{error}</div>
    {:else if records.length === 0}
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>暂无账单记录</p>
        <small>上传账单文件开始记录消费</small>
      </div>
    {:else}
      <div class="record-list">
        {#each records as record (record.id)}
          <div class="record-card">
            <div class="record-platform" style="border-left-color: {getPlatformColor(record.platform)}">
              <span class="platform-tag">{getPlatformLabel(record.platform)}</span>
            </div>
            <div class="record-body">
              <div class="record-top">
                <span class="record-merchant">{record.original_merchant}</span>
                <span class="record-amount">-{formatAmount(record.amount)}</span>
              </div>
              <div class="record-meta">
                <span class="record-time">{formatShortDate(record.trans_time)}</span>
                {#if record.category_name}
                  <span class="record-cat">{record.category_name}</span>
                {/if}
                {#if record.classification_method === 'manual'}
                  <span class="manual-badge">手动</span>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>

      <div class="pagination">
        <button disabled={page <= 1} onclick={() => goTo(page - 1)}>上一页</button>
        <span>第 {page} / {totalPages} 页</span>
        <button disabled={page >= totalPages} onclick={() => goTo(page + 1)}>下一页</button>
      </div>
    {/if}
  </div>
</Layout>

<style>
  .page { max-width: 100%; }
  .page-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 20px; }
  .page-header h2 { font-size: 20px; color: #1e293b; margin: 0; }
  .subtitle { color: #64748b; font-size: 13px; margin: 0; }

  .filters { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
  .filters select, .filters input { padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; }
  .filters select:focus, .filters input:focus { border-color: #6366f1; }

  .reset-btn { padding: 8px 16px; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; cursor: pointer; color: #475569; }
  .reset-btn:hover { background: #e2e8f0; }

  .empty-state { text-align: center; padding: 60px 20px; color: #94a3b8; }
  .empty-icon { font-size: 48px; margin-bottom: 12px; }
  .empty-state p { font-size: 15px; margin-bottom: 4px; color: #64748b; }
  .empty-state small { font-size: 12px; }

  .error-box { background: #fef2f2; color: #dc2626; padding: 16px; border-radius: 8px; text-align: center; }

  .record-list { display: flex; flex-direction: column; gap: 8px; }

  .record-card {
    display: flex; align-items: center; gap: 12px;
    background: #fff; border-radius: 10px;
    padding: 12px 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }

  .record-platform { flex-shrink: 0; width: 4px; border-radius: 2px; }
  .platform-tag { font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: #f1f5f9; color: #64748b; display: block; }

  .record-body { flex: 1; min-width: 0; }
  .record-top { display: flex; justify-content: space-between; align-items: center; }
  .record-merchant { font-size: 14px; font-weight: 500; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .record-amount { font-size: 15px; font-weight: 700; color: #ef4444; flex-shrink: 0; margin-left: 12px; }

  .record-meta { display: flex; gap: 8px; margin-top: 4px; font-size: 12px; color: #94a3b8; }
  .record-cat { background: #eef2ff; color: #6366f1; padding: 1px 8px; border-radius: 4px; font-size: 11px; }
  .manual-badge { background: #fef3c7; color: #d97706; padding: 1px 6px; border-radius: 4px; font-size: 10px; }

  .pagination { display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 20px; padding: 16px; }
  .pagination button { padding: 8px 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; font-size: 13px; }
  .pagination button:disabled { opacity: 0.4; cursor: not-allowed; }
  .pagination button:hover:not(:disabled) { background: #f1f5f9; }
  .pagination span { font-size: 13px; color: #64748b; }

  @media (max-width: 768px) {
    .record-card { padding: 10px 12px; }
    .filters { flex-direction: column; }
  }
</style>
