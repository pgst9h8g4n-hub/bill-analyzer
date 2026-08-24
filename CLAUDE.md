# CLAUDE.md — 小六记

本项目是一个每日消费记账应用，帮助用户记录和分析日常支出。

## Agent skills

### Issue tracker

Issues 和 PRD 使用 GitHub Issues 管理，通过 `gh` CLI 操作。See `docs/agents/issue-tracker.md`.

### Triage labels

使用五类标准 triage 标签：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。See `docs/agents/triage-labels.md`.

### Domain docs

单上下文仓库，文档位于根目录的 `CONTEXT.md` 和 `docs/adr/`。See `docs/agents/domain.md`.

## 项目规范

### 交流原则
- 与用户的所有交流**只用中文**
- **简洁直接，不绕弯子**
- 不清楚需求时**主动确认**，不猜测执行

### 目录结构
- `Docs/` — 存放需求文档、技术设计、执行计划
- `开发日志/` — 按日期记录开发日志（格式：`开发日志/YYYY-MM-DD.md`）
- `docs/adr/` — 架构决策记录
- `src/` — 源代码

### 开发流程
1. 先整理需求，不确定的地方逐一确认
2. 分步规划，每次只做适量工作
3. 逐步执行，保证项目稳定推进

### 安全规范
涉及敏感操作（文件删除、支付相关、密码/密钥调用、网络请求含敏感数据、系统权限变更、不可逆操作）必须先说明用途并征得用户确认。
