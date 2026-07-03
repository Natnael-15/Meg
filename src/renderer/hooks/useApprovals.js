import { useState, useEffect, useCallback } from 'react';

/**
 * Approval-queue state + IPC wiring.
 *
 * Owns:
 *  - `approvals` array (mirrors the main-process approvalQueue)
 *  - `approve(id)` / `deny(id)` action handlers that call the IPC layer
 *    and merge the returned updated approval back into state
 *  - The `approval:change` IPC listener that streams approval state
 *    transitions (created / running / staged / approved / denied / error)
 *
 * Side effects that touch OTHER state slices are delegated to the caller
 * via the `onCreated` and `onStagedWrite` callbacks, so the hook stays
 * focused on approval state and doesn't need to know about notifications
 * or the tray flyout.
 *
 * @param {object} opts
 * @param {(approval: object) => void} [opts.onCreated]    - Fired on approval:created (e.g. to surface a notification + open the tray).
 * @param {(approval: object) => void} [opts.onStagedWrite] - Fired when a write_file approval enters the 'staged' state (e.g. to open the diff review pane).
 * @returns {{approvals: array, setApprovals: function, approve: function, deny: function}}
 */
export function useApprovals({ onCreated, onStagedWrite } = {}) {
  const [approvals, setApprovals] = useState([]);

  // Initial load — fetch any approvals that were persisted from a previous
  // session (e.g. the app was closed mid-approval).
  useEffect(() => {
    if (!window.electronAPI?.listApprovals) return;
    window.electronAPI.listApprovals().then((items) => {
      if (items?.length) setApprovals(items);
    });
  }, []);

  // Live updates — the main process emits approval:change for every state
  // transition. We merge by id so the array stays deduped and ordered
  // (newest first, matching the original App.jsx behavior).
  useEffect(() => {
    if (!window.electronAPI?.onApprovalChange) return;
    window.electronAPI.onApprovalChange(({ type, approval }) => {
      setApprovals((prev) => [approval, ...prev.filter((a) => a.id !== approval.id)]);
      if (type === 'approval:created') {
        onCreated?.(approval);
      }
      if (type === 'approval:staged' && approval.tool === 'write_file') {
        onStagedWrite?.(approval);
      }
    });
    return () => window.electronAPI.removeListeners('approval:change');
  }, [onCreated, onStagedWrite]);

  const approve = useCallback(async (id) => {
    const r = await window.electronAPI?.approveToolCall(id);
    if (r?.approval) setApprovals((prev) => [r.approval, ...prev.filter((a) => a.id !== id)]);
  }, []);

  const deny = useCallback(async (id) => {
    const r = await window.electronAPI?.denyToolCall(id);
    if (r?.approval) setApprovals((prev) => [r.approval, ...prev.filter((a) => a.id !== id)]);
  }, []);

  return { approvals, setApprovals, approve, deny };
}
