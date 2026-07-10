<script lang="ts">
  import Layout from '$lib/components/Layout.svelte';
  import { uploadFile } from '$lib/api';
  import { supabase } from '$lib/supabase';

  let selectedFile = $state<File | null>(null);
  let platformHint = $state('');
  let uploading = $state(false);
  let result = $state<any>(null);
  let error = $state('');
  let userId = $state('');
  let userName = $state('');

  // 获取当前用户
  async function loadUser() {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      userId = data.session.user.id;
      userName = data.session.user.user_metadata?.name || data.session.user.email?.split('@')[0] || '用户';
    }
  }
  loadUser();

  const fileTypes = {
    alipay: { accept: '.csv', label: '支付宝交易明细 CSV', color: '#1677FF' },
    wechat: { accept: '.xlsx', label: '微信支付账单 Excel', color: '#07C160' },
    douyin: { accept: '.pdf', label: '抖音支付流水 PDF', color: '#FE2C55' },
  };

  async function handleUpload() {
    if (!selectedFile || !userId) { error = '请先登录'; return; }
    uploading = true;
    error = '';
    result = null;

    try {
      const res = await uploadFile(selectedFile, userId, platformHint || undefined);
      result = res;
    } catch (e: any) {
      error = e.message;
    } finally {
      uploading = false;
      selectedFile = null;
      platformHint = '';
    }
  }

  function onFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    selectedFile = target.files?.[0] || null;
    if (selectedFile) {
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();
      if (ext === 'csv') platformHint = 'alipay';
      else if (ext === 'xlsx') platformHint = 'wechat';
      else if (ext === 'pdf') platformHint = 'douyin';
    }
  }
</script>

<Layout currentPage="upload" userName={userName} userId={userId}>
  <div class="page">
    <div class="page-header">
      <h2>上传账单</h2>
      <p class="subtitle">从支付宝/微信/抖音导出账单文件上传</p>
    </div>

    <div class="upload-area" role="button" tabindex="0" ondragover={(e) => e.preventDefault()} ondrop={(e) => {
      e.preventDefault();
      selectedFile = e.dataTransfer?.files?.[0] || null;
    }}>
      {#if !selectedFile}
        <div class="drop-zone">
          <div class="drop-icon">📁</div>
          <p>拖拽文件到此处，或点击下方选择</p>
          <p class="hint">支持 CSV / XLSX / PDF 格式</p>
        </div>
      {/if}

      {#if selectedFile}
        <div class="file-preview">
          <div class="file-icon">📄</div>
          <div class="file-info">
            <div class="file-name">{selectedFile.name}</div>
            <div class="file-size">{(selectedFile.size / 1024).toFixed(1)} KB</div>
          </div>
          <button class="remove-btn" onclick={() => { selectedFile = null; }}>✕</button>
        </div>
      {/if}

      <label for="file-upload" class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">选择文件</label>
      <input type="file" id="file-upload" accept=".csv,.xlsx,.pdf" onchange={onFileChange} class="file-input" />
    </div>

    <div class="platform-selector">
      <label>平台类型</label>
      <div class="platform-options">
        {#each Object.entries(fileTypes) as [key, info]}
          <button class="platform-option {platformHint === key ? 'active' : ''}"
                  style="--accent: {info.color}"
                  onclick={() => platformHint = key}>
            <span class="platform-dot"></span>
            {info.label}
          </button>
        {/each}
      </div>
    </div>

    <button class="upload-btn" disabled={!selectedFile || uploading || !userId} onclick={handleUpload}>
      {uploading ? '解析中...' : '开始解析'}
    </button>

    {#if result}
      <div class="result-card success">
        <h3>✅ 解析成功</h3>
        <dl>
          <dt>插入记录</dt><dd>{result.inserted ?? result.record_count ?? '未知'}</dd>
          <dt>跳过重复</dt><dd>{result.skipped ?? 0}</dd>
          <dt>用户</dt><dd>{result.meta?.user_identifier ?? '-'}</dd>
          <dt>时间范围</dt><dd>{result.meta?.period_start} ~ {result.meta?.period_end}</dd>
        </dl>
      </div>
    {/if}

    {#if error}
      <div class="result-card error"><h3>❌ 解析失败</h3><p>{error}</p></div>
    {/if}
  </div>
</Layout>

<style>
  .page-header { margin-bottom: 24px; }
  .page-header h2 { font-size: 20px; margin: 0 0 4px; }
  .subtitle { color: #64748b; font-size: 14px; margin: 0; }

  .upload-area {
    background: #fff; border: 2px dashed #e2e8f0; border-radius: 12px;
    padding: 40px 20px; text-align: center; cursor: pointer;
    transition: border-color 0.2s; position: relative;
  }
  .upload-area:hover { border-color: #6366f1; }
  .drop-icon { font-size: 48px; margin-bottom: 12px; }
  .drop-zone p { color: #475569; font-size: 15px; margin-bottom: 4px; }
  .drop-zone .hint { color: #94a3b8; font-size: 13px; }
  .file-input { display: none; }

  .file-preview {
    display: flex; align-items: center; gap: 12px; padding: 12px;
    background: #f8fafc; border-radius: 8px; margin-bottom: 16px;
  }
  .file-icon { font-size: 24px; }
  .file-name { font-weight: 600; font-size: 14px; color: #1e293b; }
  .file-size { font-size: 12px; color: #94a3b8; }
  .remove-btn { background: none; border: none; font-size: 18px; color: #94a3b8; cursor: pointer; padding: 4px; }

  .platform-selector { margin-top: 20px; }
  .platform-selector label { display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 8px; }
  .platform-options { display: flex; gap: 8px; flex-wrap: wrap; }
  .platform-option {
    display: flex; align-items: center; gap: 6px; padding: 8px 14px;
    border: 1px solid #e2e8f0; border-radius: 8px; background: #fff;
    cursor: pointer; font-size: 13px; color: #475569; transition: all 0.15s;
  }
  .platform-option:hover { border-color: #cbd5e1; }
  .platform-option.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, white); color: #1e293b; font-weight: 600; }
  .platform-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }

  .upload-btn { margin-top: 24px; width: 100%; padding: 14px; background: #6366f1; color: #fff; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; }
  .upload-btn:hover:not(:disabled) { background: #4f46e5; }
  .upload-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .result-card { margin-top: 24px; padding: 20px; border-radius: 10px; }
  .result-card.success { background: #f0fdf4; border: 1px solid #bbf7d0; }
  .result-card.error { background: #fef2f2; border: 1px solid #fecaca; }
  .result-card h3 { margin-bottom: 12px; font-size: 15px; }
  .result-card dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; font-size: 13px; }
  .result-card dt { color: #64748b; }
  .result-card dd { color: #1e293b; font-weight: 500; }

  @media (max-width: 768px) { .platform-options { flex-direction: column; } }
</style>
