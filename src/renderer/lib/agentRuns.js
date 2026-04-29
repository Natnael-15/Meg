export const mapAgentRun = (run) => {
  const steps = run.steps || [];
  const doneSteps = steps.filter(s => s.status === 'done').length;
  const started = run.startedAt || run.createdAt;
  const duration = run.completedAt && started
    ? `${Math.max(1, Math.round((new Date(run.completedAt) - new Date(started)) / 1000))}s`
    : run.status === 'running' ? 'running' : 'just now';

  return {
    id: run.id,
    parentId: run.parentRunId,
    threadId: run.parentThreadId,
    workspaceId: run.workspaceId || null,
    workspacePath: run.workspacePath || null,
    task: run.name || 'agent',
    status: run.status,
    thread: run.parentThreadId || 'Backend run',
    model: run.model || 'qwen/qwen3.5-9b',
    duration,
    doneSteps,
    steps: Math.max(steps.length, 1),
    liveSteps: steps.map(s => ({ label: s.label, status: s.status })),
    logs: run.logs || [],
    tools: ['terminal', 'fs'],
  };
};
