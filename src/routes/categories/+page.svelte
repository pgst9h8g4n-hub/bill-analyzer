<script lang="ts">
  import { onMount } from 'svelte';
  import { db, type Category } from '$lib/db';

  let categories: Category[] = [];
  let showingAdd = false;
  let newName = '';
  let newIcon = '📝';
  let newColor = '#6366f1';
  let editingId: number | null = null;
  let editName = '';
  let editIcon = '';
  let editColor = '';
  let error = '';

  onMount(async () => {
    categories = await db.categories.toArray();
  });

  async function handleAdd() {
    if (!newName.trim()) return;
    error = '';
    try {
      await db.categories.add({ name: newName.trim(), icon: newIcon, color: newColor, is_default: false });
      categories = await db.categories.toArray();
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
    categories = await db.categories.toArray();
    editingId = null;
  }

  async function cancelEdit() {
    editingId = null;
  }

  async function handleDelete(id: number) {
    const cat = categories.find(c => c.id === id);
    if (cat?.is_default) return;
    if (!confirm('确定删除此分类？关联的消费将归入"其他"。')) return;
    const otherCat = await db.categories.where('name').equals('其他').first();
    if (otherCat) {
      await db.expenses.where('category_id').equals(id).modify({ category_id: otherCat.id });
    }
    await db.categories.delete(id);
    categories = await db.categories.toArray();
  }

  const colorPresets = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6b7280'];
  const iconPresets = ['🍜', '🚗', '🛒', '🎮', '💊', '📚', '🏠', '📱', '✈️', '🎁', '👕', '💄', '🐱', '🎵', '📝'];
</script>

<div class="min-h-screen bg-gray-50">
  <nav class="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between"
       style="padding-top: max(12px, env(safe-area-inset-top));">
    <h1 class="text-lg font-bold">消费分类</h1>
    <button onclick={() => showingAdd = !showingAdd}
      class="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm font-medium transition">
      {showingAdd ? '取消' : '+ 添加'}
    </button>
  </nav>

  <main class="px-4 py-4 max-w-md mx-auto space-y-3">
    {#if showingAdd}
      <div class="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <h3 class="font-medium text-gray-700">新建分类</h3>
        <input type="text" bind:value={newName} placeholder="分类名称" maxlength="10"
          class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none" />
        <div>
          <p class="text-xs text-gray-500 mb-2">图标</p>
          <div class="flex flex-wrap gap-2">
            {#each iconPresets as icon}
              <button type="button" onclick={() => newIcon = icon} title={icon}
                class="w-9 h-9 rounded-lg text-xl flex items-center justify-center transition
                  {newIcon === icon ? 'bg-indigo-100 ring-2 ring-indigo-500' : 'bg-gray-100 hover:bg-gray-200'}">
                {icon}
              </button>
            {/each}
          </div>
        </div>
        <div>
          <p class="text-xs text-gray-500 mb-2">颜色</p>
          <div class="flex flex-wrap gap-2">
            {#each colorPresets as color}
              <button type="button" onclick={() => newColor = color} title={color}
                class="w-8 h-8 rounded-full transition hover:scale-110
                  {newColor === color ? 'ring-2 ring-offset-1 ring-indigo-500' : ''}"
                style="background-color: {color}"></button>
            {/each}
          </div>
        </div>
        <button onclick={handleAdd} disabled={!newName.trim()}
          class="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 transition disabled:opacity-50">
          确认添加
        </button>
      </div>
    {/if}

    {#each categories as cat (cat.id)}
      {#if editingId === cat.id}
        <div class="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <div class="flex items-center gap-3">
            <input type="text" bind:value={editName} maxlength="10"
              class="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-500" />
            <span class="text-2xl">{editIcon}</span>
          </div>
          <div class="flex flex-wrap gap-2">
            {#each colorPresets as color}
              <button type="button" onclick={() => editColor = color} title={color}
                class="w-7 h-7 rounded-full transition hover:scale-110
                  {editColor === color ? 'ring-2 ring-offset-1 ring-indigo-500' : ''}"
                style="background-color: {color}"></button>
            {/each}
          </div>
          <div class="flex gap-2">
            <button onclick={saveEdit} class="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-medium">保存</button>
            <button onclick={cancelEdit} class="flex-1 bg-gray-100 text-gray-600 py-2 rounded-xl text-sm font-medium">取消</button>
          </div>
        </div>
      {:else}
        <div class="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
            style="background-color: {cat.color}20">
            {cat.icon}
          </div>
          <div class="flex-1">
            <div class="font-medium text-gray-800">{cat.name}</div>
            <div class="text-xs text-gray-400">{cat.is_default ? '预设分类' : '自定义'}</div>
          </div>
          {#if !cat.is_default}
            <div class="flex gap-1">
              <button type="button" onclick={() => startEdit(cat)} title="编辑"
                class="p-2 text-gray-400 hover:text-indigo-600 transition">✏️</button>
              <button type="button" onclick={() => handleDelete(cat.id)} title="删除"
                class="p-2 text-gray-400 hover:text-red-600 transition">🗑️</button>
            </div>
          {/if}
        </div>
      {/if}
    {/each}

    {#if categories.length === 0}
      <div class="text-center py-12 text-gray-400">
        <div class="text-4xl mb-2">📂</div>
        <p class="text-sm">暂无分类</p>
      </div>
    {/if}
  </main>
</div>
