<script lang="ts">
  import { onMount } from 'svelte';

  let { currentPage = '', userName = '', userId = '' } = $props();

  let sidebarOpen = $state(true);
  let mobileMenuOpen = $state(false);

  const navItems = [
    { id: 'dashboard', label: '📊 总览', page: '/' },
    { id: 'records', label: '📋 账单', page: '/records' },
    { id: 'upload', label: '📤 上传', page: '/upload' },
    { id: 'categories', label: '🏷️ 分类', page: '/categories' },
    { id: 'stats', label: '📈 统计', page: '/stats' },
  ];

  function navigate(to: string) {
    window.location.href = to;
    mobileMenuOpen = false;
  }
</script>

<!-- Mobile Header -->
<header class="mobile-header">
  <button class="menu-btn" onclick={() => mobileMenuOpen = !mobileMenuOpen}>☰</button>
  <span class="logo">💰 账单助手</span>
  {#if userName}
    <span class="user-badge">{userName}</span>
  {/if}
</header>

{#if mobileMenuOpen}
  <div class="mobile-overlay" role="button" tabindex="0" aria-label="关闭菜单" onclick={() => mobileMenuOpen = false} onkeydown={(e) => { if (e.key === 'Enter') mobileMenuOpen = false; }}></div>
{/if}

<!-- Sidebar -->
<aside class="sidebar" class:collapsed={!sidebarOpen} class:mobile-open={mobileMenuOpen}>
  <div class="sidebar-header">
    <button class="toggle-btn" onclick={() => sidebarOpen = !sidebarOpen}>◀</button>
    <span class="logo">💰 账单助手</span>
  </div>

  <nav class="nav-menu">
    {#each navItems as item}
      <a
        class="nav-item {item.id === currentPage ? 'active' : ''}"
        href={item.page}
        onclick={(e) => { e.preventDefault(); navigate(item.page); }}
      >
        <span class="nav-icon">{item.label.split(' ')[0]}</span>
        <span class="nav-label">{item.label.split(' ').slice(1).join(' ')}</span>
      </a>
    {/each}
  </nav>

  {#if userId}
    <div class="sidebar-footer">
      <div class="user-info">
        <div class="avatar">{userName.charAt(0).toUpperCase()}</div>
        <span class="username">{userName}</span>
      </div>
    </div>
  {/if}
</aside>

<!-- Main Content -->
<main class="main-content" class:mobile-main={mobileMenuOpen}>
  <slot />
</main>

<style>
  .mobile-header {
    display: none;
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 56px;
    background: #fff;
    border-bottom: 1px solid #e2e8f0;
    align-items: center;
    padding: 0 16px;
    z-index: 100;
    gap: 12px;
  }

  .menu-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #1e293b;
  }

  .logo {
    font-weight: 700;
    font-size: 16px;
    color: #6366f1;
  }

  .user-badge {
    font-size: 12px;
    color: #64748b;
    margin-left: auto;
  }

  .sidebar {
    width: 240px;
    height: 100vh;
    position: fixed;
    left: 0; top: 0;
    background: #fff;
    border-right: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    transition: width 0.2s;
    z-index: 50;
  }

  .sidebar.collapsed { width: 64px; }

  .sidebar-header {
    display: flex;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid #e2e8f0;
    gap: 8px;
    height: 60px;
  }

  .toggle-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: #64748b;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .toggle-btn:hover { background: #f1f5f9; }

  .sidebar.collapsed .logo,
  .sidebar.collapsed .nav-label,
  .sidebar.collapsed .sidebar-footer { display: none; }

  .nav-menu {
    flex: 1;
    padding: 8px;
    overflow-y: auto;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    color: #475569;
    text-decoration: none;
    font-size: 14px;
    transition: all 0.15s;
    white-space: nowrap;
    overflow: hidden;
  }

  .nav-item:hover { background: #f1f5f9; color: #1e293b; }
  .nav-item.active { background: #eef2ff; color: #6366f1; font-weight: 600; }

  .nav-icon {
    font-size: 18px;
    flex-shrink: 0;
    width: 24px;
    text-align: center;
  }

  .sidebar-footer { padding: 16px; border-top: 1px solid #e2e8f0; }
  .user-info { display: flex; align-items: center; gap: 10px; }

  .avatar {
    width: 32px; height: 32px;
    border-radius: 50%;
    background: #6366f1;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .username {
    font-size: 13px;
    color: #475569;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .main-content {
    margin-left: 240px;
    min-height: 100vh;
    background: #f8fafc;
    padding: 24px;
    transition: margin-left 0.2s;
  }

  .sidebar.collapsed ~ .main-content { margin-left: 64px; }

  @media (max-width: 768px) {
    .mobile-header { display: flex; }
    .sidebar {
      transform: translateX(-100%);
      width: 260px !important;
      z-index: 200;
    }
    .sidebar.mobile-open { transform: translateX(0); }
    .sidebar .toggle-btn,
    .sidebar .sidebar-footer { display: none; }
    .main-content {
      margin-left: 0 !important;
      padding: 16px;
      padding-top: 72px;
    }
    .mobile-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.3);
      z-index: 150;
    }
  }
</style>
