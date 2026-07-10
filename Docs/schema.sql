-- ============================================================
-- 消费账单分类分析系统 - Supabase 建表 SQL
-- 执行位置: Supabase Dashboard → SQL Editor
-- ============================================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. users — 用户表
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    phone TEXT UNIQUE,
    email TEXT UNIQUE,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 用户只能读写自己的数据
CREATE POLICY "users_select_own" ON users
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "users_update_own" ON users
    FOR UPDATE USING (auth.uid()::text = id::text);

-- 自动创建用户：当 Supabase Auth 用户注册时
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, name, email, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
        NEW.email,
        NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO UPDATE SET
        updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. bill_files — 账单文件表
-- ============================================================
CREATE TABLE IF NOT EXISTS bill_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('alipay', 'wechat', 'douyin')),
    original_name TEXT NOT NULL,
    file_key TEXT NOT NULL,
    period_start DATE,
    period_end DATE,
    record_count INT DEFAULT 0,
    parsed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'parsing', 'done', 'error')),
    error_msg TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bill_files_user ON bill_files(user_id);
CREATE INDEX idx_bill_files_platform ON bill_files(platform);

ALTER TABLE bill_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bill_files_manage_own" ON bill_files
    FOR ALL USING (auth.uid()::text = user_id::text);

-- ============================================================
-- 3. categories — 分类体系表
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INT DEFAULT 0,
    color TEXT DEFAULT '#6366f1',
    keywords TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_categories_user_parent_name
    ON categories(user_id, parent_id, name);

CREATE UNIQUE INDEX idx_categories_user_parent_sort
    ON categories(user_id, parent_id, sort_order);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_manage_own" ON categories
    FOR ALL USING (auth.uid()::text = user_id::text);

-- ============================================================
-- 4. category_templates — 预置分类模板
-- ============================================================
CREATE TABLE IF NOT EXISTS category_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    categories JSONB NOT NULL
);

-- 插入默认分类模板
INSERT INTO category_templates (name, is_default, categories) VALUES (
    '默认消费分类',
    TRUE,
    '[
        {
            "name": "餐饮美食",
            "color": "#ef4444",
            "keywords": ["餐饮", "美食", "餐厅", "火锅", "肯德基", "麦当劳", "星巴克", "瑞幸", "喜茶", "奶茶", "小吃", "快餐", "烧烤", "龙记山城", "鲜芋仙", "手作酸奶", "来碗冰", "安琪酵母", "新良", "淘宝闪购"]
        },
        {
            "name": "交通出行",
            "color": "#3b82f6",
            "keywords": ["交通", "出行", "打车", "滴滴", "地铁", "公交", "停车", "高铁", "火车", "机票", "中石化", "中石油", "加油", "ETC", "共享单车", "高德", "12306", "中铁网络", "速停车", "怪兽充电"]
        },
        {
            "name": "购物消费",
            "color": "#f59e0b",
            "keywords": ["购物", "电商", "淘宝", "京东", "拼多多", "抖音电商", "百货", "日用", "服饰", "数码", "家电", "美妆", "山姆", "沃尔玛", "棉来啦", "江博士", "罗森"]
        },
        {
            "name": "医疗健康",
            "color": "#10b981",
            "keywords": ["医疗", "医院", "挂号", "药房", "健康", "华西", "妇幼", "卫生院", "门诊", "体检"]
        },
        {
            "name": "酒店旅游",
            "color": "#8b5cf6",
            "keywords": ["酒店", "旅游", "民宿", "景区", "门票", "动物园", "熊猫", "文旅", "仙女山", "放野玩水", "花间堂", "希尔顿", "洲际"]
        },
        {
            "name": "生活服务",
            "color": "#ec4899",
            "keywords": ["生活", "水电", "燃气", "话费", "宽带", "物业", "充电", "理发", "美容", "卡诗", "欧莱雅", "悦木之源", "娇韵诗", "菜鸟裹裹", "闲鱼", "华润燃气", "中国电信"]
        },
        {
            "name": "文化娱乐",
            "color": "#06b6d4",
            "keywords": ["娱乐", "电影", "游戏", "视频", "音乐", "会员", "美团", "大麦网", "景区", "博物馆", "故宫", "陕西自然博物馆", "TOI", "拼图", "演出"]
        },
        {
            "name": "母婴亲子",
            "color": "#f97316",
            "keywords": ["母婴", "亲子", "儿童", "早教", "培训", "教育", "斑马", "巧虎", "贝亲", "babycare", "保姆鹅"]
        },
        {
            "name": "转账收入",
            "color": "#64748b",
            "keywords": ["转账", "红包", "收款", "退款", "提现", "群红包", "单发"]
        }
    ]'::jsonb
);

-- ============================================================
-- 5. bill_records — 统一账单记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS bill_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_id UUID REFERENCES bill_files(id) ON DELETE SET NULL,

    platform TEXT NOT NULL CHECK (platform IN ('alipay', 'wechat', 'douyin')),
    original_merchant TEXT NOT NULL DEFAULT '',
    original_product TEXT,
    original_category TEXT,

    trans_time TIMESTAMPTZ NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    direction TEXT NOT NULL DEFAULT '支出' CHECK (direction IN ('支出', '收入', '不计收支')),

    category_id UUID REFERENCES categories(id),
    classification_method TEXT DEFAULT 'auto' CHECK (classification_method IN ('auto', 'manual')),

    platform_order_no TEXT,
    merchant_order_no TEXT,
    raw_extra JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_records_user_time ON bill_records(user_id, trans_time DESC);
CREATE INDEX idx_records_category ON bill_records(category_id);
CREATE INDEX idx_records_platform ON bill_records(platform);
CREATE INDEX idx_records_user_platform_order ON bill_records(user_id, platform, platform_order_no) WHERE platform_order_no IS NOT NULL AND platform_order_no != '';

ALTER TABLE bill_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "records_manage_own" ON bill_records
    FOR ALL USING (auth.uid()::text = user_id::text);

-- ============================================================
-- 6. manual_overrides — 手动修正记录
-- ============================================================
CREATE TABLE IF NOT EXISTS manual_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    record_id UUID NOT NULL REFERENCES bill_records(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_override_record ON manual_overrides(record_id);

ALTER TABLE manual_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "overrides_manage_own" ON manual_overrides
    FOR ALL USING (
        auth.uid()::text = (SELECT user_id FROM bill_records WHERE id = bill_records.id)::text
    );

-- ============================================================
-- 7. 统计物化视图（可选，提升查询性能）
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_stats AS
SELECT
    u.id AS user_id,
    u.name AS user_name,
    c.parent_id AS parent_cat_id,
    c.name AS parent_cat_name,
    c.color AS parent_cat_color,
    date_trunc('month', br.trans_time) AS month,
    br.platform,
    COUNT(*) AS tx_count,
    SUM(br.amount) AS total_amount
FROM bill_records br
JOIN users u ON u.id = br.user_id
LEFT JOIN categories c ON c.id = br.category_id
WHERE br.direction = '支出'
GROUP BY u.id, u.name, c.parent_id, c.name, c.color, month, br.platform
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_monthly_stats ON mv_monthly_stats(user_id, month, platform, parent_cat_id);

REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_stats;

-- 创建触发器函数自动刷新物化视图
CREATE OR REPLACE FUNCTION refresh_mv_monthly_stats()
RETURNS TRIGGER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_stats;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_refresh_stats ON bill_records;
CREATE TRIGGER trg_refresh_stats
    AFTER INSERT OR UPDATE OR DELETE ON bill_records
    FOR STATEMENT EXECUTE FUNCTION refresh_mv_monthly_stats();
