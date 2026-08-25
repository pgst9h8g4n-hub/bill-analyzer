<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  let currentUserId = 0;

  onMount(() => {
    const stored = localStorage.getItem('xiaoliuji_session');
    if (stored) {
      try {
        currentUserId = JSON.parse(stored).userId;
      } catch {}
    }
    if (!currentUserId) {
      goto('/login');
    }
  });

  // Forward to expenses page which handles everything
  goto('/expenses');
</script>

<div class="min-h-screen bg-gray-50 flex items-center justify-center">
  <div class="text-gray-400">跳转中...</div>
</div>
