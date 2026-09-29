<script lang="ts">
  import { onMount } from 'svelte';
  import { db, type Category } from '$lib/db';
  import { currentLedgerId } from '$lib/session';

  $: ledgerId = $currentLedgerId;

  let categories: Category[] = [];
  let showingAdd = false;
  let newName = '';
  let newIcon = '📝';
  let newColor = '#B45309';
  let editingId: number | null = null;
  let editName = '';
  let editIcon = '';
  let editColor = '';
  let error = '';

  onMount(async () => {
    if (!ledgerId) return;
    categories = await db.categories.where('ledger_id').equals(ledgerId).toArray();
  });

  async function handleAdd() {
    if (!newName.trim()) return;
    error = '';
    try {
      await db.categories.add({ name: newName.trim(), icon: newIcon, color: newColor, is_default: false, ledger_id: ledgerId });
      categories = await db.categories.where('ledger_id').equals(ledgerId).toArray();
      newName = '';
      showingAdd = false;
    } catch {
      error = '添加失败';
    }
  }

  function startEdit(cat: Category) {
    editingId = cat.id;
    editName = cat.name;
    editIcon = cat.icon;
    editColor = cat.color;
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    await db.categories.update(editingId, { name: editName.trim(), icon: editIcon, color: editColor });
    categories = await db.categories.where('ledger_id').equals(ledgerId).toArray();
    editingId = null;
  }

  async function cancelEdit() {
    editingId = null;
  }

  async function handleDelete(id: number) {
    const cat = categories.find(c => c.id === id);
    if (cat?.is_default) return;
    if (!confirm('确定删除此分类？关联的消费将归入"其他"。')) return;
    const otherCat = await db.categories.where({ name: '其他', ledger_id: ledgerId }).first();
    if (otherCat) {
      await db.expenses.where('category_id').equals(id).modify({ category_id: otherCat.id });
    }
    await db.categories.delete(id);
    categories = await db.categories.where('ledger_id').equals(ledgerId).toArray();
  }

  const colorPresets = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#B45309', '#6b7280'];
  const iconPresets = ['🍜', '🚗', '🛒', '🎮', '💊', '📚', '🏠', '📱', '✈️', '🎁', '👕', '💄', '🐱', '🎵', '📝'];
</script>

<div class="min-h-screen bg-paper">
  <nav class="bg-clay-600 text-white px-4 py-3.5 flex items-center justify-between shrink-0"
       style="padding-top: max(12px, env(safe-area-inset-top)); box-shadow: 0 2px 8px rgba(146,64,14,0.25);"
       aria-label="顶部导航">
    <h1 class="text-lg font-bold">消费分类</h1>
    <button onclick={() => showingAdd = !showingAdd}
      class="bg-white/20 hover:bg-white/30 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all">
      {showingAdd ? '取消' : '+ 添加'}
    </button>
  </nav>

  <main class="px-4 py-4 max-w-md mx-auto space-y-3 pb-20">
    {#if showingAdd}
      <div class="bg-white rounded-2xl shadow-card p-4 space-y-4">
        <h3 class="font-semibold text-ink text-base">新建分类</h3>
        <div>
          <label for="new-name" class="block text-sm font-medium text-ink mb-1.5">名称</label>
          <input id="new-name" type="text" bind:value={newName} placeholder="分类名称" maxlength="10"
            class="input-field" />
        </div>
        <div>
          <p class="text-sm font-medium text-ink mb-2">图标</p>
          <div class="flex flex-wrap gap-2">
            {#each iconPresets as icon}
              <button type="button" onclick={() => newIcon = icon} title={icon}
                class="w-9 h-9 rounded-xl text-xl flex items-center justify-center transition-all duration-150
                  {newIcon === icon ? 'bg-clay-100 ring-2 ring-clay-600 scale-105' : 'bg-stone-50 hover:bg-stone-100'}">
                {icon}
              </button>
            {/each}
          </div>
        </div>
        <div>
          <p class="text-sm font-medium text-ink mb-2">颜色</p>
          <div class="flex flex-wrap gap-2">
            {#each colorPresets as color}
              <button type="button" onclick={() => newColor = color} title={color}
                class="w-8 h-8 rounded-full transition-all duration-150 hover:scale-110
                  {newColor === color ? 'ring-2 ring-offset-2 ring-clay-600 scale-110' : 'shadow-sm'}"
                style="background-color: {color}"></button>
            {/each}
          </div>
        </div>
        <button onclick={handleAdd} disabled={!newName.trim()}
          class="btn-primary w-full">
          确认添加
        </button>
        {#if error}
          <p class="text-sm text-red-600 text-center">{error}</p>
        {/if}
      </div>
    {/if}

    {#each categories as cat (cat.id)}
      {#if editingId === cat.id}
        <div class="bg-white rounded-2xl shadow-card p-4 space-y-3">
          <div>
            <label for="edit-name-input" class="block text-sm font-medium text-ink mb-1.5">名称</label>
            <div class="flex items-center gap-3">
              <input id="edit-name-input" type="text" bind:value={editName} maxlength="10"
                class="input-field flex-1 py-2" />
              <span class="text-2xl">{editIcon}</span>
            </div>
          </div>
          <div>
            <p class="text-sm font-medium text-ink mb-2">颜色</p>
            <div class="flex flex-wrap gap-2">
              {#each colorPresets as color}
                <button type="button" onclick={() => editColor = color} title={color}
                  class="w-7 h-7 rounded-full transition-all duration-150 hover:scale-110
                    {editColor === color ? 'ring-2 ring-offset-2 ring-clay-600' : 'shadow-sm'}"
                  style="background-color: {color}"></button>
              {/each}
            </div>
          </div>
          <div class="flex gap-2">
            <button onclick={saveEdit} class="flex-1 btn-primary py-2.5 text-sm">保存</button>
            <button onclick={cancelEdit} class="flex-1 border-2 border-stone-200 text-stone-600 py-2.5 rounded-full text-sm font-medium hover:bg-stone-50 transition">取消</button>
          </div>
        </div>
      {:else}
        <div class="bg-white rounded-2xl shadow-soft p-3.5 flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
            style="background-color: {cat.color}18; color: {cat.color};">
            {cat.icon}
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-medium text-ink text-sm">{cat.name}</div>
            <div class="text-xs text-stone-400">{cat.is_default ? '预设分类' : '自定义'}</div>
          </div>
          {#if !cat.is_default}
            <div class="flex gap-0.5">
              <button type="button" onclick={() => startEdit(cat)} title="编辑"
                class="p-2 text-stone-400 hover:text-clay-600 hover:bg-clay-50 rounded-lg transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
              </button>
              <button type="button" onclick={() => handleDelete(cat.id)} title="删除"
                class="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>
          {/if}
        </div>
      {/if}
    {/each}

    {#if categories.length === 0}
      <div class="text-center py-12 bg-white rounded-2xl shadow-soft">
        <div class="text-4xl mb-2" aria-hidden="true">📂</div>
        <p class="text-sm text-stone-500 font-medium">暂无分类</p>
      </div>
    {/if}
  </main>
</div>
