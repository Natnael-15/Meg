import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from './icons.jsx';

/* ─────────────── ThreadSearch ───────────────
   Inline Ctrl+F search inside a thread. Renders a floating search bar
   over the chat and highlights matching messages.                */
export const ThreadSearch = ({ isOpen, onClose, thread }) => {
  const [query, setQuery] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const highlightRef = useRef([]);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  useEffect(() => {
    const onKey = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter') moveToNext(e.shiftKey);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  /* highlight all matching text nodes inside the chat container */
  const highlightMatches = useCallback((searchText) => {
    const container = document.querySelector('[data-chat-messages]');
    if (!container) return;

    // Remove old highlights
    container.querySelectorAll('[data-search-highlight]').forEach(el => {
      const parent = el.parentNode;
      if (parent) parent.replaceChild(document.createTextNode(el.textContent), el);
    });
    highlightRef.current = [];

    if (!searchText.trim()) {
      setMatchCount(0);
      setCurrentMatch(0);
      return;
    }

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        // Skip inside hidden or script-like nodes
        const parent = node.parentElement;
        if (parent && (parent.closest('script, style, [data-search-highlight], pre, code'))) return NodeFilter.FILTER_REJECT;
        return node.textContent.toLowerCase().includes(searchText.toLowerCase())
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(node => {
      const text = node.textContent;
      const lower = text.toLowerCase();
      const searchLower = searchText.toLowerCase();
      let last = 0;
      const parent = node.parentNode;
      if (!parent) return;
      const fragment = document.createDocumentFragment();
      const regex = new RegExp(searchLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      for (const match of text.matchAll(regex)) {
        if (match.index > last) {
          fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
        }
        const span = document.createElement('span');
        span.dataset.searchHighlight = 'true';
        span.style.backgroundColor = 'var(--accent-bg)';
        span.style.color = 'var(--accent)';
        span.style.borderRadius = '2px';
        span.style.padding = '0 2px';
        span.textContent = match[0];
        fragment.appendChild(span);
        highlightRef.current.push(span);
        last = match.index + match[0].length;
      }
      if (last < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(last)));
      }
      parent.replaceChild(fragment, node);
    });

    setMatchCount(highlightRef.current.length);
    setCurrentMatch(0);
    if (highlightRef.current.length > 0) {
      highlightRef.current[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const moveToNext = (prev = false) => {
    if (matchCount === 0) return;
    let nextIndex = prev ? currentMatch - 1 : currentMatch + 1;
    if (nextIndex < 0) nextIndex = matchCount - 1;
    if (nextIndex >= matchCount) nextIndex = 0;
    setCurrentMatch(nextIndex);
    const el = highlightRef.current[nextIndex];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.outline = '2px solid var(--accent)';
      window.setTimeout(() => { if (el) el.style.outline = 'none'; }, 800);
    }
  };

  useEffect(() => {
    // Debounce highlighting
    const t = setTimeout(() => highlightMatches(query), 200);
    return () => clearTimeout(t);
  }, [query, thread?.messages?.length, highlightMatches]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 52,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 12px',
      borderRadius: 8,
      background: 'var(--bg-2)',
      border: '1px solid var(--border)',
      boxShadow: '0 4px 16px var(--shadow)',
      animation: 'fadeUp 0.15s ease',
    }}>
      <Icon name="search" size={14} color="var(--text-3)"/>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Find in thread…"
        style={{
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'var(--text)',
          fontSize: 13,
          width: 220,
          fontFamily: 'inherit',
        }}
      />
      {matchCount > 0 && (
        <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
          {currentMatch + 1}/{matchCount}
        </span>
      )}
      <div style={{ display: 'flex', gap: 2 }}>
        <button
          onClick={() => moveToNext(true)}
          disabled={matchCount === 0}
          style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: matchCount > 0 ? 'pointer' : 'default', padding: 2, borderRadius: 4, opacity: matchCount > 0 ? 1 : 0.4 }}
        >
          <Icon name="chevronUp" size={12}/>
        </button>
        <button
          onClick={() => moveToNext(false)}
          disabled={matchCount === 0}
          style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: matchCount > 0 ? 'pointer' : 'default', padding: 2, borderRadius: 4, opacity: matchCount > 0 ? 1 : 0.4 }}
        >
          <Icon name="chevronDown" size={12}/>
        </button>
      </div>
      <button
        onClick={onClose}
        style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 2, borderRadius: 4, transition: 'color 0.1s' }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
      >
        <Icon name="close" size={14}/>
      </button>
    </div>
  );
};

export default ThreadSearch;
