import React from 'react';
import { Icon } from './icons.jsx';
import { getTokenBudget, SUMMARIZATION_THRESHOLD } from '../lib/tokens.js';

/**
 * Compact token-budget indicator shown in the chat header.
 *
 * Renders a horizontal bar that fills as the conversation approaches the
 * model's context window. Color shifts green → amber → red as usage grows.
 * When the backend's auto-summarization threshold (8k tokens) is crossed,
 * a "auto-compressing" badge appears so the user understands why older
 * context may be condensed.
 *
 * @param {object} props
 * @param {Array} props.messages - The active thread's messages (Meg shape: {role, text}).
 * @param {string} props.model    - The active model id (used to look up context window size).
 */
export const TokenBudgetBar = ({ messages = [], model = '' }) => {
  const budget = getTokenBudget(messages, model);

  // Don't render until there's at least one message — avoids a confusing
  // empty bar on a fresh chat.
  if (!messages.length) return null;

  // Color stops: <50% green, 50-80% amber, >80% red. The "willSummarize"
  // state overrides to a distinct blue-purple so the user can tell that
  // compression is active even if usage is still well under the hard cap.
  let color = 'var(--green, #1a9e5c)';
  if (budget.willSummarize) {
    color = '#7c3aed';
  } else if (budget.percent >= 80) {
    color = 'var(--red, #e05252)';
  } else if (budget.percent >= 50) {
    color = 'var(--orange, #e07a30)';
  }

  const fmt = (n) => {
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
    return String(n);
  };

  return (
    <div
      title={`${budget.used.toLocaleString()} / ${budget.capacity.toLocaleString()} tokens (${budget.percent.toFixed(0)}% of ${model || 'context window'})${budget.willSummarize ? ' · older messages are being auto-summarized' : ''}`}
      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 99, background: 'var(--bg-active)', border: '1px solid var(--border)', fontSize: 10, color: 'var(--text-3)', cursor: 'default', userSelect: 'none', flexShrink: 0 }}
    >
      <Icon name="memory" size={11} color={color} />
      <div style={{ width: 48, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${budget.percent}%`, height: '100%', background: color, transition: 'width 0.3s ease, background 0.3s ease' }} />
      </div>
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 500, color: budget.willSummarize ? color : 'var(--text-3)', whiteSpace: 'nowrap' }}>
        {fmt(budget.used)}{budget.capacity >= 1000 ? `/${fmt(budget.capacity)}` : ''}
      </span>
      {budget.willSummarize && (
        <span style={{ fontSize: 9, fontWeight: 600, color, whiteSpace: 'nowrap' }} title={`Conversations longer than ${SUMMARIZATION_THRESHOLD.toLocaleString()} tokens are summarized to fit the model's context window`}>
          compressing
        </span>
      )}
    </div>
  );
};
