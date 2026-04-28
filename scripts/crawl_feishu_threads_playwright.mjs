#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { DEFAULT_SELECTORS, normalizePlaywrightCookies } from './browser_backend.mjs';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function loadCookies(file) { return normalizePlaywrightCookies(JSON.parse(await readFile(file, 'utf8'))); }
function selectorsFromConfig(config) { return { ...DEFAULT_SELECTORS, ...(config.selectors || {}) }; }

async function clickChatByName(page, selectors, chatName) {
  if (!chatName) return { selected: false, reason: 'chat-name-not-provided' };
  const result = await page.evaluate(({ selector, chatName }) => {
    const nodes = Array.from(document.querySelectorAll(selector));
    const match = nodes.find(node => (node.innerText || '').includes(chatName));
    if (!match) return { selected: false, reason: 'chat-not-found', visibleItems: nodes.slice(0, 20).map(node => (node.innerText || '').trim().split('\n')[0]).filter(Boolean) };
    match.click();
    return { selected: true, reason: 'matched-chat-name' };
  }, { selector: selectors.chatListItem, chatName });
  await page.waitForTimeout(1800);
  return result;
}

async function getVisibleThreads(page, selectors, maxThreads) {
  return page.evaluate(({ selector, maxThreads }) => Array.from(document.querySelectorAll(selector)).map((node, idx) => {
    const lines = (node.innerText || '').trim().split('\n').map(s => s.trim()).filter(Boolean);
    return { idx, name: lines[0] || '?', content: lines.slice(1).join(' / ') };
  }).slice(0, maxThreads), { selector: selectors.threadCard, maxThreads });
}

async function waitForFeed(page, selectors) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
  await page.locator(selectors.threadCard).first().waitFor({ state: 'visible', timeout: 45000 });
}

async function readPanelForEntry(page, selectors, entry) {
  const panel = page.locator(selectors.threadPanelBody);
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator(selectors.threadCard).nth(entry.idx).click({ timeout: 5000 });
    await page.locator(selectors.threadPanel).waitFor({ state: 'visible', timeout: 10000 });
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
    const selectors = selectorsFromConfig(config);
    const context = await browser.newContext();
    await context.addCookies(await loadCookies(config.cookies));
    const page = await context.newPage();
    await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded' });
    const chatSelection = await clickChatByName(page, selectors, config.chatName || '');
    await waitForFeed(page, selectors);
    const visible = await getVisibleThreads(page, selectors, config.maxThreads || 80);
    const panels = [];
    const errors = [];
    for (const item of visible) {
      try { panels.push({ idx: item.idx, name: item.name, panelText: await readPanelForEntry(page, selectors, item) }); }
      catch (error) { errors.push({ idx: item.idx, name: item.name, error: error.message || String(error) }); }
    }
    console.log(JSON.stringify({ backend: 'playwright', targetUrl: page.url(), chatSelection, selectors, visibleThreads: visible.length, panels, errors }));
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch(error => { console.error(error.stack || String(error)); process.exit(1); });
