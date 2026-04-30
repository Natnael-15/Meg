const { EventEmitter } = require('events');
const settings = require('./settings');
const workspace = require('./workspace');
const { executeTool } = require('./tools');
const agentRunner = require('./agentRunner');
const { completeChat } = require('./lmstudio');
const activityStore = require('./activityStore');

const events = new EventEmitter();
const RUNS_KEY = 'automationRuns';
const timers = new Map();
const MAX_AUTOMATION_RUNS = 200;
const MAX_AUTOMATION_LOGS = 200;

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

function normalizeAction(action, index) {
  return {
    id: action.id || `action-${index + 1}`,
    type: action.type || 'notify',
    label: action.label || `Action ${index + 1}`,
    target: action.target || '',
    status: action.status || 'waiting',
    result: action.result || null,
    error: action.error || null,
    startedAt: action.startedAt || null,
    completedAt: action.completedAt || null,
  };
}

function createRun(input = {}) {
  const activeWorkspace = workspace.getActive();
  const createdAt = now();
  const actions = Array.isArray(input.actions) ? input.actions.map(normalizeAction) : [];
  const run = {
    id: input.id || `automation-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    automationId: input.automationId || input.sourceId || null,
    source: input.source || 'automation-config',
    sourceId: input.sourceId || input.automationId || null,
    name: input.name || 'automation',
    trigger: input.trigger || null,
    actions,
    status: 'queued',
    workspaceId: input.workspaceId || activeWorkspace?.id || null,
    workspacePath: input.workspacePath || activeWorkspace?.path || null,
    createdAt,
    updatedAt: createdAt,
    startedAt: null,
    completedAt: null,
    error: null,
    logs: [{ ts: createdAt, level: 'info', message: 'Automation run queued.' }],
  };

  saveRuns([run, ...listRuns()]);
  emit('automation:created', run);
  scheduleRun(run.id);
  return run;
}

function scheduleRun(id) {
  clearRunTimer(id);
  timers.set(id, setTimeout(() => startRun(id), 150));
}

function clearRunTimer(id) {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
}

function updateRun(id, updater, eventName = 'automation:updated') {
  let updated = null;
  const runs = listRuns().map((run) => {
    if (run.id !== id) return run;
    updated = { ...run, ...updater(run), updatedAt: now() };
    return updated;
  });
  if (!updated) return null;
  saveRuns(runs);
  emit(eventName, updated);
  return updated;
}

function startRun(id) {
  const run = updateRun(id, (current) => ({
    status: 'running',
    startedAt: current.startedAt || now(),
    logs: [...(current.logs || []), { ts: now(), level: 'info', message: 'Automation started.' }].slice(-MAX_AUTOMATION_LOGS),
  }));
  if (!run) return;
  runActions(run).catch((error) => failRun(id, error));
}

async function runActions(run) {
  let currentRun = run;
  for (let index = 0; index < currentRun.actions.length; index += 1) {
    const action = currentRun.actions[index];
    currentRun = markActionRunning(currentRun.id, action.id);
    if (!currentRun) return;
    try {
      const result = await executeAutomationAction(currentRun, action);
      if (result?.error) throw new Error(result.error);
      currentRun = markActionDone(currentRun.id, action.id, result);
      if (!currentRun) return;
    } catch (error) {
      failRun(currentRun.id, error, action.id);
      return;
    }
  }

  completeRun(currentRun.id, {
    message: 'Automation completed.',
    completedActions: currentRun.actions.length,
  });
}

function markActionRunning(runId, actionId) {
  return updateRun(runId, (run) => ({
    actions: run.actions.map((action) => action.id === actionId ? {
      ...action,
      status: 'running',
      startedAt: action.startedAt || now(),
    } : action),
    logs: [...(run.logs || []), { ts: now(), level: 'info', message: `Running action: ${run.actions.find((item) => item.id === actionId)?.label || actionId}` }].slice(-MAX_AUTOMATION_LOGS),
  }), 'automation:action');
}

function markActionDone(runId, actionId, result) {
  return updateRun(runId, (run) => ({
    actions: run.actions.map((action) => action.id === actionId ? {
      ...action,
      status: 'done',
      completedAt: now(),
      result,
      error: null,
    } : action),
    logs: [...(run.logs || []), { ts: now(), level: 'info', message: `Completed action: ${run.actions.find((item) => item.id === actionId)?.label || actionId}` }].slice(-MAX_AUTOMATION_LOGS),
  }), 'automation:action');
}

function completeRun(id, output = {}) {
  clearRunTimer(id);
  return updateRun(id, (run) => ({
    status: 'done',
    completedAt: now(),
    output,
    logs: [...(run.logs || []), { ts: now(), level: 'info', message: output.message || 'Automation completed.' }].slice(-MAX_AUTOMATION_LOGS),
  }), 'automation:completed');
}

function failRun(id, error, actionId = null) {
  clearRunTimer(id);
  return updateRun(id, (run) => ({
    status: 'error',
    completedAt: now(),
    error: error?.message || String(error),
    actions: run.actions.map((action) => action.id === actionId ? {
      ...action,
      status: 'error',
      completedAt: now(),
      error: error?.message || String(error),
    } : action),
    logs: [...(run.logs || []), { ts: now(), level: 'error', message: error?.message || String(error) }].slice(-MAX_AUTOMATION_LOGS),
  }), 'automation:error');
}

function cancelRun(id) {
  clearRunTimer(id);
  return updateRun(id, (run) => ({
    status: 'cancelled',
    completedAt: now(),
    logs: [...(run.logs || []), { ts: now(), level: 'warn', message: 'Automation cancelled.' }].slice(-MAX_AUTOMATION_LOGS),
  }), 'automation:cancelled');
}

async function executeAutomationAction(run, action) {
  const context = {
    threadId: run.id,
    workspacePath: run.workspacePath,
    bypassPermissions: true,
  };
  if (action.type === 'command') {
    return executeTool('run_command', { command: action.target || action.label, cwd: run.workspacePath }, context);
  }
  if (action.type === 'notify') {
    return executeTool('send_telegram', { text: action.target || action.label }, context);
  }
  if (action.type === 'document') {
    if (!run.workspacePath) throw new Error('No active workspace for document action.');

    const wsName = run.workspacePath.split(/[\\/]/).pop();
    const wsEvents = activityStore.listEvents()
      .filter((e) => e.ws === wsName || e.ws === '—')
      .slice(0, 20);

    const contextStr = wsEvents.map((e) => `[${e.createdAt}] ${e.title}: ${e.detail}`).join('\n');

    const prompt = `You are Meg, an AI Operating System. Generate a concise, professional document for the action "${action.label}" in the workspace "${wsName}".

Recent workspace context:
${contextStr || 'No recent activity recorded.'}

Requirements:
1. Format the output in clean Markdown.
2. Focus on the goals defined by the automation: "${run.name}".
3. Use the trigger information if relevant: "${run.trigger?.detail || 'manual run'}".
4. The document target path is: "${action.target}".

Provide only the Markdown content for the document.`;

    const content = await completeChat([{ role: 'user', content: prompt }]);

    return executeTool('write_file', {
      path: action.target,
      content: content || `# ${run.name}\n\n(No content generated)\n`,
    }, context);
  }
  if (action.type === 'agent_run') {
    const spawned = agentRunner.createRun({
      name: action.target || action.label,
      instruction: action.label,
      parentThreadId: run.id,
      source: 'automation-action',
      sourceId: action.id,
    });
    return { ok: true, runId: spawned.id, status: 'spawned' };
  }
  throw new Error(`Unsupported automation action type: ${action.type}`);
}

module.exports = {
  events,
  listRuns,
  createRun,
  cancelRun,
};

function pruneRuns(runs) {
  const activeRuns = runs.filter((run) => run.status === 'queued' || run.status === 'running');
  const completedRuns = runs
    .filter((run) => run.status !== 'queued' && run.status !== 'running')
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  const retainedCompleted = completedRuns.slice(0, Math.max(0, MAX_AUTOMATION_RUNS - activeRuns.length));
  return [...activeRuns, ...retainedCompleted].map((run) => ({
    ...run,
    logs: Array.isArray(run.logs) ? run.logs.slice(-MAX_AUTOMATION_LOGS) : [],
  }));
}
