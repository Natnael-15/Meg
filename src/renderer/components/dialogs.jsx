import React from 'react';

export const DialogShell = ({ title, description, onClose, children, footer }) => (
  <div
    style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'backdropIn 0.15s ease' }}
    onClick={onClose}
  >
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,6,18,0.6)', backdropFilter: 'blur(6px)' }} />
    <div
      style={{ width: 420, maxWidth: '100%', background: 'var(--bg-2)', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 24px 60px var(--shadow-lg)', position: 'relative', overflow: 'hidden', animation: 'modalIn 0.2s cubic-bezier(0.22,1,0.36,1)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border-light)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: description ? 4 : 0 }}>{title}</div>
        {description && <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>{description}</div>}
      </div>
      <div style={{ padding: 18 }}>{children}</div>
      <div style={{ padding: '0 18px 18px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {footer}
      </div>
    </div>
  </div>
);

export const TextEntryDialog = ({
  title,
  description,
  label,
  value,
  placeholder,
  confirmLabel = 'Save',
  onChange,
  onCancel,
  onConfirm,
}) => {
  const canConfirm = value.trim().length > 0;
  return (
    <DialogShell
      title={title}
      description={description}
      onClose={onCancel}
      footer={
        <>
          <button onClick={onCancel} style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={() => canConfirm && onConfirm()} disabled={!canConfirm} style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: canConfirm ? 'var(--accent)' : 'var(--bg-active)', color: canConfirm ? '#fff' : 'var(--text-3)', fontSize: 12, fontWeight: 600, cursor: canConfirm ? 'pointer' : 'default' }}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <label style={{ display: 'block' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canConfirm) onConfirm();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={placeholder}
          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', fontSize: 13, color: 'var(--text)', background: 'var(--bg-input)', outline: 'none' }}
        />
      </label>
    </DialogShell>
  );
};

export const ConfirmDialog = ({
  title,
  description,
  confirmLabel = 'Confirm',
  confirmTone = 'danger',
  onCancel,
  onConfirm,
}) => {
  const confirmStyles = confirmTone === 'danger'
    ? { background: 'var(--red)', color: '#fff' }
    : { background: 'var(--accent)', color: '#fff' };

  return (
    <DialogShell
      title={title}
      description={description}
      onClose={onCancel}
      footer={
        <>
          <button onClick={onCancel} style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{ padding: '7px 12px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', ...confirmStyles }}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.7 }}>{description}</div>
    </DialogShell>
  );
};
