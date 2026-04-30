const automationConfigs = require('./automationConfigs');
const automationRunner = require('./automationRunner');
const agentRunner = require('./agentRunner');
const workspace = require('./workspace');
const settings = require('./settings');
const telegram = require('./telegram');
const { getHeadSnapshot } = require('./git');

const CHECK_INTERVAL_MS = 30 * 1000;
let intervalId = null;
let lastTriggerKeys = new Map();

const DAY_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function normalizeAutomation(automation) {
  return {
    ...automation,
    trigger: automation?.trigger || { type: 'manual', detail: 'Run from the app' },
    actions: Array.isArray(automation?.actions) ? automation.actions : [],
  };
}

function parseSchedule(detail = '') {
  const normalized = String(detail || '').trim().toLowerCase();
  const match = normalized.match(/^every\s+(day|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!match) return null;
  const [, day, rawHour, rawMinute, meridiem] = match;
  let hour = Number(rawHour);
  const minute = Number(rawMinute || 0);
  if (Number.isNaN(hour) || Number.isNaN(minute) || minute > 59) return null;
  if (meridiem.toLowerCase() === 'pm' && hour < 12) hour += 12;
  if (meridiem.toLowerCase() === 'am' && hour === 12) hour = 0;
  if (hour > 23) return null;
  return {
    day: day === 'day' ? 'day' : DAY_INDEX[day],
    hour,
    minute,
  };
}

function matchesSchedule(schedule, date = new Date()) {
  if (!schedule) return false;
  if (schedule.day !== 'day' && date.getDay() !== schedule.day) return false;
  return date.getHours() === schedule.hour && date.getMinutes() === schedule.minute;
}

function makeTriggerKey(automation, date = new Date()) {
  const stamp = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}-${date.getHours()}:${date.getMinutes()}`;
  return `${automation.id}:${stamp}`;
}

function shouldTrigger(automation, date = new Date()) {
  if (!automation?.enabled) return false;
  if (automation?.trigger?.type !== 'schedule') return false;
  const schedule = parseSchedule(automation.trigger.detail);
  if (!matchesSchedule(schedule, date)) return false;
  const key = makeTriggerKey(automation, date);
  if (lastTriggerKeys.get(automation.id) === key) return false;
  lastTriggerKeys.set(automation.id, key);
  return true;
}

function parseRepositoryTrigger(detail = '') {
  const normalized = String(detail || '').trim().toLowerCase();
  const match = normalized.match(/^on\s+(commit|merge)\s+to\s+(.+)$/i);
  if (!match) return null;
  return {
    kind: match[1].toLowerCase(),
    branch: match[2].trim(),
  };
}

function parseTelegramTrigger(detail = '') {
  const normalized = String(detail || '').trim();
  if (!normalized) return null;
  const match = normalized.match(/^keyword:\s*(.+)$/i);
  const keyword = (match ? match[1] : normalized).trim().toLowerCase();
  return keyword || null;
}

async function shouldTriggerRepository(automation) {
  if (!automation?.enabled) return null;
  if (automation?.trigger?.type !== 'repository') return null;
  const rule = parseRepositoryTrigger(automation.trigger.detail);
  if (!rule) return null;

  const workspaces = workspace.list();
  for (const item of workspaces) {
    if (!item?.path) continue;
    const snapshot = await getHeadSnapshot(item.path);
    if (!snapshot) continue;
    if (snapshot.branch !== rule.branch) continue;
    if (rule.kind === 'merge' && snapshot.parentCount < 2) continue;

    const key = `${automation.id}:${item.id}:${snapshot.head}`;
    if (lastTriggerKeys.get(`${automation.id}:${item.id}`) === key) continue;
    lastTriggerKeys.set(`${automation.id}:${item.id}`, key);
    return { workspace: item, snapshot, rule };
  }
  return null;
}

function shouldTriggerTelegram(automation, message = {}) {
  if (!automation?.enabled) return null;
  if (automation?.trigger?.type !== 'telegram') return null;
  const keyword = parseTelegramTrigger(automation.trigger.detail);
  if (!keyword) return null;
  const text = String(message.text || '').toLowerCase();
  if (!text.includes(keyword)) return null;
  const key = `${automation.id}:telegram:${message.chat?.id || 'chat'}:${message.message_id || message.date || text}`;
  if (lastTriggerKeys.get(`${automation.id}:telegram`) === key) return null;
  lastTriggerKeys.set(`${automation.id}:telegram`, key);
  return { keyword, message };
}

function listAutomations() {
  return automationConfigs.list().map(normalizeAutomation);
}

function triggerAutomation(automation, context = {}) {
  return automationRunner.createRun({
    automationId: automation.id,
    source: 'automation-config',
    sourceId: automation.id,
    name: automation.name,
    trigger: automation.trigger,
    actions: automation.actions,
    workspaceId: context.workspace?.id || null,
    workspacePath: context.workspace?.path || null,
  });
}

async function tick(date = new Date()) {
  const automations = listAutomations();
  const triggered = [];
  for (const automation of automations) {
    if (shouldTrigger(automation, date)) {
      triggered.push(triggerAutomation(automation));
    }
    const repositoryContext = await shouldTriggerRepository(automation);
    if (repositoryContext) {
      triggered.push(triggerAutomation(automation, repositoryContext));
    }
  }
  return triggered;
}

async function handleTelegramMessage(message) {
  const text = String(message.text || '').trim();
  const chatId = message.chat?.id;

  if (text.startsWith('/')) {
    const [cmd, ...args] = text.split(/\s+/);
    if (cmd === '/status') {
      await sendStatusReport(chatId);
      return [];
    }
    if (cmd === '/run') {
      await runAutomationByName(chatId, args.join(' '));
      return [];
    }
  }

  const automations = listAutomations();
  const triggered = [];
  for (const automation of automations) {
    const telegramContext = shouldTriggerTelegram(automation, message);
    if (telegramContext) {
      triggered.push(triggerAutomation(automation, telegramContext));
    }
  }
  return triggered;
}

async function sendStatusReport(chatId) {
  const token = settings.get('telegramToken');
  if (!token || !chatId) return;
  const bot = telegram.getBot(token);
  if (!bot) return;

  const agents = agentRunner.listRuns().filter((r) => r.status === 'running');
  const autos = automationRunner.listRuns().filter((r) => r.status === 'running');

  let report = '<b>✦ Meg System Status</b>\n\n';
  if (agents.length === 0 && autos.length === 0) {
    report += 'System is currently idle. No active background tasks.';
  } else {
    if (agents.length > 0) {
      report += `<b>Active Agents (${agents.length}):</b>\n`;
      agents.forEach((a) => {
        report += `• ${a.name} (ID: ${a.id.slice(-6)})\n`;
      });
      report += '\n';
    }
    if (autos.length > 0) {
      report += `<b>Active Automations (${autos.length}):</b>\n`;
      autos.forEach((a) => {
        report += `• ${a.name} (ID: ${a.id.slice(-6)})\n`;
      });
    }
  }

  await bot.sendMessage(chatId, report).catch(() => {});
}

async function runAutomationByName(chatId, name) {
  const token = settings.get('telegramToken');
  if (!token || !chatId) return;
  const bot = telegram.getBot(token);
  if (!bot) return;

  if (!name) {
    await bot.sendMessage(chatId, 'Please specify an automation name. Usage: <code>/run [name]</code>').catch(() => {});
    return;
  }

  const configs = listAutomations();
  const found = configs.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (found) {
    triggerAutomation(found, { trigger: { type: 'telegram', detail: 'Remote /run command from Telegram' } });
    await bot.sendMessage(chatId, `🚀 Starting automation: <b>${found.name}</b>`).catch(() => {});
  } else {
    await bot.sendMessage(chatId, `❌ Could not find automation named "<b>${name}</b>"`).catch(() => {});
  }
}

function start() {
  if (intervalId) return;
  intervalId = setInterval(() => {
    tick(new Date()).catch(() => {});
  }, CHECK_INTERVAL_MS);
}

function stop() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}

function reload() {
  lastTriggerKeys = new Map();
}

module.exports = {
  start,
  stop,
  reload,
  tick,
  parseSchedule,
  parseRepositoryTrigger,
  parseTelegramTrigger,
  matchesSchedule,
  handleTelegramMessage,
};
