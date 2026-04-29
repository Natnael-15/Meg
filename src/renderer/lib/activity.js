const MAX_NOTIFICATIONS = 200;
const MAX_EVENTS = 500;

const toIsoString = (value) => {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  try {
    return new Date(value).toISOString();
  } catch {
    return new Date().toISOString();
  }
};

const sortByCreatedAtDesc = (items) => [...items].sort((a, b) => {
  const left = new Date(a.createdAt || 0).getTime();
  const right = new Date(b.createdAt || 0).getTime();
  return right - left;
});

const dedupeById = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

export const normalizeNotification = (notification) => ({
  id: notification?.id || `notif:${Date.now()}`,
  kind: notification?.kind || 'info',
  icon: notification?.icon || 'bell',
  color: notification?.color || 'var(--accent)',
  title: notification?.title || 'Activity',
  body: notification?.body || '',
  read: Boolean(notification?.read),
  createdAt: toIsoString(notification?.createdAt),
});

export const normalizeNotificationList = (notifications) => {
  if (!Array.isArray(notifications)) return [];
  return sortByCreatedAtDesc(dedupeById(notifications.map(normalizeNotification))).slice(0, MAX_NOTIFICATIONS);
};

export const upsertNotification = (notifications, notification) => {
  const next = normalizeNotification(notification);
  const rest = Array.isArray(notifications) ? notifications.filter((item) => item?.id !== next.id) : [];
  return normalizeNotificationList([next, ...rest]);
};

export const markAllNotificationsRead = (notifications) =>
  normalizeNotificationList((notifications || []).map((item) => ({ ...item, read: true })));

export const dismissNotification = (notifications, id) =>
  normalizeNotificationList((notifications || []).filter((item) => item?.id !== id));

export const normalizeEvent = (event) => ({
  id: event?.id || `event:${Date.now()}`,
  type: event?.type || 'system',
  icon: event?.icon || 'bolt',
  color: event?.color || 'var(--accent)',
  title: event?.title || 'Activity',
  detail: event?.detail || '',
  ws: event?.ws || '—',
  createdAt: toIsoString(event?.createdAt),
});

export const normalizeEventList = (events) => {
  if (!Array.isArray(events)) return [];
  return sortByCreatedAtDesc(dedupeById(events.map(normalizeEvent))).slice(0, MAX_EVENTS);
};

export const upsertEvent = (events, event) => {
  const next = normalizeEvent(event);
  const rest = Array.isArray(events) ? events.filter((item) => item?.id !== next.id) : [];
  return normalizeEventList([next, ...rest]);
};
