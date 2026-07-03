// Shared scratchpad for multi-agent orchestration.
//
// When a parent agent spawns multiple sub-agents in parallel, they often
// need to coordinate: share partial results, claim work items, signal
// completion. The scratchpad is a simple key-value store scoped to a
// parent run id. Any sub-agent with the same parentRunId can read/write
// keys. Values are JSON-serializable; last-write-wins.
//
// The store is in-memory only — it lives for the duration of the parent
// run and is garbage-collected when the parent run completes. This keeps
// coordination fast (no IPC, no disk) and avoids polluting the settings
// DB with ephemeral data.
//
// The scratchpad is intentionally minimal: no locking, no versioning, no
// pub/sub. For the coordination patterns Meg needs (claim a file, publish
// a partial result, check if a sibling finished) last-write-wins with
// simple get/set is enough. If we need richer coordination later we can
// add CAS (compare-and-set) without changing the API shape.

const { EventEmitter } = require('events');

const events = new EventEmitter();
// Map<parentRunId, Map<key, { value, writtenBy, writtenAt }>>
const stores = new Map();
const MAX_KEYS_PER_RUN = 100;
const MAX_VALUE_CHARS = 50000; // ~12k tokens — don't let one key blow the budget

/**
 * Get the scratchpad store for a parent run, creating it if needed.
 * Returns a Map.
 */
function getStore(parentRunId) {
  if (!parentRunId) return null;
  if (!stores.has(parentRunId)) {
    stores.set(parentRunId, new Map());
  }
  return stores.get(parentRunId);
}

/**
 * Set a key on the parent run's scratchpad.
 * @param {string} parentRunId - The parent agent run id (scope).
 * @param {string} key - The key to set.
 * @param {*} value - JSON-serializable value.
 * @param {string} [writtenBy] - Name of the agent writing the value.
 * @returns {{ ok: true, key, writtenBy, writtenAt } | { ok: false, error }}
 */
function set(parentRunId, key, value, writtenBy = 'unknown') {
  if (!parentRunId) return { ok: false, error: 'No parentRunId in context — scratchpad is only available to sub-agents.' };
  if (!key || typeof key !== 'string') return { ok: false, error: 'Key is required.' };
  const store = getStore(parentRunId);
  if (store.size >= MAX_KEYS_PER_RUN && !store.has(key)) {
    return { ok: false, error: `Scratchpad is full (${MAX_KEYS_PER_RUN} keys).` };
  }
  // Serialize + size-check. JSON.stringify throws on circular refs.
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { ok: false, error: 'Value is not JSON-serializable.' };
  }
  if (serialized.length > MAX_VALUE_CHARS) {
    return { ok: false, error: `Value too large (${serialized.length} chars, max ${MAX_VALUE_CHARS}).` };
  }
  const entry = { value, writtenBy, writtenAt: new Date().toISOString() };
  store.set(key, entry);
  events.emit('set', { parentRunId, key, ...entry });
  return { ok: true, key, writtenBy, writtenAt: entry.writtenAt };
}

/**
 * Get a key from the parent run's scratchpad.
 * @returns {{ ok: true, key, value, writtenBy, writtenAt } | { ok: false, error }}
 */
function get(parentRunId, key) {
  if (!parentRunId) return { ok: false, error: 'No parentRunId in context.' };
  if (!key || typeof key !== 'string') return { ok: false, error: 'Key is required.' };
  const store = getStore(parentRunId);
  if (!store.has(key)) return { ok: false, error: `Key "${key}" not set.` };
  const entry = store.get(key);
  return { ok: true, key, ...entry };
}

/**
 * List all keys on the parent run's scratchpad.
 * @returns {{ ok: true, keys: Array<{key, writtenBy, writtenAt}> } | { ok: false, error }}
 */
function list(parentRunId) {
  if (!parentRunId) return { ok: false, error: 'No parentRunId in context.' };
  const store = getStore(parentRunId);
  const keys = [];
  for (const [key, entry] of store) {
    keys.push({ key, writtenBy: entry.writtenBy, writtenAt: entry.writtenAt });
  }
  return { ok: true, keys };
}

/**
 * Delete a key from the scratchpad.
 */
function del(parentRunId, key) {
  if (!parentRunId) return { ok: false, error: 'No parentRunId in context.' };
  if (!key || typeof key !== 'string') return { ok: false, error: 'Key is required.' };
  const store = getStore(parentRunId);
  if (!store.has(key)) return { ok: false, error: `Key "${key}" not set.` };
  store.delete(key);
  events.emit('delete', { parentRunId, key });
  return { ok: true, key };
}

/**
 * Drop the entire scratchpad for a parent run. Called by agentRunner when
 * the parent run completes (done/error/cancelled) to free memory.
 */
function drop(parentRunId) {
  if (!parentRunId) return;
  stores.delete(parentRunId);
  events.emit('drop', { parentRunId });
}

/**
 * Get the raw store size (for diagnostics / tests).
 */
function size(parentRunId) {
  const store = stores.get(parentRunId);
  return store ? store.size : 0;
}

module.exports = {
  events,
  set,
  get,
  list,
  delete: del,
  drop,
  size,
  MAX_KEYS_PER_RUN,
  MAX_VALUE_CHARS,
};
