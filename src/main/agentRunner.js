const { EventEmitter } = require('events');
const settings = require('./settings');
const workspace = require('./workspace');

const events = new EventEmitter();
const RUNS_KEY = 'agentRuns';
const timers = new Map();
const activeControllers = new Map();
const MAX_AGENT_RUNS = 200;
const MAX_AGENT_LOGS = 200;

function now() {
  return new Date().toISOString();
}

function listRuns() {
  const runs = settings.get(RUNS_KEY);
  return Array.isArray(runs) ? runs : [];
}

function saveRuns(runs) {
  settings.set(RUNS_KEY, pruneRuns(Array.isArray(runs) ? runs : []));
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
  const initialSteps = Array.isArray(input.steps) 
    ? input.steps.map(s => normalizeStep(s.label || s.type || 'Untitled step'))
    : [
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
    plannedSteps: input.steps || null, // Store the raw structured steps
    model: input.model || settings.get('model') || '',
    workspaceId: activeWorkspace?.id || null,
    workspacePath: activeWorkspace?.path || null,
    status: 'queued',
    steps: initialSteps,
    toolActivity: [],
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
    logs: [...(run.logs || []), { ts: now(), level, message }].slice(-MAX_AGENT_LOGS),
  }), 'agent:log');
}

function upsertToolActivity(id, updater) {
  return updateRun(id, (run) => {
    const current = Array.isArray(run.toolActivity) ? run.toolActivity : [];
    return {
      toolActivity: updater(current),
    };
  }, 'agent:tool');
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
    logs: [...(current.logs || []), { ts: now(), level: 'info', message: 'Agent started.' }].slice(-MAX_AGENT_LOGS),
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
    logs: [...(run.logs || []), { ts: now(), level: 'info', message: output.message || 'Agent completed.' }].slice(-MAX_AGENT_LOGS),
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
    logs: [...(run.logs || []), { ts: now(), level: 'error', message: error?.message || String(error) }].slice(-MAX_AGENT_LOGS),
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
    logs: [...(run.logs || []), { ts: now(), level: 'warn', message: 'Agent cancelled.' }].slice(-MAX_AGENT_LOGS),
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

  const isStructured = Array.isArray(run.plannedSteps);

  updateRun(run.id, current => {
    const nextSteps = [...current.steps];
    if (!isStructured) {
      if (nextSteps[1]) nextSteps[1] = { ...nextSteps[1], status: 'done', at: now() };
      if (nextSteps[2]) nextSteps[2] = { ...nextSteps[2], status: 'active', at: now() };
    } else if (nextSteps[0]) {
      nextSteps[0] = { ...nextSteps[0], status: 'active', at: now() };
    }
    return {
      steps: nextSteps,
      logs: [
        ...(current.logs || []),
        { ts: now(), level: 'info', message: current.workspacePath ? `Workspace scoped to ${current.workspacePath}.` : 'No active workspace selected.' },
        { ts: now(), level: 'info', message: `Running model ${current.model || 'auto-detected'}.` },
        { ts: now(), level: 'info', message: isStructured ? 'Starting structured workflow.' : 'Starting general instruction.' },
      ].slice(-MAX_AGENT_LOGS),
    };
  });

  const { streamChat } = require('./lmstudio');
  const baseUrl = settings.get('lmStudioUrl') || 'http://127.0.0.1:1234';

  let stepContext = '';
  if (isStructured) {
    stepContext = `\nPLANNED WORKFLOW:\nYou MUST follow these steps sequentially:\n${run.plannedSteps.map((s, i) => `${i + 1}. ${s.label} (Type: ${s.type}${s.target ? `, Target: ${s.target}` : ''})`).join('\n')}\n`;
  }

  const messages = [
    {
      role: 'system',
      content: `You are a focused background coding agent inside Meg.

Rules:
- Work only on the assigned task.
- Use tools when you need to inspect files, search, or run safe commands.
- Keep changes scoped to the active workspace.
- If you use commands, prefer Windows PowerShell-compatible commands.
- MANDATORY FINAL REPORT: After you have executed tools or completed the assigned task, you MUST provide a final, conversational report to the user summarizing what was achieved and any follow-up actions required. Never end a response with a tool result alone.
${stepContext}
Workspace path: ${run.workspacePath || 'No active workspace selected'}`
    },
    {
      role: 'user',
      content: `Agent name: ${run.name}

Task:
${run.instruction || (isStructured ? 'Execute the planned workflow described in the system prompt.' : 'No instruction provided.')}`
    },
  ];

  const allowedTools = {};
  if (Array.isArray(run.tools)) {
    run.tools.forEach((t) => {
      if (t === 'terminal') allowedTools['Terminal'] = true;
      if (t === 'fs') allowedTools['File system'] = true;
      if (t === 'browser') allowedTools['Browser'] = true;
    });
  }

  let output = '';
  for await (const item of streamChat(messages, run.id, run.model, true, baseUrl, { 
    workspacePath: run.workspacePath,
    agentRunId: run.id,
    ctrl,
    allowedTools
  })) {
    if (ctrl.cancelled || getRun(run.id)?.status === 'cancelled') return;
    if (item.type === 'text') {
      output += item.content;
      if (output.length % 400 < item.content.length) {
        appendLog(run.id, `Model output: ${output.slice(-300)}`);
      }
    } else if (item.type === 'tool_call') {
      appendLog(run.id, `Tool call: ${item.name}`);
      upsertToolActivity(run.id, (entries) => [
        ...entries,
        {
          id: item.id || `tool-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          name: item.name,
          args: item.args || {},
          status: 'running',
          startedAt: now(),
          completedAt: null,
          result: null,
        },
      ]);
      updateRun(run.id, current => {
        const toolLabel = `${item.name}: ${item.args.path || item.args.command || ''}`;
        return {
          steps: [...current.steps.map(s => s.status === 'active' ? { ...s, status: 'done' } : s), { label: toolLabel, status: 'active', at: now() }]
        };
      });
    } else if (item.type === 'tool_result') {
      const approvalPending = item.result?.approvalRequired && item.result?.approval?.tool === 'write_file';
      const status = approvalPending
        ? 'staged for review'
        : item.result?.error
          ? `failed: ${item.result.error}`
          : 'completed';
      appendLog(run.id, `Tool result: ${item.name} ${status}`, approvalPending ? 'info' : item.result?.error ? 'warn' : 'info');
      upsertToolActivity(run.id, (entries) => {
        const targetId = item.id || null;
        let matched = false;
        const nextEntries = entries.map((entry) => {
          const sameEntry = targetId
            ? entry.id === targetId
            : entry.name === item.name && entry.status === 'running';
          if (!sameEntry || matched) return entry;
          matched = true;
          return {
            ...entry,
            status: approvalPending ? 'staged' : item.result?.error ? 'error' : 'done',
            completedAt: now(),
            result: item.result || null,
          };
        });
        if (matched) return nextEntries;
        return [
          ...nextEntries,
          {
            id: targetId || `tool-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            name: item.name,
            args: item.args || {},
            status: approvalPending ? 'staged' : item.result?.error ? 'error' : 'done',
            startedAt: null,
            completedAt: now(),
            result: item.result || null,
          },
        ];
      });
      updateRun(run.id, current => ({
        steps: current.steps.map(s => s.status === 'active' ? { ...s, status: approvalPending ? 'done' : item.result?.error ? 'error' : 'done', at: now() } : s)
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

function pruneRuns(runs) {
  const activeRuns = runs.filter((run) => run.status === 'queued' || run.status === 'running');
  const completedRuns = runs
    .filter((run) => run.status !== 'queued' && run.status !== 'running')
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  const retainedCompleted = completedRuns.slice(0, Math.max(0, MAX_AGENT_RUNS - activeRuns.length));
  return [...activeRuns, ...retainedCompleted].map((run) => ({
    ...run,
    logs: Array.isArray(run.logs) ? run.logs.slice(-MAX_AGENT_LOGS) : [],
  }));
}
