export const DEFAULT_OUTPUT = 'local-data/thread-crawl/latest.md';
export const DEFAULT_PLAYWRIGHT_TARGET_URL = process.env.FEISHU_MESSENGER_URL || 'https://your-tenant.feishu.cn/next/messenger/';
export const DEFAULT_CDP_CLIENT = process.env.FEISHU_CDP_CLIENT || 'cdp-client.mjs';

export const DEFAULT_SELECTORS = {
  // Feishu/Lark changes DOM class names over time. These defaults are only a starting point.
  // For a real tenant, override them with CLI flags or environment variables after inspecting the page.
  chatListItem: process.env.FEISHU_CHAT_LIST_ITEM_SELECTOR || '.feed-main-list [role="listitem"], .feed-main-list .feed-card, .a11y_feed_card_item',
  threadCard: process.env.FEISHU_THREAD_CARD_SELECTOR || process.env.FEISHU_FEED_CARD_SELECTOR || '.a11y_feed_card_item',
  threadPanel: process.env.FEISHU_THREAD_PANEL_SELECTOR || '.groupDetail_content--ThreadDetailPage',
  threadPanelBody: process.env.FEISHU_THREAD_PANEL_BODY_SELECTOR || '.groupDetailBody',
};

// Backward-compatible named exports.
export const FEISHU_FEED_CARD_SELECTOR = DEFAULT_SELECTORS.threadCard;
export const FEISHU_THREAD_PANEL_SELECTOR = DEFAULT_SELECTORS.threadPanel;
export const FEISHU_THREAD_PANEL_BODY_SELECTOR = DEFAULT_SELECTORS.threadPanelBody;

function parseBoolean(value, fallback = true) {
  if (value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseCrawlerArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
    append: '',
    appendIfNew: '',
    report: '',
    browserMode: '',
    cookies: '',
    targetUrl: DEFAULT_PLAYWRIGHT_TARGET_URL,
    headless: true,
    cdpClient: DEFAULT_CDP_CLIENT,
    chatName: process.env.FEISHU_TARGET_CHAT_NAME || '',
    maxThreads: parseNumber(process.env.FEISHU_MAX_THREADS, 80),
    selectors: { ...DEFAULT_SELECTORS },
  };
  for (let i = 0; i < argv.length; i++) {
    const cur = argv[i];
    if (cur === '--output') args.output = argv[++i];
    else if (cur === '--append') args.append = argv[++i];
    else if (cur === '--append-if-new') args.appendIfNew = argv[++i];
    else if (cur === '--report') args.report = argv[++i];
    else if (cur === '--browser-mode') args.browserMode = String(argv[++i] || '').trim().toLowerCase();
    else if (cur === '--cookies') args.cookies = argv[++i];
    else if (cur === '--target-url') args.targetUrl = argv[++i];
    else if (cur === '--headless') args.headless = parseBoolean(argv[++i], true);
    else if (cur === '--cdp-client') args.cdpClient = argv[++i];
    else if (cur === '--chat-name') args.chatName = argv[++i];
    else if (cur === '--max-threads') args.maxThreads = parseNumber(argv[++i], args.maxThreads);
    else if (cur === '--chat-list-item-selector') args.selectors.chatListItem = argv[++i];
    else if (cur === '--thread-card-selector') args.selectors.threadCard = argv[++i];
    else if (cur === '--thread-panel-selector') args.selectors.threadPanel = argv[++i];
    else if (cur === '--thread-panel-body-selector') args.selectors.threadPanelBody = argv[++i];
  }
  return args;
}

export function resolveBrowserMode(args) { return args.browserMode || (args.cookies ? 'playwright' : 'cdp'); }

export function normalizePlaywrightCookie(cookie) {
  const normalized = { name: String(cookie.name || ''), value: String(cookie.value || ''), domain: String(cookie.domain || ''), path: String(cookie.path || '/'), httpOnly: Boolean(cookie.httpOnly), secure: Boolean(cookie.secure) };
  if (cookie.sameSite && ['Strict', 'Lax', 'None'].includes(cookie.sameSite)) normalized.sameSite = cookie.sameSite;
  if (!cookie.session && Number.isFinite(Number(cookie.expires)) && Number(cookie.expires) > 0) normalized.expires = Math.floor(Number(cookie.expires));
  return normalized;
}

export function normalizePlaywrightCookies(cookies) { return (Array.isArray(cookies) ? cookies : []).map(normalizePlaywrightCookie); }
