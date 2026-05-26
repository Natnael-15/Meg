// @vitest-environment node

import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

function loadModule(modulePath, dbState) {
  const source = fs.readFileSync(modulePath, 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);

  runModule((id) => {
    if (id === './db') {
      return {
        load: vi.fn((table) => dbState[table] || []),
        saveAll: vi.fn((table, items) => {
          dbState[table] = items;
        }),
      };
    }
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.dirname(modulePath), modulePath);

  return module.exports;
}

describe('config services', () => {
  it('normalizes agent configs and strips runtime fields at load time', () => {
    const dbState = {
      agents: [{
        id: 'agent-1',
        name: '',
        trigger: '',
        model: '',
        tools: ['terminal', '', null],
        steps: ['Run tests', { label: '', type: '', target: 'src' }],
        enabled: 1,
        lastRunId: 'run-1',
        lastRunStatus: 'done',
        lastRunAt: '2026-04-29T12:00:00.000Z',
      }],
    };
    const service = loadModule(path.resolve(__dirname, '../../main/agentConfigs.js'), dbState);

    const items = service.list();

    expect(items).toEqual([{
      schemaVersion: 1,
      id: 'agent-1',
      name: 'new-agent',
      trigger: 'manual only',
      model: '',
      tools: ['terminal'],
      steps: [
        { id: 'step-1', type: 'command', label: 'Run tests', target: '' },
        { id: 'step-2', type: 'command', label: 'Untitled step', target: 'src' },
      ],
      enabled: true,
    }]);
    expect(dbState.agents[0].lastRunId).toBeUndefined();
  });

  it('normalizes automation configs and strips runtime fields at save time', () => {
    const dbState = { automations: [] };
    const service = loadModule(path.resolve(__dirname, '../../main/automationConfigs.js'), dbState);

    const saved = service.saveAll([{
      id: 'auto-1',
      name: '',
      trigger: null,
      actions: [null, { label: '', type: '', target: 'npm test' }],
      enabled: 'yes',
      runs: 4,
      lastRun: 'yesterday',
      lastRunId: 'run-1',
      lastRunStatus: 'done',
    }]);

    expect(saved).toEqual([{
      schemaVersion: 1,
      id: 'auto-1',
      name: 'New automation',
      trigger: { type: 'manual', detail: 'Run from the app' },
      actions: [
        { id: 'action-1', type: 'notify', label: 'Action 1', target: '' },
        { id: 'action-2', type: 'notify', label: 'Action 2', target: 'npm test' },
      ],
      enabled: true,
    }]);
    expect(dbState.automations[0].runs).toBeUndefined();
    expect(dbState.automations[0].lastRunStatus).toBeUndefined();
  });

  it('supports incremental agent config upsert and delete operations', () => {
    const dbState = { agents: [] };
    const service = loadModule(path.resolve(__dirname, '../../main/agentConfigs.js'), dbState);

    service.upsert({ id: 'agent-1', name: 'reviewer', steps: ['Run tests'] });
    service.upsert({ id: 'agent-1', name: 'reviewer-updated', steps: ['Run tests'] });
    service.remove('agent-1');

    expect(dbState.agents).toEqual([]);
  });

  it('supports incremental automation config upsert and delete operations', () => {
    const dbState = { automations: [] };
    const service = loadModule(path.resolve(__dirname, '../../main/automationConfigs.js'), dbState);

    service.upsert({ id: 'auto-1', name: 'deploy', actions: [{ label: 'Notify' }] });
    service.upsert({ id: 'auto-1', name: 'deploy-updated', actions: [{ label: 'Notify' }] });
    service.remove('auto-1');

    expect(dbState.automations).toEqual([]);
  });
});
