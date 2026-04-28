#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatThreadRecord, parseThreadPanelText, upsertThreadRecord } from './thread_store.mjs';
import { FEISHU_FEED_CARD_SELECTOR, FEISHU_THREAD_PANEL_BODY_SELECTOR, parseCrawlerArgs, resolveBrowserMode } from './browser_backend.mjs';

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

async function fileText(file) { try { return await readFile(file, 'utf8'); } catch { return ''; } }
async function runNode(args) { const { stdout } = await execFileAsync('node', args, { maxBuffer: 1024 * 1024 * 8 }); return stdout.trim(); }
async function evalExpr(cdpClient, targetId, expr) { return runNode([cdpClient, 'eval', targetId, expr]); }
async function sleep(ms) { await new Promise(resolve => setTimeout(resolve, ms)); }
function parseJsonish(out, fallback) { if (!out || !out.trim()) return fallback; try { const first = JSON.parse(out); return typeof first === 'string' ? JSON.parse(first) : first; } catch { return fallback; } }
function nowText() { return new Date().toISOString(); }

async function listTabs(cdpClient) {
  const out = await runNode([cdpClient, 'list']);
  return out.split('\n').map(line => line.trim()).filter(Boolean);
}

function findFeishuTarget(lines) {
  const line = lines.find(item => item.includes('feishu.cn/next/messenger') || item.includes('larksuite.com/next/messenger'));
  if (!line) throw new Error('Feishu/Lark Messenger tab not found in CDP list');
  return line.split(/\s+/)[0];
}

async function getVisibleThreads(cdpClient, targetId) {
  const expr = `(() => JSON.stringify(Array.from(document.querySelectorAll(${JSON.stringify(FEISHU_FEED_CARD_SELECTOR)})).map((m, i) => ({idx:i,name:((m.innerText||'').trim().split('\\n')[0]||'?')})).slice(0,80)))()`;
  return parseJsonish(await evalExpr(cdpClient, targetId, expr), []);
}

async function clickThread(cdpClient, targetId, idx) {
  const expr = `(() => { const msgs = Array.from(document.querySelectorAll(${JSON.stringify(FEISHU_FEED_CARD_SELECTOR)})); const msg = msgs[${idx}]; if (!msg) return 'missing'; msg.click(); return 'clicked'; })()`;
  return evalExpr(cdpClient, targetId, expr);
}

async function getThreadPanel(cdpClient, targetId) {
  const expr = `(() => { const panel = document.querySelector(${JSON.stringify(FEISHU_THREAD_PANEL_BODY_SELECTOR)}); if (!panel) return JSON.stringify({ ok: false, error: 'no-thread-panel' }); return JSON.stringify({ ok: true, innerText: (panel.innerText || '').trim() }); })()`;
  return parseJsonish(await evalExpr(cdpClient, targetId, expr), { ok: false, error: 'empty' });
}

async function collectViaCdp(args) {
  const targetId = findFeishuTarget(await listTabs(args.cdpClient));
  const visible = await getVisibleThreads(args.cdpClient, targetId);
  const panels = [];
  const errors = [];
  for (const item of visible) {
    const clicked = await clickThread(args.cdpClient, targetId, item.idx);
    if (!String(clicked).includes('clicked')) { errors.push({ idx: item.idx, name: item.name, error: clicked || 'click-failed' }); continue; }
    let panel = { ok: false, error: 'panel-error' };
    for (let attempt = 0; attempt < 3; attempt++) { await sleep(1200 + attempt * 400); panel = await getThreadPanel(args.cdpClient, targetId); if (panel.ok) break; }
    if (!panel.ok) errors.push({ idx: item.idx, name: item.name, error: panel.error || 'panel-error' });
    else panels.push({ idx: item.idx, name: item.name, panelText: panel.innerText || '' });
    await sleep(250);
  }
  return { backend: 'cdp', target: targetId, visibleThreads: visible.length, panels, errors };
}

async function collectViaPlaywright(args) {
  const workerPath = path.join(SCRIPT_DIR, 'crawl_feishu_threads_playwright.mjs');
  const payload = JSON.stringify({ cookies: args.cookies, targetUrl: args.targetUrl, headless: args.headless });
  const { stdout } = await execFileAsync('node', [workerPath, payload], { cwd: path.dirname(SCRIPT_DIR), maxBuffer: 1024 * 1024 * 16 });
  return JSON.parse(stdout.trim());
}

async function upsertRawStore(targetPath, records, report) {
  let raw = await fileText(targetPath);
  for (const record of records) {
    const existed = raw.includes(`- Thread key: ${record.threadKey}`) || raw.includes(`- 线程键：${record.threadKey}`);
    raw = upsertThreadRecord(raw, record);
    if (existed) report.updated_threads += 1; else report.new_threads += 1;
  }
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, raw, 'utf8');
}

async function main() {
  const args = parseCrawlerArgs(process.argv.slice(2));
  const browserMode = resolveBrowserMode(args);
  const collected = browserMode === 'playwright' ? await collectViaPlaywright(args) : await collectViaCdp(args);
  const records = [];
  const errors = [...(collected.errors || [])];
  for (const panel of collected.panels || []) {
    try { records.push(parseThreadPanelText(panel.panelText || '', { crawlTime: nowText() })); }
    catch (error) { errors.push({ idx: panel.idx, name: panel.name, error: error.message || String(error) }); }
  }
  const markdown = records.map(formatThreadRecord).join('\n');
  const report = { created_at: new Date().toISOString(), backend: browserMode, output: args.output, append_target: args.append || args.appendIfNew || '', target_tab: collected.target || '', target_url: collected.targetUrl || args.targetUrl || '', visible_threads: collected.visibleThreads || 0, captured_threads: records.length, new_threads: 0, updated_threads: 0, is_new_increment: false, appended: false, errors };
  await mkdir(path.dirname(args.output), { recursive: true });
  await writeFile(args.output, markdown ? `${markdown}\n` : '', 'utf8');
  if (args.append) { await upsertRawStore(args.append, records, report); report.is_new_increment = report.new_threads > 0; }
  if (args.appendIfNew) { await upsertRawStore(args.appendIfNew, records, report); report.is_new_increment = report.new_threads > 0; report.appended = true; }
  if (args.report) { await mkdir(path.dirname(args.report), { recursive: true }); await writeFile(args.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); }
  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => { console.error(err.stack || String(err)); process.exit(1); });
