const { EventEmitter } = require('events');
const settings = require('./settings');

const events = new EventEmitter();
const KEY = 'toolApprovals';

function now() {
  return new Date().toISOString();
}

function list() {
  const approvals = settings.get(KEY);
  return Array.isArray(approvals) ? approvals : [];
}

function saveAll(approvals) {
  settings.set(KEY, Array.isArray(approvals) ? approvals : []);
}

function emit(type, approval) {
  events.emit(type, approval);
  events.emit('change', { type, approval });
}

function create({ tool, args, context = {}, reason, result = null }) {
  const approval = {
    id: `approval-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    tool,
    args: sanitizeArgs(args),
    rawArgs: args || {},
    threadId: context.threadId || null,
    agentRunId: context.agentRunId || (context.threadId?.startsWith?.('agent-') ? context.threadId : null),
    toolCallId: context.toolCallId || null,
    workspacePath: context.workspacePath || null,
    status: 'pending',
    reason: reason || 'Approval required',
    result,
    error: null,
    createdAt: now(),
    resolvedAt: null,
  };
  saveAll([approval, ...list()]);
  emit('approval:created', approval);
  return approval;
}

function update(id, patch, type = 'approval:updated') {
  let updated = null;
  const approvals = list().map(item => {
    if (item.id !== id) return item;
    updated = { ...item, ...patch };
    return updated;
  });
  if (!updated) throw new Error(`Approval not found: ${id}`);
  saveAll(approvals);
  emit(type, updated);
  return updated;
}

function deny(id) {
  return update(id, { status: 'denied', resolvedAt: now() }, 'approval:denied');
}

function markRunning(id) {
  return update(id, { status: 'running' }, 'approval:running');
}

function markStaged(id, result) {
  return update(id, { status: 'staged', result, error: null }, 'approval:staged');
}

function markApproved(id, result) {
  return update(id, { status: 'approved', result, resolvedAt: now() }, 'approval:approved');
}

function markFailed(id, error) {
  return update(id, { status: 'error', error: error?.message || String(error), resolvedAt: now() }, 'approval:error');
}

function get(id) {
  return list().find(item => item.id === id) || null;
}

function sanitizeArgs(args = {}) {
  const clean = { ...args };
  if (typeof clean.content === 'string') clean.content = `[${clean.content.length} chars]`;
  if (typeof clean.text === 'string' && clean.text.length > 240) clean.text = `${clean.text.slice(0, 240)}...`;
  return clean;
}

module.exports = {
  events,
  list,
  create,
  get,
  deny,
  markRunning,
  markStaged,
  markApproved,
  markFailed,
};
