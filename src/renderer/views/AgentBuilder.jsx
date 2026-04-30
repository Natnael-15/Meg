import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/icons.jsx';
import { DialogShell } from '../components/dialogs.jsx';
import { StatusBadge, Toggle } from '../components/primitives.jsx';

const STEP_TYPES = [
  { id: 'command', label: 'Run command', icon: 'terminal', placeholder: 'npm test' },
  { id: 'read', label: 'Read files', icon: 'files', placeholder: 'src/auth' },
  { id: 'write', label: 'Write output', icon: 'doc', placeholder: 'docs/release-notes.md' },
  { id: 'message', label: 'Send update', icon: 'sms', placeholder: 'Post status update' },
];

const AGENT_TEMPLATES = [
  {
    id: 'tpl-deploy-pipeline',
    name: 'deploy-pipeline',
    trigger: 'on commit to main',
    model: 'claude-3-5-sonnet',
    tools: ['terminal', 'browser'],
    steps: [
      { id: 'step-1', type: 'command', label: 'Run tests', target: 'npm test' },
      { id: 'step-2', type: 'command', label: 'Build docker image', target: 'docker build .' },
      { id: 'step-3', type: 'command', label: 'Deploy to staging', target: 'deploy staging' },
    ],
    enabled: false,
  },
  {
    id: 'tpl-weekly-report',
    name: 'weekly-report',
    trigger: 'every Friday 5pm',
    model: 'claude-3-5-haiku',
    tools: ['fs'],
    steps: [
      { id: 'step-1', type: 'read', label: 'Pull commit log', target: 'git log --since="1 week ago"' },
      { id: 'step-2', type: 'write', label: 'Write report', target: 'reports/weekly.md' },
      { id: 'step-3', type: 'message', label: 'Send to team', target: 'engineering channel' },
    ],
    enabled: false,
  },
  {
    id: 'tpl-pr-reviewer',
    name: 'pr-reviewer',
    trigger: 'on PR open',
    model: 'claude-3-5-sonnet',
    tools: ['fs', 'terminal'],
    steps: [
      { id: 'step-1', type: 'read', label: 'Read diff', target: 'pull request diff' },
      { id: 'step-2', type: 'command', label: 'Run checks', target: 'npm test' },
      { id: 'step-3', type: 'message', label: 'Post review comment', target: 'pull request thread' },
    ],
    enabled: false,
  },
];

const createStep = (type = 'command', label = '', target = '') => ({
  id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  type,
  label,
  target,
});

const normalizeStep = (step) => {
  if (typeof step === 'string') return createStep('command', step, '');
  return {
    id: step.id || `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: step.type || 'command',
    label: step.label || 'Untitled step',
    target: step.target || '',
  };
};

const normalizeAgent = (agent) => ({
  ...agent,
  steps: (agent.steps || []).map(normalizeStep),
});

const formatRunTime = (value) => {
  if (!value) return null;
  try {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  } catch {
    return value;
  }
};

const createBlankAgent = () => normalizeAgent({
  id: `ag-${Date.now()}`,
  name: 'new-agent',
  trigger: 'manual only',
  model: '',
  tools: [],
  steps: [createStep('command', 'Describe what this agent should do', '')],
  enabled: false,
});

const stripAgentRuntimeState = (agent = {}) => {
  const { lastRunId, lastRunStatus, lastRunAt, ...rest } = agent || {};
  return rest;
};

const stepTypeMeta = (type) => STEP_TYPES.find((item) => item.id === type) || STEP_TYPES[0];

const serializeStep = (step, index) => {
  const meta = stepTypeMeta(step.type);
  const target = step.target ? ` (${step.target})` : '';
  return `${index + 1}. [${meta.label}] ${step.label}${target}`;
};

const StepDialog = ({ draft, onChange, onCancel, onConfirm }) => {
  const meta = stepTypeMeta(draft.type);
  const canConfirm = draft.label.trim().length > 0;
  return (
    <DialogShell
      title="Add step"
      description="Choose a supported step type and define what this agent should do."
      onClose={onCancel}
      footer={
        <>
          <button onClick={onCancel} style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => canConfirm && onConfirm()} disabled={!canConfirm} style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: canConfirm ? 'var(--accent)' : 'var(--bg-active)', color: canConfirm ? '#fff' : 'var(--text-3)', fontSize: 12, fontWeight: 600, cursor: canConfirm ? 'pointer' : 'default' }}>Add step</button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Step type</div>
          <select value={draft.type} onChange={(e) => onChange({ ...draft, type: e.target.value })} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', fontSize: 13, color: 'var(--text)', background: 'var(--bg-input)', outline: 'none' }}>
            {STEP_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
        </label>
        <label>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Step name</div>
          <input autoFocus value={draft.label} onChange={(e) => onChange({ ...draft, label: e.target.value })} placeholder="Run integration tests" style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', fontSize: 13, color: 'var(--text)', background: 'var(--bg-input)', outline: 'none' }} />
        </label>
        <label>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Target</div>
          <input value={draft.target} onChange={(e) => onChange({ ...draft, target: e.target.value })} placeholder={meta.placeholder} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', fontSize: 13, color: 'var(--text)', background: 'var(--bg-input)', outline: 'none' }} />
        </label>
      </div>
    </DialogShell>
  );
};

export const AgentBuilder = () => {
  const [agents, setAgents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [stepDraft, setStepDraft] = useState(null);
  const [runStateByAgent, setRunStateByAgent] = useState({});
  const agentsFirst = useRef(true);
  const persistedAgentsRef = useRef([]);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.listAgentConfigs?.().then((data) => {
      if (data?.length) {
        const normalized = data.map(normalizeAgent);
        persistedAgentsRef.current = normalized;
        setAgents(normalized);
        setSelected(normalized[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (agentsFirst.current) {
      agentsFirst.current = false;
      return;
    }
    const prev = persistedAgentsRef.current || [];
    const next = agents.map(stripAgentRuntimeState);
    const prevMap = new Map(prev.map((item) => [item.id, item]));
    const nextMap = new Map(next.map((item) => [item.id, item]));
    next.forEach((item) => {
      if (JSON.stringify(prevMap.get(item.id)) !== JSON.stringify(item)) {
        window.electronAPI?.upsertAgentConfig?.(item);
      }
    });
    prev.forEach((item) => {
      if (!nextMap.has(item.id)) {
        window.electronAPI?.deleteAgentConfig?.(item.id);
      }
    });
    persistedAgentsRef.current = next;
  }, [agents]);

  const agent = agents.find((item) => item.id === selected);
  const toolOptions = [
    { id: 'terminal', icon: 'terminal', label: 'Terminal' },
    { id: 'fs', icon: 'files', label: 'File system' },
    { id: 'browser', icon: 'integration', label: 'Browser' },
    { id: 'telegram', icon: 'sms', label: 'Telegram' },
  ];
  const models = ['qwen/qwen3.5-9b', 'claude-3-5-sonnet', 'claude-3-5-haiku', 'gpt-4o', 'gemini-1.5-pro'];
  const triggers = ['on commit to main', 'on PR open', 'every Friday 5pm', 'on file change', 'manual only', 'on Telegram keyword'];

  const updateAgent = (patch) => {
    setAgents((current) => current.map((item) => (item.id === selected ? { ...item, ...patch } : item)));
  };

  const createAgent = () => {
    const next = createBlankAgent();
    setAgents((current) => [...current, next]);
    setSelected(next.id);
    setEditing(true);
  };

  const addTemplate = (template) => {
    const next = normalizeAgent({ ...template, id: `ag-${Date.now()}` });
    setAgents((current) => [...current, next]);
    setSelected(next.id);
    setEditing(true);
  };

  const deleteAgent = () => {
    if (!agent) return;
    const remaining = agents.filter((item) => item.id !== agent.id);
    setAgents(remaining);
    setSelected(remaining[0]?.id || null);
    setEditing(false);
  };

  useEffect(() => {
    if (!window.electronAPI?.listAgentRuns) return;
    window.electronAPI.listAgentRuns().then((runs) => {
      if (!Array.isArray(runs)) return;
      const next = {};
      runs.forEach((run) => {
        if (run?.source !== 'agent-config' || !run?.sourceId) return;
        const current = next[run.sourceId];
        const at = run.updatedAt || run.completedAt || run.startedAt || run.createdAt || null;
        if (!current || Date.parse(at || 0) > Date.parse(current.at || 0)) {
          next[run.sourceId] = {
            id: run.id,
            status: run.status,
            at,
          };
        }
      });
      setRunStateByAgent(next);
    });
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onAgentChange) return;
    const handleChange = ({ run }) => {
      if (run?.source !== 'agent-config' || !run?.sourceId) return;
      setRunStateByAgent((current) => ({
        ...current,
        [run.sourceId]: {
          id: run.id,
          status: run.status,
          at: run.updatedAt || run.completedAt || run.startedAt || run.createdAt || current[run.sourceId]?.at || null,
        },
      }));
    };
    const dispose = window.electronAPI.onAgentChange(handleChange);
    return () => {
      if (typeof dispose === 'function') dispose();
    };
  }, []);

  const runtimeState = agent ? runStateByAgent[agent.id] || null : null;

  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'hidden' }}>
      {editing && stepDraft && (
        <StepDialog
          draft={stepDraft}
          onChange={setStepDraft}
          onCancel={() => setStepDraft(null)}
          onConfirm={() => {
            updateAgent({ steps: [...agent.steps, createStep(stepDraft.type, stepDraft.label.trim(), stepDraft.target.trim())] });
            setStepDraft(null);
          }}
        />
      )}
      <div style={{ width: 240, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg)', flexShrink: 0 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Agent Configs</span>
          <button onClick={createAgent} style={{ color: 'var(--accent)', display: 'flex', border: 'none', background: 'transparent', cursor: 'pointer' }}><Icon name="plus" size={15} color="var(--accent)" /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
          {!agents.length && (
            <div style={{ padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 600 }}>No agents yet</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.6 }}>Create one from scratch or start from a template. Templates are copied into your config only when you choose them.</div>
              <button onClick={createAgent} style={{ height: 32, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-2)' }}>
                <Icon name="plus" size={13} /> New agent
              </button>
              {AGENT_TEMPLATES.map((template) => (
                <button key={template.id} onClick={() => addTemplate(template)} style={{ padding: '8px 10px', borderRadius: 6, border: '1px dashed var(--border)', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 11.5, fontFamily: '"JetBrains Mono",monospace', color: 'var(--text)' }}>{template.name}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>Use template</span>
                </button>
              ))}
            </div>
          )}
          {agents.map((item) => (
            <button key={item.id} onClick={() => setSelected(item.id)} style={{ width: '100%', padding: '10px', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 3, background: selected === item.id ? 'var(--bg-active)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', marginBottom: 2, transition: 'background 0.1s' }} onMouseEnter={(e) => { if (selected !== item.id) e.currentTarget.style.background = 'var(--bg-hover)'; }} onMouseLeave={(e) => { if (selected !== item.id) e.currentTarget.style.background = 'transparent'; }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11.5, color: 'var(--text)', fontWeight: 500 }}>{item.name}</span>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.enabled ? 'var(--green)' : 'var(--border)', flexShrink: 0 }} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{item.trigger}</span>
            </button>
          ))}
        </div>
        <div style={{ padding: '8px', borderTop: '1px solid var(--border-light)' }}>
          <button onClick={createAgent} style={{ width: '100%', height: 32, borderRadius: 6, border: '1px dashed var(--border)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-3)', transition: 'all 0.12s' }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-3)'; }}>
            <Icon name="plus" size={13} /> New agent
          </button>
        </div>
      </div>
      {agent && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', fontFamily: '"JetBrains Mono",monospace', marginBottom: 4 }}>{agent.name}</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <StatusBadge status={agent.enabled ? 'done' : 'queued'} />
                {runtimeState?.status && <StatusBadge status={runtimeState.status} />}
                {runtimeState?.at && <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>last run {formatRunTime(runtimeState.at)}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={deleteAgent} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)', background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <Icon name="trash" size={12} /> Delete
              </button>
              <button onClick={() => setEditing((current) => !current)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)', background: 'var(--bg)', transition: 'border-color 0.12s' }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}>{editing ? 'Save' : 'Edit'}</button>
              <button onClick={() => {
                window.dispatchEvent(new CustomEvent('meg:action', {
                  detail: {
                    action: 'spawnAgent',
                    value: {
                      ...agent,
                      source: 'agent-config',
                      sourceId: agent.id,
                    },
                  },
                }));
                setRunStateByAgent((current) => ({
                  ...current,
                  [agent.id]: {
                    id: current[agent.id]?.id || null,
                    status: 'queued',
                    at: new Date().toISOString(),
                  },
                }));
              }} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <Icon name="play" size={12} color="#fff" /> Run now
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Trigger</label>
              {editing ? <select value={agent.trigger} onChange={(e) => updateAgent({ trigger: e.target.value })} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5, color: 'var(--text)', background: 'var(--bg-input)', outline: 'none', width: '100%' }}>{triggers.map((trigger) => <option key={trigger}>{trigger}</option>)}</select> : <div style={{ padding: '8px 12px', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12.5, color: 'var(--text-2)', fontFamily: '"JetBrains Mono",monospace' }}>{agent.trigger}</div>}
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Model</label>
              {editing ? <select value={agent.model} onChange={(e) => updateAgent({ model: e.target.value })} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5, color: 'var(--text)', background: 'var(--bg-input)', outline: 'none', width: '100%' }}>{models.map((model) => <option key={model}>{model}</option>)}</select> : <div style={{ padding: '8px 12px', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12.5, color: 'var(--text-2)', fontFamily: '"JetBrains Mono",monospace' }}>{agent.model}</div>}
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>Tools</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {toolOptions.map((tool) => {
                  const active = agent.tools.includes(tool.id);
                  return (
                    <div key={tool.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border)'}`, background: active ? 'var(--accent-bg)' : 'var(--bg-2)', cursor: editing ? 'pointer' : 'default', transition: 'all 0.12s' }} onClick={() => editing && updateAgent({ tools: active ? agent.tools.filter((item) => item !== tool.id) : [...agent.tools, tool.id] })}>
                      <Icon name={tool.icon} size={13} color={active ? 'var(--accent)' : 'var(--text-3)'} />
                      <span style={{ fontSize: 12, color: active ? 'var(--accent)' : 'var(--text-2)', fontWeight: active ? 500 : 400 }}>{tool.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>Steps</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {agent.steps.map((step, index) => {
                  const meta = stepTypeMeta(step.type);
                  return (
                    <div key={step.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6 }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--bg-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>{index + 1}</span></div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 99, background: 'var(--bg-panel)', border: '1px solid var(--border)', fontSize: 10.5, color: 'var(--text-3)' }}>
                            <Icon name={meta.icon} size={11} color="var(--text-3)" />
                            {meta.label}
                          </span>
                        </div>
                        {editing ? (
                          <>
                            <input value={step.label} onChange={(e) => updateAgent({ steps: agent.steps.map((item) => item.id === step.id ? { ...item, label: e.target.value } : item) })} placeholder="Step name" style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5, color: 'var(--text)', background: 'var(--bg-input)', outline: 'none' }} />
                            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
                              <select value={step.type} onChange={(e) => updateAgent({ steps: agent.steps.map((item) => item.id === step.id ? { ...item, type: e.target.value } : item) })} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 12, color: 'var(--text)', background: 'var(--bg-input)', outline: 'none' }}>
                                {STEP_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                              </select>
                              <input value={step.target} onChange={(e) => updateAgent({ steps: agent.steps.map((item) => item.id === step.id ? { ...item, target: e.target.value } : item) })} placeholder={stepTypeMeta(step.type).placeholder} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5, color: 'var(--text)', background: 'var(--bg-input)', outline: 'none' }} />
                            </div>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{step.label}</span>
                            {step.target && <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: '"JetBrains Mono",monospace' }}>{step.target}</span>}
                          </>
                        )}
                      </div>
                      {editing && <button onClick={() => updateAgent({ steps: agent.steps.filter((item) => item.id !== step.id) })} style={{ color: 'var(--text-3)', display: 'flex', opacity: 0.5, border: 'none', background: 'transparent', cursor: 'pointer' }} onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }} onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; }}><Icon name="trash" size={13} /></button>}
                    </div>
                  );
                })}
                {editing && <button onClick={() => setStepDraft({ type: 'command', label: '', target: '' })} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 6, border: '1px dashed var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12 }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-3)'; }}>
                  <Icon name="plus" size={13} /> Add step
                </button>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--border-light)' }}>
              <div><div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Enable agent</div><div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Runs automatically when triggered</div></div>
              <Toggle on={agent.enabled} onToggle={() => updateAgent({ enabled: !agent.enabled })} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
