# Feishu Support Pipeline

Generic Feishu/Lark data pipeline for support-agent workflows.

This repository is one part of a three-repository sharing/demo set:

1. Frontend + bridge: https://github.com/zenenznze/support-agent-frontend
2. OpenClaw support example: https://github.com/zenenznze/openclaw-support-example
3. Feishu/Lark data pipeline: this repository

## What is included

- Recursive Feishu/Lark wiki document sync using `lark-cli`.
- Feishu Messenger visible thread crawler using either CDP or Playwright cookies.
- Increment/analysis gate utility so downstream analysis only runs when truly new support threads appear.
- In-repository skill docs for using the pipeline.
- Fake sample configs and outputs only.

## What is intentionally excluded

- Real Feishu tenant domains, wiki tokens, app secrets, cookies, and chat data.
- Private synced documents or customer support messages.
- Generated crawl outputs and analysis results.

## Quick start

```bash
cp .env.example .env
python3 scripts/sync_lark_docs.py   --root-token YOUR_WIKI_NODE_TOKEN   --wiki-base-url https://your-tenant.feishu.cn/wiki/   --outdir local-data/wiki-sync

npm install
npx playwright install chromium
node scripts/crawl_feishu_threads.mjs   --browser-mode playwright   --cookies local-data/feishu-cookies.json   --target-url https://your-tenant.feishu.cn/next/messenger/   --output local-data/thread-crawl/latest.md   --append-if-new local-data/thread-crawl/raw.md   --report local-data/thread-crawl/report.json
```

`local-data/` is ignored by git.
