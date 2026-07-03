// Typed action creators for the meg:action event bus.
//
// The original codebase used raw `window.dispatchEvent(new CustomEvent('meg:action', { detail: { action: 'navigate', screen: 'chat' } }))`
// calls scattered across ~30 sites in 8 files. This module wraps each
// action in a named function so:
//   1. Action names are centralized — no typos possible
//   2. The payload shape is documented per action
//   3. Callers get autocomplete + type checking
//   4. The underlying transport (CustomEvent) can be swapped later without
//      touching every call site
//
// Views should import from here instead of dispatching raw events:
//   import { navigate, openSplit, reviewFile } from '../lib/actions.js';
//   navigate('chat');
//   openSplit();
//   reviewFile({ approval: { rawArgs, result } });
//
// The App.jsx listener stays unchanged — it still receives meg:action
// CustomEvents. This is an incremental migration path, not a big-bang rewrite.

/**
 * Dispatch a meg:action event. Single low-level primitive — all the typed
 * helpers below call this.
 */
export function dispatch(action, value = undefined, extra = {}) {
  window.dispatchEvent(new CustomEvent('meg:action', {
    detail: { action, ...(value !== undefined ? { value } : {}), ...extra },
  }));
}

// ── Navigation ────────────────────────────────────────────────────────────
/** Navigate to a top-level view: 'chat' | 'workspace' | 'filebrowser' | 'agent' | 'build' | 'automations' | 'timeline' | 'mobile' | 'settings' */
export const navigate = (screen) => dispatch('navigate', screen, { screen });

/** Open the split pane (code editor + terminal). */
export const openSplit = () => dispatch('openSplit');

// ── Chat ──────────────────────────────────────────────────────────────────
/** Send text to the chat. If `append` is true, appends to the composer instead of sending immediately. */
export const sendToChat = (text) => dispatch('sendToChat', undefined, { text });

/** Append command output to the chat as a code block. */
export const appendCommandResultToChat = (text) => dispatch('appendCommandResultToChat', undefined, { text });

// ── Files ─────────────────────────────────────────────────────────────────
/** Open a file in the split pane. `file` is { name, path, content, ext }. */
export const openFile = (file) => dispatch('openFile', file);

/** Open a staged write approval as a diff review in the split pane. */
export const reviewFile = (target) => dispatch('reviewFile', target);

/** Apply a code block from chat into the active file as a draft. */
export const applyCode = (code) => dispatch('applyCode', code);

// ── Model + theme ─────────────────────────────────────────────────────────
/** Set the active model. Persists to settings + stamps the active thread. */
export const setModel = (model) => dispatch('setModel', model);

/** Set the theme. 'light' | 'dark' | 'system'. */
export const setTheme = (theme) => dispatch('setTheme', theme);

/** Trigger an LM Studio ping (updates the connection status dot). */
export const lmPing = () => dispatch('lmPing');

// ── Workspaces ────────────────────────────────────────────────────────────
/** Set the active workspace. */
export const setActiveWorkspace = (workspace) => dispatch('setActiveWorkspace', workspace);

// ── Events ────────────────────────────────────────────────────────────────
/** Add a timeline event. `event` is { type, icon, color, title, detail, ws }. */
export const addEvent = (event) => dispatch('addEvent', event);

// ── Agents ────────────────────────────────────────────────────────────────
/** Spawn a background agent run. `spec` is { name, instruction, model, steps, source, sourceId, workspaceId, workspacePath }. */
export const spawnAgent = (spec) => dispatch('spawnAgent', spec);

// ── Updates ───────────────────────────────────────────────────────────────
/** Trigger a manual update check. */
export const checkForUpdates = () => dispatch('checkForUpdates');
