const { app } = require('electron');
const path = require('path');
const store = require('./store');

function getUserDataPath() {
  return app?.getPath ? app.getPath('userData') : process.cwd();
}

const SETTINGS_FILE = path.join(getUserDataPath(), 'meg-settings.json');

const DEFAULTS = {
  model: 'qwen/qwen3.5-9b',
  lmStudioUrl: 'http://127.0.0.1:1234',
  telegramToken: '',
  telegramChatId: '',
  githubToken: '',
  apiKeys: { Anthropic: '', OpenAI: '', Google: '' },
  integrations: { Telegram: false, GitHub: false },
  memoryEnabled: true,
  memories: [],
  workspaces: [],
  activeWorkspaceId: null,
  toolWriteRoots: [process.cwd()],
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

function load() {
  const parsed = store.getAllSettings();
  return {
    ...DEFAULTS,
    ...parsed,
    apiKeys: { ...DEFAULTS.apiKeys, ...(parsed.apiKeys || {}) },
    integrations: { ...DEFAULTS.integrations, ...(parsed.integrations || {}) },
    toolPermissions: { ...DEFAULTS.toolPermissions, ...(parsed.toolPermissions || {}) },
  };
}

function save(data) {
  store.setAllSettings({ ...DEFAULTS, ...(data || {}) });
}

function get(key) {
  return load()[key];
}

function set(key, value) {
  store.setSetting(key, value);
}

module.exports = { load, save, get, set, SETTINGS_FILE, STORE_FILE: store.DB_FILE };
