// @vitest-environment node

import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

function loadRecoveryModule() {
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/recovery.js'), 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);

  runModule((id) => {
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/recovery.js'));

  return module.exports;
}

describe('startup recovery page', () => {
  it('renders escaped recovery html with diagnostics path and details', () => {
    const recovery = loadRecoveryModule();

    const html = recovery.buildRecoveryHtml({
      title: 'Meg renderer build is missing',
      summary: 'The packaged app could not find its renderer files.',
      details: ['Expected renderer build: C:\\dist\\renderer\\index.html', 'Error: <bad>'],
      diagnosticsPath: 'C:\\logs\\meg-runtime.jsonl',
    });

    expect(html).toContain('Meg renderer build is missing');
    expect(html).toContain('The packaged app could not find its renderer files.');
    expect(html).toContain('Expected renderer build: C:\\dist\\renderer\\index.html');
    expect(html).toContain('C:\\logs\\meg-runtime.jsonl');
    expect(html).toContain('&lt;bad&gt;');
  });

  it('loads the recovery page through a data url', async () => {
    const recovery = loadRecoveryModule();
    const win = {
      loadURL: vi.fn(async (url) => url),
    };

    await recovery.showRecoveryPage(win, {
      title: 'Meg could not start',
      summary: 'Renderer failed to load.',
      details: ['Error: missing build'],
      diagnosticsPath: 'C:\\logs\\meg-runtime.jsonl',
    });

    expect(win.loadURL).toHaveBeenCalledTimes(1);
    const [url] = win.loadURL.mock.calls[0];
    expect(url.startsWith('data:text/html;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url.replace('data:text/html;charset=utf-8,', ''))).toContain('Renderer failed to load.');
  });
});
