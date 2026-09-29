<script lang="ts">
  import { goto } from '$app/navigation';
  import { register, login, setSession } from '$lib/stores/auth';
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
          await setSession(result.user);
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

<div class="min-h-screen bg-paper flex items-center justify-center px-4 py-8">
  <div class="w-full max-w-sm">
    <!-- Logo -->
    <div class="text-center mb-8">
      <div class="w-16 h-16 rounded-2xl bg-clay-600 flex items-center justify-center text-3xl mx-auto mb-3 shadow-lg" style="box-shadow: 0 8px 24px rgba(180,83,9,0.3);">📒</div>
      <h1 class="text-2xl font-bold text-ink tracking-tight">小六记</h1>
      <p class="text-sm text-stone-500 mt-1">
        {mode === 'login' ? '登录账户' : '创建新账户'}
      </p>
    </div>

    <!-- Card -->
    <div class="bg-white rounded-2xl shadow-card p-6 space-y-4">
      {#if error}
        <div class="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      {/if}

      <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-3">
        <div>
          <label for="username" class="block text-sm font-medium text-ink mb-1.5">用户名</label>
          <input
            id="username"
            type="text"
            bind:value={username}
            placeholder="输入用户名"
            class="input-field"
            autocomplete="username"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium text-ink mb-1.5">密码</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            placeholder="输入密码"
            class="input-field"
            autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </div>

        {#if mode === 'register'}
          <div>
            <label for="confirmPassword" class="block text-sm font-medium text-ink mb-1.5">确认密码</label>
            <input
              id="confirmPassword"
              type="password"
              bind:value={confirmPassword}
              placeholder="再次输入密码"
              class="input-field"
              autocomplete="new-password"
            />
          </div>
        {/if}

        <button
          type="submit"
          disabled={loading}
          class="btn-primary w-full"
        >
          {loading ? '处理中...' : (mode === 'login' ? '登录' : '注册')}
        </button>
      </form>

      <div class="pt-1 text-center">
        <button
          type="button"
          onclick={switchMode}
          class="text-sm text-clay-600 hover:text-clay-700 font-medium transition-colors"
        >
          {mode === 'login'
            ? '没有账户？注册一个新账户'
            : '已有账户？返回登录'}
        </button>
      </div>
    </div>

    <p class="text-center text-xs text-stone-400 mt-6">
      数据仅保存在本设备上 · 本地存储更安全
    </p>
  </div>
</div>
