const fs = require('fs');

async function loadRendererSurface(win, reportRuntime, {
  appRef,
  devServerUrl,
  rendererIndex,
  diagnosticsPath,
  showRecoveryPage,
}) {
  if (!appRef?.isPackaged) {
    try {
      await win.loadURL(devServerUrl);
      return { mode: 'dev-server' };
    } catch (error) {
      reportRuntime('renderer:dev-load-failed', { devServerUrl, error: error.message }, 'error');
      if (fs.existsSync(rendererIndex)) {
        reportRuntime('renderer:dev-fallback-to-build', { rendererIndex });
        try {
          await win.loadFile(rendererIndex);
          return { mode: 'dev-fallback-build' };
        } catch (fallbackError) {
          reportRuntime('renderer:dev-fallback-load-failed', { rendererIndex, error: fallbackError.message }, 'error');
          await showRecoveryPage(win, {
            title: 'Meg could not load the fallback renderer build',
            summary: 'The Vite dev server failed and the local renderer build also failed to load.',
            details: [
              `Dev server URL: ${devServerUrl}`,
              `Fallback renderer build: ${rendererIndex}`,
              `Error: ${fallbackError.message}`,
            ],
            diagnosticsPath,
          });
          reportRuntime('renderer:recovery-shown', {
            title: 'Meg could not load the fallback renderer build',
            summary: 'The Vite dev server failed and the local renderer build also failed to load.',
          }, 'error');
          return { mode: 'recovery', reason: 'dev-fallback-load-failed' };
        }
      }
      await showRecoveryPage(win, {
        title: 'Meg could not reach the dev renderer',
        summary: 'The Vite dev server did not load, and no local renderer build was available as a fallback.',
        details: [
          `Dev server URL: ${devServerUrl}`,
          `Error: ${error.message}`,
          `Expected renderer build: ${rendererIndex}`,
        ],
        diagnosticsPath,
      });
      reportRuntime('renderer:recovery-shown', {
        title: 'Meg could not reach the dev renderer',
        summary: 'The Vite dev server did not load, and no local renderer build was available as a fallback.',
      }, 'error');
      return { mode: 'recovery', reason: 'dev-load-failed' };
    }
  }

  if (!fs.existsSync(rendererIndex)) {
    reportRuntime('renderer:build-missing', { rendererIndex }, 'error');
    await showRecoveryPage(win, {
      title: 'Meg renderer build is missing',
      summary: 'The packaged app could not find its renderer files.',
      details: [
        `Expected renderer build: ${rendererIndex}`,
        'Rebuild the renderer or reinstall the packaged app.',
      ],
      diagnosticsPath,
    });
    reportRuntime('renderer:recovery-shown', {
      title: 'Meg renderer build is missing',
      summary: 'The packaged app could not find its renderer files.',
    }, 'error');
    return { mode: 'recovery', reason: 'build-missing' };
  }

  try {
    await win.loadFile(rendererIndex);
    return { mode: 'packaged-build' };
  } catch (error) {
    reportRuntime('renderer:load-failed', { rendererIndex, error: error.message }, 'error');
    await showRecoveryPage(win, {
      title: 'Meg could not load the renderer',
      summary: 'The packaged renderer exists but failed to load.',
      details: [
        `Renderer build: ${rendererIndex}`,
        `Error: ${error.message}`,
      ],
      diagnosticsPath,
    });
    reportRuntime('renderer:recovery-shown', {
      title: 'Meg could not load the renderer',
      summary: 'The packaged renderer exists but failed to load.',
    }, 'error');
    return { mode: 'recovery', reason: 'packaged-load-failed' };
  }
}

module.exports = {
  loadRendererSurface,
};
