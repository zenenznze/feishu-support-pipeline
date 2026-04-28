# 飞书 Messenger 抓取器适配说明

这个仓库里的 Messenger 抓取器是通用模板，不是“任何飞书租户都开箱即用”的承诺。

原因很简单：飞书 / Lark 的前端 DOM、会话列表结构、话题侧边栏结构，会随着租户、语言、客户端版本和灰度发布变化。真实项目里通常需要先跑通一次，再把“目标网页、目标群聊、关键选择器、滚动范围、日期范围”固化为本地配置。

## 通用逻辑和项目配置的边界

通用逻辑包括：

1. 打开 Messenger 页面。
2. 可选：按群聊名称点击目标会话。
3. 找到当前页面可见的话题 / thread 卡片。
4. 逐个点击 thread 卡片。
5. 从右侧 thread 面板读取完整文本。
6. 解析首条时间、首条发送者、首条正文和完整线程。
7. 按 thread key 增量去重。
8. 生成抓取报告，供 analysis gate 判断是否需要后续分析。

需要每个项目自行确认的部分包括：

1. `--target-url`：具体飞书 / Lark Messenger 地址。
2. `--chat-name`：目标客服群、用户群或支持群名称。
3. `--chat-list-item-selector`：左侧会话列表项选择器。
4. `--thread-card-selector`：中间主消息区或话题列表中的 thread 卡片选择器。
5. `--thread-panel-selector`：右侧 thread 详情面板选择器。
6. `--thread-panel-body-selector`：右侧 thread 正文滚动区选择器。
7. 抓取前是否需要手动滚动到某个日期范围。
8. 是否要从“当前可见范围”抓，还是分批滚动后多次抓。

## 推荐适配流程

### 1. 先用可见范围小批量测试

```bash
node scripts/crawl_feishu_threads.mjs \
  --browser-mode playwright \
  --cookies local-data/feishu-cookies.json \
  --target-url https://your-tenant.feishu.cn/next/messenger/ \
  --chat-name "your support group name" \
  --max-threads 5 \
  --output local-data/thread-crawl/latest.md \
  --append-if-new local-data/thread-crawl/raw.md \
  --report local-data/thread-crawl/report.json
```

先确认：

- `report.json` 里的 `chat_selection.selected` 是否为 `true`。
- `visible_threads` 是否大于 0。
- `captured_threads` 是否大于 0。
- `errors` 是否为空或可解释。
- `latest.md` 中是否真的出现了目标群的 thread 内容。

### 2. 如果没有选中目标群聊

调整：

```bash
--chat-name "目标群聊名称"
--chat-list-item-selector "你的会话列表项选择器"
```

如果 `chat_selection.reason` 是 `chat-not-found`，可以查看 `visibleItems`，判断当前页面是不是没有加载到目标会话，或者选择器选错了区域。

### 3. 如果 visible_threads 为 0

调整：

```bash
--thread-card-selector "你的 thread 卡片选择器"
```

你需要在浏览器 DevTools 里确认真正的 thread root / 话题卡片节点，而不是左侧会话摘要、系统卡片或普通消息节点。

### 4. 如果能点击但读不到正文

调整：

```bash
--thread-panel-selector "你的右侧 thread 面板选择器"
--thread-panel-body-selector "你的右侧 thread 正文选择器"
```

正确的正文区通常是右侧详情面板里的滚动容器，而不是中间主消息区的摘要文本。

### 5. 如果要抓历史日期

通用脚本不会自动承诺“服务端全量历史”。它只抓当前前端已经加载出来的内容。

如果要抓历史：

1. 先在飞书主消息区滚动到目标日期附近。
2. 确认目标日期的 thread 卡片已经进入 DOM。
3. 再运行抓取脚本。
4. 如果跨度很长，按日期分批运行，并保留每次的 `report.json`。

## CLI 参数速查

```bash
--target-url                     飞书 / Lark Messenger URL
--chat-name                      目标群聊名称，用于从会话列表中点击目标群
--max-threads                    本次最多处理多少个可见 thread
--chat-list-item-selector         会话列表项 CSS selector
--thread-card-selector            thread 卡片 CSS selector
--thread-panel-selector           右侧 thread 面板 CSS selector
--thread-panel-body-selector      右侧 thread 正文 CSS selector
```

也可以用环境变量：

```bash
FEISHU_TARGET_CHAT_NAME="your support group name"
FEISHU_MAX_THREADS=80
FEISHU_CHAT_LIST_ITEM_SELECTOR="..."
FEISHU_THREAD_CARD_SELECTOR="..."
FEISHU_THREAD_PANEL_SELECTOR="..."
FEISHU_THREAD_PANEL_BODY_SELECTOR="..."
```

## 生产建议

- 不要把本地项目的真实群聊名、租户域名、cookies、截图和客户记录提交到公开仓库。
- 把项目专用配置放到 `.env`、私有配置仓库或部署平台 Secret 中。
- 抓取完成后先看 report，再决定是否生成日志或 FAQ。
- 对外发布任何客服日志前，都需要人工脱敏和复核。
