import React, { useState } from 'react';
import { Icon } from './icons.jsx';
import logoImg from '../assets/logo-m.jpg';

/**
 * 4-step onboarding modal: Welcome → Model → Setup → Done.
 * Modernized for the dark-mode-first design system.
 */
export const Onboarding = ({ onDone, onModelChange, onOpenSettings, currentModel, telegramConnected, lmStatus }) => {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [model, setModel] = useState(currentModel || 'qwen/qwen3.5-9b');
  const steps = ['Welcome', 'Model', 'Setup', 'Done'];
  const go = (d) => { setDir(d); setStep((s) => s + d); };

  const pickModel = (m) => { setModel(m); onModelChange?.(m); };

  const MODELS = [
    { id: 'qwen/qwen3.5-9b', label: 'qwen/qwen3.5-9b', tag: 'Local', desc: 'Runs via LM Studio — private & offline' },
    { id: 'claude-3-5-sonnet', label: 'claude-3-5-sonnet', tag: 'Anthropic', desc: 'Best for complex tasks & code' },
    { id: 'claude-3-5-haiku', label: 'claude-3-5-haiku', tag: 'Anthropic', desc: 'Quick responses, lower cost' },
    { id: 'gpt-4o', label: 'gpt-4o', tag: 'OpenAI', desc: 'Strong general-purpose model' },
    { id: 'deepseek-chat', label: 'deepseek-chat', tag: 'DeepSeek', desc: 'General-purpose cloud model' },
    { id: 'deepseek-reasoner', label: 'deepseek-reasoner', tag: 'DeepSeek', desc: 'Reasoning-focused cloud model' },
  ];

  const animation = dir > 0 ? 'stepFwd 0.25s cubic-bezier(0.22,1,0.36,1) both' : 'stepBack 0.25s cubic-bezier(0.22,1,0.36,1) both';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'backdropIn 0.2s ease' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,6,16,0.8)', backdropFilter: 'blur(10px) saturate(0.6)' }} />

      <div style={{ width: 520, maxWidth: '92vw', background: 'var(--bg-2)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 40px 100px var(--shadow-lg)', position: 'relative', animation: 'modalIn 0.3s cubic-bezier(0.22,1,0.36,1)', border: '1px solid var(--border)' }}>
        {/* Progress track */}
        <div style={{ height: 2, background: 'var(--border)' }}>
          <div style={{ height: '100%', width: `${(step / (steps.length - 1)) * 100}%`, background: 'var(--accent)', transition: 'width 0.35s cubic-bezier(0.22,1,0.36,1)', borderRadius: 99 }} />
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', gap: 0, padding: '20px 36px 0', alignItems: 'center' }}>
          {steps.map((s, i) => (
            <React.Fragment key={i}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: i <= step ? 'var(--accent)' : 'var(--bg-active)', transition: 'all 0.2s', boxShadow: i === step ? '0 0 0 3px var(--accent-bg)' : 'none' }}>
                  {i < step ? <Icon name="check" size={12} color="#fff" /> : <span style={{ fontSize: 10, color: i <= step ? '#fff' : 'var(--text-3)', fontWeight: 700 }}>{i + 1}</span>}
                </div>
                <span style={{ fontSize: 10, color: i === step ? 'var(--text)' : i < step ? 'var(--accent)' : 'var(--text-3)', fontWeight: i === step ? 600 : 400, transition: 'color 0.2s' }}>{s}</span>
              </div>
              {i < steps.length - 1 && <div style={{ flex: 1, height: 1.5, background: i < step ? 'var(--accent)' : 'var(--border)', margin: '0 4px 15px', transition: 'background 0.3s', borderRadius: 99 }} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step content */}
        <div key={step} style={{ padding: '24px 36px 8px', minHeight: 300, animation }}>

          {step === 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <img src={logoImg} alt="Meg Logo" style={{ width: 48, height: 48, borderRadius: 12, boxShadow: '0 4px 14px var(--shadow)', objectFit: 'cover' }} />
                <div>
                  <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>Meet Meg</h1>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>Local-first AI desktop assistant</span>
                </div>
              </div>
              <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 20 }}>
                Meg runs on your machine, works across your files and tools, and can message you through connected integrations — all powered by local or cloud models of your choice.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { icon: 'agent', label: 'Runs agents autonomously in the background' },
                  { icon: 'code', label: 'Writes, executes, and debugs code' },
                  { icon: 'sms', label: 'Uses Telegram when you connect it' },
                  { icon: 'memory', label: 'Keeps session state and saved memories' },
                ].map((f, i) => (
                  <div key={i} className="ob-feature" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={f.icon} size={15} color="var(--accent)" />
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{f.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 4, letterSpacing: '-0.02em' }}>Choose your model</h2>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.6 }}>Default for all tasks. Change anytime in Settings.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {MODELS.map((m) => (
                  <label key={m.id} onClick={() => pickModel(m.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 9, border: `1px solid ${model === m.id ? 'var(--accent-border)' : 'var(--border)'}`, background: model === m.id ? 'var(--accent-bg)' : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${model === m.id ? 'var(--accent)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'border-color 0.15s' }}>
                      {model === m.id && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontFamily: '"JetBrains Mono",monospace', color: model === m.id ? 'var(--accent)' : 'var(--text)', fontWeight: model === m.id ? 500 : 400 }}>{m.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{m.desc}</div>
                    </div>
                    <span style={{ fontSize: 9.5, padding: '2px 7px', borderRadius: 99, background: model === m.id ? 'var(--accent)' : 'var(--bg-active)', color: model === m.id ? '#fff' : 'var(--text-3)', fontWeight: 600, flexShrink: 0, transition: 'all 0.15s', letterSpacing: '0.02em' }}>{m.tag.toUpperCase()}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 4, letterSpacing: '-0.02em' }}>Complete setup in Settings</h2>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 18, lineHeight: 1.6 }}>Connections, API keys, and tool permissions are configured in Settings. This shows live status.</p>
              {[
                { label: 'LM Studio', detail: lmStatus === true ? 'Connected' : lmStatus === false ? 'Offline' : 'Not checked yet', icon: 'terminal', ok: lmStatus === true },
                { label: 'Telegram', detail: telegramConnected ? 'Connected' : 'Not connected', icon: 'sms', ok: telegramConnected },
                { label: 'Tool permissions', detail: 'Manage read/write/terminal/web access', icon: 'lock', ok: null },
                { label: 'Provider keys', detail: 'Configure cloud provider keys if needed', icon: 'key', ok: null },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: item.ok === true ? 'var(--green-bg)' : 'var(--bg-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={item.icon} size={16} color={item.ok === true ? 'var(--green)' : 'var(--text-3)'} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{item.label}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{item.detail}</div>
                  </div>
                  {item.ok === true && <Icon name="check" size={14} color="var(--green)" />}
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={onOpenSettings} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-panel)', fontSize: 12.5, fontWeight: 500, color: 'var(--text-2)', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent-border)';e.currentTarget.style.color='var(--accent)';}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--text-2)';}}>
                  Open Settings
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ textAlign: 'center', padding: '24px 0 12px' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', animation: 'pulseGreen 2s ease infinite' }}>
                <Icon name="check" size={28} color="var(--green)" />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 10, letterSpacing: '-0.02em' }}>Meg is ready</h2>
              <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.8, marginBottom: 20 }}>
                Model: <code style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 12, background: 'var(--bg-active)', padding: '2px 7px', borderRadius: 5, color: 'var(--text)' }}>{model}</code>
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.7 }}>
                Start in chat, then configure integrations in Settings when needed.<br />
                Press <kbd style={{ background: 'var(--bg-active)', padding: '2px 7px', borderRadius: 5, fontSize: 11, border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}>⌘K</kbd> anytime to search or run a command.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 36px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-light)', marginTop: 8 }}>
          <button onClick={() => step > 0 && go(-1)} style={{ fontSize: 13, color: step === 0 ? 'transparent' : 'var(--text-3)', pointerEvents: step === 0 ? 'none' : 'auto', transition: 'color 0.2s,transform 0.15s', padding: '6px 0', background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { if (step > 0) { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.transform = 'translateX(-2px)'; } }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.transform = 'translateX(0)'; }}>
            ← Back
          </button>
          <button onClick={() => { step < steps.length - 1 ? go(1) : onDone(); }} className="btn-pressable"
            style={{ padding: '10px 28px', borderRadius: 9, background: 'var(--accent)', color: '#fff', fontSize: 13.5, fontWeight: 600, border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px var(--accent-bg)', letterSpacing: '-0.01em', transition: 'opacity 0.15s,box-shadow 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.boxShadow = '0 6px 20px var(--accent-border)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.boxShadow = '0 4px 16px var(--accent-bg)'; }}>
            {step === steps.length - 1 ? 'Start using Meg →' : 'Continue →'}
          </button>
        </div>
      </div>
    </div>
  );
};
