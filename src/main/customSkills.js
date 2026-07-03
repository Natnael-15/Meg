// Custom skills plugin loader.
//
// Meg ships with 31 built-in skills (lib/skills.js), but users may want to
// add their own — domain-specific expert prompts, team conventions, project
// patterns. This module loads custom skill definitions from the filesystem
// (a `skills/` directory under the Electron userData path) and merges them
// with the built-ins.
//
// Skill file format (JSON, one skill per file):
// {
//   "id": "rust-embedded",
//   "name": "Rust Embedded",
//   "icon": "🦀",
//   "color": "#ce422b",
//   "category": "Language",
//   "desc": "no_std Rust for microcontrollers",
//   "keywords": ["rust", "embedded", "no_std", "hal", "cortex-m"],
//   "prompt": "ACTIVE SKILL — RUST EMBEDDED EXPERT:\n- ..."
// }
//
// Custom skills take precedence on id collisions — this lets users override
// built-ins by creating a skill file with the same id.
//
// The loader is designed to never crash the app: a malformed skill file is
// skipped with a console.warn, not thrown.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const REQUIRED_FIELDS = ['id', 'name', 'prompt'];
const VALID_FIELDS = new Set(['id', 'name', 'icon', 'color', 'category', 'desc', 'keywords', 'prompt']);

let _cache = null;
let _cacheLoaded = false;

/** Get the directory where custom skill JSON files live. */
function getSkillsDir() {
  const userData = app?.getPath ? app.getPath('userData') : process.cwd();
  return path.join(userData, 'skills');
}

/**
 * Validate + normalize a raw skill object loaded from JSON.
 * Returns the normalized skill, or null if invalid.
 */
function normalizeSkill(raw, sourceFile = '') {
  if (!raw || typeof raw !== 'object') return null;
  for (const field of REQUIRED_FIELDS) {
    if (typeof raw[field] !== 'string' || !raw[field].trim()) {
      console.warn(`[skills] ${sourceFile}: missing or invalid "${field}" field, skipping`);
      return null;
    }
  }
  // Warn on unknown fields so users notice typos.
  for (const key of Object.keys(raw)) {
    if (!VALID_FIELDS.has(key)) {
      console.warn(`[skills] ${sourceFile}: unknown field "${key}" (will be ignored)`);
    }
  }
  return {
    id: raw.id.trim(),
    name: raw.name.trim(),
    icon: typeof raw.icon === 'string' ? raw.icon : '✦',
    color: typeof raw.color === 'string' ? raw.color : 'var(--accent)',
    category: typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : 'Custom',
    desc: typeof raw.desc === 'string' ? raw.desc : '',
    keywords: Array.isArray(raw.keywords) ? raw.keywords.filter(k => typeof k === 'string') : [],
    prompt: raw.prompt,
    _custom: true,
    _source: sourceFile,
  };
}

/**
 * Load all custom skill JSON files from the skills directory.
 * Returns an array of normalized skill objects. Returns an empty array if
 * the directory doesn't exist or contains no valid skill files.
 *
 * Results are cached for the lifetime of the process — call invalidateCache()
 * to force a re-read (e.g. after the user adds/removes a skill file).
 */
function loadCustomSkills() {
  if (_cacheLoaded) return _cache;
  _cache = [];
  _cacheLoaded = true;

  const dir = getSkillsDir();
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return _cache; // Directory doesn't exist yet — that's fine.
  }

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const fullPath = path.join(dir, file);
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (e) {
      console.warn(`[skills] ${file}: failed to parse JSON (${e.message}), skipping`);
      continue;
    }
    const skill = normalizeSkill(raw, file);
    if (skill) {
      // Check for duplicate ids within the custom set.
      if (_cache.some(s => s.id === skill.id)) {
        console.warn(`[skills] ${file}: duplicate id "${skill.id}" (already loaded from another file), skipping`);
        continue;
      }
      _cache.push(skill);
    }
  }
  return _cache;
}

/**
 * Merge custom skills with built-in skills. Custom skills take precedence
 * on id collisions (they override built-ins).
 *
 * @param {Array} builtins - The built-in SKILLS array from lib/skills.js.
 * @returns {Array} Merged array of all skills.
 */
function mergeSkills(builtins = []) {
  const customs = loadCustomSkills();
  if (!customs.length) return builtins;
  const customIds = new Set(customs.map(s => s.id));
  // Built-ins whose id is NOT overridden by a custom skill come first,
  // then all custom skills. This keeps the display order stable.
  return [...builtins.filter(s => !customIds.has(s.id)), ...customs];
}

/** Force the next loadCustomSkills() call to re-read from disk. */
function invalidateCache() {
  _cache = null;
  _cacheLoaded = false;
}

/** Get the skills directory path (for the Settings UI to show / open it). */
function getSkillsDirPath() {
  return getSkillsDir();
}

/**
 * Ensure the skills directory exists (creates it if missing).
 * Called on app startup so users can drop skill files in immediately.
 */
function ensureSkillsDir() {
  const dir = getSkillsDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // Ignore — we'll handle the missing dir gracefully in loadCustomSkills.
  }
  return dir;
}

module.exports = {
  loadCustomSkills,
  mergeSkills,
  normalizeSkill,
  invalidateCache,
  getSkillsDirPath,
  ensureSkillsDir,
  REQUIRED_FIELDS,
  VALID_FIELDS,
};
