<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    goto('/expenses');
  });
</script>

<div class="min-h-screen bg-gray-50 flex items-center justify-center">
  <div class="text-gray-400">跳转中...</div>
</div>
