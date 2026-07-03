// Cloud context redaction.
//
// When the user selects a cloud model (OpenAI, Anthropic, Google, DeepSeek),
// their workspace context, file contents, and memories are sent off-machine.
// This module scans outgoing messages for high-entropy secret patterns and
// replaces them with placeholders BEFORE the request hits the network.
//
// The redactor is intentionally conservative — it only redacts strings that
// match well-known secret formats (API keys, tokens, passwords in env-style
// assignments). False positives would break code the user pastes, so we
// favor precision over recall. Redacted values are held in a per-request
// map so the LLM's response can be re-substituted (though in practice the
// LLM rarely echoes secrets back verbatim).
//
// Local models (LM Studio) skip redaction entirely — the data never leaves
// the user's machine, so there's no privacy concern.

// Patterns that match common secret formats. Each is anchored to avoid
// matching arbitrary base64-encoded content (which would cause false
// positives on legitimate code). Order matters: more specific patterns
// first so the placeholder substitution doesn't fragment a match.
const SECRET_PATTERNS = [
  // OpenAI API keys: sk-proj-... or sk-... (40+ alphanumeric)
  { id: 'openai-key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/g, label: '[REDACTED:OPENAI_KEY]' },
  // Anthropic API keys: sk-ant-...
  { id: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{50,}\b/g, label: '[REDACTED:ANTHROPIC_KEY]' },
  // GitHub PATs: ghp_..., gho_..., ghs_..., ghu_..., gh[so]_... (classic + fine-grained)
  { id: 'github-pat', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, label: '[REDACTED:GITHUB_TOKEN]' },
  // Slack tokens: xoxb-..., xoxp-..., xoxa-...
  { id: 'slack-token', re: /\bxox[abp]-[A-Za-z0-9-]{10,}\b/g, label: '[REDACTED:SLACK_TOKEN]' },
  // Stripe keys: sk_live_..., sk_test_..., rk_live_...
  { id: 'stripe-key', re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g, label: '[REDACTED:STRIPE_KEY]' },
  // AWS access keys: AKIA... (20 chars)
  { id: 'aws-key', re: /\bAKIA[0-9A-Z]{16}\b/g, label: '[REDACTED:AWS_ACCESS_KEY]' },
  // AWS secret keys — only when labeled (avoid false positives on base64)
  { id: 'aws-secret', re: /\baws_secret_access_key\s*[=:]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi, label: '[REDACTED:AWS_SECRET]' },
  // Google API keys: AIza...
  { id: 'google-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, label: '[REDACTED:GOOGLE_API_KEY]' },
  // DeepSeek API keys: sk-... (overlap with OpenAI, but DeepSeek keys are shorter)
  // — covered by the openai-key pattern above; the label is generic enough.
  // JWTs — three base64 segments separated by dots
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, label: '[REDACTED:JWT]' },
  // Private keys (PEM format) — multiline, so we use a flag regex
  { id: 'pem-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |)PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |PGP |)PRIVATE KEY-----/g, label: '[REDACTED:PRIVATE_KEY]' },
  // Generic password/token assignments in env-style: PASSWORD=..., token: "...", api_key: '...'
  // Only match when the value looks like a secret (8+ chars, not a placeholder).
  { id: 'env-password', re: /\b(?:password|passwd|pwd|token|api[_-]?key|secret[_-]?key|access[_-]?token)\s*[=:]\s*["']([^\s"']{8,})["']/gi, label: '[REDACTED:SECRET]' },
];

/**
 * Scan a string for secret patterns and return the list of matches.
 * Each match is { pattern, label, value, index }. Does NOT mutate the input.
 * Useful for the "X secrets detected" UI badge.
 */
function detectSecrets(text) {
  if (typeof text !== 'string' || !text) return [];
  const found = [];
  for (const pattern of SECRET_PATTERNS) {
    pattern.re.lastIndex = 0;
    let match;
    while ((match = pattern.re.exec(text)) !== null) {
      found.push({
        pattern: pattern.id,
        label: pattern.label,
        value: match[0],
        index: match.index,
      });
    }
  }
  return found;
}

/**
 * Redact secrets from a string, replacing each with a placeholder.
 * Returns { redacted: string, count: number, secrets: Array<{pattern, label}> }.
 *
 * The original values are NOT returned — by design. We don't want to hold
 * plaintext secrets in memory longer than necessary. If the caller needs
 * to re-substitute (e.g. in an LLM response), they can use the placeholder
 * labels as-is; the LLM rarely needs the actual secret value.
 */
function redactString(text) {
  if (typeof text !== 'string' || !text) return { redacted: text, count: 0, secrets: [] };
  let result = text;
  const seen = new Set();
  const secrets = [];
  for (const pattern of SECRET_PATTERNS) {
    pattern.re.lastIndex = 0;
    result = result.replace(pattern.re, (match) => {
      if (seen.has(match)) return pattern.label; // dedupe identical values
      seen.add(match);
      secrets.push({ pattern: pattern.id, label: pattern.label });
      return pattern.label;
    });
  }
  return { redacted: result, count: secrets.length, secrets };
}

/**
 * Walk an OpenAI-style messages array and redact secrets from every string
 * field. Handles both `content` (string) and `content` (array of parts, for
 * vision messages) shapes. Returns a NEW array — the input is not mutated.
 *
 * Returns { messages, totalRedacted } where totalRedacted is the sum across
 * all messages.
 */
function redactMessages(messages = []) {
  if (!Array.isArray(messages)) return { messages: [], totalRedacted: 0 };
  let totalRedacted = 0;
  const redacted = messages.map((msg) => {
    if (!msg || typeof msg !== 'object') return msg;
    // String content
    if (typeof msg.content === 'string') {
      const { redacted: r, count } = redactString(msg.content);
      totalRedacted += count;
      return { ...msg, content: r };
    }
    // Array content (vision messages: [{type:'text', text}, {type:'image_url', ...}])
    if (Array.isArray(msg.content)) {
      const newContent = msg.content.map((part) => {
        if (part && typeof part === 'object' && typeof part.text === 'string') {
          const { redacted: r, count } = redactString(part.text);
          totalRedacted += count;
          return { ...part, text: r };
        }
        return part;
      });
      return { ...msg, content: newContent };
    }
    return msg;
  });
  return { messages: redacted, totalRedacted };
}

/**
 * Determine whether a model routes to a cloud provider (and thus needs
 * redaction). Local LM Studio models never need redaction.
 */
function isCloudModel(model = '') {
  const m = String(model || '').toLowerCase().trim();
  return m.startsWith('gpt-')
    || m.startsWith('claude-')
    || m.startsWith('gemini-')
    || m.startsWith('deepseek-')
    || m === 'deepseek-chat'
    || m === 'deepseek-reasoner';
}

module.exports = {
  detectSecrets,
  redactString,
  redactMessages,
  isCloudModel,
  SECRET_PATTERNS,
};
