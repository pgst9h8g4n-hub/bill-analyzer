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
      passwordMsg = '密码修改成功';
      oldPassword = '';
      newPassword = '';
      confirmNewPassword = '';
    } else {
      passwordMsg = result.error ?? '修改失败';
    }
  }

  async function handleDeleteAccount() {
    if (!confirm('确定要删除账户吗？此操作不可恢复，所有消费记录将被清空！')) return;
    if (!userId) return;
    deleting = true;
    try {
      await deleteUser(userId);
      clearSession();
      sessionStorage.removeItem('xiaoliuji_session');
      goto('/login');
    } catch {
      passwordMsg = '删除失败，请重试';
    } finally {
      deleting = false;
    }
  }
</script>

<div class="min-h-screen bg-gray-50">
  <main class="px-4 py-4 max-w-md mx-auto space-y-4">
    <!-- 账户信息 -->
    <div class="bg-white rounded-2xl shadow-sm p-4">
      <h2 class="font-semibold text-gray-800 mb-3">账户信息</h2>
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-xl">
          👤
        </div>
        <div>
          <div class="font-medium text-gray-800">{username || '用户'}</div>
          <div class="text-xs text-gray-400">本地账户</div>
        </div>
      </div>
    </div>

    <!-- 修改密码 -->
    <div class="bg-white rounded-2xl shadow-sm p-4">
      <h2 class="font-semibold text-gray-800 mb-3">修改密码</h2>
      <form onsubmit={(e) => { e.preventDefault(); handleChangePassword(); }} class="space-y-3">
        <input type="password" name="oldPassword" bind:value={oldPassword} placeholder="当前密码"
          class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" />
        <input type="password" name="newPassword" bind:value={newPassword} placeholder="新密码"
          class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" />
        <input type="password" name="confirmNewPassword" bind:value={confirmNewPassword} placeholder="确认新密码"
          class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" />
        {#if passwordMsg}
          <p class="text-sm {passwordMsg.includes('成功') ? 'text-green-600' : 'text-red-600'}">{passwordMsg}</p>
        {/if}
        <button type="submit"
          class="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 transition">
          确认修改
        </button>
      </form>
    </div>

    <!-- 危险操作 -->
    <div class="bg-white rounded-2xl shadow-sm p-4">
      <h2 class="font-semibold text-red-600 mb-3">危险操作</h2>
      <p class="text-sm text-gray-500 mb-3">删除账户将清除所有数据，不可恢复</p>
      <button onclick={handleDeleteAccount} disabled={deleting}
        class="w-full border-2 border-red-300 text-red-600 py-3 rounded-xl font-medium hover:bg-red-50 transition disabled:opacity-50">
        {deleting ? '删除中...' : '删除账户'}
      </button>
    </div>
  </main>
</div>
