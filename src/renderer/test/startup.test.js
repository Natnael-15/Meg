// @vitest-environment node

import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

function loadStartupModule(fsOverrides = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/startup.js'), 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);

  runModule((id) => {
    if (id === 'fs') {
      return {
        existsSync: fsOverrides.existsSync || vi.fn(() => false),
      };
    }
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/startup.js'));

  return module.exports;
}

describe('renderer startup loader', () => {
  it('shows recovery when the dev server fails and no fallback build exists', async () => {
    const startup = loadStartupModule({
      existsSync: vi.fn(() => false),
    });
    const win = {
      loadURL: vi.fn(async () => { throw new Error('connect ECONNREFUSED'); }),
      loadFile: vi.fn(async () => true),
    };
    const reportRuntime = vi.fn();
    const showRecoveryPage = vi.fn(async () => true);

    const result = await startup.loadRendererSurface(win, reportRuntime, {
      appRef: { isPackaged: false },
      devServerUrl: 'http://127.0.0.1:59999',
      rendererIndex: 'C:\\dist\\renderer\\index.html',
      diagnosticsPath: 'C:\\logs\\meg-runtime.jsonl',
      showRecoveryPage,
    });

    expect(result).toEqual({ mode: 'recovery', reason: 'dev-load-failed' });
    expect(showRecoveryPage).toHaveBeenCalledWith(win, expect.objectContaining({
      title: 'Meg could not reach the dev renderer',
      diagnosticsPath: 'C:\\logs\\meg-runtime.jsonl',
    }));
    expect(reportRuntime).toHaveBeenCalledWith('renderer:dev-load-failed', expect.any(Object), 'error');
  });

  it('shows recovery when the packaged build is missing', async () => {
    const startup = loadStartupModule({
      existsSync: vi.fn(() => false),
    });
    const win = {
      loadURL: vi.fn(async () => true),
      loadFile: vi.fn(async () => true),
    };
    const reportRuntime = vi.fn();
    const showRecoveryPage = vi.fn(async () => true);

    const result = await startup.loadRendererSurface(win, reportRuntime, {
      appRef: { isPackaged: true },
      devServerUrl: 'http://127.0.0.1:5173',
      rendererIndex: 'C:\\dist\\renderer\\index.html',
      diagnosticsPath: 'C:\\logs\\meg-runtime.jsonl',
      showRecoveryPage,
    });

    expect(result).toEqual({ mode: 'recovery', reason: 'build-missing' });
    expect(showRecoveryPage).toHaveBeenCalledWith(win, expect.objectContaining({
      title: 'Meg renderer build is missing',
    }));
    expect(reportRuntime).toHaveBeenCalledWith('renderer:build-missing', { rendererIndex: 'C:\\dist\\renderer\\index.html' }, 'error');
  });

  it('shows recovery when the packaged renderer exists but loadFile fails', async () => {
    const startup = loadStartupModule({
      existsSync: vi.fn(() => true),
    });
    const win = {
      loadURL: vi.fn(async () => true),
      loadFile: vi.fn(async () => { throw new Error('load failed'); }),
    };
    const reportRuntime = vi.fn();
    const showRecoveryPage = vi.fn(async () => true);

    const result = await startup.loadRendererSurface(win, reportRuntime, {
      appRef: { isPackaged: true },
      devServerUrl: 'http://127.0.0.1:5173',
      rendererIndex: 'C:\\dist\\renderer\\index.html',
      diagnosticsPath: 'C:\\logs\\meg-runtime.jsonl',
      showRecoveryPage,
    });

    expect(result).toEqual({ mode: 'recovery', reason: 'packaged-load-failed' });
    expect(showRecoveryPage).toHaveBeenCalledWith(win, expect.objectContaining({
      title: 'Meg could not load the renderer',
    }));
    expect(reportRuntime).toHaveBeenCalledWith('renderer:load-failed', expect.objectContaining({
      rendererIndex: 'C:\\dist\\renderer\\index.html',
      error: 'load failed',
    }), 'error');
  });
});
