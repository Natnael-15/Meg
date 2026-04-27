const { app } = require('electron');
const path = require('path');
const fs = require('fs');

function filePath(table) {
  return path.join(app.getPath('userData'), `meg-${table}.json`);
}

function load(table) {
  try {
    return JSON.parse(fs.readFileSync(filePath(table), 'utf8'));
  } catch {
    return [];
  }
}

function saveAll(table, items) {
  fs.writeFileSync(filePath(table), JSON.stringify(items, null, 2), 'utf8');
}

module.exports = { load, saveAll };
