const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./store');

function migrationId(table) {
  return `table:${table}:meg-${table}.json:${store.LEGACY_MIGRATION_POLICY.tableImportVersion}`;
}

function filePath(table) {
  const userData = app?.getPath ? app.getPath('userData') : process.cwd();
  return path.join(userData, `meg-${table}.json`);
}

function load(table) {
  migrateLegacyTable(table);
  return store.collectionList(table);
}

function saveAll(table, items) {
  store.collectionReplaceAll(table, Array.isArray(items) ? items : [], itemId);
}

function itemId(item, index) {
  return String(item?.id ?? item?.key ?? item?.name ?? `${Date.now()}-${index}`);
}

function migrateLegacyTable(table) {
  const id = migrationId(table);
  const state = store.getLegacyMigrationState()[id];
  if (state?.status === 'imported' || state?.status === 'skipped-existing') return;
  if (store.collectionCount(table) > 0) return;
  const legacyPath = filePath(table);
  if (!fs.existsSync(legacyPath)) return;
  try {
    const items = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
    if (Array.isArray(items) && items.length) {
      store.collectionReplaceAll(table, items, itemId);
      store.markLegacyMigration(id, {
        status: 'imported',
        table,
        source: legacyPath,
        importedCount: items.length,
      });
      return;
    }
    store.markLegacyMigration(id, {
      status: 'skipped-empty',
      table,
      source: legacyPath,
    });
  } catch {
    store.markLegacyMigration(id, {
      status: 'invalid',
      table,
      source: legacyPath,
      reason: 'invalid-json',
    });
  }
}

module.exports = { load, saveAll, filePath };
