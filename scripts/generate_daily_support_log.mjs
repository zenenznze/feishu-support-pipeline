#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    input: '',
    threadsDir: '',
    output: '',
    date: '',
    mode: 'faq',
    title: '',
    productName: '产品',
    maxItems: 20,
  };
  for (let i = 0; i < argv.length; i++) {
    const cur = argv[i];
    if (cur === '--input') args.input = argv[++i];
    else if (cur === '--threads-dir') args.threadsDir = argv[++i];
    else if (cur === '--output') args.output = argv[++i];
    else if (cur === '--date') args.date = argv[++i];
    else if (cur === '--mode') args.mode = argv[++i];
    else if (cur === '--title') args.title = argv[++i];
    else if (cur === '--product-name') args.productName = argv[++i];
    else if (cur === '--max-items') args.maxItems = Number(argv[++i] || 20);
    else if (cur === '--help' || cur === '-h') args.help = true;
  }
  if (args.help) return args;
  if (!args.input && !args.threadsDir) throw new Error('Usage: node scripts/generate_daily_support_log.mjs --input <raw.md> OR --threads-dir <dir> --date YYYY-MM-DD --output <daily.md> [--mode faq|log|retro] [--product-name 产品名]');
  if (!args.output) throw new Error('--output is required');
  if (!['faq', 'log', 'retro'].includes(args.mode)) throw new Error('--mode must be one of: faq, log, retro');
  return args;
}

function cleanLine(line) {
  return String(line || '').replace(/\u200d|\u200b|\ufeff/g, '').trim();
}

function stripFence(text) {
  return String(text || '').replace(/^```\w*\n?/gm, '').replace(/^```$/gm, '').trim();
}

function splitRawThreadRecords(rawText) {
  const blocks = String(rawText || '').split(/\n---\n|^---\n/m).map(b => b.trim()).filter(Boolean);
  return blocks.map((block, index) => parseThreadBlock(block, `thread-${index + 1}`)).filter(Boolean);
}

function parseThreadBlock(block, fallbackId) {
  const lines = String(block || '').split('\n');
  const getMeta = (label) => {
    const found = lines.find(line => line.trim().startsWith(`- ${label}:`));
    return found ? cleanLine(found.split(':').slice(1).join(':')) : '';
  };
  const heading = lines.find(line => /^##\s+Thread:/.test(line));
  const summary = cleanLine((heading || '').replace(/^##\s+Thread:\s*/, '')) || fallbackId;
  const firstMessageTime = getMeta('First message time');
  const firstMessageAuthor = getMeta('First sender');
  const threadKey = getMeta('Thread key');
  const firstIdx = lines.findIndex(line => cleanLine(line) === '### First message');
  const fullIdx = lines.findIndex(line => cleanLine(line) === '### Full thread');
  const firstMessageBody = firstIdx >= 0
    ? lines.slice(firstIdx + 1, fullIdx >= 0 ? fullIdx : undefined).join('\n').trim()
    : '';
  const fullThreadText = fullIdx >= 0 ? stripFence(lines.slice(fullIdx + 1).join('\n')) : block;
  return {
    id: fallbackId,
    summary,
    firstMessageTime,
    firstMessageAuthor,
    threadKey,
    firstMessageBody: cleanLine(firstMessageBody).slice(0, 1000),
    fullThreadText: fullThreadText.trim(),
  };
}

async function readThreadFiles(dir) {
  const names = await readdir(dir);
  const mdFiles = names.filter(name => name.endsWith('.md')).sort();
  const records = [];
  for (const name of mdFiles) {
    const file = path.join(dir, name);
    const text = await readFile(file, 'utf8');
    const parsed = parseThreadBlock(text, name.replace(/\.md$/, ''));
    if (parsed) records.push({ ...parsed, file });
  }
  return records;
}

function normalizeText(text) {
  return cleanLine(String(text || '')
    .replace(/@[^\s，。！？:：]+/g, '')
    .replace(/https?:\/\/\S+/g, '[链接]')
    .replace(/\s+/g, ' '));
}

const CATEGORY_RULES = [
  ['账号 / 登录 / 权限', /登录|账号|权限|无法访问|密码|验证码|绑定|授权|access|permission|login/i],
  ['套餐 / 购买 / 计费', /套餐|购买|充值|余额|退款|发票|开票|账单|价格|月卡|订阅|invoice|refund|billing|payment/i],
  ['配置 / 接入 / 使用路径', /配置|设置|接入|安装|部署|文档|教程|怎么用|命令|接口|api|key|token|install|config|setup/i],
  ['报错 / 稳定性 / 可用性', /报错|错误|失败|不可用|卡住|超时|异常|502|503|500|400|retry|error|failed|timeout/i],
  ['模型 / 分组 / 能力范围', /模型|分组|额度|上下文|能力|限额|速率|并发|model|quota|limit|context/i],
  ['运营 / 人工处理', /客服|人工|合作|邀请|群|工单|反馈|运营|联系|support|ticket/i],
];

function categorize(record) {
  const text = `${record.summary}\n${record.firstMessageBody}\n${record.fullThreadText}`;
  for (const [name, regex] of CATEGORY_RULES) if (regex.test(text)) return name;
  return '其他问题';
}

function pickQuestion(record) {
  const source = normalizeText(record.firstMessageBody || record.summary || record.fullThreadText);
  const sentence = source.split(/(?<=[？?。.!！])\s*/).find(Boolean) || source;
  return sentence.replace(/^[-*\d.、\s]+/, '').slice(0, 90) || '用户咨询的具体问题是什么';
}

function compactEvidence(record, max = 160) {
  const body = normalizeText(record.firstMessageBody || record.fullThreadText || record.summary);
  return body.length > max ? `${body.slice(0, max)}…` : body;
}

function groupByCategory(records) {
  const groups = new Map();
  for (const record of records) {
    const category = categorize(record);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(record);
  }
  return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'zh-Hans-CN'));
}

function formatDate(date) {
  return date || new Date().toISOString().slice(0, 10);
}

function renderFaq(records, args) {
  const date = formatDate(args.date);
  const items = records.slice(0, args.maxItems);
  const lines = [];
  lines.push(args.title || `# ${args.productName} 客服 FAQ - ${date}`);
  lines.push('');
  lines.push(`本文基于 ${date} 当天抓取到的客服话题线程整理，仅保留可复用的问题模式。内容为初稿，发布前应由人工核对产品规则、价格、权限、链接和时效信息。`);
  lines.push('');
  items.forEach((record, idx) => {
    lines.push(`## ${idx + 1}. ${pickQuestion(record)}`);
    lines.push('');
    lines.push('建议答复：');
    lines.push('- 先确认用户的具体环境、账号状态、入口和报错原文。');
    lines.push('- 根据当前产品文档或后台状态给出明确处理步骤。');
    lines.push('- 如果涉及权限、退款、发票、套餐或账号信息，转人工或按内部流程处理。');
    lines.push('');
    lines.push('排查要点：');
    lines.push(`- 问题归类：${categorize(record)}`);
    if (record.firstMessageTime) lines.push(`- 首条时间：${record.firstMessageTime}`);
    lines.push(`- 依据片段：${compactEvidence(record)}`);
    lines.push('');
  });
  const groups = groupByCategory(records);
  lines.push(`## ${items.length + 1}. 当天最常见的问题归类`);
  lines.push('');
  groups.forEach(([category, group], idx) => lines.push(`${idx + 1}. ${category}：${group.length} 条`));
  lines.push('');
  lines.push('## 人工复核清单');
  lines.push('');
  lines.push('- 删除或脱敏客户姓名、账号、订单号、截图链接、内部群名和私有域名。');
  lines.push('- 核对所有价格、套餐、模型、权限和 SLA 口径是否仍然有效。');
  lines.push('- 将临时判断改成可复用的标准答复。');
  lines.push('');
  return lines.join('\n');
}

function renderLog(records, args) {
  const date = formatDate(args.date);
  const groups = groupByCategory(records);
  const lines = [];
  lines.push(args.title || `# ${args.productName} 每日客服日志 - ${date}`);
  lines.push('');
  lines.push(`本文基于 ${date} 的客服话题线程生成，用于沉淀当天高频问题、暴露的流程问题和后续改进方向。`);
  lines.push('');
  lines.push('## 当天概览');
  lines.push('');
  lines.push(`- 线程数量：${records.length}`);
  lines.push(`- 主要问题类型：${groups.slice(0, 5).map(([name]) => name).join('、') || '无'}`);
  lines.push('');
  lines.push('## 典型问题归类');
  lines.push('');
  groups.forEach(([category, group]) => {
    lines.push(`### ${category}（${group.length} 条）`);
    lines.push('');
    group.slice(0, 5).forEach(record => lines.push(`- ${pickQuestion(record)}（${record.firstMessageTime || '时间未识别'}）`));
    lines.push('');
  });
  lines.push('## 暴露的问题');
  lines.push('');
  lines.push('- 如果同类问题重复出现，说明自助文档、入口提示或错误文案仍有改进空间。');
  lines.push('- 如果用户需要反复补充环境信息，说明首次提问收集字段不够标准化。');
  lines.push('- 如果问题集中在套餐、权限、模型或计费，建议补充一张可验证的对照表。');
  lines.push('');
  lines.push('## 建议动作');
  lines.push('');
  lines.push('1. 将高频问题整理为 FAQ 或标准回复。');
  lines.push('2. 把需要用户补充的信息前置到提问模板。');
  lines.push('3. 对需要人工处理的问题建立固定转交流程。');
  lines.push('4. 发布前由人工复核所有产品规则和敏感信息。');
  lines.push('');
  return lines.join('\n');
}

function renderRetro(records, args) {
  const date = formatDate(args.date);
  const groups = groupByCategory(records);
  const lines = [];
  lines.push(args.title || `# ${args.productName} 客服内部复盘 - ${date}`);
  lines.push('');
  lines.push('## 高频问题');
  lines.push('');
  groups.forEach(([category, group], idx) => lines.push(`${idx + 1}. ${category}：${group.length} 条`));
  lines.push('');
  lines.push('## 共性根因');
  lines.push('');
  lines.push('- 用户无法从现有入口快速判断自己的问题属于配置、权限、计费还是服务异常。');
  lines.push('- 报错信息和下一步动作之间缺少直接映射。');
  lines.push('- 部分问题需要人工处理，但转交流程没有在第一轮答复中充分明确。');
  lines.push('');
  lines.push('## 用户体验风险');
  lines.push('');
  lines.push('- 重复提问增加客服压力。');
  lines.push('- 用户在错误入口反复尝试，扩大故障感知。');
  lines.push('- 涉及费用或权限的问题如果口径不一致，容易引发信任风险。');
  lines.push('');
  lines.push('## 建议动作');
  lines.push('');
  lines.push('- 建立标准排查字段：客户端、入口、账号状态、报错原文、截图、复现步骤。');
  lines.push('- 把当天 FAQ 中可复用的条目回填到知识库。');
  lines.push('- 标记需要产品、运营或工程介入的问题，并在后续日志中跟踪闭环。');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/generate_daily_support_log.mjs --input <raw.md> OR --threads-dir <dir> --date YYYY-MM-DD --output <daily.md> [--mode faq|log|retro] [--product-name 产品名]');
    return;
  }
  let records = [];
  if (args.threadsDir) records = await readThreadFiles(args.threadsDir);
  else records = splitRawThreadRecords(await readFile(args.input, 'utf8'));
  if (!records.length) throw new Error('No thread records found');
  records = records.filter(record => !args.date || record.firstMessageTime.includes(args.date) || record.id.includes(args.date) || (record.file || '').includes(args.date));
  if (!records.length) throw new Error(`No thread records matched date: ${args.date}`);
  const body = args.mode === 'faq' ? renderFaq(records, args) : args.mode === 'log' ? renderLog(records, args) : renderRetro(records, args);
  await mkdir(path.dirname(args.output), { recursive: true });
  await writeFile(args.output, `${body}\n`, 'utf8');
  console.log(JSON.stringify({ output: args.output, mode: args.mode, date: formatDate(args.date), threads: records.length }, null, 2));
}

main().catch(err => { console.error(err.stack || String(err)); process.exit(1); });
