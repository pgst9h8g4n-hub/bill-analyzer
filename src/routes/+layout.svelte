<script lang="ts">
  import { useAuth } from '$lib/session';
  import { page } from '$app/stores';

  useAuth();
</script>

<svelte:head>
  <title>小六记</title>
</svelte:head>

<nav class="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between shrink-0"
     style="padding-top: max(12px, env(safe-area-inset-top));"
     aria-label="顶部导航">
  <slot name="nav-title" />
  <a href="/settings" class="text-sm opacity-80 hover:opacity-100" aria-label="打开设置">设置</a>
</nav>

<slot />

<!-- 底部导航 -->
<nav class="bg-white border-t border-gray-100 px-4 py-2 flex justify-around shrink-0"
     style="padding-bottom: max(8px, env(safe-area-inset-bottom));"
     aria-label="底部导航">
  <a href="/"
     class="flex flex-col items-center py-1 px-3 transition-colors
       {$page.url.pathname === '/' ? 'text-indigo-600' : 'text-gray-400'}"
     aria-label="首页"
     aria-current={$page.url.pathname === '/' ? 'page' : undefined}>
    <span class="text-xl" aria-hidden="true">🏠</span>
    <span class="text-xs mt-0.5">首页</span>
  </a>
  <a href="/expenses"
     class="flex flex-col items-center py-1 px-3 transition-colors
       {$page.url.pathname.startsWith('/expenses') ? 'text-indigo-600' : 'text-gray-400'}"
     aria-label="消费明细"
     aria-current={$page.url.pathname.startsWith('/expenses') ? 'page' : undefined}>
    <span class="text-xl" aria-hidden="true">📋</span>
    <span class="text-xs mt-0.5">明细</span>
  </a>
  <a href="/stats"
     class="flex flex-col items-center py-1 px-3 transition-colors
       {$page.url.pathname.startsWith('/stats') ? 'text-indigo-600' : 'text-gray-400'}"
     aria-label="统计概览"
     aria-current={$page.url.pathname.startsWith('/stats') ? 'page' : undefined}>
    <span class="text-xl" aria-hidden="true">📊</span>
    <span class="text-xs mt-0.5">统计</span>
  </a>
  <a href="/budget"
     class="flex flex-col items-center py-1 px-3 transition-colors
       {$page.url.pathname.startsWith('/budget') ? 'text-indigo-600' : 'text-gray-400'}"
     aria-label="预算管理"
     aria-current={$page.url.pathname.startsWith('/budget') ? 'page' : undefined}>
    <span class="text-xl" aria-hidden="true">💰</span>
    <span class="text-xs mt-0.5">预算</span>
  </a>
</nav>
