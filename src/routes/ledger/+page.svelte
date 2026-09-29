<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { currentUserId, currentUsername } from '$lib/session';
  import { createLedger, joinLedger, getUserLedgers, deleteLedger } from '$lib/db/ledgers';
  import { seedDefaultCategories } from '$lib/db';
  import { setActiveLedger, getActiveLedger } from '$lib/stores/ledger';

  $: userId = $currentUserId;
  $: username = $currentUsername;

  let mode = 'list' as 'list' | 'create' | 'join';
  let ledgers: import('$lib/db').Ledger[] = [];
  let newLedgerName = '';
  let inviteCode = '';
  let errorMsg = '';
  let loading = false;
  let userHasLedgers = false;


  let activeLedgerCode: string | null = null;

  onMount(async () => {
    if (!userId) {
      goto('/login');
      return;
    }
    const _active = await getActiveLedger(userId);
    ledgers = await getUserLedgers(userId);
    if (_active) {
      activeLedgerCode = ledgers.find(l => l.id === _active.id)?.code ?? null;
    }
    userHasLedgers = ledgers.length > 0;
  });

  async function handleCreate() {
    errorMsg = '';
    if (!newLedgerName.trim()) {
      errorMsg = '请输入账本名称';
      return;
    }
    loading = true;
    try {
      const ledger = await createLedger(userId, newLedgerName.trim());
      await seedDefaultCategories(ledger.id);
      await setActiveLedger(ledger.id);
      ledgers = await getUserLedgers(userId);
      activeLedgerCode = ledger.code;
      goto('/');
    } catch {
      errorMsg = '创建失败，请重试';
    } finally {
      loading = false;
    }
  }

  async function handleJoin() {
    errorMsg = '';
    if (!inviteCode.trim() || inviteCode.length < 6) {
      errorMsg = '请输入完整的6位邀请码';
      return;
    }
    loading = true;
    try {
      const result = await joinLedger(userId, inviteCode.trim().toUpperCase());
      if (!result.success) {
        errorMsg = result.error ?? '加入失败';
      } else {
        ledgers = await getUserLedgers(userId);
        const newest = ledgers[ledgers.length - 1];
        if (newest) {
          await setActiveLedger(newest.id);
          activeLedgerCode = newest.code;
          goto('/');
        }
      }
    } catch {
      errorMsg = '加入失败，请重试';
    } finally {
      loading = false;
    }
  }

  async function selectLedger(ledger: import('$lib/db').Ledger) {
    errorMsg = '';
    await setActiveLedger(ledger.id);
    activeLedgerCode = ledger.code;
    goto('/');
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  function isActive(ledger: import('$lib/db').Ledger): boolean {
    return ledger.code === activeLedgerCode;
  }

  async function handleDelete(ledger: import('$lib/db').Ledger) {
    if (!confirm(`确定删除账本「${ledger.name}」？此操作不可恢复！`)) return;
    loading = true;
    errorMsg = '';
    try {
      await deleteLedger(ledger.id, userId);
      ledgers = ledgers.filter(l => l.id !== ledger.id);
      if (isActive(ledger)) {
        const next = ledgers[0];
        if (next) {
          await setActiveLedger(next.id);
          activeLedgerCode = next.code;
        } else {
          goto('/ledger');
        }
      }
    } catch (e: any) {
      errorMsg = e?.message ?? '删除失败';
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen bg-paper flex items-center justify-center px-4 py-8">
  <div class="w-full max-w-sm">
    <!-- Logo -->
    <div class="text-center mb-8">
      <div class="w-16 h-16 rounded-2xl bg-clay-600 flex items-center justify-center text-3xl mx-auto mb-3 shadow-lg" style="box-shadow: 0 8px 24px rgba(180,83,9,0.3);">📒</div>
      <h1 class="text-2xl font-bold text-ink tracking-tight">小六记</h1>
      <p class="text-sm text-stone-500 mt-1">欢迎，{username}</p>
    </div>

    <!-- 选择卡片 -->
    <div class="bg-white rounded-2xl shadow-card p-6 space-y-4">
      <h2 class="font-semibold text-ink text-lg text-center">选择一个账本</h2>

      {#if mode === 'list'}
        {#if userHasLedgers}
          <!-- 已有账本列表 -->
          <div class="space-y-2">
            {#each ledgers as ledger}
              <div class="relative rounded-xl border-2 transition-all duration-150 {isActive(ledger) ? 'border-clay-600 bg-clay-50' : 'border-stone-100 hover:border-clay-200'}">
                <button onclick={() => selectLedger(ledger)} class="w-full flex items-center gap-3 px-4 py-3 text-left">
                  <span class="text-xl" aria-hidden="true">📒</span>
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-ink text-sm">{ledger.name}</div>
                    <div class="flex items-center gap-2 mt-0.5">
                      <span class="font-mono text-xs text-clay-600 tracking-wider">{ledger.code}</span>
                      {#if isActive(ledger)}
                        <span class="text-[10px] bg-clay-600 text-white px-1.5 py-0.5 rounded-full font-medium">当前</span>
                      {/if}
                    </div>
                  </div>
                  {#if !isActive(ledger)}
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  {/if}
                </button>
                <!-- 邀请码复制 + 删除操作 -->
                <div class="flex items-center px-4 pb-2.5 gap-2">
                  <button type="button" onclick={() => copyCode(ledger.code)}
                    class="flex items-center gap-1 px-2.5 py-1 text-xs text-stone-500 hover:text-clay-600 hover:bg-clay-50 rounded-lg transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                    复制邀请码
                  </button>
                  {#if !isActive(ledger)}
                    <button type="button" onclick={() => handleDelete(ledger)}
                      class="flex items-center gap-1 px-2.5 py-1 text-xs text-stone-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      退出账本
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center py-6 text-stone-400">
            <p class="text-sm">还没有账本</p>
            <p class="text-xs mt-1">创建第一个，开始记账</p>
          </div>
        {/if}

        <!-- 操作按钮 -->
        <div class="grid grid-cols-2 gap-3 pt-2">
          <button onclick={() => { mode = 'create'; errorMsg = ''; }}
            class="btn-outline w-full text-sm py-2.5">
            + 创建新账本
          </button>
          <button onclick={() => { mode = 'join'; errorMsg = ''; }}
            class="btn-outline w-full text-sm py-2.5">
            加入他人账本
          </button>
        </div>

        {#if errorMsg}
          <div class="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-xl">{errorMsg}</div>
        {/if}

      {:else if mode === 'create'}
        <div class="space-y-3">
          <p class="text-sm font-medium text-ink">账本名称</p>
          <input type="text" bind:value={newLedgerName} placeholder="如：我家" maxlength="20"
            class="input-field" />
          {#if errorMsg}
            <div class="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-xl">{errorMsg}</div>
          {/if}
          <button onclick={handleCreate} disabled={loading || !newLedgerName.trim()}
            class="btn-primary w-full">
            {loading ? '创建中...' : '创建'}
          </button>
          <button onclick={() => { mode = 'list'; errorMsg = ''; }}
            class="text-sm text-stone-400 hover:text-stone-600 transition-colors w-full">
            取消
          </button>
        </div>

      {:else if mode === 'join'}
        <div class="space-y-3">
          <p class="text-sm font-medium text-ink">输入6位邀请码</p>
          <input type="text" bind:value={inviteCode} placeholder="ABC123" maxlength="6"
            class="input-field text-center tracking-widest uppercase font-mono"
            oninput={(e) => { inviteCode = (e.target as HTMLInputElement).value.toUpperCase(); }}
            autocomplete="off" />
          {#if errorMsg}
            <div class="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-xl">{errorMsg}</div>
          {/if}
          <button onclick={handleJoin} disabled={loading || inviteCode.length < 6}
            class="btn-primary w-full">
            {loading ? '加入中...' : '加入账本'}
          </button>
          <button onclick={() => { mode = 'list'; errorMsg = ''; inviteCode = ''; }}
            class="text-sm text-stone-400 hover:text-stone-600 transition-colors w-full">
            取消
          </button>
        </div>
      {/if}
    </div>

    <p class="text-center text-xs text-stone-400 mt-6">
      数据仅保存在本设备上 · 本地存储更安全
    </p>
  </div>
</div>
