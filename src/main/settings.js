const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const SETTINGS_FILE = path.join(app.getPath('userData'), 'meg-settings.json');

const DEFAULTS = {
  model: 'qwen/qwen3.5-9b',
  lmStudioUrl: 'http://127.0.0.1:1234',
  telegramToken: '',
  telegramChatId: '',
  apiKeys: { Anthropic: '', OpenAI: '', Google: '' },
  integrations: { Telegram: false, GitHub: false },
  memoryEnabled: true,
  memories: [],
};

function load() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(data) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function get(key) {
  return load()[key];
}

function set(key, value) {
  const current = load();
  current[key] = value;
  save(current);
}

module.exports = { load, save, get, set, SETTINGS_FILE };
