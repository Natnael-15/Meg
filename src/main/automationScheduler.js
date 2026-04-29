const db = require('./db');
const automationRunner = require('./automationRunner');
const workspace = require('./workspace');
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
  return db.load('automations').map(normalizeAutomation);
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

function handleTelegramMessage(message) {
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
