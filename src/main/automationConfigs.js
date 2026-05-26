const db = require('./db');
const AUTOMATION_CONFIG_SCHEMA_VERSION = 1;

function createAction(action = {}, index = 0) {
  if (!action || typeof action !== 'object') {
    return {
      id: `action-${index + 1}`,
      type: 'notify',
      label: `Action ${index + 1}`,
      target: '',
    };
  }
  return {
    id: action.id || `action-${index + 1}`,
    type: action.type || 'notify',
    label: action.label || `Action ${index + 1}`,
    target: action.target || '',
  };
}

function normalizeTrigger(trigger) {
  if (!trigger || typeof trigger !== 'object') {
    return { type: 'manual', detail: 'Run from the app' };
  }
  return {
    type: trigger.type || 'manual',
    detail: trigger.detail || 'Run from the app',
  };
}

function normalizeAutomation(automation = {}, index = 0) {
  const {
    schemaVersion,
    runs,
    lastRun,
    lastRunId,
    lastRunStatus,
    ...rest
  } = automation || {};

  return {
    ...rest,
    schemaVersion: AUTOMATION_CONFIG_SCHEMA_VERSION,
    id: automation.id || `auto-${index + 1}`,
    name: automation.name || 'New automation',
    trigger: normalizeTrigger(automation.trigger),
    actions: Array.isArray(automation.actions) ? automation.actions.map((action, actionIndex) => createAction(action, actionIndex)) : [],
    enabled: Boolean(automation.enabled),
  };
}

function normalizeList(items) {
  return (Array.isArray(items) ? items : []).map(normalizeAutomation);
}

function list() {
  const raw = db.load('automations');
  const normalized = normalizeList(raw);
  if (JSON.stringify(raw || []) !== JSON.stringify(normalized)) {
    db.saveAll('automations', normalized);
  }
  return normalized;
}

function saveAll(items) {
  const normalized = normalizeList(items);
  db.saveAll('automations', normalized);
  return list();
}

function upsert(automation) {
  const items = list();
  const normalizedAutomation = normalizeAutomation(automation, items.length);
  const next = [
    ...items.filter((item) => item.id !== normalizedAutomation.id),
    normalizedAutomation,
  ];
  db.saveAll('automations', normalizeList(next));
  return list().find((item) => item.id === normalizedAutomation.id) || null;
}

function remove(id) {
  const next = list().filter((item) => item.id !== id);
  db.saveAll('automations', next);
  return list();
}

module.exports = {
  AUTOMATION_CONFIG_SCHEMA_VERSION,
  list,
  saveAll,
  upsert,
  remove,
  normalizeAutomation,
};
