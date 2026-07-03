// Pure helpers extracted from App.jsx to reduce its size and make these
// utilities independently testable. None of these depend on React.

import { normalizeThread } from './threads.js';

/**
 * Build the quick-capture suggestion list shown in the Ctrl+Shift+M overlay.
 * Pulls recent thread titles + recent activity event titles.
 */
export const buildQuickCaptureItems = (threads = [], events = []) => {
  const threadItems = threads
    .filter((t) => t?.title && t.title !== 'New chat')
    .slice(0, 2)
    .map((t) => `Continue: ${t.title}`);
  const eventItems = events
    .filter((e) => e?.title)
    .slice(0, 2)
    .map((e) => `Follow up: ${e.title}`);
  return [...new Set([...threadItems, ...eventItems])].slice(0, 4);
};

/** Default per-thread tool toggles shown in the ContextPanel. */
export const DEFAULT_THREAD_TOOLS = {
  Terminal: false,
  Browser: false,
  'File system': false,
};

/** Create a fresh thread record with sensible defaults. */
export const createThreadRecord = (id) => {
  const now = new Date().toISOString();
  return normalizeThread({
    id,
    iconName: 'chat',
    title: 'New chat',
    subtitle: 'Start a conversation',
    unread: false,
    messages: [],
    files: [],
    tools: { ...DEFAULT_THREAD_TOOLS },
    memory: '',
    createdAt: now,
    updatedAt: now,
  });
};

/** Extract the workspace-scoped fields that should be stamped onto a thread. */
export const getWorkspaceThreadFields = (workspace) => {
  if (!workspace) return {};
  return {
    workspaceId: workspace.id || null,
    workspaceName: workspace.name || null,
    workspacePath: workspace.path || null,
  };
};

/** Build a notification row from an approval-queue entry. */
export const buildApprovalNotification = (approval) => ({
  id: `approval:${approval.id}`,
  kind: 'approval',
  icon: 'lock',
  color: 'var(--accent)',
  title: 'Tool approval requested',
  body: approval.tool === 'run_command' ? approval.args?.command : approval.args?.path,
  createdAt: new Date().toISOString(),
  read: false,
});

/** Build a notification row from an inbound Telegram message. */
export const buildTelegramNotification = (message, fallbackChatId) => ({
  id: `telegram:${message.chatId || fallbackChatId || 'unknown'}:${message.message_id || message.id || message.date || message.text || Date.now()}`,
  kind: 'telegram',
  icon: 'sms',
  color: 'var(--accent)',
  title: `Telegram from ${message.from || 'Unknown'}`,
  body: `"${message.text || ''}"`,
  createdAt: message.date ? new Date(message.date * 1000).toISOString() : new Date().toISOString(),
  read: false,
});

/** Build a timeline event row from an inbound Telegram message. */
export const buildTelegramEvent = (message) => ({
  id: `telegram-event:${message.chatId || 'unknown'}:${message.message_id || message.id || message.date || message.text || Date.now()}`,
  type: 'sms',
  icon: 'sms',
  color: 'var(--accent)',
  title: `Telegram from ${message.from || 'Unknown'}`,
  detail: `"${message.text || ''}"`,
  ws: '—',
  createdAt: message.date ? new Date(message.date * 1000).toISOString() : new Date().toISOString(),
});

/**
 * Resolve whether the app should render in dark mode given the user's theme
 * choice ('light' | 'dark' | 'system'). Honors the OS preference when set
 * to 'system'.
 */
export const resolveThemeDarkMode = (themeChoice) => {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme:dark)').matches;
  return themeChoice === 'dark' || (themeChoice === 'system' && prefersDark);
};

/**
 * Read a value from localStorage — but only when running in preview mode
 * (i.e. no Electron bridge). In the desktop app, persistence goes through
 * the settings IPC instead, so we short-circuit and return the fallback.
 */
export const readPreviewStorage = (key, fallback) => {
  if (window.electronAPI) return fallback;
  const value = localStorage.getItem(key);
  return value ?? fallback;
};

/** Mirror of readPreviewStorage for writes. No-ops in the desktop app. */
export const writePreviewStorage = (key, value) => {
  if (window.electronAPI) return;
  localStorage.setItem(key, value);
};
