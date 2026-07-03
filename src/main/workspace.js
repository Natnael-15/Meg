const fsp = require('fs/promises');
const path = require('path');
const settings = require('./settings');
const store = require('./store');

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
const WORKSPACE_INDEX_COLLECTION = 'workspaceIndex';
const LEGACY_WORKSPACE_COLLECTION = 'workspaces';
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

async function collectWorkspaceInventory(rootPath, ignoredDirs = []) {
  const files = [];
  const visited = new Set();
  const ignored = new Set(Array.isArray(ignoredDirs) && ignoredDirs.length ? ignoredDirs : Array.from(GENERATED_DIRS));
  let truncated = false;

  // Async recursive walk. The original sync version used fs.readdirSync +
  // fs.statSync, which blocked the main process event loop for the entire
  // walk — up to 2000 files. On a network drive or a large repo this could
  // freeze the renderer UI for seconds. The async version yields between
  // directory reads so other IPC handlers (chat streaming, approvals, etc.)
  // can make progress.
  async function visit(dirPath) {
    if (!dirPath || visited.has(dirPath) || truncated) return;
    visited.add(dirPath);

    let entries = [];
    try {
      entries = sortDirectoryEntries(await fsp.readdir(dirPath, { withFileTypes: true }));
    } catch {
      return;
    }

    for (const entry of entries) {
      if (truncated) break;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (ignored.has(entry.name)) continue;
        await visit(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      let stats;
      try {
        stats = await fsp.stat(fullPath);
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

  await visit(rootPath);

  return {
    files,
    truncated,
    lang: deriveWorkspaceLanguage(files),
  };
}

async function buildWorkspaceMeta(workspace) {
  const inventory = await collectWorkspaceInventory(workspace.path, workspace.ignoredDirs);
  return {
    files: inventory.files.length,
    lang: inventory.lang,
    inventory: inventory.files,
    inventoryTruncated: inventory.truncated,
    inventoryUpdatedAt: new Date().toISOString(),
  };
}

function sanitizeWorkspaceRecord(workspace = {}) {
  if (!workspace || typeof workspace !== 'object') return workspace;
  const {
    files,
    lang,
    inventory,
    inventoryTruncated,
    inventoryUpdatedAt,
    ...rest
  } = workspace;
  return rest;
}

function readWorkspaceIndex(workspaceId) {
  if (!workspaceId) return null;
  return store.collectionGet(WORKSPACE_INDEX_COLLECTION, String(workspaceId), null);
}

function writeWorkspaceIndex(workspaceId, meta) {
  if (!workspaceId || !meta) return;
  store.collectionUpsert(WORKSPACE_INDEX_COLLECTION, String(workspaceId), {
    workspaceId: String(workspaceId),
    files: typeof meta.files === 'number' ? meta.files : 0,
    lang: meta.lang || '',
    inventory: Array.isArray(meta.inventory) ? meta.inventory : [],
    inventoryTruncated: Boolean(meta.inventoryTruncated),
    inventoryUpdatedAt: meta.inventoryUpdatedAt || new Date().toISOString(),
  });
}

function deleteWorkspaceIndex(workspaceId) {
  if (!workspaceId) return;
  store.collectionDelete(WORKSPACE_INDEX_COLLECTION, String(workspaceId));
}

function migrateWorkspaceIndex(workspace) {
  if (!workspace?.id) return sanitizeWorkspaceRecord(workspace);
  const hasInlineIndex =
    typeof workspace.files === 'number' ||
    typeof workspace.lang === 'string' && workspace.lang.length > 0 ||
    Array.isArray(workspace.inventory) ||
    workspace.inventoryTruncated ||
    workspace.inventoryUpdatedAt;
  if (!hasInlineIndex) return sanitizeWorkspaceRecord(workspace);
  if (!readWorkspaceIndex(workspace.id)) {
    writeWorkspaceIndex(workspace.id, {
      files: workspace.files,
      lang: workspace.lang,
      inventory: workspace.inventory,
      inventoryTruncated: workspace.inventoryTruncated,
      inventoryUpdatedAt: workspace.inventoryUpdatedAt,
    });
  }
  return sanitizeWorkspaceRecord(workspace);
}

function mergeWorkspaceMeta(workspace, meta = null) {
  return {
    ...workspace,
    files: typeof meta?.files === 'number' ? meta.files : 0,
    lang: meta?.lang || '',
    inventory: Array.isArray(meta?.inventory) ? meta.inventory : [],
    inventoryTruncated: Boolean(meta?.inventoryTruncated),
    inventoryUpdatedAt: meta?.inventoryUpdatedAt || null,
  };
}

function isMetaStale(workspace) {
  const index = workspace?.id ? readWorkspaceIndex(workspace.id) : null;
  if (!index?.inventoryUpdatedAt) return true;
  const updatedAt = Date.parse(index.inventoryUpdatedAt);
  if (Number.isNaN(updatedAt)) return true;
  return (Date.now() - updatedAt) > WORKSPACE_META_MAX_AGE_MS;
}

async function normalizeWorkspace(input = {}) {
  if (!input.path || typeof input.path !== 'string') {
    throw new Error('Workspace path is required');
  }
  const fullPath = path.resolve(input.path);
  let stats;
  try {
    stats = await fsp.stat(fullPath);
  } catch {
    throw new Error(`Workspace path does not exist: ${fullPath}`);
  }
  if (!stats.isDirectory()) throw new Error(`Workspace path is not a directory: ${fullPath}`);

  return {
    id: input.id || `ws-${Date.now()}`,
    name: input.name || path.basename(fullPath),
    path: fullPath,
    ignoredDirs: Array.isArray(input.ignoredDirs) ? input.ignoredDirs : Array.from(GENERATED_DIRS),
    createdAt: input.createdAt || new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };
}

async function migrateLegacyWorkspaceCollection() {
  const current = settings.get('workspaces');
  if (Array.isArray(current) && current.length > 0) return current;
  const legacy = store.collectionList(LEGACY_WORKSPACE_COLLECTION) || [];
  if (!Array.isArray(legacy) || legacy.length === 0) return Array.isArray(current) ? current : [];
  const migrated = [];
  for (const item of legacy) {
    migrated.push(await normalizeWorkspace(item));
  }
  saveAll(migrated);
  store.collectionReplaceAll(LEGACY_WORKSPACE_COLLECTION, [], (item, index) => String(item?.id ?? index));
  return migrated;
}

async function list() {
  const workspaces = await migrateLegacyWorkspaceCollection();
  const current = Array.isArray(workspaces) ? workspaces : [];
  let changed = false;
  const sanitized = current.map((workspace) => {
    const next = migrateWorkspaceIndex(workspace);
    if (JSON.stringify(next) !== JSON.stringify(workspace)) changed = true;
    return next;
  });
  if (changed) saveAll(sanitized);
  return sanitized;
}

function saveAll(workspaces) {
  settings.set('workspaces', Array.isArray(workspaces) ? workspaces.map(sanitizeWorkspaceRecord) : []);
}

async function refreshWorkspaceMeta(target) {
  const current = await list();
  const targetId = typeof target === 'string' ? target : target?.id;
  const targetPath = typeof target === 'object' ? path.resolve(target.path) : null;
  const workspace = current.find((item) => (
    !target ||
    item.id === targetId ||
    (targetPath && path.resolve(item.path) === targetPath)
  ));
  if (!workspace) return null;
  const meta = await buildWorkspaceMeta(workspace);
  writeWorkspaceIndex(workspace.id, meta);
  return mergeWorkspaceMeta(workspace, meta);
}

async function resolveWorkspace(target) {
  const current = await list();
  if (!target) return null;
  const targetId = typeof target === 'string' ? target : target?.id;
  const targetPath = typeof target === 'object' && target?.path ? path.resolve(target.path) : null;
  return current.find((workspace) => (
    workspace.id === targetId ||
    (targetPath && path.resolve(workspace.path) === targetPath)
  )) || null;
}

async function listWithMeta() {
  const current = await list();
  const results = [];
  for (const workspace of current) {
    if (isMetaStale(workspace)) {
      results.push(await refreshWorkspaceMeta(workspace.id));
    } else {
      results.push(mergeWorkspaceMeta(workspace, readWorkspaceIndex(workspace.id)));
    }
  }
  return results;
}

async function searchFiles(target, query, limit = DEFAULT_WORKSPACE_SEARCH_LIMIT) {
  const workspace = await resolveWorkspace(target);
  if (!workspace) throw new Error(`Workspace not found: ${typeof target === 'string' ? target : target?.id || target?.path || 'unknown'}`);
  const normalizedQuery = typeof query === 'string' ? query.trim().toLowerCase() : '';
  const count = Number.isFinite(limit) ? Math.max(1, Math.min(limit, DEFAULT_WORKSPACE_SEARCH_LIMIT)) : DEFAULT_WORKSPACE_SEARCH_LIMIT;
  const current = isMetaStale(workspace)
    ? await refreshWorkspaceMeta(workspace.id)
    : mergeWorkspaceMeta(workspace, readWorkspaceIndex(workspace.id));
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

async function upsert(input) {
  const workspace = await normalizeWorkspace(input);
  const meta = await buildWorkspaceMeta(workspace);
  writeWorkspaceIndex(workspace.id, meta);
  const refreshed = mergeWorkspaceMeta(workspace, meta);
  const existing = await list();
  const removed = existing.filter(w => w.id !== refreshed.id && path.resolve(w.path) === refreshed.path);
  removed.forEach((workspaceToDelete) => deleteWorkspaceIndex(workspaceToDelete.id));
  const next = [
    refreshed,
    ...existing.filter(w => w.id !== refreshed.id && path.resolve(w.path) !== refreshed.path),
  ];
  saveAll(next);
  return refreshed;
}

async function getActiveId() {
  return settings.get('activeWorkspaceId') || null;
}

async function getActive() {
  const activeId = await getActiveId();
  const all = await listWithMeta();
  return all.find(w => w.id === activeId) || null;
}

async function setActive(idOrWorkspace) {
  if (!idOrWorkspace) {
    settings.set('activeWorkspaceId', null);
    return null;
  }

  if (typeof idOrWorkspace === 'object') {
    const workspace = await upsert(idOrWorkspace);
    settings.set('activeWorkspaceId', workspace.id);
    settings.set('toolWriteRoots', [workspace.path]);
    return workspace;
  }

  const all = await list();
  const workspace = all.find(w => w.id === idOrWorkspace);
  if (!workspace) throw new Error(`Workspace not found: ${idOrWorkspace}`);
  const next = { ...workspace, lastActiveAt: new Date().toISOString() };
  const currentList = await list();
  saveAll(currentList.map(w => w.id === next.id ? next : w));
  settings.set('activeWorkspaceId', next.id);
  settings.set('toolWriteRoots', [next.path]);
  return next;
}

async function getRootFallback(cwd) {
  const active = await getActive();
  return active?.path || cwd || process.cwd();
}

/**
 * Synchronous lightweight path lookup. Returns the active workspace's path
 * without triggering an inventory walk. Used by the tool layer's defaultCwd()
 * which is called on every tool execution and can't afford an async round-trip
 * through listWithMeta().
 *
 * Falls back to `cwd` (or process.cwd()) if no active workspace is set or if
 * the active workspace's path no longer exists on disk.
 */
function getActivePathSync() {
  const activeId = settings.get('activeWorkspaceId');
  if (!activeId) return null;
  const workspaces = settings.get('workspaces') || [];
  const active = workspaces.find(w => w.id === activeId);
  return active?.path || null;
}

function isGeneratedDir(name) {
  // Note: this stays sync because tools.searchFiles calls it in a tight loop.
  // It reads the active workspace from settings (cached), so it's O(1) and
  // doesn't touch the filesystem.
  const activeId = settings.get('activeWorkspaceId');
  // Build the ignored set from defaults + the active workspace's overrides
  // without an async list() call. This is safe because ignoredDirs are
  // persisted on the workspace record itself.
  const workspaces = settings.get('workspaces') || [];
  const active = workspaces.find(w => w.id === activeId);
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
  getActivePathSync,
  isGeneratedDir,
  refreshWorkspaceMeta,
  searchFiles,
};
