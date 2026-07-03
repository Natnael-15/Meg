// Token estimation utilities shared between the renderer (chat header token
// budget bar) and the main process (lmstudio.js auto-summarization threshold).
//
// We use the same ~4 chars/token heuristic as the main process so the
// numbers the user sees in the UI match the numbers the backend uses to
// decide when to compress history.

/** Approximate tokens in a single string (~4 chars per token). */
export function estimateTokens(text = '') {
  if (typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Approximate tokens in an array of OpenAI-style chat messages.
 * Each message carries ~40 chars of structural overhead (role tags, etc.)
 * on top of its content length.
 *
 * Accepts Meg's thread-message shape ({role, text}) as well as the
 * OpenAI shape ({role, content}) by normalizing `text` → `content`.
 */
export function estimateMessagesTokens(messages = []) {
  if (!Array.isArray(messages)) return 0;
  return messages.reduce((acc, m) => {
    let contentLen = 0;
    const content = m.content ?? m.text;
    if (typeof content === 'string') {
      contentLen = content.length;
    } else if (Array.isArray(content)) {
      contentLen = content.reduce((cAcc, part) => {
        if (typeof part?.text === 'string') return cAcc + part.text.length;
        if (part?.content && typeof part.content === 'string') return cAcc + part.content.length;
        return cAcc;
      }, 0);
    }
    return acc + contentLen + 40;
  }, 0) / 4;
}

/**
 * Common model context-window sizes (in tokens). Used by the chat header to
 * show how much of the model's budget the current conversation is consuming.
 *
 * These are conservative published figures. For local LM Studio models we
 * default to 8k since the user can configure a smaller context in LM Studio
 * itself — the bar is a rough guide, not a hard limit.
 */
export const MODEL_CONTEXT_WINDOWS = {
  // OpenAI
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16385,
  'o1': 200000,
  'o3': 200000,
  'o4-mini': 200000,
  // Anthropic
  'claude-3-5-sonnet': 200000,
  'claude-3-5-haiku': 200000,
  'claude-3-opus': 200000,
  // Google
  'gemini-1.5-pro': 2000000,
  'gemini-1.5-flash': 1000000,
  'gemini-2.0-flash': 1000000,
  // DeepSeek
  'deepseek-chat': 64000,
  'deepseek-reasoner': 64000,
};

/** Default context window for unknown / local models. */
export const DEFAULT_CONTEXT_WINDOW = 8192;

/**
 * Look up the context window for a model. Falls back to DEFAULT_CONTEXT_WINDOW
 * for unknown models (including all LM Studio local models, which the user
 * configures separately in LM Studio itself).
 */
export function getContextWindow(model = '') {
  const m = String(model || '').toLowerCase().trim();
  // Try exact match first, then prefix match (e.g. "gpt-4o-2024-08-06").
  if (MODEL_CONTEXT_WINDOWS[m]) return MODEL_CONTEXT_WINDOWS[m];
  for (const [prefix, size] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (m.startsWith(prefix)) return size;
  }
  return DEFAULT_CONTEXT_WINDOW;
}

/**
 * The threshold at which Meg's backend auto-summarizes history (8k tokens).
 * Exported so the UI can show the same line the backend uses.
 */
export const SUMMARIZATION_THRESHOLD = 8000;

/**
 * Build a token-budget summary for a thread's message list + active model.
 * Returns { used, capacity, percent, willSummarize }.
 */
export function getTokenBudget(messages = [], model = '') {
  const used = Math.round(estimateMessagesTokens(messages));
  const capacity = getContextWindow(model);
  const percent = capacity > 0 ? Math.min(100, (used / capacity) * 100) : 0;
  return {
    used,
    capacity,
    percent,
    willSummarize: used >= SUMMARIZATION_THRESHOLD,
  };
}
