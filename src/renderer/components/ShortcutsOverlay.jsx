import React from 'react';
import { Icon } from './icons.jsx';

/**
 * Keyboard shortcuts overlay.
 *
 * Triggered by `?` (Shift+/) or Ctrl+/. Shows a grid of all keyboard
 * shortcuts in Meg. Pure presentational component — the keybinding
 * listener is in App.jsx.
 */
const SHORTCUTS = [
  { category: 'Chat', keys: [
    { combo: 'Enter', desc: 'Send message' },
    { combo: 'Shift+Enter', desc: 'New line in message' },
    { combo: 'Escape', desc: 'Close skill picker / cancel' },
    { combo: 'Ctrl+V', desc: 'Paste image (auto-attaches as vision input)' },
  ]},
  { category: 'Navigation', keys: [
    { combo: '⌘K / Ctrl+K', desc: 'Open command palette' },
    { combo: 'Ctrl+F', desc: 'Search within conversation' },
    { combo: 'Ctrl+Shift+M', desc: 'Quick capture' },
    { combo: '?', desc: 'Show this shortcuts overlay' },
  ]},
  { category: 'Views', keys: [
    { combo: 'F12', desc: 'Toggle DevTools' },
  ]},
];

export const ShortcutsOverlay = ({ onClose }) => {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'backdropIn 0.15s ease',
        background: 'rgba(8,6,18,0.6)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560, maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto',
          background: 'rgba(var(--bg-2-rgb, 255, 255, 255), 0.9)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 16, border: '1px solid var(--border)',
          boxShadow: '0 24px 60px var(--shadow-lg)',
          animation: 'modalIn 0.2s cubic-bezier(0.22,1,0.36,1)',
          padding: '20px 24px',
        }}
      >
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
          <h2 style={{fontSize:16,fontWeight:700,color:'var(--text)',margin:0}}>Keyboard Shortcuts</h2>
          <button onClick={onClose} style={{border:'none',background:'transparent',cursor:'pointer',color:'var(--text-3)',padding:4,borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.color='var(--text)'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-3)'}>
            <Icon name="close" size={16}/>
          </button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:18}}>
          {SHORTCUTS.map(group => (
            <div key={group.category}>
              <div style={{fontSize:10,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>{group.category}</div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {group.keys.map((shortcut, i) => (
                  <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0'}}>
                    <span style={{fontSize:12.5,color:'var(--text-2)'}}>{shortcut.desc}</span>
                    <kbd style={{
                      fontSize:11, fontFamily:'"JetBrains Mono",monospace',
                      padding:'3px 8px', borderRadius:5,
                      background:'var(--bg-active)', border:'1px solid var(--border)',
                      color:'var(--text)', whiteSpace:'nowrap',
                    }}>{shortcut.combo}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
