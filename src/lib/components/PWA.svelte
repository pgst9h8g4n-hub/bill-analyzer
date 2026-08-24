<script lang="ts">
  import { onMount } from 'svelte';

  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }

  onMount(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => console.log('Service Worker registered'))
        .catch((err) => console.error('SW registration failed:', err));
    }

    let deferredPrompt: BeforeInstallPromptEvent | null = null;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e as unknown as BeforeInstallPromptEvent;
    });

    (window as unknown as Record<string, unknown>).__installPWA = () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((result) => {
          deferredPrompt = null;
          void result;
        });
      }
    };
  });
</script>

<!-- PWA 服务注册和安装提示，无需渲染内容 -->
