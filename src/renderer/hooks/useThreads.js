import { useState, useCallback, useRef, useEffect } from 'react';
import { normalizeThread, normalizeThreadList } from '../lib/threads.js';

/**
 * Thread state + persistence.
 *
 * Owns:
 *  - `threads` array (mirrors the main-process threadStore)
 *  - `activeId` (the currently-selected thread id, or null)
 *  - `updateThreads(updater)` — setThreads wrapper that normalizes
 *  - `activeIdRef`, `threadsRef` — ref mirrors for async closures
 *  - Initial load from DB + debounced persistence (1.5s)
 *
 * @returns {{threads, setThreads, activeId, setActiveId, updateThreads, activeIdRef, threadsRef, dbLoaded}}
 */
export function useThreads() {
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const dbLoaded = useRef(false);
  const activeIdRef = useRef(activeId);
  const threadsRef = useRef(threads);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { threadsRef.current = threads; }, [threads]);

  const updateThreads = useCallback((updater) => {
    setThreads((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      return normalizeThreadList(next);
    });
  }, []);

  // ── Load persisted threads on mount ──
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.listThreads().then((data) => {
      dbLoaded.current = true;
      if (data?.length) {
        setThreads(normalizeThreadList(data));
        window.electronAPI.getSetting('lastActiveThreadId').then((id) => {
          setActiveId((id && data.find((t) => t.id === id)) ? id : data[0].id);
        });
      }
    });
  }, []);

  // ── Persist threads (debounced 1.5s) ──
  useEffect(() => {
    if (!window.electronAPI || !dbLoaded.current) return;
    const timer = setTimeout(() => {
      window.electronAPI.saveThreads(threads);
    }, 1500);
    return () => clearTimeout(timer);
  }, [threads]);

  // ── Persist last active thread ──
  useEffect(() => {
    if (!window.electronAPI || !dbLoaded.current) return;
    window.electronAPI.setSetting('lastActiveThreadId', activeId);
  }, [activeId]);

  return {
    threads,
    setThreads,
    activeId,
    setActiveId,
    updateThreads,
    activeIdRef,
    threadsRef,
    dbLoaded,
  };
}
