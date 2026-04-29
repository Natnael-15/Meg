// @vitest-environment node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function loadWorkspaceModule(state) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/workspace.js'), 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);

  runModule((id) => {
    if (id === 'fs') return require('fs');
    if (id === 'path') return require('path');
    if (id === './settings') {
      return {
        get: (key) => state[key],
        set: (key, value) => {
          state[key] = value;
        },
      };
    }
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/workspace.js'));

  return module.exports;
}

describe('workspace module', () => {
  let workspace;
  let tempRoot;
  let state;

  beforeEach(() => {
    state = {
      workspaces: [],
      activeWorkspaceId: null,
      toolWriteRoots: [],
    };
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meg-workspace-'));
    workspace = loadWorkspaceModule(state);
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('upserts a normalized workspace and deduplicates by path', () => {
    const first = workspace.upsert({
      id: 'ws-1',
      name: 'Spec Workspace',
      path: tempRoot,
    });

    const second = workspace.upsert({
      id: 'ws-2',
      name: 'Renamed Workspace',
      path: tempRoot,
    });

    expect(first.path).toBe(path.resolve(tempRoot));
    expect(second.path).toBe(path.resolve(tempRoot));
    expect(workspace.list()).toHaveLength(1);
    expect(workspace.list()[0]).toMatchObject({
      id: 'ws-2',
      name: 'Renamed Workspace',
      path: path.resolve(tempRoot),
    });
  });

  it('sets an object workspace active and updates tool write roots', () => {
    const active = workspace.setActive({
      id: 'ws-live',
      name: 'Live Workspace',
      path: tempRoot,
    });

    expect(active).toMatchObject({
      id: 'ws-live',
      name: 'Live Workspace',
      path: path.resolve(tempRoot),
    });
    expect(state.activeWorkspaceId).toBe('ws-live');
    expect(state.toolWriteRoots).toEqual([path.resolve(tempRoot)]);
    expect(workspace.getActive()).toMatchObject({ id: 'ws-live' });
  });

  it('activates an existing workspace by id and stamps lastActiveAt', () => {
    workspace.upsert({
      id: 'ws-existing',
      name: 'Existing Workspace',
      path: tempRoot,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastActiveAt: '2026-01-02T00:00:00.000Z',
    });

    const active = workspace.setActive('ws-existing');

    expect(active.id).toBe('ws-existing');
    expect(active.path).toBe(path.resolve(tempRoot));
    expect(active.lastActiveAt).toBeTruthy();
    expect(active.lastActiveAt).not.toBe('2026-01-02T00:00:00.000Z');
    expect(state.activeWorkspaceId).toBe('ws-existing');
    expect(state.toolWriteRoots).toEqual([path.resolve(tempRoot)]);
  });

  it('uses active workspace and ignored dirs for helper lookups', () => {
    workspace.setActive({
      id: 'ws-fallback',
      name: 'Fallback Workspace',
      path: tempRoot,
      ignoredDirs: ['coverage', '.cache'],
    });

    expect(workspace.getRootFallback('C:\\fallback')).toBe(path.resolve(tempRoot));
    expect(workspace.isGeneratedDir('.cache')).toBe(true);
    expect(workspace.isGeneratedDir('src')).toBe(false);
  });

  it('refreshes cached workspace metadata recursively and skips ignored directories', () => {
    fs.mkdirSync(path.join(tempRoot, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'node_modules', 'left-pad'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'package.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(tempRoot, 'src', 'app.tsx'), 'export default null;', 'utf8');
    fs.writeFileSync(path.join(tempRoot, 'node_modules', 'left-pad', 'index.js'), 'module.exports = {};', 'utf8');

    const saved = workspace.upsert({
      id: 'ws-meta',
      name: 'Meta Workspace',
      path: tempRoot,
    });

    expect(saved.files).toBe(2);
    expect(saved.lang).toBe('TypeScript');
    expect(saved.inventory.map((entry) => entry.path).sort()).toEqual([
      path.join(tempRoot, 'package.json'),
      path.join(tempRoot, 'src', 'app.tsx'),
    ].sort());

    fs.writeFileSync(path.join(tempRoot, 'README.md'), '# readme', 'utf8');
    const refreshed = workspace.refreshWorkspaceMeta('ws-meta');

    expect(refreshed.files).toBe(3);
    expect(refreshed.inventory.some((entry) => entry.path.endsWith('README.md'))).toBe(true);
    expect(refreshed.inventory.some((entry) => entry.path.includes('node_modules'))).toBe(false);
    expect(refreshed.inventoryUpdatedAt).toBeTruthy();
  });

  it('searches cached workspace inventory by file name and path', () => {
    fs.mkdirSync(path.join(tempRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'package.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(tempRoot, 'src', 'app.tsx'), 'export default null;', 'utf8');

    workspace.upsert({
      id: 'ws-search',
      name: 'Search Workspace',
      path: tempRoot,
    });

    const byName = workspace.searchFiles('ws-search', 'app.tsx');
    expect(byName.total).toBe(1);
    expect(byName.results[0].path).toContain(path.join('src', 'app.tsx'));

    const byPath = workspace.searchFiles('ws-search', 'package');
    expect(byPath.total).toBe(1);
    expect(byPath.results[0].path).toContain('package.json');
  });
});
