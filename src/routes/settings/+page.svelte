<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { changePassword, changeUsername, deleteUser, clearSession } from '$lib/stores/auth';
  import { currentUserId, currentUsername } from '$lib/session';
  import { ocrMode, ocrProvider, loadConfig, saveConfig, clearConfig, setMode } from '$lib/stores/ocr-config';
  import { getOCRConfig, getTodayCloudQuota, type DualQuota } from '$lib/ocr/cloud';

  $: userId = $currentUserId;
  $: username = $currentUsername;

  let oldPassword = '';
  let newPassword = '';
  let confirmNewPassword = '';
  let passwordMsg = '';
  let passwordSaving = false;
  // 账户名
  let newName = '';
  let nameMsg = '';
  let nameSaving = false;
  let deleting = false;

  // OCR 配置
  let ocrProviderName = 'baidu';
  let apiKey = '';
  let secretKey = '';
  let ocrMsg = '';
  let ocrSaving = false;
  let ocrModeValue: 'local' | 'cloud' | 'smart' = 'smart';
  let hasConfig = false;
  let todayQuota: DualQuota = { period: '', accurate: { period: '', count: 0, quotaExhausted: false }, general: { period: '', count: 0, quotaExhausted: false } };

  // 订阅 mode 变化，保持本地状态与 store 同步
  ocrMode.subscribe(v => { if (v !== 'auto') ocrModeValue = v; })();
  ocrProvider.subscribe(v => { ocrProviderName = v; })();

  onMount(async () => {
    // 预填当前账户名，便于"小改"场景（如补全昵称）直接编辑
    newName = $currentUsername;
    const config = await getOCRConfig();
    if (config) {
      ocrProviderName = config.provider;
      apiKey = config.apiKey;
      secretKey = config.secretKey;
      hasConfig = true;
    }
    // 加载今日额度
    const quota = await getTodayCloudQuota();
    todayQuota = quota;
    // Load saved mode from IndexedDB
    const modeStored = await (await import('$lib/db')).db.settings.get('ocr_mode');
    if (modeStored?.value) {
      try {
        ocrModeValue = JSON.parse(modeStored.value);
        ocrMode.set(ocrModeValue);
      } catch {}
    }
  });

  async function handleChangePassword() {
    passwordMsg = '';
    if (passwordSaving) return;
    if (!oldPassword || !newPassword || !confirmNewPassword) {
      passwordMsg = '请填写所有字段';
      return;
    }
    if (newPassword !== confirmNewPassword) {
      passwordMsg = '两次密码不一致';
      return;
    }
    if (newPassword.length < 4) {
      passwordMsg = '新密码至少4位';
      return;
    }
    if (!userId) {
      passwordMsg = '请先登录';
      return;
    }
    passwordSaving = true;
    try {
      const result = await changePassword(userId, oldPassword, newPassword);
      if (result.success) {
        passwordMsg = '✅ 密码修改成功';
        oldPassword = '';
        newPassword = '';
        confirmNewPassword = '';
      } else {
        passwordMsg = '❌ ' + (result.error ?? '修改失败');
      }
    } finally {
      passwordSaving = false;
    }
  }

  async function handleChangeUsername() {
    nameMsg = '';
    if (nameSaving) return;
    if (!userId) {
      nameMsg = '请先登录';
      return;
    }
    nameSaving = true;
    try {
      const result = await changeUsername(userId, newName);
      if (result.success) {
        // 同步显示层 + 会话存储里的 username（restoreSession 按 userId 查，不依赖存储名，
        // 此处只更新展示缓存；不能 clearSession，那会清掉登录态导致下次要重登）
        const trimmed = newName.trim();
        currentUsername.set(trimmed);
        const { db } = await import('$lib/db');
        const sessionRow = await db.settings.get('session');
        if (sessionRow?.value) {
          try {
            const s = JSON.parse(sessionRow.value);
            if (s.userId === userId) s.username = trimmed;
            await db.settings.put({ key: 'session', value: JSON.stringify(s) });
          } catch {}
        }
        localStorage.setItem('xiaoliuji_session', JSON.stringify({ ...JSON.parse(localStorage.getItem('xiaoliuji_session') ?? '{}'), username: trimmed }));
        nameMsg = '✅ 账户名已更新';
      } else {
        nameMsg = '❌ ' + (result.error ?? '修改失败');
      }
    } finally {
      nameSaving = false;
    }
  }

  async function handleSaveOCRConfig() {
    ocrMsg = '';
    if (ocrSaving) return;
    if (!apiKey || apiKey.length < 10) {
      ocrMsg = '❌ 请输入有效的 API Key';
      return;
    }
    if (!secretKey || secretKey.length < 10) {
      ocrMsg = '❌ 请输入有效的 Secret Key';
      return;
    }
    ocrSaving = true;
    try {
      await saveConfig({mode: ocrModeValue,
        provider: ocrProviderName as 'baidu' | 'tencent',
        apiKey,
        secretKey
      });
      // 同步模式到 store
      setMode(ocrModeValue as 'local' | 'cloud' | 'auto' | 'smart');
      hasConfig = true;
      ocrMsg = '✅ 配置保存成功！';
      // 更新 OCR 页面状态
      ocrProvider.set(ocrProviderName as 'baidu' | 'tencent');
    } catch (e) {
      ocrMsg = '❌ 保存失败: ' + (e as Error).message;
    } finally {
      ocrSaving = false;
    }
  }

  async function handleClearOCRConfig() {
    try {
      await clearConfig();
      apiKey = '';
      secretKey = '';
      hasConfig = false;
      ocrMsg = '✅ 配置已清除';
    } catch (e) {
      ocrMsg = '❌ 清除失败: ' + (e as Error).message;
    }
  }

  async function handleDeleteAccount() {
    if (!confirm('确定要删除账户吗？此操作不可恢复，所有消费记录将被清空！')) return;
    if (!userId) return;
    deleting = true;
    try {
      await deleteUser(userId);
      clearSession();
      localStorage.removeItem('xiaoliuji_session');
      goto('/login');
    } catch {
      passwordMsg = '❌ 删除失败，请重试';
    } finally {
      deleting = false;
    }
  }
</script>

<div class="min-h-screen bg-paper">
  <main class="px-4 py-4 max-w-md mx-auto space-y-4 pb-20">
    <!-- 账户信息 -->
    <div class="bg-white rounded-2xl shadow-card p-4">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-full bg-clay-100 flex items-center justify-center text-xl font-semibold text-clay-700"
             style="font-family:'JetBrains Mono',monospace;">
          {username?.[0]?.toUpperCase() ?? '用'}
        </div>
        <div>
          <div class="font-medium text-ink text-base">{username || '用户'}</div>
          <div class="text-xs text-stone-400">本地账户 · 数据仅保存在本设备</div>
        </div>
      </div>
    </div>

    <!-- 修改账户名 -->
    <div class="bg-white rounded-2xl shadow-card p-4">
      <h2 class="font-semibold text-ink text-base mb-3">修改账户名</h2>
      <form onsubmit={(e) => { e.preventDefault(); handleChangeUsername(); }} class="space-y-3">
        <input id="account-name" type="text" bind:value={newName} placeholder="新账户名"
          class="input-field" />
        {#if nameMsg}
          <p class="text-sm font-medium {nameMsg.includes('更新') ? 'text-green-600' : 'text-red-600'}">{nameMsg}</p>
        {/if}
        <button type="submit" disabled={nameSaving}
          class="btn-primary w-full disabled:opacity-50">
          {nameSaving ? '保存中…' : '保存账户名'}
        </button>
      </form>
      <p class="text-xs text-stone-400 mt-2">账户名用于登录，需至少 2 个字符且不能与其他账户重复</p>
    </div>

    <!-- 修改密码 -->
    <div class="bg-white rounded-2xl shadow-card p-4">
      <h2 class="font-semibold text-ink text-base mb-3">修改密码</h2>
      <form onsubmit={(e) => { e.preventDefault(); handleChangePassword(); }} class="space-y-3">
        <input type="password" bind:value={oldPassword} placeholder="当前密码"
          class="input-field" />
        <input type="password" bind:value={newPassword} placeholder="新密码"
          class="input-field" />
        <input type="password" bind:value={confirmNewPassword} placeholder="确认新密码"
          class="input-field" />
        {#if passwordMsg}
          <p class="text-sm font-medium {passwordMsg.includes('成功') ? 'text-green-600' : 'text-red-600'}">{passwordMsg}</p>
        {/if}
        <button type="submit" disabled={passwordSaving}
          class="btn-primary w-full disabled:opacity-50">
          {passwordSaving ? '修改中…' : '确认修改'}
        </button>
      </form>
    </div>

    <!-- 数据导出入口 -->
    <div class="bg-white rounded-2xl shadow-card p-4">
      <h2 class="font-semibold text-ink text-base mb-3">导出数据</h2>
      <a href="/export" class="flex items-center gap-3 p-3 rounded-xl hover:bg-stone-50 transition-colors">
        <div class="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-lg">📄</div>
        <div class="flex-1">
          <div class="font-medium text-ink text-sm">导出消费记录</div>
          <div class="text-xs text-stone-400">CSV / JSON 格式</div>
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </a>
    </div>

    <!-- OCR 云端配置 -->
    <div class="bg-white rounded-2xl shadow-card p-4">
      <h2 class="font-semibold text-ink text-base mb-3">云端 OCR 配置</h2>
      <div class="space-y-3">
        <div>
          <label class="block text-sm font-medium text-ink mb-1.5">识别模式</label>
          <select bind:value={ocrModeValue} class="input-field">
            <option value="local">仅本地</option>
            <option value="cloud">仅云端</option>
            <option value="smart">智能切换（高精度版 → 标准版 → 本地）</option>
          </select>
          <p class="text-xs text-stone-400 mt-1">
            {ocrModeValue === 'smart' ? '优先高精度版，额度耗尽自动降级标准版，再耗尽降级本地 OCR' : ''}
          </p>
        </div>
        <div>
          <label class="block text-sm font-medium text-ink mb-1.5">提供商</label>
          <div class="flex gap-2">
            <button type="button" onclick={() => ocrProviderName = 'baidu'}
              class="flex-1 py-2 rounded-xl border-2 transition-all {ocrProviderName === 'baidu' ? 'border-clay-600 bg-clay-50 text-clay-700' : 'border-stone-200 text-stone-500'}">
              百度 OCR
            </button>
            <button type="button" onclick={() => ocrProviderName = 'tencent'}
              class="flex-1 py-2 rounded-xl border-2 transition-all {ocrProviderName === 'tencent' ? 'border-clay-600 bg-clay-50 text-clay-700' : 'border-stone-200 text-stone-500'}">
              腾讯云 OCR
            </button>
          </div>
          <p class="text-xs text-stone-400 mt-1">
            {ocrProviderName === 'baidu' ? '百度 OCR 高精度版 + 标准版各 1000次/月免费' : '腾讯云 OCR 免费 500次/月'}
          </p>
          {#if hasConfig && ocrProviderName === 'baidu'}
            {@const accRemaining = 1000 - todayQuota.accurate.count}
            {@const genRemaining = 1000 - todayQuota.general.count}
            <div class="mt-2 space-y-2.5">
              <!-- 高精度版 -->
              <div>
                <div class="flex items-center justify-between text-xs mb-0.5">
                  <span class="text-stone-500">高精度版</span>
                  <span class={todayQuota.accurate.quotaExhausted ? 'text-red-500 font-medium' : accRemaining <= 100 ? 'text-amber-600 font-medium' : 'text-stone-400'}>
                    {todayQuota.accurate.quotaExhausted ? '已耗尽' : `${todayQuota.accurate.count} / 1000 次${accRemaining <= 100 ? ' ⚠️ 即将用尽' : ''}`}
                  </span>
                </div>
                <div class="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-300 {todayQuota.accurate.quotaExhausted ? 'bg-red-400' : accRemaining <= 100 ? 'bg-amber-400' : 'bg-clay-500'}"
                       style="width:{todayQuota.accurate.quotaExhausted ? 100 : Math.min(100, Math.round(todayQuota.accurate.count / 1000 * 100))}%"></div>
                </div>
              </div>
              <!-- 标准版 -->
              <div>
                <div class="flex items-center justify-between text-xs mb-0.5">
                  <span class="text-stone-500">标准版</span>
                  <span class={todayQuota.general.quotaExhausted ? 'text-red-500 font-medium' : genRemaining <= 100 ? 'text-amber-600 font-medium' : 'text-stone-400'}>
                    {todayQuota.general.quotaExhausted ? '已耗尽' : `${todayQuota.general.count} / 1000 次${genRemaining <= 100 ? ' ⚠️ 即将用尽' : ''}`}
                  </span>
                </div>
                <div class="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-300 {todayQuota.general.quotaExhausted ? 'bg-red-400' : genRemaining <= 100 ? 'bg-amber-400' : 'bg-clay-500'}"
                       style="width:{todayQuota.general.quotaExhausted ? 100 : Math.min(100, Math.round(todayQuota.general.count / 1000 * 100))}%"></div>
                </div>
              </div>
              <p class="text-xs text-stone-400">
                本地计数仅供参考，实际额度以
                <a href="https://console.bce.baidu.com/ai/#/ai/ocr/qualification" target="_blank"
                   class="text-clay-600 hover:underline">百度控制台</a>为准
              </p>
            </div>
          {:else if hasConfig && ocrProviderName === 'tencent'}
            <!-- 腾讯暂无本地计数（数据层 DualQuota 只记录百度双版本），仅展示免费额度说明 -->
            <div class="mt-2 space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="text-stone-500">通用文本识别</span>
                <span class="text-stone-400">免费 500 次 / 月</span>
              </div>
              <p class="text-xs text-stone-400">
                本地暂不统计腾讯额度，实际以
                <a href="https://console.cloud.tencent.com/ocr" target="_blank"
                   class="text-clay-600 hover:underline">腾讯云控制台</a>为准
              </p>
            </div>
          {/if}
        </div>
        <div>
          <label class="block text-sm font-medium text-ink mb-1.5">API Key</label>
          <input type="text" bind:value={apiKey} placeholder="输入百度 API Key" class="input-field" />
        </div>
        <div>
          <label class="block text-sm font-medium text-ink mb-1.5">Secret Key</label>
          <input type="password" bind:value={secretKey} placeholder="输入百度 Secret Key" class="input-field" />
        </div>
        {#if ocrMsg}
          <p class="text-sm font-medium {ocrMsg.includes('成功') ? 'text-green-600' : 'text-red-600'}">{ocrMsg}</p>
        {/if}
        <button onclick={handleSaveOCRConfig} disabled={ocrSaving} class="btn-primary w-full disabled:opacity-50">
          {ocrSaving ? '保存中…' : '保存配置'}
        </button>
        {#if hasConfig}
          <button onclick={handleClearOCRConfig} class="w-full text-xs text-stone-400 hover:text-stone-600 py-2">
            清除配置
          </button>
        {/if}
      </div>
      <div class="mt-3 pt-3 border-t border-stone-100">
        <p class="text-xs text-stone-400">
          💡 如何获取 API Key？访问{' '}
          <a href="https://console.bce.baidu.com/ai/" target="_blank" class="text-clay-600 hover:underline">
            console.bce.baidu.com
          </a>
          {' '}注册并创建应用
        </p>
      </div>
    </div>

    <!-- 危险操作 -->
    <div class="bg-white rounded-2xl shadow-card p-4">
      <h2 class="font-semibold text-red-600 text-base mb-1">危险操作</h2>
      <p class="text-sm text-stone-400 mb-3">删除账户将清除所有数据，不可恢复</p>
      <button onclick={handleDeleteAccount} disabled={deleting}
        class="w-full border-2 border-red-200 text-red-600 py-3 rounded-full font-medium hover:bg-red-50 transition-all disabled:opacity-50">
        {deleting ? '删除中...' : '删除账户'}
      </button>
    </div>

    <div class="text-center text-xs text-stone-300 py-2">
      小六记 v1.0 · 数据本地存储
    </div>
  </main>
</div>
