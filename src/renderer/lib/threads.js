const DEFAULT_THREAD_TITLE = 'New chat';
const DEFAULT_THREAD_SUBTITLE = 'Start a conversation';

const truncate = (value, limit = 80) => {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
};

const summarizeToolCall = (message) => {
  if (!message || message.role !== 'tool_call') return '';
  if (message.name === 'run_command') return `Ran command: ${message.args?.command || ''}`.trim();
  if (message.name === 'read_file') return `Read file: ${message.args?.path || ''}`.trim();
  if (message.name === 'write_file') return `Wrote file: ${message.args?.path || ''}`.trim();
  return message.name ? message.name.replace(/_/g, ' ') : '';
};

export const threadMessagePreview = (message) => {
  if (!message) return '';
  if (message.role === 'tool_call') return summarizeToolCall(message);
  return truncate(message.text || message.label || '');
};

export const deriveThreadSummary = (thread) => {
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const firstUser = messages.find((message) => message.role === 'user' && String(message.text || '').trim());
  const lastMeaningful = [...messages]
    .reverse()
    .find((message) => message.role !== 'system' && message.role !== 'agent' && threadMessagePreview(message));

  return {
    title: truncate(firstUser?.text, 48) || thread?.title || DEFAULT_THREAD_TITLE,
    subtitle: threadMessagePreview(lastMeaningful) || thread?.subtitle || DEFAULT_THREAD_SUBTITLE,
  };
};

export const normalizeThread = (thread) => {
  const createdAt = thread?.createdAt || thread?.updatedAt || new Date().toISOString();
  const updatedAt = thread?.updatedAt || createdAt;
  const summary = deriveThreadSummary(thread);
  return {
    iconName: 'chat',
    unread: false,
    files: [],
    tools: {},
    memory: '',
    ...thread,
    ...summary,
    createdAt,
    updatedAt,
  };
};

export const sortThreadsByActivity = (threads = []) => (
  [...threads].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
);

export const normalizeThreadList = (threads = []) => sortThreadsByActivity((threads || []).map(normalizeThread));
