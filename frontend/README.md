# 消费账单分类分析系统 - 前端

SvelteKit 前端应用，部署到 Cloudflare Pages。

## 开发

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173

## 构建

```bash
npm run build
```

产出在 `frontend/build/` 目录，可直接部署到 Cloudflare Pages。

## 环境变量

复制 `.env.example` 为 `.env` 并填入：

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_API_URL=http://localhost:8000/api/v1
```

## 依赖

- `@supabase/supabase-js` — Supabase 客户端
- `chart.js` + `svelte-chartjs` — 图表
- `@sveltejs/adapter-static` — 静态站点适配器
- `@sveltejs/kit` — SvelteKit 框架
