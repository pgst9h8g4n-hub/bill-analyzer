import { l as attr, e as escape_html } from "../../../chunks/attributes.js";
import { createClient } from "@supabase/supabase-js";
const SUPABASE_URL = "https://spzxyecryqenludsrrrn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwenh5ZWNyeXFlbmx1ZHNycnJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1OTE1NjksImV4cCI6MjA5OTE2NzU2OX0.O9gzjDRgW_KRS5dRN3UKwLf8JvAWavS-ipugYYhw1xU";
createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let email = "";
    let password = "";
    let isLoading = false;
    $$renderer2.push(`<div class="login-page svelte-1x05zx6"><div class="login-card svelte-1x05zx6"><div class="login-header svelte-1x05zx6"><div class="logo-icon svelte-1x05zx6">💰</div> <h1 class="svelte-1x05zx6">消费账单分类分析</h1> <p class="svelte-1x05zx6">统一管理支付宝 · 微信 · 抖音账单</p></div> <form class="login-form"><div class="form-group svelte-1x05zx6"><label for="email" class="svelte-1x05zx6">邮箱</label> <input id="email" type="email" placeholder="your@email.com"${attr("value", email)} autocomplete="email" class="svelte-1x05zx6"/></div> <div class="form-group svelte-1x05zx6"><label for="password" class="svelte-1x05zx6">密码</label> <input id="password" type="password" placeholder="输入密码"${attr("value", password)}${attr("autocomplete", "current-password")} class="svelte-1x05zx6"/></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <button type="submit" class="submit-btn svelte-1x05zx6"${attr("disabled", isLoading, true)}>${escape_html("登录")}</button> <button type="button" class="switch-btn svelte-1x05zx6">${escape_html("没有账号？注册一个")}</button></form> <p class="footer-note svelte-1x05zx6">首次使用请先在 Supabase 后台创建用户</p></div></div>`);
  });
}
export {
  _page as default
};
