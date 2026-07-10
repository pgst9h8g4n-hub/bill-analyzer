<script lang="ts">
  import Layout from '$lib/components/Layout.svelte';
  import { getCategories, createCategory, deleteCategory, type CategoryNode } from '$lib/api';
  import { supabase } from '$lib/supabase';

  let userId = $state('');
  let userName = $state('');

  async function loadUser() {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      userId = data.session.user.id;
      userName = data.session.user.user_metadata?.name || data.session.user.email?.split('@')[0] || '用户';
    }
  }
  loadUser();

  let categories = $state<CategoryNode[]>([]);
  let loading = $state(true);
  let error = $state('');

  let newName = $state('');
  let newKeywords = $state('');
  let newColor = $state('#6366f1');
  let saving = $state(false);

  async function loadCategories() {
    if (!userId) return;
    try { categories = await getCategories(userId); }
    catch (e: any) { error = e.message; }
    finally { loading = false; }
  }

  // 用户加载后自动加载分类
  $effect(() => { if (userId) loadCategories(); });

  async function handleCreate() {
    if (!newName.trim() || !userId) return;
    saving = true;
    try {
      const keywords = newKeywords.split(/[,，\s]+/).filter(Boolean);
      await createCategory(userId, { name: newName.trim(), keywords, color: newColor });
      newName = ''; newKeywords = ''; newColor = '#6366f1';
      await loadCategories();
    } catch (e: any) { error = e.message; }
    finally { saving = false; }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除此分类？关联的记录将变为未分类。')) return;
    try { await deleteCategory(id); await loadCategories(); }
    catch (e: any) { error = e.message; }
  }

  function flattenCats(cats: CategoryNode[], depth = 0): { cat: CategoryNode; depth: number }[] {
    let result: { cat: CategoryNode; depth: number }[] = [];
    for (const c of cats) {
      result.push({ cat: c, depth });
      if (c.children) result = result.concat(flattenCats(c.children, depth + 1));
    }
    return result;
  }

  const flatList = $derived(flattenCats(categories));
</script>

<Layout currentPage="categories" userName={userName} userId={userId}>
  <div class="page">
    <div class="page-header">
      <h2>分类管理</h2>
      <p class="subtitle">自定义消费分类，用于自动分类匹配</p>
    </div>

    {#if error}
      <div class="error-box">{error}</div>
    {/if}

    <div class="card create-form">
      <h3 class="form-title">➕ 新建分类</h3>
      <div class="form-row">
        <input type="text" placeholder="分类名称" bind:value={newName} maxlength="20" class="form-input" />
        <input type="text" placeholder="关键词（逗号分隔）" bind:value={newKeywords} class="form-input" />
        <input type="color" bind:value={newColor} class="color-picker" title="分类颜色" />
        <button class="btn-create" onclick={handleCreate} disabled={saving || !newName.trim()}>
          {saving ? '创建中...' : '创建'}
        </button>
      </div>
    </div>

    {#if loading}
      <div class="empty-state">加载中...</div>
    {:else if flatList.length === 0}
      <div class="empty-state">
        <div class="empty-icon">🏷️</div>
        <p>暂无分类</p>
        <small>使用上方表单创建第一个分类</small>
      </div>
    {:else}
      <div class="category-list">
        {#each flatList as item}
          <div class="category-item">
            <div class="category-color" style="background: {item.cat.color}"></div>
            <div class="category-info">
              <div class="category-name">{item.cat.name}</div>
              {#if item.cat.keywords.length > 0}
                <div class="category-kw">{item.cat.keywords.slice(0, 5).join('、')}{#if item.cat.keywords.length > 5}...{/if}</div>
              {/if}
            </div>
            <button class="delete-btn" onclick={() => handleDelete(item.cat.id)}>🗑</button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</Layout>

<style>
  .page-header { margin-bottom: 24px; }
  .page-header h2 { font-size: 20px; margin: 0 0 4px; }
  .subtitle { color: #64748b; font-size: 14px; margin: 0; }
  .error-box { background: #fef2f2; color: #dc2626; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; }

  .card {
    background: #fff; border-radius: 12px; padding: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px;
  }

  .form-title { font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 12px; }
  .form-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .form-input { flex: 1; min-width: 120px; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; }
  .form-input:focus { border-color: #6366f1; }
  .color-picker { width: 40px; height: 36px; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; padding: 2px; }
  .btn-create { padding: 8px 20px; background: #6366f1; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .btn-create:hover:not(:disabled) { background: #4f46e5; }
  .btn-create:disabled { opacity: 0.5; cursor: not-allowed; }

  .empty-state { text-align: center; padding: 40px 20px; color: #94a3b8; }
  .empty-icon { font-size: 40px; margin-bottom: 8px; }
  .empty-state p { font-size: 14px; color: #64748b; margin-bottom: 4px; }
  .empty-state small { font-size: 12px; }

  .category-list { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
  .category-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; }
  .category-item:last-child { border-bottom: none; }
  .category-color { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
  .category-info { flex: 1; min-width: 0; }
  .category-name { font-size: 14px; font-weight: 500; color: #1e293b; }
  .category-kw { font-size: 11px; color: #94a3b8; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .delete-btn { background: none; border: none; font-size: 16px; cursor: pointer; opacity: 0.4; transition: opacity 0.15s; padding: 4px; }
  .delete-btn:hover { opacity: 1; }

  @media (max-width: 768px) { .form-row { flex-direction: column; } .form-input { min-width: 100%; } }
</style>
