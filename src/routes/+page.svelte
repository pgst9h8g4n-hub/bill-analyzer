<script lang="ts">
  import { onMount } from 'svelte';
  import { initDB } from '$lib/db';
  import PWA from '$lib/components/PWA.svelte';

  onMount(async () => {
    await initDB();
  });
</script>

<PWA />

<svelte:head>
  <title>小六记 - 每日记账</title>
  <meta name="description" content="便捷的日常消费记账应用" />
</svelte:head>

<div class="min-h-screen bg-gray-50 flex flex-col">
  <!-- 导航栏 -->
  <nav class="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between shrink-0"
       style="padding-top: max(12px, env(safe-area-inset-top));">
    <h1 class="text-lg font-bold tracking-tight">📒 小六记</h1>
    <div class="text-sm opacity-80">每日记账</div>
  </nav>

  <!-- 主内容区 -->
  <main class="flex-1 px-4 py-4 overflow-auto">
    <div class="max-w-md mx-auto">
      <!-- 欢迎卡片 -->
      <div class="bg-white rounded-2xl shadow-sm p-6 mb-4 text-center">
        <div class="text-5xl mb-3">📒</div>
        <p class="text-lg font-semibold text-gray-800">欢迎使用小六记</p>
        <p class="text-sm text-gray-500 mt-1">记录每一笔消费，掌控生活支出</p>
      </div>

      <!-- 快速操作 -->
      <div class="grid grid-cols-3 gap-3 mb-4">
        <div class="bg-white rounded-xl p-4 text-center shadow-sm">
          <div class="text-2xl mb-1">📸</div>
          <div class="text-xs text-gray-600">拍照记账</div>
        </div>
        <div class="bg-white rounded-xl p-4 text-center shadow-sm">
          <div class="text-2xl mb-1">📊</div>
          <div class="text-xs text-gray-600">统计概览</div>
        </div>
        <div class="bg-white rounded-xl p-4 text-center shadow-sm">
          <div class="text-2xl mb-1">⚙️</div>
          <div class="text-xs text-gray-600">设置</div>
        </div>
      </div>

      <!-- 本月概览 -->
      <div class="bg-white rounded-2xl shadow-sm p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-gray-800">本月概览</h2>
          <span class="text-xs text-gray-400">8月</span>
        </div>
        <div class="text-3xl font-bold text-indigo-600">¥0.00</div>
        <p class="text-xs text-gray-400 mt-1">本月支出</p>
      </div>
    </div>
  </main>
</div>
