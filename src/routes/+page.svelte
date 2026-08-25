<script lang="ts">
  import { invalidate } from '$app/navigation';
  import { onMount } from 'svelte';
  import { initDB } from '$lib/db';

  let currentPage = 'home';
  let username = '';

  onMount(async () => {
    await initDB();
    const stored = localStorage.getItem('xiaoliuji_session');
    if (stored) {
      try {
        const session = JSON.parse(stored);
        username = session.username;
      } catch {}
    }
  });

  function logout() {
    localStorage.removeItem('xiaoliuji_session');
    window.location.href = '/login';
  }
</script>

<div class="min-h-screen bg-gray-50 flex flex-col">
  <!-- 导航栏 -->
  <nav class="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between shrink-0"
       style="padding-top: max(12px, env(safe-area-inset-top));">
    <h1 class="text-lg font-bold tracking-tight">📒 小六记</h1>
    <button onclick={() => window.location.href = '/settings'} class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition">
      ⚙️
    </button>
  </nav>

  <!-- 主内容区 -->
  <main class="flex-1 px-4 py-4 overflow-auto">
    <div class="max-w-md mx-auto space-y-4">
      <!-- 欢迎卡片 -->
      <div class="bg-white rounded-2xl shadow-sm p-5">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-lg">👤</div>
          <div>
            <div class="font-semibold text-gray-800">{username || '欢迎使用小六记'}</div>
            <div class="text-xs text-gray-400">记录每一笔消费，掌控生活支出</div>
          </div>
        </div>
        <div class="flex gap-2">
          <a href="/categories" class="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-medium py-2.5 rounded-xl text-center transition">
            📂 管理分类
          </a>
          <a href="/settings" class="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm font-medium py-2.5 rounded-xl text-center transition">
            ⚙️ 设置
          </a>
        </div>
      </div>

      <!-- 本月概览 -->
      <div class="bg-white rounded-2xl shadow-sm p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-gray-800">本月概览</h2>
          <span class="text-xs text-gray-400">2026年8月</span>
        </div>
        <div class="text-3xl font-bold text-indigo-600">¥0.00</div>
        <p class="text-xs text-gray-400 mt-1">本月总支出</p>
      </div>

      <!-- 快捷操作 -->
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-white rounded-xl p-4 text-center shadow-sm">
          <div class="text-2xl mb-1">📸</div>
          <div class="text-xs text-gray-600">拍照记账</div>
        </div>
        <div class="bg-white rounded-xl p-4 text-center shadow-sm">
          <div class="text-2xl mb-1">📝</div>
          <div class="text-xs text-gray-600">手动录入</div>
        </div>
        <div class="bg-white rounded-xl p-4 text-center shadow-sm">
          <div class="text-2xl mb-1">📊</div>
          <div class="text-xs text-gray-600">统计报表</div>
        </div>
      </div>

      <!-- 最近消费 -->
      <div class="bg-white rounded-2xl shadow-sm p-4">
        <h2 class="font-semibold text-gray-800 mb-3">最近消费</h2>
        <div class="text-center py-8 text-gray-400">
          <div class="text-3xl mb-2">📭</div>
          <p class="text-sm">还没有消费记录</p>
          <p class="text-xs mt-1">开始记账吧！</p>
        </div>
      </div>
    </div>
  </main>

  <!-- 底部导航 -->
  <nav class="bg-white border-t border-gray-100 px-4 py-2 flex justify-around shrink-0"
       style="padding-bottom: max(8px, env(safe-area-inset-bottom));">
    <a href="/" class="flex flex-col items-center py-1 px-3 text-indigo-600">
      <span class="text-xl">🏠</span>
      <span class="text-xs mt-0.5">首页</span>
    </a>
    <a href="/expenses" class="flex flex-col items-center py-1 px-3 text-gray-400">
      <span class="text-xl">📋</span>
      <span class="text-xs mt-0.5">明细</span>
    </a>
    <a href="/stats" class="flex flex-col items-center py-1 px-3 text-gray-400">
      <span class="text-xl">📊</span>
      <span class="text-xs mt-0.5">统计</span>
    </a>
    <a href="/settings" class="flex flex-col items-center py-1 px-3 text-gray-400">
      <span class="text-xl">⚙️</span>
      <span class="text-xs mt-0.5">设置</span>
    </a>
  </nav>
</div>
