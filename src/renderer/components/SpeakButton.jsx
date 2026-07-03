import { useState, useEffect, useCallback } from 'react';
import { Icon } from './icons.jsx';

/**
 * Text-to-Speech (TTS) button for Meg's responses.
 *
 * Uses the Web Speech API's SpeechSynthesis interface — built into Chromium
 * (and therefore Electron) with no external dependency. Voices come from the
 * OS (Windows: SAPI voices; macOS: NSSpeechSynthesizer; Linux: eSpeak/etc).
 *
 * Click to speak the message; click again to stop. A small spinner shows
 * while speaking. If no voices are available (rare headless env), the button
 * is disabled with a tooltip.
 */
export const SpeakButton = ({ text, compact = false }) => {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setSupported(false);
    }
    return () => {
      // Stop speaking if the component unmounts mid-utterance.
      if (window.speechSynthesis?.speaking) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const toggle = useCallback(() => {
    if (!supported) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    if (!text || !text.trim()) return;
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 4000)); // Cap at 4k chars to avoid runaway speech
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    // Prefer a voice that matches the OS locale for natural pronunciation.
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) {
      const preferred = voices.find(v => v.lang.startsWith(navigator.language?.slice(0, 2) || 'en'))
        || voices.find(v => v.default)
        || voices[0];
      if (preferred) utterance.voice = preferred;
    }
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }, [speaking, text, supported]);

  if (!supported) return null;

  const size = compact ? 12 : 14;
  return (
    <button
      onClick={toggle}
      title={speaking ? 'Stop speaking' : 'Read aloud'}
      aria-label={speaking ? 'Stop speaking' : 'Read aloud'}
      style={{
        width: 24, height: 24, borderRadius: 5,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: speaking ? 'var(--accent-bg)' : 'transparent',
        border: 'none', cursor: 'pointer',
        color: speaking ? 'var(--accent)' : 'var(--text-3)',
        transition: 'background 0.15s, color 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { if (!speaking) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-2)'; } }}
      onMouseLeave={(e) => { if (!speaking) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)'; } }}
    >
      {speaking ? (
        <div style={{display:'flex',gap:1.5,alignItems:'center'}}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              width: 2, borderRadius: 1, background: 'var(--accent)',
              animation: `wave-bar 0.6s ease-in-out ${i * 0.1}s infinite alternate`,
              height: [4, 8, 6][i],
            }}/>
          ))}
        </div>
      ) : (
        <Icon name="mic" size={size}/>
      )}
    </button>
  );
};
