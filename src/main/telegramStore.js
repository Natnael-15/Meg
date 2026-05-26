const db = require('./db');

const TELEGRAM_MESSAGE_SCHEMA_VERSION = 1;
const MAX_TELEGRAM_MESSAGES = 500;

function toIsoString(value) {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  try {
    return new Date(value).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function normalizeMessage(message = {}, index = 0) {
  return {
    schemaVersion: TELEGRAM_MESSAGE_SCHEMA_VERSION,
    id: message?.id || `telegram-message:${index + 1}`,
    direction: message?.direction === 'outbound' ? 'outbound' : 'inbound',
    from: message?.from || (message?.direction === 'outbound' ? 'Meg' : 'Telegram'),
    text: message?.text || '',
    chatId: message?.chatId != null ? String(message.chatId) : '',
    createdAt: toIsoString(message?.createdAt || (message?.date ? message.date * 1000 : null)),
    status: message?.status || (message?.direction === 'outbound' ? 'pending' : 'received'),
  };
}

function normalizeList(items) {
  const seen = new Set();
  return [...(Array.isArray(items) ? items : [])]
    .map(normalizeMessage)
    .filter((item) => {
      if (!item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    .slice(-MAX_TELEGRAM_MESSAGES);
}

function listMessages() {
  const raw = db.load('telegramMessages');
  const normalized = normalizeList(raw);
  if (JSON.stringify(raw || []) !== JSON.stringify(normalized)) {
    db.saveAll('telegramMessages', normalized);
  }
  return normalized;
}

function saveMessages(items) {
  const normalized = normalizeList(items);
  db.saveAll('telegramMessages', normalized);
  return listMessages();
}

function upsertMessage(message) {
  const normalized = normalizeMessage(message);
  const next = normalizeList([
    ...listMessages().filter((item) => item.id !== normalized.id),
    normalized,
  ]);
  db.saveAll('telegramMessages', next);
  return next.find((item) => item.id === normalized.id) || null;
}

function removeMessage(id) {
  const next = listMessages().filter((item) => item.id !== id);
  db.saveAll('telegramMessages', next);
  return next;
}

module.exports = {
  TELEGRAM_MESSAGE_SCHEMA_VERSION,
  MAX_TELEGRAM_MESSAGES,
  listMessages,
  saveMessages,
  upsertMessage,
  removeMessage,
  normalizeMessage,
};
