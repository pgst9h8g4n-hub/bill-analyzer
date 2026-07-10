# 消费账单分类分析系统 - 后端

FastAPI 后端服务，负责账单文件上传、解析、自动分类、统计查询。

## 部署
- 平台：Railway
- 运行时：Python 3.11+
- 构建方式：直接运行 uvicorn

## 依赖
```bash
pip install fastapi uvicorn python-multipart pydantic pydantic-settings psycopg2-binary sqlalchemy httpx supabase
pip install openpyxl PyPDF2 chardet
```

## 环境变量
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
DATABASE_URL=postgresql://...
ALLOWED_ORIGINS=https://your-domain.pages.dev
```
