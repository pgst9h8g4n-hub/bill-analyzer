<script lang="ts">
  import { useAuth, currentUsername } from '$lib/session';
  import { page } from '$app/stores';

  useAuth();
</script>

<svelte:head>
  <title>小六记</title>
</svelte:head>

<nav class="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between shrink-0"
     style="padding-top: max(12px, env(safe-area-inset-top));">
  <slot name="nav-title" />
  <a href="/settings" class="text-sm opacity-80 hover:opacity-100">设置</a>
</nav>

<slot />

<div class="bg-white border-t border-gray-100 px-4 py-2 flex justify-around shrink-0"
     style="padding-bottom: max(8px, env(safe-area-inset-bottom));">
  <a href="/" class="flex flex-col items-center py-1 px-3 {($page.url.pathname === '/') ? 'text-indigo-600' : 'text-gray-400'}">
    <span class="text-xl">🏠</span>
    <span class="text-xs mt-0.5">首页</span>
  </a>
  <a href="/expenses" class="flex flex-col items-center py-1 px-3 {($page.url.pathname.startsWith('/expenses')) ? 'text-indigo-600' : 'text-gray-400'}">
    <span class="text-xl">📋</span>
    <span class="text-xs mt-0.5">明细</span>
  </a>
  <a href="/stats" class="flex flex-col items-center py-1 px-3 {($page.url.pathname.startsWith('/stats')) ? 'text-indigo-600' : 'text-gray-400'}">
    <span class="text-xl">📊</span>
    <span class="text-xs mt-0.5">统计</span>
  </a>
  <a href="/budget" class="flex flex-col items-center py-1 px-3 {($page.url.pathname.startsWith('/budget')) ? 'text-indigo-600' : 'text-gray-400'}">
    <span class="text-xl">💰</span>
    <span class="text-xs mt-0.5">预算</span>
  </a>
</div>
