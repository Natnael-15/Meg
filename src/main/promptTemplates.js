// Prompt template library.
//
// Users can save frequently-used prompts (code review, debug help, refactor
// requests, etc.) as named templates, then insert them into the chat input
// with a single click or /template command. Templates are persisted in the
// settings DB via IPC.
//
// Built-in templates ship with Meg and can't be deleted (only overridden by
// a user template with the same id). User templates live in settings under
// the `promptTemplates` key.

const BUILTIN_TEMPLATES = [
  {
    id: 'builtin-code-review',
    name: 'Code Review',
    icon: '🔍',
    category: 'Code',
    builtin: true,
    prompt: 'Review the following code for bugs, security issues, performance problems, and style. Provide specific, actionable suggestions with line references. Focus on the most impactful issues first.',
  },
  {
    id: 'builtin-explain',
    name: 'Explain Code',
    icon: '📖',
    category: 'Code',
    builtin: true,
    prompt: 'Explain what this code does, step by step. Cover the purpose, the key logic, any edge cases, and how it fits into the larger system. Use plain language — assume I am familiar with the language but not this specific codebase.',
  },
  {
    id: 'builtin-refactor',
    name: 'Refactor',
    icon: '🔧',
    category: 'Code',
    builtin: true,
    prompt: 'Refactor this code to improve readability, maintainability, and adherence to best practices. Preserve all existing behavior. Explain each change you make and why.',
  },
  {
    id: 'builtin-add-tests',
    name: 'Add Tests',
    icon: '🧪',
    category: 'Code',
    builtin: true,
    prompt: 'Write comprehensive tests for this code. Include happy-path tests, edge cases, error handling, and any integration tests that make sense. Use the testing framework already in use in this project.',
  },
  {
    id: 'builtin-fix-bug',
    name: 'Fix Bug',
    icon: '🐛',
    category: 'Code',
    builtin: true,
    prompt: 'I have a bug. Here is the code and the unexpected behavior I am seeing. Find the root cause, explain why it happens, and provide a fix. Verify the fix handles the edge case that triggered the bug.',
  },
  {
    id: 'builtin-docs',
    name: 'Document',
    icon: '📝',
    category: 'Code',
    builtin: true,
    prompt: 'Write documentation for this code: a summary of what it does, the public API (with parameter and return types), usage examples, and any caveats. Use the project\'s existing doc style (JSDoc, docstrings, etc.).',
  },
  {
    id: 'builtin-standup',
    name: 'Daily Standup',
    icon: '☀️',
    category: 'Work',
    builtin: true,
    prompt: 'Based on my recent activity (commits, file changes, open threads), generate a concise daily standup: what I did yesterday, what I plan to do today, and any blockers. Keep it under 5 bullet points.',
  },
  {
    id: 'builtin-pr-desc',
    name: 'PR Description',
    icon: '🔀',
    category: 'Work',
    builtin: true,
    prompt: 'Generate a pull request description for these changes. Include: a one-line summary, a detailed description of what changed and why, testing instructions, and any follow-up items. Use markdown.',
  },
  {
    id: 'builtin-commit-msg',
    name: 'Commit Message',
    icon: '💬',
    category: 'Work',
    builtin: true,
    prompt: 'Write a conventional commit message for these changes. Use the format: type(scope): subject\\n\\nbody. Keep the subject under 72 characters. Explain the why, not the what.',
  },
  {
    id: 'builtin-summarize',
    name: 'Summarize',
    icon: '📋',
    category: 'Work',
    builtin: true,
    prompt: 'Summarize this content in 3-5 bullet points. Focus on the key takeaways and any action items. Skip filler and repetition.',
  },
];

/**
 * Get all templates: built-ins + user templates (user overrides built-ins
 * on id collision).
 */
function getAllTemplates() {
  const userTemplates = settings.get('promptTemplates') || [];
  const userIds = new Set(userTemplates.map(t => t.id));
  return [...BUILTIN_TEMPLATES.filter(t => !userIds.has(t.id)), ...userTemplates];
}

/**
 * Get only user templates (for the settings UI).
 */
function getUserTemplates() {
  return settings.get('promptTemplates') || [];
}

/**
 * Save a user template. Overwrites on id collision.
 */
function saveTemplate(template) {
  const existing = settings.get('promptTemplates') || [];
  const idx = existing.findIndex(t => t.id === template.id);
  const next = { ...template, builtin: false, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...next };
  } else {
    existing.push(next);
  }
  settings.set('promptTemplates', existing);
  return next;
}

/**
 * Delete a user template by id. Built-in templates can't be deleted.
 */
function deleteTemplate(id) {
  const existing = settings.get('promptTemplates') || [];
  settings.set('promptTemplates', existing.filter(t => t.id !== id));
}

const settings = require('./settings');

module.exports = {
  BUILTIN_TEMPLATES,
  getAllTemplates,
  getUserTemplates,
  saveTemplate,
  deleteTemplate,
};
