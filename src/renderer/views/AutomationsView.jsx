import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/icons.jsx';
import { DialogShell } from '../components/dialogs.jsx';
import { StatusBadge, Toggle } from '../components/primitives.jsx';

const TRIGGER_TYPES = [
  { id: 'manual', label: 'Manual only', icon: 'zap', color: 'var(--accent)', placeholder: 'Run from the app' },
  { id: 'pull_request', label: 'Pull request event', icon: 'git', color: '#8b5cf6', placeholder: 'on PR opened' },
  { id: 'schedule', label: 'Scheduled time', icon: 'agent', color: 'var(--orange)', placeholder: 'Every Friday 5pm' },
  { id: 'repository', label: 'Repository event', icon: 'git', color: '#8b5cf6', placeholder: 'on merge to main' },
  { id: 'telegram', label: 'Telegram keyword', icon: 'sms', color: 'var(--green)', placeholder: 'keyword: deploy status' },
];

const ACTION_TYPES = [
  { id: 'agent_run', label: 'Run agent', icon: 'agent', placeholder: 'pr-reviewer' },
  { id: 'notify', label: 'Send notification', icon: 'sms', placeholder: 'Notify via Telegram' },
  { id: 'command', label: 'Run command', icon: 'terminal', placeholder: 'npm test' },
  { id: 'document', label: 'Write document', icon: 'doc', placeholder: 'reports/weekly.md' },
];

const createAction = (type = 'notify', label = '', target = '') => ({
  id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  type,
  label,
  target,
});

const normalizeAction = (action) => {
  if (!action) return createAction();
  if (!action.type) {
    return createAction(
      action.icon === 'agent' ? 'agent_run' : action.icon === 'terminal' ? 'command' : action.icon === 'doc' ? 'document' : 'notify',
      action.label || 'Untitled action',
      action.target || '',
    );
  }
  return {
    id: action.id || `action-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: action.type,
    label: action.label || 'Untitled action',
    target: action.target || '',
  };
};

const triggerTypeMeta = (type) => TRIGGER_TYPES.find((item) => item.id === type) || TRIGGER_TYPES[0];
const actionTypeMeta = (type) => ACTION_TYPES.find((item) => item.id === type) || ACTION_TYPES[0];

const normalizeTrigger = (trigger) => {
  if (!trigger) return { type: 'manual', detail: 'Run from the app' };
  if (!trigger.type) {
    if (trigger.icon === 'git') return { type: 'repository', detail: trigger.label || 'repository event' };
    if (trigger.icon === 'agent') return { type: 'schedule', detail: trigger.label || 'scheduled run' };
    if (trigger.icon === 'sms') return { type: 'telegram', detail: trigger.label || 'telegram keyword' };
    return { type: 'manual', detail: trigger.label || 'Run from the app' };
  }
  return { type: trigger.type, detail: trigger.detail || '' };
};

const normalizeAutomation = (automation) => ({
  ...automation,
  trigger: normalizeTrigger(automation.trigger),
  actions: (automation.actions || []).map(normalizeAction),
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

const AUTOMATION_TEMPLATES = [
  {
    id: 'tpl-pr-review',
    name: 'PR review',
    trigger: { type: 'pull_request', detail: 'on PR opened' },
    actions: [
      createAction('agent_run', 'Run pr-reviewer', 'pr-reviewer'),
      createAction('notify', 'Notify via Telegram', 'engineering channel'),
    ],
    enabled: false,
    runs: 0,
    lastRun: 'Never',
  },
  {
    id: 'tpl-weekly-report',
    name: 'Weekly report',
    trigger: { type: 'schedule', detail: 'Every Friday 5pm' },
    actions: [
      createAction('agent_run', 'Run weekly-report', 'weekly-report'),
      createAction('document', 'Write report output', 'reports/weekly.md'),
    ],
    enabled: false,
    runs: 0,
    lastRun: 'Never',
  },
  {
    id: 'tpl-deploy',
    name: 'Deploy on merge',
    trigger: { type: 'repository', detail: 'on merge to main' },
    actions: [
      createAction('command', 'Run deploy command', 'deploy staging'),
      createAction('notify', 'Text me when done', 'Telegram owner'),
    ],
    enabled: false,
    runs: 0,
    lastRun: 'Never',
  },
];

const createBlankAutomation = () => ({
  id: `auto-${Date.now()}`,
  name: 'New automation',
  trigger: { type: 'manual', detail: 'Run from the app' },
  actions: [],
  enabled: false,
});

const stripAutomationRuntimeState = (automation = {}) => {
  const { runs, lastRun, lastRunId, lastRunStatus, ...rest } = automation || {};
  return rest;
};

const TriggerCard = ({ trigger, editing, onChange }) => {
  const meta = triggerTypeMeta(trigger.type);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 320 }}>
      <div className="auto-card" style={{ padding: '12px 16px', borderRadius: 10, border: `1.5px solid ${meta.color}44`, background: `${meta.color}11`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${meta.color}22`, border: `1px solid ${meta.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name={meta.icon} size={15} color={meta.color} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{meta.label}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{trigger.detail || meta.placeholder}</div>
        </div>
      </div>
      {editing && (
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8 }}>
          <select value={trigger.type} onChange={(e) => onChange({ ...trigger, type: e.target.value, detail: triggerTypeMeta(e.target.value).placeholder })} style={{ border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', fontSize: 13, color: 'var(--text)', background: 'var(--bg-input)', outline: 'none' }}>
            {TRIGGER_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <input value={trigger.detail} onChange={(e) => onChange({ ...trigger, detail: e.target.value })} placeholder={triggerTypeMeta(trigger.type).placeholder} style={{ border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', fontSize: 13, color: 'var(--text)', background: 'var(--bg-input)', outline: 'none' }} />
        </div>
      )}
    </div>
  );
};

const ActionDialog = ({ draft, onChange, onCancel, onConfirm }) => {
  const meta = actionTypeMeta(draft.type);
  const canConfirm = draft.label.trim().length > 0;
  return (
    <DialogShell
      title="Add action"
      description="Choose a supported action type and define the target it should operate on."
      onClose={onCancel}
      footer={
        <>
          <button onClick={onCancel} style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => canConfirm && onConfirm()} disabled={!canConfirm} style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: canConfirm ? 'var(--accent)' : 'var(--bg-active)', color: canConfirm ? '#fff' : 'var(--text-3)', fontSize: 12, fontWeight: 600, cursor: canConfirm ? 'pointer' : 'default' }}>Add action</button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Action type</div>
          <select value={draft.type} onChange={(e) => onChange({ ...draft, type: e.target.value })} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', fontSize: 13, color: 'var(--text)', background: 'var(--bg-input)', outline: 'none' }}>
            {ACTION_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Action name</div>
          <input autoFocus value={draft.label} onChange={(e) => onChange({ ...draft, label: e.target.value })} placeholder="Notify via Telegram" style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', fontSize: 13, color: 'var(--text)', background: 'var(--bg-input)', outline: 'none' }} />
        </label>
        <label>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Target</div>
          <input value={draft.target} onChange={(e) => onChange({ ...draft, target: e.target.value })} placeholder={meta.placeholder} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', fontSize: 13, color: 'var(--text)', background: 'var(--bg-input)', outline: 'none' }} />
        </label>
      </div>
    </DialogShell>
  );
};

export const AutomationsView = () => {
  const [autos, setAutos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [actionDraft, setActionDraft] = useState(null);
  const [editing, setEditing] = useState(false);
  const [runStateByAutomation, setRunStateByAutomation] = useState({});
  const [automationRuns, setAutomationRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const autosFirst = useRef(true);
  const persistedAutosRef = useRef([]);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.listAutomationConfigs?.().then((data) => {
      if (data?.length) {
        const normalized = data.map(normalizeAutomation);
        persistedAutosRef.current = normalized.map(stripAutomationRuntimeState);
        setAutos(normalized);
        setSelected(normalized[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (autosFirst.current) {
      autosFirst.current = false;
      return;
    }
    const prev = persistedAutosRef.current || [];
    const next = autos.map(stripAutomationRuntimeState);
    const prevMap = new Map(prev.map((item) => [item.id, item]));
    const nextMap = new Map(next.map((item) => [item.id, item]));
    next.forEach((item) => {
      if (JSON.stringify(prevMap.get(item.id)) !== JSON.stringify(item)) {
        window.electronAPI?.upsertAutomationConfig?.(item);
      }
    });
    prev.forEach((item) => {
      if (!nextMap.has(item.id)) {
        window.electronAPI?.deleteAutomationConfig?.(item.id);
      }
    });
    persistedAutosRef.current = next;
  }, [autos]);

  const auto = autos.find((item) => item.id === selected);

  const updateAutomation = (patch) => {
    setAutos((current) => current.map((item) => (item.id === selected ? { ...item, ...patch } : item)));
  };

  const createAutomation = () => {
    const next = createBlankAutomation();
    setAutos((current) => [...current, next]);
    setSelected(next.id);
    setEditing(true);
  };

  const addTemplate = (template) => {
    const next = normalizeAutomation({ ...template, id: `auto-${Date.now()}` });
    setAutos((current) => [...current, next]);
    setSelected(next.id);
    setEditing(true);
  };

  const deleteAutomation = () => {
    if (!auto) return;
    const remaining = autos.filter((item) => item.id !== auto.id);
    setAutos(remaining);
    setSelected(remaining[0]?.id || null);
    setEditing(false);
  };

  useEffect(() => {
    if (!window.electronAPI?.listAutomationRuns) return;
    window.electronAPI.listAutomationRuns().then((runs) => {
      if (!Array.isArray(runs)) return;
      setAutomationRuns(runs);
      const next = {};
      runs.forEach((run) => {
        if (!run?.sourceId) return;
        const current = next[run.sourceId] || { count: 0, lastRunAt: null, lastRunId: null, lastRunStatus: null };
        const at = run.updatedAt || run.completedAt || run.startedAt || run.createdAt || null;
        current.count += 1;
        if (!current.lastRunAt || Date.parse(at || 0) > Date.parse(current.lastRunAt || 0)) {
          current.lastRunAt = at;
          current.lastRunId = run.id;
          current.lastRunStatus = run.status;
        }
        next[run.sourceId] = current;
      });
      setRunStateByAutomation(next);
    });
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onAutomationChange) return;
    const handleChange = ({ run }) => {
      if (!run?.sourceId) return;
      setAutomationRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
      setRunStateByAutomation((current) => {
        const previous = current[run.sourceId] || { count: 0, lastRunAt: null, lastRunId: null, lastRunStatus: null };
        const at = run.updatedAt || run.completedAt || run.startedAt || run.createdAt || previous.lastRunAt || null;
        const shouldIncrement = previous.lastRunId !== run.id && run.status === 'queued';
        return {
          ...current,
          [run.sourceId]: {
            count: previous.count + (shouldIncrement ? 1 : 0),
            lastRunAt: at,
            lastRunId: run.id,
            lastRunStatus: run.status,
          },
        };
      });
    };
    const dispose = window.electronAPI.onAutomationChange(handleChange);
    return () => {
      if (typeof dispose === 'function') dispose();
    };
  }, []);

  const runtimeState = auto ? runStateByAutomation[auto.id] || { count: 0, lastRunAt: null, lastRunId: null, lastRunStatus: null } : { count: 0, lastRunAt: null, lastRunId: null, lastRunStatus: null };
  const runsForAutomation = auto
    ? automationRuns
      .filter((run) => run.sourceId === auto.id || run.automationId === auto.id)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    : [];
  const selectedRun = runsForAutomation.find((run) => run.id === selectedRunId) || runsForAutomation[0] || null;

  useEffect(() => {
    if (!selectedRunId || !runsForAutomation.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(runsForAutomation[0]?.id || null);
    }
  }, [runsForAutomation, selectedRunId]);

  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'hidden' }}>
      {actionDraft && (
        <ActionDialog
          draft={actionDraft}
          onChange={setActionDraft}
          onCancel={() => setActionDraft(null)}
          onConfirm={() => {
            updateAutomation({ actions: [...auto.actions, createAction(actionDraft.type, actionDraft.label.trim(), actionDraft.target.trim())] });
            setActionDraft(null);
          }}
        />
      )}
      <div style={{ width: 240, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg)', flexShrink: 0 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Automations</span>
          <button onClick={createAutomation} style={{ color: 'var(--accent)', display: 'flex', border: 'none', background: 'transparent', cursor: 'pointer' }}><Icon name="plus" size={15} color="var(--accent)" /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
          {!autos.length && (
            <div style={{ padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 600 }}>No automations yet</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.6 }}>Create one from scratch or copy a template. Nothing is pre-enabled or persisted until you add it.</div>
              <button onClick={createAutomation} style={{ height: 32, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-2)' }}>
                <Icon name="plus" size={13} /> New automation
              </button>
              {AUTOMATION_TEMPLATES.map((template) => (
                <button key={template.id} onClick={() => addTemplate(template)} style={{ padding: '8px 10px', borderRadius: 6, border: '1px dashed var(--border)', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 11.5, color: 'var(--text)', fontWeight: 500 }}>{template.name}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>Use template</span>
                </button>
              ))}
            </div>
          )}
          {autos.map((item, index) => {
            const meta = triggerTypeMeta(item.trigger.type);
            return (
              <button key={item.id} onClick={() => setSelected(item.id)} style={{ width: '100%', padding: '10px', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 4, background: selected === item.id ? 'var(--bg-active)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', marginBottom: 3, transition: 'background 0.1s', animation: `fadeUp 0.15s ${index * 0.06}s both` }} onMouseEnter={(e) => { if (selected !== item.id) e.currentTarget.style.background = 'var(--bg-hover)'; }} onMouseLeave={(e) => { if (selected !== item.id) e.currentTarget.style.background = 'transparent'; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{item.name}</span>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.enabled ? 'var(--green)' : 'var(--border)', flexShrink: 0 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name={meta.icon} size={11} color={meta.color} />
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{item.trigger.detail}</span>
                </div>
                <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{runStateByAutomation[item.id]?.count || 0} runs · last {formatRunTime(runStateByAutomation[item.id]?.lastRunAt) || 'Never'}</span>
              </button>
            );
          })}
        </div>
        <div style={{ padding: '8px', borderTop: '1px solid var(--border-light)' }}>
          <button onClick={createAutomation} style={{ width: '100%', height: 32, borderRadius: 7, border: '1px dashed var(--border)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-3)', transition: 'all 0.12s' }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-3)'; }}>
            <Icon name="plus" size={13} /> New automation
          </button>
        </div>
      </div>

      {auto && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', animation: 'navIn 0.2s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 4 }}>{auto.name}</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <StatusBadge status={auto.enabled ? 'done' : 'queued'} />
                {runtimeState.lastRunStatus && <StatusBadge status={runtimeState.lastRunStatus} />}
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{runtimeState.count} runs · last {formatRunTime(runtimeState.lastRunAt) || 'Never'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={deleteAutomation} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)', background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <Icon name="trash" size={12} /> Delete
              </button>
              <button onClick={() => setEditing((current) => !current)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)', background: 'var(--bg)' }}>{editing ? 'Save' : 'Edit'}</button>
              <Toggle on={auto.enabled} onToggle={() => updateAutomation({ enabled: !auto.enabled })} />
              <button onClick={() => {
                window.electronAPI?.createAutomationRun?.({
                  name: auto.name,
                  trigger: auto.trigger,
                  actions: auto.actions,
                  source: 'automation-config',
                  sourceId: auto.id,
                });
                setRunStateByAutomation((current) => {
                  const previous = current[auto.id] || { count: 0, lastRunAt: null, lastRunId: null, lastRunStatus: null };
                  return {
                    ...current,
                    [auto.id]: {
                      ...previous,
                      count: previous.count + 1,
                      lastRunAt: new Date().toISOString(),
                      lastRunStatus: 'queued',
                    },
                  };
                });
              }} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <Icon name="play" size={12} color="#fff" /> Run now
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Trigger</div>
            <TriggerCard trigger={auto.trigger} editing={editing} onChange={(trigger) => updateAutomation({ trigger })} />
            <div style={{ width: 1.5, height: 24, background: 'var(--border)', marginLeft: 22 }} />
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Actions</div>
            {auto.actions.map((action, index) => {
              const meta = actionTypeMeta(action.type);
              return (
                <React.Fragment key={action.id}>
                  <div className="auto-card" style={{ padding: '12px 16px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--bg-2)', display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 320 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={meta.icon} size={15} color="var(--accent)" />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {editing ? (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
                            <select value={action.type} onChange={(e) => updateAutomation({ actions: auto.actions.map((item) => item.id === action.id ? { ...item, type: e.target.value } : item) })} style={{ border: '1px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 12, color: 'var(--text)', background: 'var(--bg-input)', outline: 'none' }}>
                              {ACTION_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                            </select>
                            <input value={action.label} onChange={(e) => updateAutomation({ actions: auto.actions.map((item) => item.id === action.id ? { ...item, label: e.target.value } : item) })} placeholder="Action name" style={{ border: '1px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13, color: 'var(--text)', background: 'var(--bg-input)', outline: 'none' }} />
                          </div>
                          <input value={action.target} onChange={(e) => updateAutomation({ actions: auto.actions.map((item) => item.id === action.id ? { ...item, target: e.target.value } : item) })} placeholder={actionTypeMeta(action.type).placeholder} style={{ border: '1px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13, color: 'var(--text)', background: 'var(--bg-input)', outline: 'none' }} />
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{action.label}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{meta.label}{action.target ? ` · ${action.target}` : ''}</div>
                        </>
                      )}
                    </div>
                    <button onClick={() => updateAutomation({ actions: auto.actions.filter((item) => item.id !== action.id) })} style={{ marginLeft: 'auto', color: 'var(--text-3)', display: 'flex', opacity: 0.5, cursor: 'pointer', background: 'none', border: 'none' }} onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }} onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; }}>
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                  {index < auto.actions.length - 1 && <div style={{ width: 1.5, height: 16, background: 'var(--border)', marginLeft: 22 }} />}
                </React.Fragment>
              );
            })}
            <div style={{ width: 1.5, height: 16, background: 'var(--border)', marginLeft: 22 }} />
            {editing && (
              <button onClick={() => setActionDraft({ type: 'notify', label: '', target: '' })} style={{ padding: '10px 16px', borderRadius: 10, border: '1.5px dashed var(--border)', background: 'transparent', display: 'flex', alignItems: 'center', gap: 8, minWidth: 320, cursor: 'pointer', color: 'var(--text-3)', fontSize: 12.5, fontFamily: 'inherit', transition: 'all 0.12s' }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-bg)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'transparent'; }}>
                <Icon name="plus" size={14} /> Add action
              </button>
            )}
          </div>

          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Run history</div>
            {!runsForAutomation.length && (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No automation runs yet.</div>
            )}
            {runsForAutomation.length > 0 && (
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {runsForAutomation.slice(0, 8).map((run) => (
                    <button
                      key={run.id}
                      onClick={() => setSelectedRunId(run.id)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: `1px solid ${selectedRun?.id === run.id ? 'var(--accent-border)' : 'var(--border)'}`,
                        background: selectedRun?.id === run.id ? 'var(--accent-bg)' : 'var(--bg)',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                        <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 600 }}>{run.name}</span>
                        <StatusBadge status={run.status} small />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatRunTime(run.updatedAt || run.createdAt) || 'Unknown time'}</div>
                    </button>
                  ))}
                </div>

                {selectedRun && (
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{selectedRun.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                          Started {formatRunTime(selectedRun.startedAt || selectedRun.createdAt) || 'Unknown'} · Finished {formatRunTime(selectedRun.completedAt) || 'Not finished'}
                        </div>
                      </div>
                      <StatusBadge status={selectedRun.status} />
                    </div>

                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Actions</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(selectedRun.actions || []).map((action) => (
                          <div key={action.id} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-2)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 500 }}>{action.label}</span>
                              <StatusBadge status={action.status} small />
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{actionTypeMeta(action.type).label}{action.target ? ` · ${action.target}` : ''}</div>
                            {action.error && <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 6 }}>{action.error}</div>}
                            {action.result && !action.error && <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(action.result, null, 2)}</div>}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Logs</div>
                      <div style={{ background: 'var(--code-bg)', borderRadius: 8, border: '1px solid var(--code-border)', padding: '10px 12px' }}>
                        {(selectedRun.logs || []).length ? selectedRun.logs.map((entry, index) => (
                          <div key={`${entry.ts || 'log'}-${index}`} style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 10.5, color: entry.level === 'error' ? 'var(--red)' : entry.level === 'warn' ? 'var(--orange)' : 'var(--code-blue)', lineHeight: 1.8 }}>
                            {`${entry.ts ? new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'} ${(entry.level || 'info').toUpperCase()}: ${entry.message || ''}`}
                          </div>
                        )) : <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>No automation log entries yet.</div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
