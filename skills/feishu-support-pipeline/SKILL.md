---
name: feishu-support-pipeline
description: Generic Feishu/Lark support data pipeline for wiki document sync and visible Messenger thread crawling.
---

# Feishu Support Pipeline Skill

Use this skill when you need to refresh support-agent knowledge from Feishu/Lark.

## Document sync

```bash
python3 scripts/sync_lark_docs.py   --root-token "$LARK_WIKI_ROOT_TOKEN"   --wiki-base-url "$LARK_WIKI_BASE_URL"   --outdir local-data/wiki-sync
```

## Chat/thread crawl

```bash
node scripts/crawl_feishu_threads.mjs   --browser-mode playwright   --cookies local-data/feishu-cookies.json   --target-url "$FEISHU_MESSENGER_URL"   --output local-data/thread-crawl/latest.md   --append-if-new local-data/thread-crawl/raw.md   --report local-data/thread-crawl/report.json
```

## Analysis gate

Run downstream analysis only if the gate says `should_analyze: true`, and only after the operator asks for analysis.

```bash
node scripts/analysis_gate.mjs   --raw local-data/thread-crawl/raw.md   --state local-data/thread-crawl/analysis-state.json   --crawl-report local-data/thread-crawl/report.json
```
