import { writable } from 'svelte/store';
import { goto } from '$app/navigation';
import { onMount } from 'svelte';
import { initDB } from '$lib/db';
import { clearSession, restoreSession } from '$lib/stores/auth';

export const currentUserId = writable<number>(0);
export const currentUsername = writable<string>('');

export function useAuth() {
  onMount(async () => {
    await initDB();
    const session = await restoreSession();
    if (session) {
      currentUserId.set(session.userId);
      currentUsername.set(session.username);
    } else {
      goto('/login');
    }
  });

  return {
    logout() {
      clearSession();
      goto('/login');
    }
  };
}
