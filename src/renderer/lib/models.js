// Shared model helpers used by App.jsx and SettingsView.jsx.

export const isThinkingModel = (m) => {
  if (!m) return false;
  // Match qwen3, deepseek-r1 / deepseek_r1, or any model with "thinking" in the name.
  return /\b(qwen[-_]?3|deepseek[-_]?r1|.*thinking.*)\b/i.test(m);
};

export const modelProvider = (m) => {
  if (!m) return 'Other';
  if (/^claude/i.test(m)) return 'Anthropic';
  if (/^(gpt|o1|o3|o4)/i.test(m)) return 'OpenAI';
  if (/^deepseek/i.test(m)) return 'DeepSeek';
  if (/^(gemini|gemma)/i.test(m)) return 'Google';
  return 'Other';
};
