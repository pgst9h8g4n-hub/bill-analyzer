<script lang="ts">
  import { onMount } from 'svelte';

  onMount(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => console.log('Service Worker registered'))
        .catch((err) => console.error('SW registration failed:', err));
    }

    // 通知用户可以将应用添加到主屏幕
    let deferredPrompt: BeforeInstallPromptEvent | null = null;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e as unknown as BeforeInstallPromptEvent;
    });

    // 暴露全局方法供手动触发安装
    (window as unknown as Record<string, unknown>).__installPWA = () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((result) => {
          deferredPrompt = null;
        });
      }
    };
  });
</script>

<style>
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .install-banner {
    animation: fadeIn 0.3s ease-out;
  }
</style>

<!-- iOS PWA meta tags 在 app.html 中声明 -->
