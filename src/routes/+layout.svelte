<script lang="ts">
  import { useAuth } from '$lib/session';
  import { page } from '$app/stores';

  useAuth();
</script>

<svelte:head>
  <title>小六记</title>
</svelte:head>

<!-- 顶部导航 -->
<nav class="bg-clay-600 text-white px-4 py-3.5 flex items-center justify-between shrink-0"
     style="padding-top: max(12px, env(safe-area-inset-top)); box-shadow: 0 2px 8px rgba(146,64,14,0.25);"
     aria-label="顶部导航">
  <slot name="nav-title" />
  <a href="/settings" class="text-sm opacity-85 hover:opacity-100 transition-opacity" aria-label="打开设置">⚙ 设置</a>
</nav>

<slot />

<!-- 底部导航 -->
<nav class="bg-white border-t border-stone-100 px-2 py-1.5 flex justify-around shrink-0"
     style="padding-bottom: max(8px, env(safe-area-inset-bottom)); box-shadow: 0 -1px 4px rgba(0,0,0,0.04);"
     aria-label="底部导航">
  <a href="/"
     class="flex flex-col items-center py-1.5 px-4 transition-colors duration-150
       {$page.url.pathname === '/' ? 'text-clay-600' : 'text-stone-400'}"
     aria-label="首页"
     aria-current={$page.url.pathname === '/' ? 'page' : undefined}>
    <span class="text-xl leading-none" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    </span>
    <span class="text-[10px] mt-0.5 font-medium">首页</span>
  </a>
  <a href="/expenses"
     class="flex flex-col items-center py-1.5 px-4 transition-colors duration-150
       {$page.url.pathname.startsWith('/expenses') ? 'text-clay-600' : 'text-stone-400'}"
     aria-label="消费明细"
     aria-current={$page.url.pathname.startsWith('/expenses') ? 'page' : undefined}>
    <span class="text-xl leading-none" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
    </span>
    <span class="text-[10px] mt-0.5 font-medium">明细</span>
  </a>
  <a href="/stats"
     class="flex flex-col items-center py-1.5 px-4 transition-colors duration-150
       {$page.url.pathname.startsWith('/stats') ? 'text-clay-600' : 'text-stone-400'}"
     aria-label="统计概览"
     aria-current={$page.url.pathname.startsWith('/stats') ? 'page' : undefined}>
    <span class="text-xl leading-none" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>
    </span>
    <span class="text-[10px] mt-0.5 font-medium">统计</span>
  </a>
  <a href="/budget"
     class="flex flex-col items-center py-1.5 px-4 transition-colors duration-150
       {$page.url.pathname.startsWith('/budget') ? 'text-clay-600' : 'text-stone-400'}"
     aria-label="预算管理"
     aria-current={$page.url.pathname.startsWith('/budget') ? 'page' : undefined}>
    <span class="text-xl leading-none" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="2" y1="10" y2="14"/></svg>
    </span>
    <span class="text-[10px] mt-0.5 font-medium">预算</span>
  </a>
</nav>
