#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { FEISHU_FEED_CARD_SELECTOR, FEISHU_THREAD_PANEL_BODY_SELECTOR, FEISHU_THREAD_PANEL_SELECTOR, normalizePlaywrightCookies } from './browser_backend.mjs';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function loadCookies(file) { return normalizePlaywrightCookies(JSON.parse(await readFile(file, 'utf8'))); }

async function getVisibleThreads(page) {
  return page.evaluate((selector) => Array.from(document.querySelectorAll(selector)).map((node, idx) => {
    const lines = (node.innerText || '').trim().split('\n').map(s => s.trim()).filter(Boolean);
    return { idx, name: lines[0] || '?', content: lines.slice(1).join(' / ') };
  }).slice(0, 80), FEISHU_FEED_CARD_SELECTOR);
}

async function waitForFeed(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
  await page.locator(FEISHU_FEED_CARD_SELECTOR).first().waitFor({ state: 'visible', timeout: 45000 });
}

async function readPanelForEntry(page, entry) {
  const panel = page.locator(FEISHU_THREAD_PANEL_BODY_SELECTOR);
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator(FEISHU_FEED_CARD_SELECTOR).nth(entry.idx).click({ timeout: 5000 });
    await page.locator(FEISHU_THREAD_PANEL_SELECTOR).waitFor({ state: 'visible', timeout: 10000 });
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    await sleep(1000 + attempt * 400);
    const panelText = await panel.innerText();
    if (panelText) return panelText;
  }
  throw new Error(`Thread sidebar did not refresh for card ${entry.idx}`);
}

async function main() {
  const config = JSON.parse(process.argv[2] || '{}');
  if (!config.cookies) throw new Error('Playwright mode requires --cookies <exported-feishu-cookies.json>');
  const browser = await chromium.launch({ headless: config.headless !== false });
  try {
    const context = await browser.newContext();
    await context.addCookies(await loadCookies(config.cookies));
    const page = await context.newPage();
    await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded' });
    await waitForFeed(page);
    const visible = await getVisibleThreads(page);
    const panels = [];
    const errors = [];
    for (const item of visible) {
      try { panels.push({ idx: item.idx, name: item.name, panelText: await readPanelForEntry(page, item) }); }
      catch (error) { errors.push({ idx: item.idx, name: item.name, error: error.message || String(error) }); }
    }
    console.log(JSON.stringify({ backend: 'playwright', targetUrl: page.url(), visibleThreads: visible.length, panels, errors }));
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch(error => { console.error(error.stack || String(error)); process.exit(1); });
