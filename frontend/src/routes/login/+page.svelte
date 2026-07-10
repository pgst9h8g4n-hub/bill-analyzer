<script lang="ts">
  import { supabase } from '$lib/supabase';
  import { setTokenGetter } from '$lib/api';

  let email = $state('');
  let password = $state('');
  let isLoading = $state(false);
  let error = $state('');
  let isSignUp = $state(false);

  async function handleSubmit() {
    if (!email || !password) {
      error = '请输入邮箱和密码';
      return;
    }
    isLoading = true;
    error = '';

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name: email.split('@')[0] } },
        });
        if (signUpError) throw signUpError;
        error = '注册成功！请直接登录';
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        if (data.session) setTokenGetter(() => data.session!.access_token);
        window.location.href = '/';
      }
    } catch (e: any) {
      error = e.message || '操作失败，请重试';
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="login-page">
  <div class="login-card">
    <div class="login-header">
      <div class="logo-icon">💰</div>
      <h1>消费账单分类分析</h1>
      <p>统一管理支付宝 · 微信 · 抖音账单</p>
    </div>

    <form class="login-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <div class="form-group">
        <label for="email">邮箱</label>
        <input id="email" type="email" placeholder="your@email.com" bind:value={email} autocomplete="email" />
      </div>

      <div class="form-group">
        <label for="password">密码</label>
        <input id="password" type="password" placeholder="输入密码" bind:value={password} autocomplete={isSignUp ? 'new-password' : 'current-password'} />
      </div>

      {#if error}
        <div class="error-message">{error}</div>
      {/if}

      <button type="submit" class="submit-btn" disabled={isLoading}>
        {isLoading ? '处理中...' : (isSignUp ? '注册' : '登录')}
      </button>

      <button type="button" class="switch-btn" onclick={() => { isSignUp = !isSignUp; error = ''; }}>
        {isSignUp ? '已有账号？去登录' : '没有账号？注册一个'}
      </button>
    </form>

    <p class="footer-note">首次使用请先在 Supabase 后台创建用户</p>
  </div>
</div>

<style>
  .login-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 20px;
  }

  .login-card {
    background: #fff;
    border-radius: 16px;
    padding: 40px;
    width: 100%;
    max-width: 420px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  }

  .login-header { text-align: center; margin-bottom: 32px; }
  .logo-icon { font-size: 48px; margin-bottom: 12px; }
  .login-header h1 { font-size: 22px; color: #1e293b; margin-bottom: 6px; }
  .login-header p { color: #64748b; font-size: 14px; }

  .form-group { margin-bottom: 18px; }
  .form-group label { display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 6px; }
  .form-group input {
    width: 100%; padding: 10px 14px; border: 1px solid #e2e8f0;
    border-radius: 8px; font-size: 14px; outline: none;
  }
  .form-group input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }

  .error-message {
    background: #fef2f2; color: #dc2626; padding: 10px 14px;
    border-radius: 8px; font-size: 13px; margin-bottom: 16px;
    border: 1px solid #fecaca;
  }

  .submit-btn {
    width: 100%; padding: 12px; background: #6366f1; color: #fff;
    border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;
  }
  .submit-btn:hover:not(:disabled) { background: #4f46e5; }
  .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .switch-btn {
    width: 100%; padding: 10px; background: none; border: none;
    color: #6366f1; font-size: 13px; cursor: pointer; margin-top: 8px;
  }
  .switch-btn:hover { text-decoration: underline; }
  .footer-note { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 20px; }

  @media (max-width: 480px) { .login-card { padding: 28px 20px; } }
</style>
