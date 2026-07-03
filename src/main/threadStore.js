const db = require('./db');

const THREAD_SCHEMA_VERSION = 1;
const DEFAULT_THREAD_TITLE = 'New chat';
const DEFAULT_THREAD_SUBTITLE = 'Start a conversation';
const MAX_THREADS = 200;
const MAX_THREAD_MESSAGES = 500;

function truncate(value, limit = 80) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
}

function summarizeToolCall(message) {
  if (!message || message.role !== 'tool_call') return '';
  if (message.name === 'run_command') return `Ran command: ${message.args?.command || ''}`.trim();
  if (message.name === 'read_file') return `Read file: ${message.args?.path || ''}`.trim();
  if (message.name === 'write_file') return `Wrote file: ${message.args?.path || ''}`.trim();
  return message.name ? message.name.replace(/_/g, ' ') : '';
}

function threadMessagePreview(message) {
  if (!message) return '';
  if (message.role === 'tool_call') return summarizeToolCall(message);
  return truncate(message.text || message.label || '');
}

function deriveThreadSummary(thread) {
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const firstUser = messages.find((message) => message.role === 'user' && String(message.text || '').trim());
  const lastMeaningful = [...messages]
    .reverse()
    .find((message) => message.role !== 'system' && message.role !== 'agent' && threadMessagePreview(message));

  return {
    title: truncate(firstUser?.text, 48) || thread?.title || DEFAULT_THREAD_TITLE,
    subtitle: threadMessagePreview(lastMeaningful) || thread?.subtitle || DEFAULT_THREAD_SUBTITLE,
  };
}

function toIsoString(value) {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  try {
    return new Date(value).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function normalizeThread(thread = {}, index = 0) {
  const {
    schemaVersion,
    time,
    ...rest
  } = thread || {};
  const createdAt = toIsoString(thread?.createdAt || thread?.updatedAt);
  const updatedAt = toIsoString(thread?.updatedAt || createdAt);
  const summary = deriveThreadSummary(thread);
  return {
    iconName: 'chat',
    unread: false,
    files: [],
    tools: {},
    memory: '',
    ...rest,
    schemaVersion: THREAD_SCHEMA_VERSION,
    id: thread?.id || `thread-${index + 1}`,
    messages: Array.isArray(thread?.messages) ? thread.messages.slice(-MAX_THREAD_MESSAGES) : [],
    ...summary,
    createdAt,
    updatedAt,
  };
}

function sortThreadsByActivity(items = []) {
  return [...items].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
}

function normalizeList(items) {
  return sortThreadsByActivity((Array.isArray(items) ? items : []).map(normalizeThread)).slice(0, MAX_THREADS);
}

function list() {
  const raw = db.load('threads');
  const normalized = normalizeList(raw);
  if (JSON.stringify(raw || []) !== JSON.stringify(normalized)) {
    db.saveAll('threads', normalized);
  }
  return normalized;
}

function saveAll(items) {
  const normalized = normalizeList(items);
  db.saveAll('threads', normalized);
  return list();
}

function upsert(thread) {
  const items = list();
  const normalizedThread = normalizeThread(thread, items.length);
  const next = normalizeList([
    normalizedThread,
    ...items.filter((item) => item.id !== normalizedThread.id),
  ]);
  db.saveAll('threads', next);
  return next.find((item) => item.id === normalizedThread.id) || null;
}

function remove(id) {
  const next = list().filter((item) => item.id !== id);
  db.saveAll('threads', next);
  return next;
}

/**
 * Fork a thread from a specific message.
 *
 * Creates a new thread that is a copy of the source thread up to (and
 * including) the message with `fromMessageId`. The new thread gets a fresh
 * id, a "(fork)" suffix on the title, and a `forkedFrom` reference pointing
 * back to the source thread + message. Messages after `fromMessageId` are
 * dropped — the user can take the conversation in a different direction.
 *
 * If `fromMessageId` is null, the entire thread is copied (full clone).
 *
 * Returns the new thread, or null if the source thread doesn't exist.
 */
function fork(sourceThreadId, fromMessageId = null) {
  const source = list().find((t) => t.id === sourceThreadId);
  if (!source) return null;
  const sourceMessages = Array.isArray(source.messages) ? source.messages : [];
  let cutMessages;
  if (fromMessageId) {
    const cutIdx = sourceMessages.findIndex((m) => m.id === fromMessageId);
    if (cutIdx === -1) return null;
    cutMessages = sourceMessages.slice(0, cutIdx + 1);
  } else {
    cutMessages = [...sourceMessages];
  }
  const newId = `chat-${Date.now()}`;
  const forked = normalizeThread({
    ...source,
    id: newId,
    title: `${source.title || 'Chat'} (fork)`,
    subtitle: 'Forked conversation',
    messages: cutMessages,
    forkedFrom: { threadId: sourceThreadId, messageId: fromMessageId, at: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    unread: false,
  });
  const next = normalizeList([forked, ...list()]);
  db.saveAll('threads', next);
  return forked;
}

module.exports = {
  THREAD_SCHEMA_VERSION,
  MAX_THREADS,
  MAX_THREAD_MESSAGES,
  list,
  saveAll,
  upsert,
  remove,
  fork,
  normalizeThread,
};
