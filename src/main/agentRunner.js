const { EventEmitter } = require('events');
const settings = require('./settings');
const workspace = require('./workspace');

const events = new EventEmitter();
const RUNS_KEY = 'agentRuns';
const timers = new Map();
const activeControllers = new Map();

function now() {
  return new Date().toISOString();
}

function listRuns() {
  const runs = settings.get(RUNS_KEY);
  return Array.isArray(runs) ? runs : [];
}

function saveRuns(runs) {
  settings.set(RUNS_KEY, Array.isArray(runs) ? runs : []);
}

function emit(type, run) {
  events.emit(type, run);
  events.emit('change', { type, run });
}

function normalizeStep(label, status = 'waiting') {
  return { label, status, at: null };
}

function createRun(input = {}) {
  const activeWorkspace = workspace.getActive();
  const createdAt = now();
  const steps = [
    normalizeStep('Queued'),
    normalizeStep('Preparing workspace context'),
    normalizeStep(input.instruction || 'Run task'),
  ];

  const run = {
    id: input.id || `agent-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    parentRunId: input.parentRunId || null,
    parentThreadId: input.parentThreadId || input.threadId || null,
    source: input.source || null,
    sourceId: input.sourceId || null,
    name: input.name || 'sub-agent',
    instruction: input.instruction || '',
    model: input.model || settings.get('model') || 'qwen/qwen3.5-9b',
    workspaceId: activeWorkspace?.id || null,
    workspacePath: activeWorkspace?.path || null,
    status: 'queued',
    steps,
    logs: [{ ts: createdAt, level: 'info', message: 'Agent run queued.' }],
    createdAt,
    updatedAt: createdAt,
    startedAt: null,
    completedAt: null,
    error: null,
  };

  saveRuns([run, ...listRuns()]);
  emit('agent:created', run);
  scheduleRun(run.id);
  return run;
}

function updateRun(id, updater, eventName = 'agent:updated') {
  let updated = null;
  const runs = listRuns().map(run => {
    if (run.id !== id) return run;
    updated = { ...run, ...updater(run), updatedAt: now() };
    return updated;
  });
  if (!updated) return null;
  saveRuns(runs);
  emit(eventName, updated);
  return updated;
}

function appendLog(id, message, level = 'info') {
  return updateRun(id, run => ({
    logs: [...(run.logs || []), { ts: now(), level, message }],
  }), 'agent:log');
}

function scheduleRun(id) {
  clearRunTimer(id);
  const queuedTimer = setTimeout(() => {
    startRun(id);
  }, 250);
  timers.set(id, queuedTimer);
}

function startRun(id) {
  const run = updateRun(id, current => ({
    status: 'running',
    startedAt: current.startedAt || now(),
    steps: current.steps.map((s, i) => i === 0 ? { ...s, status: 'done', at: now() } : i === 1 ? { ...s, status: 'active', at: now() } : s),
    logs: [...(current.logs || []), { ts: now(), level: 'info', message: 'Agent started.' }],
  }));
  if (!run) return;
  runAgentStream(run).catch(error => failRun(id, error));
}

function completeRun(id, output = {}) {
  clearRunTimer(`${id}:context`);
  clearRunTimer(`${id}:complete`);
  activeControllers.delete(id);
  return updateRun(id, run => ({
    status: 'done',
    completedAt: now(),
    output,
    steps: run.steps.map(s => ({ ...s, status: 'done', at: s.at || now() })),
    logs: [...(run.logs || []), { ts: now(), level: 'info', message: output.message || 'Agent completed.' }],
  }), 'agent:completed');
}

function failRun(id, error) {
  clearRunTimer(`${id}:context`);
  clearRunTimer(`${id}:complete`);
  activeControllers.delete(id);
  return updateRun(id, run => ({
    status: 'error',
    completedAt: now(),
    error: error?.message || String(error),
    logs: [...(run.logs || []), { ts: now(), level: 'error', message: error?.message || String(error) }],
  }), 'agent:error');
}

function cancelRun(id) {
  clearRunTimer(id);
  clearRunTimer(`${id}:context`);
  clearRunTimer(`${id}:complete`);
  const ctrl = activeControllers.get(id);
  if (ctrl) ctrl.cancelled = true;
  activeControllers.delete(id);
  return updateRun(id, run => ({
    status: 'cancelled',
    completedAt: now(),
    logs: [...(run.logs || []), { ts: now(), level: 'warn', message: 'Agent cancelled.' }],
  }), 'agent:cancelled');
}

function getRun(id) {
  return listRuns().find(run => run.id === id) || null;
}

function waitForRun(id) {
  return new Promise((resolve) => {
    const check = (run) => {
      if (run.id === id && (run.status === 'done' || run.status === 'error' || run.status === 'cancelled')) {
        events.removeListener('agent:completed', check);
        events.removeListener('agent:error', check);
        events.removeListener('agent:cancelled', check);
        resolve(run);
      }
    };
    events.on('agent:completed', check);
    events.on('agent:error', check);
    events.on('agent:cancelled', check);
    
    // Safety check in case it's already done
    const current = getRun(id);
    if (current && (current.status === 'done' || current.status === 'error' || current.status === 'cancelled')) {
      check(current);
    }
  });
}

function clearRunTimer(id) {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
}

async function runAgentStream(run) {
  const ctrl = { cancelled: false };
  activeControllers.set(run.id, ctrl);

  updateRun(run.id, current => ({
    steps: current.steps.map((s, i) => i === 1 ? { ...s, status: 'done', at: now() } : i === 2 ? { ...s, status: 'active', at: now() } : s),
    logs: [
      ...(current.logs || []),
      { ts: now(), level: 'info', message: current.workspacePath ? `Workspace scoped to ${current.workspacePath}.` : 'No active workspace selected.' },
      { ts: now(), level: 'info', message: `Running model ${current.model}.` },
    ],
  }));

  const { streamChat } = require('./lmstudio');
  const baseUrl = settings.get('lmStudioUrl') || 'http://127.0.0.1:1234';
  const messages = [
    {
      role: 'system',
      content: `You are a focused background coding agent inside Meg.

Rules:
- Work only on the assigned task.
- Use tools when you need to inspect files, search, or run safe commands.
- Keep changes scoped to the active workspace.
- If you use commands, prefer Windows PowerShell-compatible commands.
- End with a concise final report: what you did, what changed, and any follow-up risk.

Workspace path: ${run.workspacePath || 'No active workspace selected'}`
    },
    {
      role: 'user',
      content: `Agent name: ${run.name}

Task:
${run.instruction || 'No instruction provided.'}`
    },
  ];

  let output = '';
  for await (const item of streamChat(messages, run.id, run.model, true, baseUrl, { 
    workspacePath: run.workspacePath,
    agentRunId: run.id 
  })) {
    if (ctrl.cancelled || getRun(run.id)?.status === 'cancelled') return;
    if (item.type === 'text') {
      output += item.content;
      if (output.length % 400 < item.content.length) {
        appendLog(run.id, `Model output: ${output.slice(-300)}`);
      }
    } else if (item.type === 'tool_call') {
      appendLog(run.id, `Tool call: ${item.name}`);
      updateRun(run.id, current => {
        const toolLabel = `${item.name}: ${item.args.path || item.args.command || ''}`;
        return {
          steps: [...current.steps.map(s => s.status === 'active' ? { ...s, status: 'done' } : s), { label: toolLabel, status: 'active', at: now() }]
        };
      });
    } else if (item.type === 'tool_result') {
      const status = item.result?.error ? `failed: ${item.result.error}` : 'completed';
      appendLog(run.id, `Tool result: ${item.name} ${status}`, item.result?.error ? 'warn' : 'info');
      updateRun(run.id, current => ({
        steps: current.steps.map(s => s.status === 'active' ? { ...s, status: item.result?.error ? 'error' : 'done', at: now() } : s)
      }));
    }
  }

  activeControllers.delete(run.id);
  completeRun(run.id, {
    message: 'Agent completed.',
    text: output.trim(),
  });
}

module.exports = {
  events,
  listRuns,
  createRun,
  cancelRun,
  appendLog,
  completeRun,
  failRun,
  waitForRun,
};
