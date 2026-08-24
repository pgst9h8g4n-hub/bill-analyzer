<script lang="ts">
  import { onMount } from 'svelte';
  import { initDB } from '$lib/db';

  onMount(async () => {
    await initDB();
  });
</script>

<svelte:head>
  <title>小六记 - 每日记账</title>
  <meta name="description" content="便捷的日常消费记账应用" />
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <nav class="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between">
    <h1 class="text-lg font-bold">小六记</h1>
    <div class="text-sm opacity-80">每日记账</div>
  </nav>

  <main class="px-4 py-4">
    <div class="text-center py-12 text-gray-500">
      <div class="text-4xl mb-4">📒</div>
      <p class="text-lg font-medium">欢迎使用小六记</p>
      <p class="text-sm mt-2">记录每一笔消费，掌控生活支出</p>
    </div>
  </main>
</div>
