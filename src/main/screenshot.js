// Screenshot capture via Electron's desktopCapturer.
//
// Grabs the full screen (or a specific display) as a PNG data URL and
// returns it in the same shape as a pasted image — so the InputBar can
// attach it directly to the next message as a vision input.
//
// We use desktopCapturer.getSources() with thumbnailSize set to the screen
// resolution so the captured image is full-quality. The thumbnail is
// converted to a data URL via toDataURL().

const { desktopCapturer } = require('electron');

/**
 * Capture a screenshot of the primary display.
 * Returns { ok, dataUrl, width, height } or { ok: false, error }.
 */
async function captureScreen() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
      fetchWindowIcons: false,
    });
    if (!sources.length) {
      return { ok: false, error: 'No display sources available' };
    }
    // Use the first screen (primary display).
    const source = sources[0];
    const dataUrl = source.thumbnail.toDataURL('image/png', 0.85);
    const size = source.thumbnail.getSize();
    return {
      ok: true,
      dataUrl,
      width: size.width,
      height: size.height,
      name: `screenshot-${Date.now()}.png`,
      mime: 'image/png',
      sizeBytes: Math.round(dataUrl.length * 0.75), // base64 overhead
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Capture a specific window by id. Useful if the user wants to screenshot
 * just the Meg app window or another app.
 */
async function captureWindow(windowId) {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 1920, height: 1080 },
      fetchWindowIcons: false,
    });
    const source = windowId
      ? sources.find(s => s.id === windowId)
      : sources[0];
    if (!source) {
      return { ok: false, error: 'Window not found' };
    }
    const dataUrl = source.thumbnail.toDataURL('image/png', 0.85);
    const size = source.thumbnail.getSize();
    return {
      ok: true,
      dataUrl,
      width: size.width,
      height: size.height,
      name: `screenshot-${source.name || 'window'}-${Date.now()}.png`.replace(/[^a-zA-Z0-9._-]/g, '_'),
      mime: 'image/png',
      sizeBytes: Math.round(dataUrl.length * 0.75),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * List available screen + window sources for the picker UI.
 */
async function listSources() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 160, height: 90 },
      fetchWindowIcons: true,
    });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      display_id: s.display_id,
      icon: s.appIcon ? s.appIcon.toDataURL() : null,
      thumbnail: s.thumbnail.toDataURL('image/jpeg', 0.6),
    }));
  } catch (e) {
    return [];
  }
}

module.exports = { captureScreen, captureWindow, listSources };
