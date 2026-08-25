<script lang="ts">
  import { goto } from '$app/navigation';
  import { register, login, clearSession } from '$lib/stores/auth';
  import type { Session } from '$lib/stores/auth';
  import { onMount } from 'svelte';

  let mode = 'login' as 'login' | 'register';
  let username = '';
  let password = '';
  let confirmPassword = '';
  let error = '';
  let loading = false;

  let currentSession: Session | null = null;

  onMount(async () => {
    const stored = localStorage.getItem('xiaoliuji_session');
    if (stored) {
      try {
        currentSession = JSON.parse(stored) as Session;
        goto('/');
      } catch {}
    }
  });

  async function handleSubmit() {
    error = '';
    if (!username.trim() || !password.trim()) {
      error = '请填写用户名和密码';
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      error = '两次输入的密码不一致';
      return;
    }
    if (mode === 'register' && password.length < 4) {
      error = '密码至少4位';
      return;
    }

    loading = true;
    try {
      if (mode === 'register') {
        const result = await register(username.trim(), password);
        if (!result.success) {
          error = result.error ?? '注册失败';
        } else {
          error = '注册成功，请登录';
          mode = 'login';
          username = '';
          password = '';
          confirmPassword = '';
        }
      } else {
        const result = await login(username.trim(), password);
        if (!result.success) {
          error = result.error ?? '登录失败';
        } else if (result.user) {
          localStorage.setItem('xiaoliuji_session', JSON.stringify({
            userId: result.user.id,
            username: result.user.username,
            createdAt: result.user.created_at
          }));
          goto('/');
        }
      }
    } finally {
      loading = false;
    }
  }

  function switchMode() {
    mode = mode === 'login' ? 'register' : 'login';
    error = '';
    username = '';
    password = '';
    confirmPassword = '';
  }
</script>

<div class="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center px-4">
  <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
    <div class="text-center mb-8">
      <div class="text-5xl mb-3">📒</div>
      <h1 class="text-2xl font-bold text-gray-800">小六记</h1>
      <p class="text-sm text-gray-500 mt-1">
        {mode === 'login' ? '登录你的账户' : '创建新账户'}
      </p>
    </div>

    {#if error}
      <div class="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
        {error}
      </div>
    {/if}

    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
      <div>
        <label for="username" class="block text-sm font-medium text-gray-700 mb-1">用户名</label>
        <input
          id="username"
          type="text"
          bind:value={username}
          placeholder="输入用户名"
          class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition"
          autocomplete="username"
        />
      </div>

      <div>
        <label for="password" class="block text-sm font-medium text-gray-700 mb-1">密码</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          placeholder="输入密码"
          class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition"
          autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
      </div>

      {#if mode === 'register'}
        <div>
          <label for="confirmPassword" class="block text-sm font-medium text-gray-700 mb-1">确认密码</label>
          <input
            id="confirmPassword"
            type="password"
            bind:value={confirmPassword}
            placeholder="再次输入密码"
            class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition"
            autocomplete="new-password"
          />
        </div>
      {/if}

      <button
        type="submit"
        disabled={loading}
        class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50"
      >
        {loading ? '处理中...' : (mode === 'login' ? '登录' : '注册')}
      </button>
    </form>

    <div class="mt-6 text-center">
      <button
        type="button"
        onclick={switchMode}
        class="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
      >
        {mode === 'login'
          ? '没有账户？立即注册'
          : '已有账户？返回登录'}
      </button>
    </div>
  </div>
</div>
