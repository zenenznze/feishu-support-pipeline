---
name: feishu-support-pipeline
description: 通用飞书 / Lark 客服数据管线，用于同步 Wiki 文档、抓取 Messenger 话题线程，并生成每日客服日志、FAQ 或内部复盘初稿。
---

# Feishu Support Pipeline Skill

当任务涉及“刷新客服知识库”“抓取飞书支持群话题”“根据聊天记录生成每日客服日志 / FAQ / 复盘”时使用本 skill。

## 基本原则

- 真实数据只写入 `local-data/`，不要提交到 Git。
- 公开仓库中只能保留假样例、通用配置和脱敏说明。
- 飞书聊天抓取只能代表当前前端可加载 / 可见范围，不等同于服务端绝对全量历史。
- 日志、FAQ、复盘生成结果只是初稿，发布前必须人工复核产品规则和敏感信息。

## 1. 同步飞书 / Lark Wiki 文档

```bash
python3 scripts/sync_lark_docs.py \
  --root-token "$LARK_WIKI_ROOT_TOKEN" \
  --wiki-base-url "$LARK_WIKI_BASE_URL" \
  --outdir local-data/wiki-sync
```

适合：同步客服知识库、产品文档、内部 FAQ。

## 2. 抓取飞书 Messenger 聊天 / 话题线程

### Playwright + cookies 模式

```bash
node scripts/crawl_feishu_threads.mjs \
  --browser-mode playwright \
  --cookies local-data/feishu-cookies.json \
  --target-url "$FEISHU_MESSENGER_URL" \
  --output local-data/thread-crawl/latest.md \
  --append-if-new local-data/thread-crawl/raw.md \
  --report local-data/thread-crawl/report.json
```

### CDP 复用已登录浏览器模式

```bash
node scripts/crawl_feishu_threads.mjs \
  --browser-mode cdp \
  --cdp-client "$FEISHU_CDP_CLIENT" \
  --output local-data/thread-crawl/latest.md \
  --append-if-new local-data/thread-crawl/raw.md \
  --report local-data/thread-crawl/report.json
```

输出：

- `latest.md`：本次抓取内容
- `raw.md`：累计线程库，按 thread key 去重
- `report.json`：抓取报告，包含新增和更新数量

## 3. 增量判断

```bash
node scripts/analysis_gate.mjs \
  --raw local-data/thread-crawl/raw.md \
  --state local-data/thread-crawl/analysis-state.json \
  --crawl-report local-data/thread-crawl/report.json
```

只有当输出中 `should_analyze: true` 时，才继续生成日志、FAQ 或复盘。

分析完成后标记：

```bash
node scripts/analysis_gate.mjs \
  --raw local-data/thread-crawl/raw.md \
  --state local-data/thread-crawl/analysis-state.json \
  --crawl-report local-data/thread-crawl/report.json \
  --mark-analyzed
```

## 4. 生成每日客服日志 / FAQ / 内部复盘

### FAQ 初稿

```bash
node scripts/generate_daily_support_log.mjs \
  --input local-data/thread-crawl/raw.md \
  --date 2026-01-01 \
  --mode faq \
  --product-name 你的产品名 \
  --output local-data/support-logs/2026-01-01-faq.md
```

### 每日客服日志

```bash
node scripts/generate_daily_support_log.mjs \
  --input local-data/thread-crawl/raw.md \
  --date 2026-01-01 \
  --mode log \
  --product-name 你的产品名 \
  --output local-data/support-logs/2026-01-01-log.md
```

### 内部复盘

```bash
node scripts/generate_daily_support_log.mjs \
  --input local-data/thread-crawl/raw.md \
  --date 2026-01-01 \
  --mode retro \
  --product-name 你的产品名 \
  --output local-data/support-logs/2026-01-01-retro.md
```

也可以从某一天的 thread-files 目录生成：

```bash
node scripts/generate_daily_support_log.mjs \
  --threads-dir local-data/thread-crawl/by-date/2026-01-01/thread-files \
  --date 2026-01-01 \
  --mode faq \
  --product-name 你的产品名 \
  --output local-data/support-logs/2026-01-01-faq.md
```

## 5. 推荐日常流程

1. 抓取飞书 Messenger 话题线程。
2. 运行 analysis gate 判断是否有新增内容。
3. 有新增时生成 FAQ / 日志 / 复盘初稿。
4. 人工复核、脱敏、修正口径。
5. 将复核后的内容写回客服知识库或交给 support agent 使用。

## 6. 发布前检查

- 不包含真实 cookies、token、secret。
- 不包含真实租户域名、客户名、订单号、账号、截图链接。
- 不包含私有群名、内部成员名、本地私有路径。
- 所有价格、套餐、权限、模型、SLA、退款、发票口径都经过人工复核。

## 7. 校验命令

```bash
npm run check
python3 -m py_compile scripts/sync_lark_docs.py
```
