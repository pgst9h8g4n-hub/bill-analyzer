<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { changePassword, deleteUser, clearSession } from '$lib/stores/auth';
  import { currentUserId, currentUsername } from '$lib/session';

  $: userId = $currentUserId;
  $: username = $currentUsername;

  let oldPassword = '';
  let newPassword = '';
  let confirmNewPassword = '';
  let passwordMsg = '';
  let deleting = false;

  async function handleChangePassword() {
    passwordMsg = '';
    if (!oldPassword || !newPassword || !confirmNewPassword) {
      passwordMsg = '请填写所有字段';
      return;
    }
    if (newPassword !== confirmNewPassword) {
      passwordMsg = '两次密码不一致';
      return;
    }
    if (newPassword.length < 4) {
      passwordMsg = '新密码至少4位';
      return;
    }
    if (!userId) {
      passwordMsg = '请先登录';
      return;
    }
    const result = await changePassword(userId, oldPassword, newPassword);
    if (result.success) {
      passwordMsg = '✅ 密码修改成功';
      oldPassword = '';
      newPassword = '';
      confirmNewPassword = '';
    } else {
      passwordMsg = '❌ ' + (result.error ?? '修改失败');
    }
  }

  async function handleDeleteAccount() {
    if (!confirm('确定要删除账户吗？此操作不可恢复，所有消费记录将被清空！')) return;
    if (!userId) return;
    deleting = true;
    try {
      await deleteUser(userId);
      clearSession();
      localStorage.removeItem('xiaoliuji_session');
      goto('/login');
    } catch {
      passwordMsg = '❌ 删除失败，请重试';
    } finally {
      deleting = false;
    }
  }
</script>

<div class="min-h-screen bg-paper">
  <main class="px-4 py-4 max-w-md mx-auto space-y-4 pb-20">
    <!-- 账户信息 -->
    <div class="bg-white rounded-2xl shadow-card p-4">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-full bg-clay-100 flex items-center justify-center text-xl font-semibold text-clay-700"
             style="font-family:'JetBrains Mono',monospace;">
          {username?.[0]?.toUpperCase() ?? '用'}
        </div>
        <div>
          <div class="font-medium text-ink text-base">{username || '用户'}</div>
          <div class="text-xs text-stone-400">本地账户 · 数据仅保存在本设备</div>
        </div>
      </div>
    </div>

    <!-- 修改密码 -->
    <div class="bg-white rounded-2xl shadow-card p-4">
      <h2 class="font-semibold text-ink text-base mb-3">修改密码</h2>
      <form onsubmit={(e) => { e.preventDefault(); handleChangePassword(); }} class="space-y-3">
        <input type="password" bind:value={oldPassword} placeholder="当前密码"
          class="input-field" />
        <input type="password" bind:value={newPassword} placeholder="新密码"
          class="input-field" />
        <input type="password" bind:value={confirmNewPassword} placeholder="确认新密码"
          class="input-field" />
        {#if passwordMsg}
          <p class="text-sm font-medium {passwordMsg.includes('成功') ? 'text-green-600' : 'text-red-600'}">{passwordMsg}</p>
        {/if}
        <button type="submit"
          class="btn-primary w-full">
          确认修改
        </button>
      </form>
    </div>

    <!-- 数据导出入口 -->
    <div class="bg-white rounded-2xl shadow-card p-4">
      <h2 class="font-semibold text-ink text-base mb-3">导出数据</h2>
      <a href="/export" class="flex items-center gap-3 p-3 rounded-xl hover:bg-stone-50 transition-colors">
        <div class="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-lg">📄</div>
        <div class="flex-1">
          <div class="font-medium text-ink text-sm">导出消费记录</div>
          <div class="text-xs text-stone-400">CSV / JSON 格式</div>
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </a>
    </div>

    <!-- 危险操作 -->
    <div class="bg-white rounded-2xl shadow-card p-4">
      <h2 class="font-semibold text-red-600 text-base mb-1">危险操作</h2>
      <p class="text-sm text-stone-400 mb-3">删除账户将清除所有数据，不可恢复</p>
      <button onclick={handleDeleteAccount} disabled={deleting}
        class="w-full border-2 border-red-200 text-red-600 py-3 rounded-full font-medium hover:bg-red-50 transition-all disabled:opacity-50">
        {deleting ? '删除中...' : '删除账户'}
      </button>
    </div>

    <div class="text-center text-xs text-stone-300 py-2">
      小六记 v1.0 · 数据本地存储
    </div>
  </main>
</div>
