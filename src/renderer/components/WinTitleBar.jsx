import React, { useState } from 'react';
import { Icon } from './icons.jsx';

/**
 * Custom frameless Windows title bar with:
 *  - LM Studio connection status dot
 *  - Update status button (available / downloading N% / ready → restart)
 *  - Tray indicator with unread badge
 *  - Min / Max / Close window controls
 *
 * The bar is draggable via the `.titlebar-drag` class; the buttons and
 * update menu use `.titlebar-nodrag` so they remain clickable.
 */
export const WinTitleBar = ({ onTray, unreadCount, lmStatus, updateInfo, onDownload, onInstall }) => {
  const [maximized, setMaximized] = useState(false);
  const [showUpdateMenu, setShowUpdateMenu] = useState(false);
  const api = window.electronAPI;

  const handleWinBtn = (key) => {
    if (key === 'min') { api?.minimize(); }
    if (key === 'max') { setMaximized((m) => !m); api?.maximize(); }
    if (key === 'close') { api?.close(); }
  };

  return (
    <div className="titlebar-drag" style={{ height: 32, background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', flexShrink: 0, userSelect: 'none', zIndex: 50 }}>
      <div style={{ width: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <div style={{ width: 18, height: 18, borderRadius: 5, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 10, color: '#fff', fontWeight: 800, letterSpacing: '-0.04em' }}>M</span>
        </div>
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-3)', flex: 1, fontWeight: 400, letterSpacing: '0.01em' }}>Meg</span>

      {/* Update Status Button */}
      {updateInfo && (
        <div style={{ position: 'relative', marginRight: 12 }} className="titlebar-nodrag">
          <button onClick={() => setShowUpdateMenu(!showUpdateMenu)} style={{ height: 22, padding: '0 8px', borderRadius: 4, background: updateInfo.status === 'ready' ? 'var(--green-bg)' : 'var(--bg-active)', border: `1px solid ${updateInfo.status === 'ready' ? 'var(--green-border)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', transition: 'all 0.2s' }}>
            <Icon name={updateInfo.status === 'downloading' ? 'spinner' : 'bolt'} size={11} color={updateInfo.status === 'ready' ? 'var(--green)' : 'var(--accent)'} />
            <span style={{ fontSize: 10.5, fontWeight: 600, color: updateInfo.status === 'ready' ? 'var(--green)' : 'var(--text)' }}>
              {updateInfo.status === 'available' ? 'Update' : updateInfo.status === 'downloading' ? `${updateInfo.progress}%` : 'Ready'}
            </span>
          </button>
          {showUpdateMenu && (
            <div style={{ position: 'absolute', top: 28, right: 0, width: 200, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px var(--shadow-lg)', padding: '8px', zIndex: 2000 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, padding: '0 4px', color: 'var(--text)' }}>Version {updateInfo.version}</div>
              {updateInfo.status === 'available' && <button onClick={() => { onDownload(); setShowUpdateMenu(false); }} style={{ width: '100%', padding: '6px', borderRadius: 4, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Download Now</button>}
              {updateInfo.status === 'downloading' && (
                <div style={{ padding: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 4, color: 'var(--text-3)' }}><span>Downloading…</span><span>{updateInfo.progress}%</span></div>
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}><div style={{ height: '100%', width: `${updateInfo.progress}%`, background: 'var(--accent)', transition: 'width 0.2s linear' }} /></div>
                </div>
              )}
              {updateInfo.status === 'ready' && <button onClick={onInstall} style={{ width: '100%', padding: '6px', borderRadius: 4, background: 'var(--green)', color: '#fff', border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Restart & Install</button>}
            </div>
          )}
        </div>
      )}

      {/* LM Studio connection dot */}
      {lmStatus !== undefined ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 8 }} title={lmStatus ? 'LM Studio connected' : 'LM Studio offline'}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: lmStatus ? 'var(--green)' : 'var(--red)', flexShrink: 0 }} />
          <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
            LM Studio: <strong style={{ color: lmStatus ? 'var(--green)' : 'var(--red)' }}>{lmStatus ? 'online' : 'offline'}</strong>
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 8 }} title="Checking LM Studio…">
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-3)', flexShrink: 0, opacity: 0.5 }} />
          <span style={{ fontSize: 10.5, color: 'var(--text-3)', opacity: 0.7 }}>LM Studio: checking…</span>
        </div>
      )}
      {/* Tray indicator */}
      <button aria-label="Open tray" className="titlebar-nodrag win-btn" onClick={onTray} style={{ width: 36, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'background 0.1s', position: 'relative' }} title="Tray">
        <Icon name="tray" size={14} />
        {unreadCount > 0 && <div style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: '50%', background: 'var(--orange)', border: '2px solid var(--bg-sidebar)' }} />}
      </button>
      {/* Windows controls */}
      <div className="titlebar-nodrag" style={{ display: 'flex', height: '100%' }}>
        {[
          { label: '─', key: 'min', cls: 'win-btn' },
          { label: maximized ? '❐' : '□', key: 'max', cls: 'win-btn' },
          { label: '✕', key: 'close', cls: 'win-close' },
        ].map((btn) => (
          <button key={btn.key} className={btn.cls} onClick={() => handleWinBtn(btn.key)} style={{ width: 46, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: btn.key === 'min' ? 18 : 12, color: 'var(--text-3)', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'background 0.1s,color 0.1s', lineHeight: 1, letterSpacing: btn.key === 'min' ? '-2px' : '0' }}>
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
};
