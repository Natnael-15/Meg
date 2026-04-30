// @vitest-environment node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function loadStoreModule(userDataPath) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/store.js'), 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);

  runModule((id) => {
    if (id === 'electron') {
      return { app: { getPath: () => userDataPath } };
    }
    if (id === 'fs') return require('fs');
    if (id === 'path') return require('path');
    if (id === 'node:sqlite') {
      throw new Error('sqlite unavailable in test');
    }
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/store.js'));

  return module.exports;
}

function loadSettingsModule({ userDataPath, store }) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/settings.js'), 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);

  runModule((id) => {
    if (id === 'electron') {
      return { app: { getPath: () => userDataPath } };
    }
    if (id === 'path') return require('path');
    if (id === './store') return store;
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/settings.js'));

  return module.exports;
}

function loadDbModule({ userDataPath, store }) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/db.js'), 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);

  runModule((id) => {
    if (id === 'electron') {
      return { app: { getPath: () => userDataPath } };
    }
    if (id === 'path') return require('path');
    if (id === 'fs') return require('fs');
    if (id === './store') return store;
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/db.js'));

  return module.exports;
}

describe('store/settings/db persistence', () => {
  let userDataPath;

  beforeEach(() => {
    userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'meg-persist-'));
  });

  afterEach(() => {
    fs.rmSync(userDataPath, { recursive: true, force: true });
  });

  it('persists and reloads fallback settings through store.setAllSettings', () => {
    const store = loadStoreModule(userDataPath);

    store.setAllSettings({
      model: 'gpt-4o',
      integrations: { Telegram: true },
      toolPermissions: { runCommands: true },
    });

    const saved = JSON.parse(fs.readFileSync(store.FALLBACK_FILE, 'utf8'));
    expect(saved.settings).toMatchObject({
      model: 'gpt-4o',
      integrations: { Telegram: true },
      toolPermissions: { runCommands: true },
    });

    const reloaded = loadStoreModule(userDataPath);
    expect(reloaded.getAllSettings()).toMatchObject({
      model: 'gpt-4o',
      integrations: { Telegram: true },
      toolPermissions: { runCommands: true },
    });
  });

  it('migrates legacy settings into the fallback store when empty', () => {
    const legacyPath = path.join(userDataPath, 'meg-settings.json');
    fs.writeFileSync(legacyPath, JSON.stringify({
      model: 'claude-3-5-sonnet',
      telegramToken: 'abc123',
    }), 'utf8');

    const store = loadStoreModule(userDataPath);

    expect(store.getSetting('model')).toBe('claude-3-5-sonnet');
    expect(store.getSetting('telegramToken')).toBe('abc123');
    expect(store.getLegacyMigrationState()).toMatchObject({
      'settings:meg-settings.json:v1': {
        status: 'imported',
        source: legacyPath,
      },
    });

    const fallback = JSON.parse(fs.readFileSync(store.FALLBACK_FILE, 'utf8'));
    expect(fallback.settings.model).toBe('claude-3-5-sonnet');
    expect(fallback.meta.legacyMigrations['settings:meg-settings.json:v1'].status).toBe('imported');
  });

  it('deep-merges settings defaults with partial persisted values', () => {
    const store = loadStoreModule(userDataPath);
    store.setAllSettings({
      apiKeys: { OpenAI: 'sk-test' },
      integrations: { Telegram: true },
      toolPermissions: { runCommands: true },
    });

    const settings = loadSettingsModule({ userDataPath, store });
    const loaded = settings.load();

    expect(loaded.apiKeys).toMatchObject({
      Anthropic: '',
      OpenAI: 'sk-test',
      Google: '',
    });
    expect(loaded.integrations).toMatchObject({
      Telegram: true,
      GitHub: false,
    });
    expect(loaded.toolPermissions).toMatchObject({
      runCommands: true,
      writeFiles: false,
      requireApprovalForCommands: true,
    });
  });

  it('migrates legacy table files into collection storage on first load', () => {
    const legacyThreadsPath = path.join(userDataPath, 'meg-threads.json');
    fs.writeFileSync(legacyThreadsPath, JSON.stringify([
      { id: 't-1', title: 'First thread' },
      { id: 't-2', title: 'Second thread' },
    ]), 'utf8');

    const store = loadStoreModule(userDataPath);
    const db = loadDbModule({ userDataPath, store });

    const threads = db.load('threads');
    expect(threads).toHaveLength(2);
    expect(threads[0]).toMatchObject({ id: 't-1', title: 'First thread' });
    expect(store.collectionCount('threads')).toBe(2);
    expect(store.getLegacyMigrationState()).toMatchObject({
      'table:threads:meg-threads.json:v1': {
        status: 'imported',
        source: legacyThreadsPath,
        importedCount: 2,
      },
    });

    const fallback = JSON.parse(fs.readFileSync(store.FALLBACK_FILE, 'utf8'));
    expect(Object.keys(fallback.collections.threads)).toHaveLength(2);
  });

  it('reads collection items back through collectionGet in fallback mode', () => {
    const store = loadStoreModule(userDataPath);
    store.collectionUpsert('workspaceIndex', 'ws-1', {
      workspaceId: 'ws-1',
      files: 2,
      lang: 'TypeScript',
    });

    expect(store.collectionGet('workspaceIndex', 'ws-1')).toMatchObject({
      workspaceId: 'ws-1',
      files: 2,
      lang: 'TypeScript',
    });
    expect(store.collectionGet('workspaceIndex', 'missing', null)).toBeNull();
  });

  it('records skipped-existing legacy settings instead of importing over current data', () => {
    const store = loadStoreModule(userDataPath);
    store.setAllSettings({ model: 'qwen/qwen3.5-9b' });

    const legacyPath = path.join(userDataPath, 'meg-settings.json');
    fs.writeFileSync(legacyPath, JSON.stringify({ model: 'should-not-win' }), 'utf8');

    const reloaded = loadStoreModule(userDataPath);
    expect(reloaded.getSetting('model')).toBe('qwen/qwen3.5-9b');
    expect(reloaded.getLegacyMigrationState()).toMatchObject({
      'settings:meg-settings.json:v1': {
        status: 'skipped-existing',
        source: legacyPath,
      },
    });
  });
});
