# 飞书支持数据管线（Feishu Support Pipeline）

这是一个通用版的飞书 / Lark 客服数据管线，用来把客服知识从飞书文档和飞书 Messenger 话题线程中同步到本地，并进一步生成可复用的每日客服日志、FAQ 或内部复盘初稿。

本仓库是三仓库开源示例中的第三部分：

1. 客服前端 + bridge：<https://github.com/zenenznze/support-agent-frontend>
2. OpenClaw 客服后端示例：<https://github.com/zenenznze/openclaw-support-example>
3. 飞书 / Lark 数据管线：本仓库

## 这个仓库解决什么问题

客服系统通常需要两类材料：

- 静态知识：飞书 Wiki / Doc 中的产品文档、FAQ、操作说明。
- 动态问题：客服群、用户服务群、支持群里每天出现的真实问题。

本仓库提供一套通用管线：

1. 递归同步飞书 / Lark Wiki 文档。
2. 抓取飞书 Messenger 当前可见的聊天 / 话题线程。
3. 用增量判断脚本决定是否需要触发后续分析。
4. 基于抓到的线程生成每日客服日志、FAQ 或内部复盘初稿。
5. 将生成结果放在 `local-data/` 下，供人工复核后再进入知识库或客服机器人。

## 已包含内容

- 通用版飞书 / Lark Wiki 递归同步脚本：`scripts/sync_lark_docs.py`
- 通用版飞书 Messenger 话题线程抓取脚本：`scripts/crawl_feishu_threads.mjs`
- Playwright 抓取后端：`scripts/crawl_feishu_threads_playwright.mjs`
- CDP / Playwright 参数解析与选择：`scripts/browser_backend.mjs`
- 线程存储、去重、格式化工具：`scripts/thread_store.mjs`
- 增量判断脚本：`scripts/analysis_gate.mjs`
- 每日客服日志 / FAQ / 内部复盘生成脚本：`scripts/generate_daily_support_log.mjs`
- 仓库内置 skill 文档：`skills/feishu-support-pipeline/SKILL.md`
- 示例配置和假样例输出
- 安全与隐私说明

## 不包含内容

本仓库已经按公开模板处理，不包含：

- 真实飞书租户域名
- 真实 Wiki token、App Secret、用户 token
- 浏览器 cookies、localStorage、sessionStorage
- 真实聊天记录、客户内容、截图、私有文档
- 私有客服群名、内部成员名、本地私有路径
- 生产环境配置

所有真实输出都应写入 `local-data/`。该目录已被 `.gitignore` 忽略。

## 环境准备

### 1. 安装 Node 依赖

```bash
npm install
npx playwright install chromium
```

### 2. 准备环境变量

```bash
cp .env.example .env
```

按需修改：

```bash
# 飞书 / Lark 文档同步
LARK_WIKI_ROOT_TOKEN=your-wiki-root-token
LARK_WIKI_BASE_URL=https://your-tenant.feishu.cn/wiki/
LARK_SYNC_OUTDIR=local-data/wiki-sync

# 飞书 Messenger 抓取
FEISHU_MESSENGER_URL=https://your-tenant.feishu.cn/next/messenger/
FEISHU_COOKIES_FILE=local-data/feishu-cookies.json
FEISHU_CDP_CLIENT=/path/to/cdp-client.mjs
```

## 流程一：同步飞书 / Lark Wiki 文档

```bash
python3 scripts/sync_lark_docs.py \
  --root-token "$LARK_WIKI_ROOT_TOKEN" \
  --wiki-base-url "$LARK_WIKI_BASE_URL" \
  --outdir local-data/wiki-sync
```

适用场景：

- 同步客服知识库
- 同步产品文档
- 把飞书 Wiki 内容导出为本地文件，后续再做清洗、切片或索引

注意：

- 不要把真实同步结果提交到 Git。
- 不要把真实 Wiki token 写进配置文件提交。

## 流程二：抓取飞书 Messenger 聊天 / 话题线程

本仓库提供两种浏览器模式。

### 方式 A：Playwright + cookies

适合做通用演示或自动化环境。

```bash
node scripts/crawl_feishu_threads.mjs \
  --browser-mode playwright \
  --cookies local-data/feishu-cookies.json \
  --target-url https://your-tenant.feishu.cn/next/messenger/ \
  --output local-data/thread-crawl/latest.md \
  --append-if-new local-data/thread-crawl/raw.md \
  --report local-data/thread-crawl/report.json
```

### 方式 B：复用已登录浏览器的 CDP 会话

适合本机已经打开并登录飞书的场景。你需要提供一个可用的 CDP client，并确保浏览器启动了 remote debugging。

```bash
node scripts/crawl_feishu_threads.mjs \
  --browser-mode cdp \
  --cdp-client /path/to/cdp-client.mjs \
  --output local-data/thread-crawl/latest.md \
  --append-if-new local-data/thread-crawl/raw.md \
  --report local-data/thread-crawl/report.json
```

抓取结果说明：

- `latest.md`：本次可见范围内抓到的线程。
- `raw.md`：长期累计的线程库，按 thread key 去重更新。
- `report.json`：本次抓取报告，包括可见线程数、新增线程数、更新线程数和错误列表。

重要限制：

- 该脚本抓取的是前端当前可加载 / 可见范围内的线程，不等同于飞书服务端绝对全量历史。
- 如果要做完整历史归档，需要先在飞书主消息区滚动到目标时间范围，再分批抓取。
- 抓取后仍需人工复核，尤其是客户隐私、订单号、账号、截图链接和内部口径。

## 流程三：判断是否需要分析

抓取后先运行 analysis gate，避免没有新增内容时重复触发后续分析。

```bash
node scripts/analysis_gate.mjs \
  --raw local-data/thread-crawl/raw.md \
  --state local-data/thread-crawl/analysis-state.json \
  --crawl-report local-data/thread-crawl/report.json
```

返回结果中的关键字段：

- `should_analyze: true`：有新的未分析线程，可以继续生成日志或 FAQ。
- `should_analyze: false`：没有新的未分析增量，通常无需重复分析。

当你确认本轮已经分析完，可以标记状态：

```bash
node scripts/analysis_gate.mjs \
  --raw local-data/thread-crawl/raw.md \
  --state local-data/thread-crawl/analysis-state.json \
  --crawl-report local-data/thread-crawl/report.json \
  --mark-analyzed
```

## 流程四：生成每日客服日志 / FAQ / 内部复盘

新增脚本：

```bash
scripts/generate_daily_support_log.mjs
```

它可以读取两类输入：

1. 聚合文件：`local-data/thread-crawl/raw.md`
2. 某一天的 thread 文件目录：`local-data/thread-crawl/by-date/YYYY-MM-DD/thread-files/`

### 生成 FAQ 初稿

```bash
node scripts/generate_daily_support_log.mjs \
  --input local-data/thread-crawl/raw.md \
  --date 2026-01-01 \
  --mode faq \
  --product-name 你的产品名 \
  --output local-data/support-logs/2026-01-01-faq.md
```

### 生成每日客服日志

```bash
node scripts/generate_daily_support_log.mjs \
  --input local-data/thread-crawl/raw.md \
  --date 2026-01-01 \
  --mode log \
  --product-name 你的产品名 \
  --output local-data/support-logs/2026-01-01-log.md
```

### 生成内部复盘

```bash
node scripts/generate_daily_support_log.mjs \
  --input local-data/thread-crawl/raw.md \
  --date 2026-01-01 \
  --mode retro \
  --product-name 你的产品名 \
  --output local-data/support-logs/2026-01-01-retro.md
```

### 从某一天的 thread-files 目录生成

```bash
node scripts/generate_daily_support_log.mjs \
  --threads-dir local-data/thread-crawl/by-date/2026-01-01/thread-files \
  --date 2026-01-01 \
  --mode faq \
  --product-name 你的产品名 \
  --output local-data/support-logs/2026-01-01-faq.md
```

输出定位：

- `faq`：适合沉淀成可复用标准问答。
- `log`：适合写每日客服日志，关注当天问题概览、分类和改进方向。
- `retro`：适合内部复盘，关注共性根因、用户体验风险和建议动作。

这个脚本生成的是“可编辑初稿”，不是最终客服口径。发布前必须人工复核。

## 推荐日常工作流

```bash
# 1. 抓取当天或当前可见范围内的飞书话题线程
node scripts/crawl_feishu_threads.mjs \
  --browser-mode playwright \
  --cookies local-data/feishu-cookies.json \
  --target-url "$FEISHU_MESSENGER_URL" \
  --output local-data/thread-crawl/latest.md \
  --append-if-new local-data/thread-crawl/raw.md \
  --report local-data/thread-crawl/report.json

# 2. 判断是否有新增内容需要分析
node scripts/analysis_gate.mjs \
  --raw local-data/thread-crawl/raw.md \
  --state local-data/thread-crawl/analysis-state.json \
  --crawl-report local-data/thread-crawl/report.json

# 3. 如果 should_analyze 为 true，生成每日 FAQ 或客服日志初稿
node scripts/generate_daily_support_log.mjs \
  --input local-data/thread-crawl/raw.md \
  --date 2026-01-01 \
  --mode faq \
  --product-name 你的产品名 \
  --output local-data/support-logs/2026-01-01-faq.md

# 4. 人工复核、脱敏、修正产品规则后，再进入知识库或对外发布
```

## 示例文件

- `configs/thread-crawl.example.json`：聊天线程抓取配置示例
- `configs/wiki-sync.example.json`：Wiki 同步配置示例
- `configs/daily-log.example.json`：每日客服日志生成配置示例
- `examples/thread-report.sample.json`：抓取报告假样例
- `examples/thread-raw.sample.md`：线程聚合文件假样例

你可以用假样例直接测试日志生成：

```bash
node scripts/generate_daily_support_log.mjs \
  --input examples/thread-raw.sample.md \
  --date 2026-01-01 \
  --mode faq \
  --product-name 示例产品 \
  --output /tmp/feishu-support-sample-faq.md
```

## 安全与隐私

请始终遵守：

- 真实 cookies、token、secret 只能放在本地 `.env` 或 `local-data/`，不要提交。
- 真实聊天记录、截图、客户标识、订单号、账号信息不要提交。
- 对外发布日志或 FAQ 前，必须先做脱敏和人工复核。
- 如果你要把生成结果喂给客服机器人，建议只喂经过复核的版本，不要直接使用原始聊天记录。

更多说明见：`docs/security-and-privacy.md`

## 校验

```bash
npm run check
python3 -m py_compile scripts/sync_lark_docs.py
```

## License

MIT
