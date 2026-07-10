"""
消费账单分类分析系统 - FastAPI 应用入口
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.api.routes import router as api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    settings = get_settings()
    print(f"🚀 消费账单分类分析系统启动")
    print(f"   Supabase: {settings.supabase_url[:30]}...")
    yield
    print("👋 应用关闭")


app = FastAPI(
    title="消费账单分类分析系统",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS 中间件
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载 API 路由
app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "name": "消费账单分类分析系统",
        "version": "0.1.0",
        "docs": "/api/v1/docs",
    }
