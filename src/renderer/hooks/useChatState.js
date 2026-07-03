import { useState, useEffect, useCallback } from 'react';

/**
 * Chat streaming state + IPC listener wiring.
 *
 * Owns:
 *  - `typing` flag (true while a chat response is streaming)
 *  - `redactionNotices` map ({ [threadId]: { count, provider, ts } })
 *  - The 7 streaming IPC listeners (chunk, thinking, done, error, tool_call,
 *    tool_result, resume, redacted) that update thread messages + agent
 *    activity in real time.
 *
 * The hook is "headless" — it doesn't render anything. It takes the
 * `updateThreads` callback, `setActiveAgents` setter, `activeIdRef` (so
 * unread badges compute correctly), and the current `threads` + `activeModel`
 * (for the tool_call → agent activity mapping) as inputs.
 *
 * @param {object} opts
 * @param {function} opts.updateThreads   - setThreads wrapper that normalizes.
 * @param {function} opts.setActiveAgents - setter for the activeAgents array.
 * @param {object}   opts.activeIdRef     - ref to the active thread id.
 * @param {Array}    opts.threads         - current threads (for tool_call → agent mapping).
 * @param {string}   opts.activeModel     - current model id (for new agent entries).
 * @returns {{typing, redactionNotices}}
 */
export function useChatState({ updateThreads, setActiveAgents, activeIdRef, threads, activeModel }) {
  const [typing, setTyping] = useState(false);
  const [redactionNotices, setRedactionNotices] = useState({});

  // ── Streaming IPC listeners (set up once) ──────────────────────────
  // All 7 listeners are registered on mount and cleaned up on unmount.
  // We use refs for the latest values so the callbacks don't go stale
  // without re-registering (which would leak listeners).
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api.onChunk(({ chunk, threadId }) => {
      updateThreads((ts) => ts.map((t) => {
        if (t.id !== threadId) return t;
        const msgs = [...t.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'meg' && last.streaming) {
          msgs[msgs.length - 1] = { ...last, text: last.text + chunk };
        }
        return { ...t, messages: msgs, unread: threadId !== activeIdRef.current || t.unread };
      }));
    });

    api.onThinking(({ chunk, threadId }) => {
      updateThreads((ts) => ts.map((t) => {
        if (t.id !== threadId) return t;
        const msgs = [...t.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'meg' && last.streaming) {
          msgs[msgs.length - 1] = { ...last, thinking: (last.thinking || '') + chunk };
        }
        return { ...t, messages: msgs, unread: threadId !== activeIdRef.current || t.unread };
      }));
    });

    api.onDone(({ threadId }) => {
      setTyping(false);
      updateThreads((ts) => ts.map((t) => {
        if (t.id !== threadId) return t;
        return {
          ...t,
          messages: t.messages
            .map((m) => m.streaming ? { ...m, streaming: false } : m)
            .filter((m) => !(m.role === 'meg' && (!m.text || m.text.trim() === ''))),
          unread: threadId !== activeIdRef.current || t.unread,
        };
      }));
      setActiveAgents((prev) => prev.map((a) => a.threadId === threadId ? {
        ...a,
        status: 'done',
        doneSteps: a.steps,
        liveSteps: a.liveSteps.map((s) => s.status === 'active' ? { ...s, status: 'done' } : s),
      } : a));
    });

    api.onError(({ error, threadId }) => {
      setTyping(false);
      updateThreads((ts) => ts.map((t) => {
        if (t.id !== threadId) return t;
        const msgs = [...t.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'meg' && last.streaming) {
          msgs[msgs.length - 1] = { ...last, text: `Error: ${error}`, streaming: false };
        }
        return { ...t, messages: msgs, unread: threadId !== activeIdRef.current || t.unread };
      }));
    });

    api.onToolCall(({ id, name, args, threadId }) => {
      updateThreads((ts) => ts.map((t) => {
        if (t.id !== threadId) return t;
        // Finalize any streaming meg message (drop if empty)
        const msgs = t.messages
          .map((m) => m.streaming && m.role === 'meg' ? (m.text ? { ...m, streaming: false } : null) : m)
          .filter((m) => m !== null && !(m.role === 'meg' && (!m.text || m.text.trim() === '')));
        return { ...t, messages: [...msgs, { id: `tc-${id}`, role: 'tool_call', name, args, pending: true }], unread: threadId !== activeIdRef.current || t.unread };
      }));
      if (name === 'spawn_subagent') return;
      setActiveAgents((prev) => {
        const existing = prev.find((a) => a.threadId === threadId);
        const taskName = name + ': ' + (args.command || args.path || '');
        const step = { label: taskName, status: 'done' };

        if (existing) {
          return prev.map((a) => a.threadId === threadId ? {
            ...a,
            status: 'running',
            doneSteps: a.doneSteps + 1,
            steps: a.steps + 1,
            liveSteps: [...a.liveSteps, step],
          } : a);
        }
        const thread = threads.find((t) => t.id === threadId);
        return [...prev, {
          id: 'ag-' + Date.now(),
          threadId,
          task: thread?.title || 'Active Task',
          status: 'running',
          thread: thread?.title || 'Chat',
          model: activeModel,
          duration: 'just now',
          doneSteps: 1,
          steps: 2,
          liveSteps: [step, { label: 'Thinking…', status: 'active' }],
          tools: ['terminal', 'fs'],
        }];
      });
    });

    api.onToolResult(({ id, result, threadId }) => {
      updateThreads((ts) => ts.map((t) => {
        if (t.id !== threadId) return t;
        return {
          ...t,
          updatedAt: new Date().toISOString(),
          messages: t.messages.map((m) =>
            m.role === 'tool_call' && m.id === `tc-${id}` ? { ...m, result, pending: false } : m
          ),
        };
      }));
    });

    api.onResume(({ threadId }) => {
      updateThreads((ts) => ts.map((t) => {
        if (t.id !== threadId) return t;
        return {
          ...t,
          updatedAt: new Date().toISOString(),
          messages: [...t.messages, { id: Date.now(), role: 'meg', text: '', streaming: true }],
          unread: threadId !== activeIdRef.current || t.unread,
        };
      }));
    });

    api.onRedacted(({ count, provider, threadId }) => {
      setRedactionNotices((prev) => ({ ...prev, [threadId]: { count, provider, ts: Date.now() } }));
    });

    return () => api.removeListeners('chat:chunk', 'chat:done', 'chat:error', 'chat:tool_call', 'chat:tool_result', 'chat:resume', 'chat:thinking', 'chat:redacted');
  }, []); // Intentionally empty — listeners register once.

  return { typing, setTyping, redactionNotices, setRedactionNotices };
}
