import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './icons.jsx';

/**
 * Static command entries shown in the ⌘K palette. Each entry is a
 * { group, icon, label, action, id } tuple. `action` is consumed by the
 * parent App's `handleCmd` switch.
 */
export const CMD_ITEMS = [
  { group: 'Commands', icon: 'timeline', label: 'Activity timeline', action: 'nav', id: 'timeline' },
  { group: 'Commands', icon: 'zap', label: 'Automations', action: 'nav', id: 'automations' },
  { group: 'Commands', icon: 'plus', label: 'New chat', action: 'new-chat' },
  { group: 'Commands', icon: 'workspace', label: 'Workspace', action: 'nav', id: 'workspace' },
  { group: 'Commands', icon: 'agent', label: 'View running agents', action: 'nav', id: 'agent' },
  { group: 'Commands', icon: 'build', label: 'Agent builder', action: 'nav', id: 'build' },
  { group: 'Commands', icon: 'files', label: 'File browser', action: 'nav', id: 'filebrowser' },
  { group: 'Commands', icon: 'mobile', label: 'Telegram companion', action: 'nav', id: 'mobile' },
  { group: 'Commands', icon: 'settings', label: 'Settings', action: 'nav', id: 'settings' },
  { group: 'Commands', icon: 'bell', label: 'Notifications', action: 'notif' },
];

/**
 * ⌘K command palette. Fuzzy-filtered search across:
 *  - Recent chat threads (jump to chat)
 *  - Workspaces (jump to workspace view)
 *  - The active file (jump to file browser)
 *  - Static commands (navigate, new chat, open notifications)
 *
 * Keyboard: ↑/↓ to move, Enter to run, Esc to close.
 */
export const CommandPalette = ({ onClose, onAction, threads, workspaces, activeFile }) => {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Build dynamic items
  const threadItems = (threads || []).map((t) => ({ group: 'Chats', icon: 'sms', label: t.title, action: 'open-chat', id: t.id }));
  const wsItems = (workspaces || []).map((w) => ({ group: 'Workspaces', icon: 'workspace', label: w.name, action: 'nav', id: 'workspace', wsId: w.id }));
  const fileItems = activeFile ? [{ group: 'Active File', icon: 'doc', label: activeFile.name, action: 'nav', id: 'filebrowser' }] : [];

  const allItems = [...threadItems, ...wsItems, ...fileItems, ...CMD_ITEMS.filter((i) => i.group === 'Commands')];

  const filtered = query ? allItems.filter((i) => i.label.toLowerCase().includes(query.toLowerCase())) : allItems;
  const grouped = filtered.reduce((acc, item) => { (acc[item.group] = acc[item.group] || []).push(item); return acc; }, {});

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); if (filtered[cursor]) { onAction(filtered[cursor]); onClose(); } }
    if (e.key === 'Escape') onClose();
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80, animation: 'backdropIn 0.15s ease' }} onClick={onClose}>
      <div style={{ background: 'rgba(10,8,20,0.6)', position: 'absolute', inset: 0, backdropFilter: 'blur(3px)' }} />
      <div style={{ width: 520, background: 'rgba(var(--bg-2-rgb, 255, 255, 255), 0.76)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: 16, overflow: 'hidden', boxShadow: `0 24px 60px var(--shadow-lg)`, animation: 'modalIn 0.18s cubic-bezier(0.22,1,0.36,1)', position: 'relative', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border-light)' }}>
          <Icon name="search" size={16} color="var(--text-3)" />
          <input ref={inputRef} value={query} onChange={(e) => { setQuery(e.target.value); setCursor(0); }} onKeyDown={handleKey} placeholder="Search chats, workspaces, commands…" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: 'var(--text)', background: 'none' }} />
          <kbd style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--bg-active)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', flexShrink: 0 }}>Esc</kbd>
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div style={{ padding: '8px 16px 4px', fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{group}</div>
              {items.map((item) => {
                const i = filtered.indexOf(item); const active = cursor === i;
                return (
                  <button key={item.label + item.id} onClick={() => { onAction(item); onClose(); }} onMouseEnter={() => setCursor(i)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: active ? 'var(--accent-bg)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.08s' }}>
                    <div style={{ width: 26, height: 26, borderRadius: 6, background: active ? 'var(--accent)' : 'var(--bg-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.08s' }}>
                      <Icon name={item.icon} size={13} color={active ? '#fff' : 'var(--text-3)'} />
                    </div>
                    <span style={{ fontSize: 13.5, color: active ? 'var(--accent)' : 'var(--text)', fontWeight: active ? 500 : 400 }}>{item.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>{item.group}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No results for &ldquo;{query}&rdquo;</div>}
        </div>
      </div>
    </div>
  );
};
