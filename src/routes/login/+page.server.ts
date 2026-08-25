import { goto } from '$app/navigation';
import { register, login } from '$lib/stores/auth';
import type { Session } from '$lib/stores/auth';
import { onMount } from 'svelte';

let mode = 'login' as 'login' | 'register';
let username = '';
let password = '';
let confirmPassword = '';
let error = '';
let loading = false;
let currentSession: Session | null = null;

onMount(async () => {
  // Check if already logged in via localStorage
  const stored = localStorage.getItem('xiaoliuji_session');
  if (stored) {
    try {
      currentSession = JSON.parse(stored) as Session;
      goto('/');
    } catch {}
  }
});

async function handleSubmit() {
  error = '';
  if (!username.trim() || !password.trim()) {
    error = '请填写用户名和密码';
    return;
  }
  if (mode === 'register' && password !== confirmPassword) {
    error = '两次输入的密码不一致';
    return;
  }
  if (mode === 'register' && password.length < 4) {
    error = '密码至少4位';
    return;
  }

  loading = true;
  try {
    if (mode === 'register') {
      const result = await register(username.trim(), password);
      if (!result.success) {
        error = result.error ?? '注册失败';
      } else {
        error = '注册成功，请登录';
        mode = 'login';
        username = '';
        password = '';
        confirmPassword = '';
      }
    } else {
      const result = await login(username.trim(), password);
      if (!result.success) {
        error = result.error ?? '登录失败';
      } else if (result.user) {
        localStorage.setItem('xiaoliuji_session', JSON.stringify({
          userId: result.user.id,
          username: result.user.username,
          createdAt: result.user.created_at
        }));
        goto('/');
      }
    }
  } finally {
    loading = false;
  }
}

function switchMode() {
  mode = mode === 'login' ? 'register' : 'login';
  error = '';
  username = '';
  password = '';
  confirmPassword = '';
}