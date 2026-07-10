<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { setTokenGetter } from '$lib/api';
  import Login from '../routes/login/+page.svelte';
  import Dashboard from '../routes/+page.svelte';

  let showLogin = $state(true);
  let userId = $state('');
  let userName = $state('');

  onMount(async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      showLogin = false;
      userId = data.session.user.id;
      userName = data.session.user.user_metadata?.name || data.session.user.email?.split('@')[0] || '用户';
      setTokenGetter(() => data.session!.access_token);
    }
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      showLogin = false;
      userId = session.user.id;
      userName = session.user.user_metadata?.name || session.user.email?.split('@')[0] || '用户';
      setTokenGetter(() => session.access_token);
    } else {
      showLogin = true;
    }
  });
</script>

{#if showLogin}
  <Login />
{:else}
  <Dashboard userId={userId} userName={userName} />
{/if}
