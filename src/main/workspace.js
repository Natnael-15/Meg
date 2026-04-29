const fs = require('fs');
const path = require('path');
const settings = require('./settings');

const GENERATED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  'build',
  '.next',
  '.vite',
  'coverage',
]);
const MAX_WORKSPACE_INVENTORY = 2000;
const WORKSPACE_META_MAX_AGE_MS = 5 * 60 * 1000;
const DEFAULT_WORKSPACE_SEARCH_LIMIT = 100;
const EXT_LABELS = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  html: 'HTML',
  css: 'CSS',
  md: 'Markdown',
};

function getEntryExt(name = '') {
  const ext = path.extname(name).replace(/^\./, '').toLowerCase();
  return ext || null;
}

function deriveWorkspaceLanguage(files = []) {
  const counts = files.reduce((acc, file) => {
    const ext = file.ext || getEntryExt(file.name);
    if (!ext) return acc;
    acc[ext] = (acc[ext] || 0) + 1;
    return acc;
  }, {});
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  return best ? (EXT_LABELS[best] || best.toUpperCase()) : '';
}

function sortDirectoryEntries(entries = []) {
  return [...entries].sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function collectWorkspaceInventory(rootPath, ignoredDirs = []) {
  const files = [];
  const visited = new Set();
  const ignored = new Set(Array.isArray(ignoredDirs) && ignoredDirs.length ? ignoredDirs : Array.from(GENERATED_DIRS));
  let truncated = false;

  function visit(dirPath) {
    if (!dirPath || visited.has(dirPath) || truncated) return;
    visited.add(dirPath);

    let entries = [];
    try {
      entries = sortDirectoryEntries(fs.readdirSync(dirPath, { withFileTypes: true }));
    } catch {
      return;
    }

    for (const entry of entries) {
      if (truncated) break;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (ignored.has(entry.name)) continue;
        visit(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      let stats;
      try {
        stats = fs.statSync(fullPath);
      } catch {
        continue;
      }
      files.push({
        name: entry.name,
        path: fullPath,
        ext: getEntryExt(entry.name),
        size: stats.size,
        mtime: stats.mtime.toISOString(),
      });
      if (files.length >= MAX_WORKSPACE_INVENTORY) {
        truncated = true;
      }
    }
  }

  visit(rootPath);

  return {
    files,
    truncated,
    lang: deriveWorkspaceLanguage(files),
  };
}

function buildWorkspaceMeta(workspace) {
  const inventory = collectWorkspaceInventory(workspace.path, workspace.ignoredDirs);
  return {
    files: inventory.files.length,
    lang: inventory.lang,
    inventory: inventory.files,
    inventoryTruncated: inventory.truncated,
    inventoryUpdatedAt: new Date().toISOString(),
  };
}

function isMetaStale(workspace) {
  if (!workspace?.inventoryUpdatedAt) return true;
  const updatedAt = Date.parse(workspace.inventoryUpdatedAt);
  if (Number.isNaN(updatedAt)) return true;
  return (Date.now() - updatedAt) > WORKSPACE_META_MAX_AGE_MS;
}

function normalizeWorkspace(input = {}) {
  if (!input.path || typeof input.path !== 'string') {
    throw new Error('Workspace path is required');
  }
  const fullPath = path.resolve(input.path);
  if (!fs.existsSync(fullPath)) throw new Error(`Workspace path does not exist: ${fullPath}`);
  if (!fs.statSync(fullPath).isDirectory()) throw new Error(`Workspace path is not a directory: ${fullPath}`);

  return {
    id: input.id || `ws-${Date.now()}`,
    name: input.name || path.basename(fullPath),
    path: fullPath,
    ignoredDirs: Array.isArray(input.ignoredDirs) ? input.ignoredDirs : Array.from(GENERATED_DIRS),
    createdAt: input.createdAt || new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    files: typeof input.files === 'number' ? input.files : 0,
    lang: input.lang || '',
    inventory: Array.isArray(input.inventory) ? input.inventory : [],
    inventoryTruncated: Boolean(input.inventoryTruncated),
    inventoryUpdatedAt: input.inventoryUpdatedAt || null,
  };
}

function list() {
  const workspaces = settings.get('workspaces');
  return Array.isArray(workspaces) ? workspaces : [];
}

function saveAll(workspaces) {
  settings.set('workspaces', Array.isArray(workspaces) ? workspaces : []);
}

function refreshWorkspaceMeta(target) {
  const current = list();
  const targetId = typeof target === 'string' ? target : target?.id;
  const targetPath = typeof target === 'object' ? path.resolve(target.path) : null;
  let refreshedWorkspace = null;

  const next = current.map((workspace) => {
    const matchesTarget =
      !target ||
      workspace.id === targetId ||
      (targetPath && path.resolve(workspace.path) === targetPath);
    if (!matchesTarget) return workspace;
    const refreshed = { ...workspace, ...buildWorkspaceMeta(workspace) };
    refreshedWorkspace = refreshed;
    return refreshed;
  });

  if (!refreshedWorkspace) return null;
  saveAll(next);
  return refreshedWorkspace;
}

function resolveWorkspace(target) {
  const current = list();
  if (!target) return null;
  const targetId = typeof target === 'string' ? target : target?.id;
  const targetPath = typeof target === 'object' && target?.path ? path.resolve(target.path) : null;
  return current.find((workspace) => (
    workspace.id === targetId ||
    (targetPath && path.resolve(workspace.path) === targetPath)
  )) || null;
}

function listWithMeta() {
  const current = list();
  let changed = false;
  const next = current.map((workspace) => {
    if (!isMetaStale(workspace)) return workspace;
    changed = true;
    return { ...workspace, ...buildWorkspaceMeta(workspace) };
  });
  if (changed) {
    saveAll(next);
    return next;
  }
  return current;
}

function searchFiles(target, query, limit = DEFAULT_WORKSPACE_SEARCH_LIMIT) {
  const workspace = resolveWorkspace(target);
  if (!workspace) throw new Error(`Workspace not found: ${typeof target === 'string' ? target : target?.id || target?.path || 'unknown'}`);
  const normalizedQuery = typeof query === 'string' ? query.trim().toLowerCase() : '';
  const count = Number.isFinite(limit) ? Math.max(1, Math.min(limit, DEFAULT_WORKSPACE_SEARCH_LIMIT)) : DEFAULT_WORKSPACE_SEARCH_LIMIT;
  const current = isMetaStale(workspace) ? refreshWorkspaceMeta(workspace.id) : workspace;
  const inventory = Array.isArray(current?.inventory) ? current.inventory : [];
  const results = normalizedQuery
    ? inventory.filter((entry) => {
      const name = entry.name?.toLowerCase() || '';
      const fullPath = entry.path?.toLowerCase() || '';
      return name.includes(normalizedQuery) || fullPath.includes(normalizedQuery);
    })
    : inventory;
  return {
    workspaceId: current.id,
    query: normalizedQuery,
    total: results.length,
    truncated: Boolean(current.inventoryTruncated),
    results: results
      .slice()
      .sort((a, b) => Date.parse(b.mtime || 0) - Date.parse(a.mtime || 0))
      .slice(0, count),
  };
}

function upsert(input) {
  const workspace = normalizeWorkspace(input);
  const refreshed = { ...workspace, ...buildWorkspaceMeta(workspace) };
  const existing = list();
  const next = [
    refreshed,
    ...existing.filter(w => w.id !== refreshed.id && path.resolve(w.path) !== refreshed.path),
  ];
  saveAll(next);
  return refreshed;
}

function getActiveId() {
  return settings.get('activeWorkspaceId') || null;
}

function getActive() {
  const activeId = getActiveId();
  return listWithMeta().find(w => w.id === activeId) || null;
}

function setActive(idOrWorkspace) {
  if (!idOrWorkspace) {
    settings.set('activeWorkspaceId', null);
    return null;
  }

  if (typeof idOrWorkspace === 'object') {
    const workspace = upsert(idOrWorkspace);
    settings.set('activeWorkspaceId', workspace.id);
    settings.set('toolWriteRoots', [workspace.path]);
    return workspace;
  }

  const workspace = list().find(w => w.id === idOrWorkspace);
  if (!workspace) throw new Error(`Workspace not found: ${idOrWorkspace}`);
  const next = { ...workspace, lastActiveAt: new Date().toISOString() };
  saveAll(list().map(w => w.id === next.id ? next : w));
  settings.set('activeWorkspaceId', next.id);
  settings.set('toolWriteRoots', [next.path]);
  return next;
}

function getRootFallback(cwd) {
  const active = getActive();
  return active?.path || cwd || process.cwd();
}

function isGeneratedDir(name) {
  const active = getActive();
  const ignored = new Set(active?.ignoredDirs || GENERATED_DIRS);
  return ignored.has(name);
}

module.exports = {
  GENERATED_DIRS,
  list,
  listWithMeta,
  upsert,
  getActive,
  setActive,
  getRootFallback,
  isGeneratedDir,
  refreshWorkspaceMeta,
  searchFiles,
};
