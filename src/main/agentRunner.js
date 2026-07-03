const { EventEmitter } = require('events');
const settings = require('./settings');
const workspace = require('./workspace');

const events = new EventEmitter();
const RUNS_KEY = 'agentRuns';
const timers = new Map();
const activeControllers = new Map();
const MAX_AGENT_RUNS = 200;
const MAX_AGENT_LOGS = 200;
const DEFAULT_GOAL_STEPS = [
  { label: 'Analyze codebase and requirements', type: 'research' },
  { label: 'Implement requirements in workspace', type: 'implementation' },
  { label: 'Verify correct implementation and polish', type: 'verification' },
];

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

function cleanupStaleRuns() {
  try {
    const runs = settings.get(RUNS_KEY);
    if (Array.isArray(runs)) {
      let changed = false;
      const cleaned = runs.map(run => {
        if (run.status === 'running' || run.status === 'queued') {
          const stamp = now();
          changed = true;
          const msg = run.status === 'running' ? 'Agent run interrupted on app close.' : 'Agent run cancelled on startup.';
          return {
            ...run,
            status: 'cancelled',
            completedAt: stamp,
            updatedAt: stamp,
            steps: Array.isArray(run.steps)
              ? run.steps.map((step) => ({
                  ...step,
                  status: step.status === 'done' ? 'done' : 'cancelled',
                  at: step.at || stamp,
                }))
              : run.steps,
            logs: [...(run.logs || []), { ts: stamp, level: 'warn', message: msg }].slice(-MAX_AGENT_LOGS),
          };
        }
        return run;
      });
      if (changed) {
        settings.set(RUNS_KEY, cleaned);
      }
    }
  } catch (e) {
    console.error('Failed to cleanup stale agent runs:', e);
  }
}
cleanupStaleRuns();

function emit(type, run) {
  events.emit(type, run);
  events.emit('change', { type, run });
}

function normalizeStep(label, status = 'waiting') {
  return { label, status, at: null };
}

function parsePlannedSteps(content) {
  const raw = String(content || '').trim();
  if (!raw) return [];
  const unwrapped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const arrayStart = unwrapped.indexOf('[');
  const arrayEnd = unwrapped.lastIndexOf(']');
  const candidate = arrayStart !== -1 && arrayEnd !== -1
    ? unwrapped.slice(arrayStart, arrayEnd + 1)
    : unwrapped;
  const parsed = JSON.parse(candidate);
  const steps = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.steps) ? parsed.steps : [];
  return steps
    .map((step) => ({
      label: step?.label || step?.description || step?.title || '',
      type: step?.type || 'task',
    }))
    .filter((step) => step.label);
}

function buildGoalSteps(plannedSteps) {
  const planned = Array.isArray(plannedSteps) && plannedSteps.length ? plannedSteps : DEFAULT_GOAL_STEPS;
  const generatedSteps = planned.map((step, index) => normalizeStep(step.label, index === 0 ? 'active' : 'waiting'));
  if (generatedSteps[0]) generatedSteps[0].at = now();
  return [
    { label: 'Queued', status: 'done', at: now() },
    { label: 'Planning workflow', status: 'done', at: now() },
    ...generatedSteps,
    { label: 'Verifying and iterating on results', status: 'waiting', at: null },
  ];
}

function advanceGoalStepState(currentSteps, activeStepNum) {
  if (!Array.isArray(currentSteps) || !Number.isInteger(activeStepNum) || activeStepNum < 1) {
    return currentSteps;
  }
  return currentSteps.map((step, index) => {
    const generatedStart = 2;
    const verificationIndex = currentSteps.length - 1;
    if (index < generatedStart || index >= verificationIndex) return step;
    const stepNum = index - generatedStart + 1;
    if (stepNum < activeStepNum) {
      return step.status === 'done' ? step : { ...step, status: 'done', at: step.at || now() };
    }
    if (stepNum === activeStepNum) {
      return step.status === 'active' ? step : { ...step, status: 'active', at: step.at || now() };
    }
    if (step.status === 'waiting') return step;
    return { ...step, status: 'waiting', at: step.at };
  });
}

async function createRun(input = {}) {
  const activeWorkspace = await workspace.getActive();
  const createdAt = now();
  const isGoal = !!input.goal;
  const initialSteps = isGoal
    ? [
        normalizeStep('Queued'),
        normalizeStep('Planning workflow'),
      ]
    : Array.isArray(input.steps) 
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
    goal: isGoal,
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
  // Drop the scratchpad for this run if it was a parent run. Sub-agent
  // scratchpads are scoped to the parent, so they persist until the parent
  // finishes — this is the right time to clean up.
  try { require('./scratchpad').drop(id); } catch {}
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
  try { require('./scratchpad').drop(id); } catch {}
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

/**
 * Wait for multiple runs to complete (fan-out / scatter-gather).
 * Resolves once every run reaches a terminal state (done/error/cancelled).
 * Never rejects — a rejected sub-agent is returned in the results array
 * with status='error' so the caller can decide how to handle partial
 * failures.
 *
 * @param {string[]} ids - Run ids to wait for.
 * @returns {Promise<Array<object>>} Array of completed run objects, in the
 *   same order as the input ids.
 */
function waitForRuns(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return Promise.resolve([]);
  return Promise.all(ids.map((id) => waitForRun(id)));
}

function clearRunTimer(id) {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
}

async function runAgentStream(run) {
  const ctrl = { cancelled: false };
  activeControllers.set(run.id, ctrl);

  const baseUrl = settings.get('lmStudioUrl') || 'http://127.0.0.1:1234';
  let isStructured = Array.isArray(run.plannedSteps);
  let plannedSteps = run.plannedSteps;
  let lastAnnouncedStep = 0;

  if (run.goal) {
    updateRun(run.id, current => ({
      steps: current.steps.map((s, i) => i === 1 ? { ...s, status: 'active', at: now() } : s),
      logs: [...(current.logs || []), { ts: now(), level: 'info', message: 'Initiating planning phase with local model...' }].slice(-MAX_AGENT_LOGS)
    }));

    try {
      const { getClientForModel } = require('./lmstudio');
      const planModel = run.model || settings.get('model') || 'qwen/qwen3-8b';
      const client = getClientForModel(planModel, baseUrl);

      const planPrompt = `You are a structured planning assistant.
The user wants to accomplish the following goal in their codebase workspace:
"${run.instruction}"

Please break down this goal into a list of 3 to 6 logical, sequential execution steps.
Output must be a valid JSON array of step objects, where each object has:
- "label": a short description of what to do (e.g. "Find all button references", "Add styles to buttons", "Test changes").
- "type": the action type, one of: "research", "implementation", "integration", "verification".

Example output format:
[
  {"label": "Analyze workspace structure", "type": "research"},
  {"label": "Implement button component", "type": "implementation"},
  {"label": "Verify implementation matches", "type": "verification"}
]

Respond with ONLY the JSON array. Do not include markdown code block formatting (\`\`\`json) or additional text.`;

      const comp = await client.chat.completions.create({
        model: planModel,
        messages: [
          { role: 'system', content: 'You respond only with raw JSON. No explanations, no markdown formatting.' },
          { role: 'user', content: planPrompt }
        ],
        temperature: 0.1
      });

      const content = comp.choices[0]?.message?.content || '';
      const stepsList = parsePlannedSteps(content);
      if (stepsList.length > 0) {
        plannedSteps = stepsList;
      }
    } catch (e) {
      appendLog(run.id, `Planning phase failed or returned invalid JSON: ${e.message}. Using default workflow.`, 'warn');
    }

    if (!plannedSteps || plannedSteps.length === 0) {
      plannedSteps = DEFAULT_GOAL_STEPS;
    }

    isStructured = true;

    updateRun(run.id, current => {
      return {
        plannedSteps: plannedSteps,
        steps: buildGoalSteps(plannedSteps),
        logs: [...(current.logs || []), { ts: now(), level: 'info', message: `Planned ${plannedSteps.length} workflow steps successfully.` }].slice(-MAX_AGENT_LOGS)
      };
    });
  } else {
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
  }

  const { streamChat, TOOL_CATEGORY_MAP } = require('./lmstudio');

  let stepContext = '';
  if (isStructured && plannedSteps) {
    stepContext = `\nPLANNED WORKFLOW:\nYou MUST follow these steps sequentially:\n${plannedSteps.map((s, i) => `${i + 1}. ${s.label} (Type: ${s.type || 'task'})`).join('\n')}

MANDATORY STEP REPORTING:
When you transition to a new step in the workflow, you MUST output a line of text in this exact format:
[STEP] Starting: Step <number>
For example, when you begin the first step, output: "[STEP] Starting: Step 1"
When you start the second step, output: "[STEP] Starting: Step 2"
`;
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

  // Build a per-agent tool allowlist as a Set of concrete tool names.
  // streamChat uses this to (a) filter the tool definitions sent to the LLM
  // and (b) reject any disallowed tool calls at execution time.
  // When run.tools is empty/undefined, allowedToolNames stays null and all
  // tools are available (backward-compatible with runs created before the
  // Agent Builder tool picker existed).
  const allowedToolNames = Array.isArray(run.tools) && run.tools.length > 0
    ? new Set(run.tools.flatMap((t) => TOOL_CATEGORY_MAP[t] || []))
    : null;

  let output = '';
  for await (const item of streamChat(messages, run.id, run.model, true, baseUrl, {
    workspacePath: run.workspacePath,
    agentRunId: run.id,
    parentRunId: run.parentRunId,
    ctrl,
    allowedToolNames,
    skipApproval: !!run.goal
  })) {
    if (ctrl.cancelled || getRun(run.id)?.status === 'cancelled') return;
    if (item.type === 'text') {
      output += item.content;
      if (output.length % 400 < item.content.length) {
        appendLog(run.id, `Model output: ${output.slice(-300)}`);
      }

      if (isStructured && plannedSteps) {
        const matches = [...output.matchAll(/\[STEP\]\s*(?:Starting|Now starting):\s*(?:Step\s*)?(\d+)/gi)];
        if (matches.length > 0) {
          const lastMatch = matches[matches.length - 1];
          const activeStepNum = parseInt(lastMatch[1], 10);
          if (activeStepNum > lastAnnouncedStep) {
            lastAnnouncedStep = activeStepNum;
            updateRun(run.id, current => ({
              steps: advanceGoalStepState(current.steps, activeStepNum),
            }));
          }
        }
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
      if (!run.goal) {
        updateRun(run.id, current => {
          const toolLabel = `${item.name}: ${item.args.path || item.args.command || ''}`;
          return {
            steps: [...current.steps.map(s => s.status === 'active' ? { ...s, status: 'done' } : s), { label: toolLabel, status: 'active', at: now() }]
          };
        });
      }
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
      if (!run.goal) {
        updateRun(run.id, current => ({
          steps: current.steps.map(s => s.status === 'active' ? { ...s, status: approvalPending ? 'done' : item.result?.error ? 'error' : 'done', at: now() } : s)
        }));
      }
    }
  }

  if (run.goal && !ctrl.cancelled) {
    updateRun(run.id, current => {
      const nextSteps = current.steps.map((s, i) => {
        if (i === current.steps.length - 1) {
          return { ...s, status: 'active', at: now() };
        } else if (i >= 2) {
          return { ...s, status: 'done', at: s.at || now() };
        }
        return s;
      });
      return {
        steps: nextSteps,
        logs: [...(current.logs || []), { ts: now(), level: 'info', message: 'Entering Verification and Iteration phase.' }].slice(-MAX_AGENT_LOGS)
      };
    });

    messages.push({
      role: 'assistant',
      content: output
    });
    messages.push({
      role: 'system',
      content: `VERIFICATION AND ITERATION PHASE:
Review the user's initial goal: "${run.instruction}".
Verify that the implementation is complete, correct, and matches the requirements.
Feel free to read files, run tests, or execute commands to verify.
If you find any bugs, incomplete parts, or improvements, use your tools to fix them.
Do not stop until the goal is fully and perfectly met.
Once you are absolutely sure the goal has been fully met, provide a final confirmation report to the user.`
    });

    let verifyOutput = '';
    for await (const item of streamChat(messages, run.id, run.model, true, baseUrl, {
      workspacePath: run.workspacePath,
      agentRunId: run.id,
      parentRunId: run.parentRunId,
      ctrl,
      allowedToolNames,
      skipApproval: true
    })) {
      if (ctrl.cancelled || getRun(run.id)?.status === 'cancelled') return;
      if (item.type === 'text') {
        verifyOutput += item.content;
        if (verifyOutput.length % 400 < item.content.length) {
          appendLog(run.id, `Verification output: ${verifyOutput.slice(-300)}`);
        }
      } else if (item.type === 'tool_call') {
        appendLog(run.id, `Verification tool call: ${item.name}`);
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
      } else if (item.type === 'tool_result') {
        const status = item.result?.error ? `failed: ${item.result.error}` : 'completed';
        appendLog(run.id, `Verification tool result: ${item.name} ${status}`, item.result?.error ? 'warn' : 'info');
        upsertToolActivity(run.id, (entries) => {
          const targetId = item.id || null;
          let matched = false;
          const nextEntries = entries.map((entry) => {
            const sameEntry = targetId ? entry.id === targetId : entry.name === item.name && entry.status === 'running';
            if (!sameEntry || matched) return entry;
            matched = true;
            return {
              ...entry,
              status: item.result?.error ? 'error' : 'done',
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
              status: item.result?.error ? 'error' : 'done',
              startedAt: null,
              completedAt: now(),
              result: item.result || null,
            },
          ];
        });
      }
    }
    output += '\n\n[VERIFICATION REPORT]\n' + verifyOutput;
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
  cleanupStaleRuns,
  appendLog,
  completeRun,
  failRun,
  waitForRun,
  waitForRuns,
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
