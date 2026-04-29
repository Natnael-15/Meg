const { app } = require('electron');
const fs = require('fs');
const path = require('path');

function getUserDataPath() {
  return app?.getPath ? app.getPath('userData') : process.cwd();
}

const DB_FILE = path.join(getUserDataPath(), 'meg.db');
const FALLBACK_FILE = path.join(getUserDataPath(), 'meg-store.json');
const LEGACY_SETTINGS_FILE = path.join(getUserDataPath(), 'meg-settings.json');
const LEGACY_MIGRATION_META_KEY = 'legacyMigrations';
const LEGACY_MIGRATION_POLICY = {
  version: 1,
  introducedInVersion: '0.5.0',
  retireAfterVersion: '0.7.0',
  settingsImportId: 'settings:meg-settings.json:v1',
  tableImportVersion: 'v1',
};

let sqlite = null;
try {
  sqlite = require('node:sqlite');
} catch {
  sqlite = null;
}

let db = null;
let fallback = null;

function isSqliteAvailable() {
  return !!sqlite?.DatabaseSync;
}

function initSqlite() {
  if (db || !isSqliteAvailable()) return db;
  db = new sqlite.DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv_collections (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
  `);
  migrateLegacySettings();
  return db;
}

function loadFallback() {
  if (fallback) return fallback;
  try {
    fallback = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf8'));
  } catch {
    fallback = { settings: {}, collections: {}, meta: {} };
  }
  fallback.meta = fallback.meta || {};
  migrateLegacySettings();
  return fallback;
}

function saveFallback() {
  fs.writeFileSync(FALLBACK_FILE, JSON.stringify(fallback || { settings: {}, collections: {} }, null, 2), 'utf8');
}

function now() {
  return new Date().toISOString();
}

function parseValue(raw, fallbackValue = null) {
  if (raw == null) return fallbackValue;
  try { return JSON.parse(raw); } catch { return fallbackValue; }
}

function getMeta(key, fallbackValue = null) {
  if (initSqlite()) {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row ? parseValue(row.value, fallbackValue) : fallbackValue;
  }
  const data = loadFallback();
  return Object.prototype.hasOwnProperty.call(data.meta, key) ? data.meta[key] : fallbackValue;
}

function setMeta(key, value) {
  if (typeof value === 'undefined') {
    if (initSqlite()) {
      db.prepare('DELETE FROM meta WHERE key = ?').run(key);
      return;
    }
    const data = loadFallback();
    delete data.meta[key];
    saveFallback();
    return;
  }
  if (initSqlite()) {
    db.prepare(`
      INSERT INTO meta (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(value), now());
    return;
  }
  const data = loadFallback();
  data.meta[key] = value;
  saveFallback();
}

function getLegacyMigrationState() {
  return getMeta(LEGACY_MIGRATION_META_KEY, {}) || {};
}

function markLegacyMigration(id, detail) {
  const current = getLegacyMigrationState();
  setMeta(LEGACY_MIGRATION_META_KEY, {
    ...current,
    [id]: {
      ...detail,
      id,
      policyVersion: LEGACY_MIGRATION_POLICY.version,
      completedAt: now(),
    },
  });
}

function hasUserSettings() {
  if (initSqlite()) {
    const row = db.prepare('SELECT key FROM settings LIMIT 1').get();
    return !!row;
  }
  return Object.keys(loadFallback().settings || {}).length > 0;
}

function getSetting(key, fallbackValue = null) {
  if (initSqlite()) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? parseValue(row.value, fallbackValue) : fallbackValue;
  }
  const data = loadFallback();
  return Object.prototype.hasOwnProperty.call(data.settings, key) ? data.settings[key] : fallbackValue;
}

function setSetting(key, value) {
  if (typeof value === 'undefined') {
    if (initSqlite()) {
      db.prepare('DELETE FROM settings WHERE key = ?').run(key);
      return;
    }
    const data = loadFallback();
    delete data.settings[key];
    saveFallback();
    return;
  }
  if (initSqlite()) {
    db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(value), now());
    return;
  }
  const data = loadFallback();
  data.settings[key] = value;
  saveFallback();
}

function getAllSettings() {
  if (initSqlite()) {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    return rows.reduce((acc, row) => {
      acc[row.key] = parseValue(row.value);
      return acc;
    }, {});
  }
  return { ...loadFallback().settings };
}

function setAllSettings(data) {
  const entries = Object.entries(data || {});
  if (initSqlite()) {
    runTransaction(() => {
      for (const [key, value] of entries) setSetting(key, value);
    });
    return;
  }
  fallback = { ...loadFallback(), settings: { ...(data || {}) } };
  saveFallback();
}

function collectionList(collection) {
  if (initSqlite()) {
    const rows = db.prepare('SELECT value FROM kv_collections WHERE collection = ? ORDER BY updated_at DESC').all(collection);
    return rows.map(row => parseValue(row.value)).filter(Boolean);
  }
  const items = loadFallback().collections[collection] || {};
  return Object.values(items);
}

function collectionReplaceAll(collection, items, idSelector = defaultIdSelector) {
  const safeItems = Array.isArray(items) ? items : [];
  if (initSqlite()) {
    runTransaction(() => {
      db.prepare('DELETE FROM kv_collections WHERE collection = ?').run(collection);
      const upsert = db.prepare(`
        INSERT INTO kv_collections (collection, id, value, updated_at)
        VALUES (?, ?, ?, ?)
      `);
      safeItems.forEach((item, index) => {
        upsert.run(collection, idSelector(item, index), JSON.stringify(item), now());
      });
    });
    return;
  }
  const data = loadFallback();
  data.collections[collection] = {};
  safeItems.forEach((item, index) => {
    data.collections[collection][idSelector(item, index)] = item;
  });
  saveFallback();
}

function collectionCount(collection) {
  if (initSqlite()) {
    const row = db.prepare('SELECT COUNT(*) AS count FROM kv_collections WHERE collection = ?').get(collection);
    return row?.count || 0;
  }
  return Object.keys(loadFallback().collections[collection] || {}).length;
}

function defaultIdSelector(item, index) {
  return String(item?.id ?? item?.key ?? item?.name ?? index);
}

function collectionUpsert(collection, id, value) {
  if (!id) throw new Error('Collection item id is required');
  if (initSqlite()) {
    db.prepare(`
      INSERT INTO kv_collections (collection, id, value, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(collection, id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(collection, id, JSON.stringify(value), now());
    return;
  }
  const data = loadFallback();
  data.collections[collection] = data.collections[collection] || {};
  data.collections[collection][id] = value;
  saveFallback();
}

function collectionDelete(collection, id) {
  if (initSqlite()) {
    db.prepare('DELETE FROM kv_collections WHERE collection = ? AND id = ?').run(collection, id);
    return;
  }
  const data = loadFallback();
  if (data.collections[collection]) delete data.collections[collection][id];
  saveFallback();
}

function migrateLegacySettings() {
  const migrationId = LEGACY_MIGRATION_POLICY.settingsImportId;
  const migrationState = getLegacyMigrationState()[migrationId];
  if (migrationState?.status === 'imported' || migrationState?.status === 'skipped-existing') return;
  if (!fs.existsSync(LEGACY_SETTINGS_FILE)) return;
  let legacy = null;
  try {
    legacy = JSON.parse(fs.readFileSync(LEGACY_SETTINGS_FILE, 'utf8'));
  } catch {
    markLegacyMigration(migrationId, {
      status: 'invalid',
      source: LEGACY_SETTINGS_FILE,
      reason: 'invalid-json',
    });
    return;
  }
  if (!legacy || typeof legacy !== 'object') {
    markLegacyMigration(migrationId, {
      status: 'invalid',
      source: LEGACY_SETTINGS_FILE,
      reason: 'non-object',
    });
    return;
  }

  if (hasUserSettings()) {
    markLegacyMigration(migrationId, {
      status: 'skipped-existing',
      source: LEGACY_SETTINGS_FILE,
    });
    return;
  }

  if (db) {
    const insert = db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
    runTransaction(() => {
      for (const [key, value] of Object.entries(legacy)) insert.run(key, JSON.stringify(value), now());
    });
  } else {
    const data = loadFallback();
    data.settings = legacy;
    saveFallback();
  }

  markLegacyMigration(migrationId, {
    status: 'imported',
    source: LEGACY_SETTINGS_FILE,
    importedKeys: Object.keys(legacy),
  });
}

function runTransaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  }
}

module.exports = {
  DB_FILE,
  FALLBACK_FILE,
  LEGACY_SETTINGS_FILE,
  LEGACY_MIGRATION_POLICY,
  isSqliteAvailable,
  getSetting,
  setSetting,
  getAllSettings,
  setAllSettings,
  getMeta,
  setMeta,
  getLegacyMigrationState,
  markLegacyMigration,
  collectionList,
  collectionReplaceAll,
  collectionCount,
  collectionUpsert,
  collectionDelete,
};
