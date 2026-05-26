const db = require('./db');

const NOTIFICATION_SCHEMA_VERSION = 1;
const EVENT_SCHEMA_VERSION = 1;
const MAX_NOTIFICATIONS = 200;
const MAX_EVENTS = 500;

function toIsoString(value) {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  try {
    return new Date(value).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function sortByCreatedAtDesc(items) {
  return [...items].sort((a, b) => {
    const left = new Date(a.createdAt || 0).getTime();
    const right = new Date(b.createdAt || 0).getTime();
    return right - left;
  });
}

function dedupeById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function normalizeNotification(notification = {}, index = 0) {
  return {
    schemaVersion: NOTIFICATION_SCHEMA_VERSION,
    id: notification?.id || `notif:${index + 1}`,
    kind: notification?.kind || 'info',
    icon: notification?.icon || 'bell',
    color: notification?.color || 'var(--accent)',
    title: notification?.title || 'Activity',
    body: notification?.body || '',
    read: Boolean(notification?.read),
    createdAt: toIsoString(notification?.createdAt),
  };
}

function normalizeNotificationList(notifications) {
  if (!Array.isArray(notifications)) return [];
  return sortByCreatedAtDesc(dedupeById(notifications.map(normalizeNotification))).slice(0, MAX_NOTIFICATIONS);
}

function normalizeEvent(event = {}, index = 0) {
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    id: event?.id || `event:${index + 1}`,
    type: event?.type || 'system',
    icon: event?.icon || 'bolt',
    color: event?.color || 'var(--accent)',
    title: event?.title || 'Activity',
    detail: event?.detail || '',
    ws: event?.ws || '—',
    createdAt: toIsoString(event?.createdAt),
  };
}

function normalizeEventList(events) {
  if (!Array.isArray(events)) return [];
  return sortByCreatedAtDesc(dedupeById(events.map(normalizeEvent))).slice(0, MAX_EVENTS);
}

function listNotifications() {
  const raw = db.load('notifications');
  const normalized = normalizeNotificationList(raw);
  if (JSON.stringify(raw || []) !== JSON.stringify(normalized)) {
    db.saveAll('notifications', normalized);
  }
  return normalized;
}

function saveNotifications(items) {
  const normalized = normalizeNotificationList(items);
  db.saveAll('notifications', normalized);
  return listNotifications();
}

function upsertNotification(notification) {
  const normalized = normalizeNotification(notification);
  const next = normalizeNotificationList([
    normalized,
    ...listNotifications().filter((item) => item.id !== normalized.id),
  ]);
  db.saveAll('notifications', next);
  return next.find((item) => item.id === normalized.id) || null;
}

function dismissNotification(id) {
  const next = listNotifications().filter((item) => item.id !== id);
  db.saveAll('notifications', next);
  return next;
}

function markAllNotificationsRead() {
  const next = listNotifications().map((item) => ({ ...item, read: true }));
  db.saveAll('notifications', next);
  return next;
}

function listEvents() {
  const raw = db.load('events');
  const normalized = normalizeEventList(raw);
  if (JSON.stringify(raw || []) !== JSON.stringify(normalized)) {
    db.saveAll('events', normalized);
  }
  return normalized;
}

function saveEvents(items) {
  const normalized = normalizeEventList(items);
  db.saveAll('events', normalized);
  return listEvents();
}

function upsertEvent(event) {
  const normalized = normalizeEvent(event);
  const next = normalizeEventList([
    normalized,
    ...listEvents().filter((item) => item.id !== normalized.id),
  ]);
  db.saveAll('events', next);
  return next.find((item) => item.id === normalized.id) || null;
}

module.exports = {
  NOTIFICATION_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
  MAX_NOTIFICATIONS,
  MAX_EVENTS,
  listNotifications,
  saveNotifications,
  upsertNotification,
  dismissNotification,
  markAllNotificationsRead,
  listEvents,
  saveEvents,
  upsertEvent,
  normalizeNotification,
  normalizeEvent,
};
