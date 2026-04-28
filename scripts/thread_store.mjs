function cleanLine(line) {
  return String(line || '').replace(/\u200d|\u200b|\ufeff/g, '').trim();
}

function isNoiseLine(line) {
  return ['本群成员', '可阅读', '回复话题', '话题', 'Shift + Enter 换行'].includes(line) || /^来自：/.test(line);
}

function summarize(text, max = 40) {
  const value = cleanLine(text);
  return value ? (value.length > max ? `${value.slice(0, max)}...` : value) : 'untitled-thread';
}

function isReplyCountLine(line) {
  return /^\d+\s+条话题回复$/.test(line);
}

export function buildThreadKey(record) {
  const time = cleanLine(record.firstMessageTime);
  const body = cleanLine(record.firstMessageBody);
  const author = cleanLine(record.firstMessageAuthor);
  const attachmentOnly = !body || /^\[[^\]]+\]$/.test(body);
  return attachmentOnly ? `${time}__${author}__${body || '[attachment]'}` : `${time}__${body}`;
}

export function parseThreadPanelText(panelText, { crawlTime } = {}) {
  let lines = String(panelText || '')
    .split(/\n+/)
    .map(cleanLine)
    .filter(Boolean)
    .filter(line => !isNoiseLine(line));
  const replyBoxIndex = lines.indexOf('回复话题');
  if (replyBoxIndex >= 0) lines = lines.slice(0, replyBoxIndex);
  if (lines.length < 3) throw new Error('Thread panel text is too short to parse');
  const firstMessageAuthor = lines[0];
  const firstMessageTime = lines[1];
  const firstMessageBody = isReplyCountLine(lines[2]) ? '[image]' : lines[2];
  return {
    summary: summarize(firstMessageBody),
    crawlTime: cleanLine(crawlTime),
    firstMessageAuthor,
    firstMessageTime,
    firstMessageBody,
    fullThreadText: lines.join('\n'),
    threadKey: buildThreadKey({ firstMessageAuthor, firstMessageTime, firstMessageBody }),
  };
}

export function formatThreadRecord(record) {
  return [
    '---',
    '',
    `## Thread: ${record.summary}`,
    '',
    `- First message time: ${record.firstMessageTime}`,
    `- First sender: ${record.firstMessageAuthor}`,
    `- Thread key: ${record.threadKey}`,
    `- Last crawled: ${record.crawlTime}`,
    '',
    '### First message',
    '',
    record.firstMessageBody || '[empty]',
    '',
    '### Full thread',
    '',
    '```text',
    record.fullThreadText || '[empty]',
    '```',
    '',
  ].join('\n');
}

function splitRawBlocks(rawText) {
  return String(rawText || '').split(/\n---\n/);
}

function normalizeRecord(record) {
  const normalized = {
    ...record,
    summary: summarize(record.summary || record.firstMessageBody),
    crawlTime: cleanLine(record.crawlTime),
    firstMessageAuthor: cleanLine(record.firstMessageAuthor),
    firstMessageTime: cleanLine(record.firstMessageTime),
    firstMessageBody: cleanLine(record.firstMessageBody),
    fullThreadText: String(record.fullThreadText || '').trim(),
  };
  normalized.threadKey = cleanLine(record.threadKey || buildThreadKey(normalized));
  return normalized;
}

export function upsertThreadRecord(rawText, record) {
  const normalized = normalizeRecord(record);
  const blocks = splitRawBlocks(rawText);
  const rendered = formatThreadRecord(normalized).replace(/^---\n/, '');
  let replaced = false;
  const nextBlocks = blocks.map(block => {
    if (!block.includes(`- Thread key: ${normalized.threadKey}`) && !block.includes(`- 线程键：${normalized.threadKey}`)) return block;
    replaced = true;
    return rendered;
  });
  if (!replaced) nextBlocks.push(rendered);
  return nextBlocks.join('\n---\n').replace(/\n{3,}/g, '\n\n');
}
