import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Workspace state + IPC wiring.
 *
 * Owns:
 *  - `workspaces` array (mirrors the main-process workspace settings)
 *  - `activeWorkspace` (the currently-selected workspace, or null)
 *  - `setActiveWorkspace(w)` — sets active in state + persists via IPC
 *  - `activeWorkspaceRef` — a ref mirror so async closures (addMessage,
 *    meg:action handler) can read the latest active workspace without
 *    re-binding on every change
 *  - The initial load + persistence effects
 *
 * The hook is intentionally agnostic about the workspace switcher UI —
 * callers render their own dropdown and call `setActiveWorkspace` on click.
 *
 * @returns {{workspaces, activeWorkspace, setActiveWorkspace, activeWorkspaceRef}}
 */
export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState(null);
  const activeWorkspaceRef = useRef(activeWorkspace);

  // Keep the ref in sync so async closures always see the latest value.
  useEffect(() => {
    activeWorkspaceRef.current = activeWorkspace;
  }, [activeWorkspace]);

  // Wrap setActiveWorkspace so callers can pass either a workspace object
  // or null. We persist the change via IPC (the main process stores it in
  // settings + scopes toolWriteRoots).
  const setActiveWorkspace = useCallback((workspace) => {
    setActiveWorkspaceState(workspace);
    if (workspace) {
      window.electronAPI?.setActiveWorkspace?.(workspace);
    }
  }, []);

  // ── Initial load: fetch persisted workspaces + active workspace ──
  useEffect(() => {
    if (!window.electronAPI) return;

    // First listWorkspaces call — sets the initial array (may be empty).
    window.electronAPI.listWorkspaces().then((data) => {
      if (data?.length) setWorkspaces(data);
    });

    // Second call (with the full meta enrichment). This re-fetches and
    // merges in the per-workspace file inventory, language, etc. We use a
    // functional update so we don't lose the first call's data if the
    // second is slower.
    window.electronAPI.listWorkspaces?.().then((data) => {
      if (!data?.length) return;
      setWorkspaces((ws) => [
        ...data.map((w) => ({
          ...w,
          branch: 'main',
          dirty: 0,
          ahead: 0,
          lang: w.lang || '',
          color: w.color || 'var(--accent)',
          lastActive: w.lastActive || w.lastActiveAt || w.updatedAt || w.createdAt || null,
          desc: w.path,
          agents: 0,
          threads: 0,
          files: typeof w.files === 'number' ? w.files : 0,
          inventory: Array.isArray(w.inventory) ? w.inventory : [],
          inventoryTruncated: Boolean(w.inventoryTruncated),
        })),
        ...ws.filter((w) => !data.some((x) => x.path === w.path)),
      ]);
    });

    // Load the active workspace.
    window.electronAPI.getActiveWorkspace?.().then((w) => {
      if (w) setActiveWorkspaceState(w);
    });
  }, []);

  // ── Persist: save workspaces to DB whenever they change ──
  // Skip the first render (no DB loaded yet) — the load effect above
  // populates state, and we only want to write back user-driven changes.
  // We use a ref to detect the first change after mount.
  const dbReady = useRef(false);
  useEffect(() => {
    if (!window.electronAPI) return;
    if (!dbReady.current) {
      // Mark ready once we have at least one workspace OR the load effect
      // has run (even with zero workspaces, we don't want to write on the
      // very first render).
      dbReady.current = true;
      return;
    }
    workspaces.forEach((w) => window.electronAPI.upsertWorkspace(w));
  }, [workspaces]);

  return {
    workspaces,
    setWorkspaces,
    activeWorkspace,
    setActiveWorkspace,
    activeWorkspaceRef,
  };
}
