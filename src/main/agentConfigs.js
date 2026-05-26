const db = require('./db');

const DEFAULT_MODEL = '';
const DEFAULT_TRIGGER = 'manual only';
const AGENT_CONFIG_SCHEMA_VERSION = 1;

function createStep(step = {}, index = 0) {
  if (typeof step === 'string') {
    return {
      id: `step-${index + 1}`,
      type: 'command',
      label: step,
      target: '',
    };
  }
  return {
    id: step.id || `step-${index + 1}`,
    type: step.type || 'command',
    label: step.label || 'Untitled step',
    target: step.target || '',
  };
}

function normalizeAgent(agent = {}, index = 0) {
  const {
    schemaVersion,
    lastRunId,
    lastRunStatus,
    lastRunAt,
    ...rest
  } = agent || {};

  return {
    ...rest,
    schemaVersion: AGENT_CONFIG_SCHEMA_VERSION,
    id: agent.id || `ag-${index + 1}`,
    name: agent.name || 'new-agent',
    trigger: agent.trigger || DEFAULT_TRIGGER,
    model: agent.model || DEFAULT_MODEL,
    tools: Array.isArray(agent.tools) ? agent.tools.filter(Boolean) : [],
    steps: Array.isArray(agent.steps) ? agent.steps.map((step, stepIndex) => createStep(step, stepIndex)) : [],
    enabled: Boolean(agent.enabled),
  };
}

function normalizeList(items) {
  return (Array.isArray(items) ? items : []).map(normalizeAgent);
}

function list() {
  const raw = db.load('agents');
  const normalized = normalizeList(raw);
  if (JSON.stringify(raw || []) !== JSON.stringify(normalized)) {
    db.saveAll('agents', normalized);
  }
  return normalized;
}

function saveAll(items) {
  const normalized = normalizeList(items);
  db.saveAll('agents', normalized);
  return list();
}

function upsert(agent) {
  const items = list();
  const normalizedAgent = normalizeAgent(agent, items.length);
  const next = [
    ...items.filter((item) => item.id !== normalizedAgent.id),
    normalizedAgent,
  ];
  db.saveAll('agents', normalizeList(next));
  return list().find((item) => item.id === normalizedAgent.id) || null;
}

function remove(id) {
  const next = list().filter((item) => item.id !== id);
  db.saveAll('agents', next);
  return list();
}

module.exports = {
  AGENT_CONFIG_SCHEMA_VERSION,
  list,
  saveAll,
  upsert,
  remove,
  normalizeAgent,
};
