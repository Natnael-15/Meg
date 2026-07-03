const { app } = require('electron');
const path = require('path');
const store = require('./store');

function getUserDataPath() {
  return app?.getPath ? app.getPath('userData') : process.cwd();
}

const SETTINGS_FILE = path.join(getUserDataPath(), 'meg-settings.json');

const DEFAULTS = {
  model: '',
  lmStudioUrl: 'http://127.0.0.1:1234',
  telegramToken: '',
  telegramChatId: '',
  githubToken: '',
  apiKeys: { Anthropic: '', OpenAI: '', Google: '', DeepSeek: '' },
  integrations: { Telegram: false, GitHub: false },
  memoryEnabled: true,
  memories: [],
  workspaces: [],
  activeWorkspaceId: null,
  toolWriteRoots: [process.cwd()],
  toolApprovalMode: 'manual', // manual | auto | bypass
  agentRuns: [],
  toolApprovals: [],
  toolPermissions: {
    readFiles: true,
    writeFiles: false,
    runCommands: false,
    webSearch: true,
    telegram: true,
    spawnAgents: true,
    requireApprovalForWrites: true,
    requireApprovalForCommands: true,
  },
};

// ── In-memory cache ───────────────────────────────────────────────────────
// The original implementation called `store.getAllSettings()` on every
// `load()` and every `get(key)` — each call SELECTed every row from the
// settings table and JSON.parsed each one. With ~12+ settings keys and
// multiple IPC handlers calling `get()` per request (e.g. the chat path
// reads `apiKeys`, `lmStudioUrl`, `model`, `toolPermissions`…), this was
// a measurable hot path on every chat turn and tool call.
//
// The cache is invalidated on every `set()` / `save()` and lazily rebuilt
// on the next `load()`. This keeps reads O(1) while preserving the
// semantics that a freshly-set value is immediately visible to subsequent
// reads in the same process.
let _cache = null;
let _cacheLoaded = false;

function load() {
  if (!_cacheLoaded) {
    const parsed = store.getAllSettings();
    _cache = {
      ...DEFAULTS,
      ...parsed,
      apiKeys: { ...DEFAULTS.apiKeys, ...(parsed.apiKeys || {}) },
      integrations: { ...DEFAULTS.integrations, ...(parsed.integrations || {}) },
      toolPermissions: { ...DEFAULTS.toolPermissions, ...(parsed.toolPermissions || {}) },
    };
    _cacheLoaded = true;
  }
  // Return a shallow copy so callers can't mutate the cache by accident.
  return {
    ..._cache,
    apiKeys: { ..._cache.apiKeys },
    integrations: { ..._cache.integrations },
    toolPermissions: { ..._cache.toolPermissions },
  };
}

function save(data) {
  store.setAllSettings({ ...DEFAULTS, ...(data || {}) });
  // Invalidate so the next load() re-reads from disk.
  _cache = null;
  _cacheLoaded = false;
}

function get(key) {
  return load()[key];
}

function set(key, value) {
  store.setSetting(key, value);
  // Update the cache in place if it's already warm — cheaper than a full
  // reload, and keeps the value consistent for the next get().
  if (_cacheLoaded && _cache) {
    _cache[key] = value;
  }
}

/**
 * Invalidate the in-memory cache. Exposed for tests that manipulate the
 * underlying store directly (bypassing set/save) and need the next load()
 * to re-read from disk.
 */
function invalidateCache() {
  _cache = null;
  _cacheLoaded = false;
}

module.exports = { load, save, get, set, invalidateCache, SETTINGS_FILE, STORE_FILE: store.DB_FILE };
