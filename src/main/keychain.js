// OS keychain integration via Electron's safeStorage API.
//
// Stores API keys (OpenAI, Anthropic, Google, DeepSeek) and the Telegram
// bot token in the OS-native credential store:
//   - macOS: Keychain
//   - Windows: DPAPI (Data Protection API)
//   - Linux: libsecret (GNOME Keyring / KWallet)
//
// Falls back to the existing plaintext settings storage if safeStorage is
// unavailable (e.g. in headless Linux without a secret service, or during
// unit tests where Electron's safeStorage isn't initialized).
//
// The API mirrors a simple key-value store: setSecret(key, value),
// getSecret(key), deleteSecret(key). Values are encrypted on write and
// decrypted on read. The encrypted blob is stored in the settings DB under
// the `secrets` collection; the encryption key lives in the OS keychain.

const { app, safeStorage } = require('electron');
const settings = require('./settings');

const SECRETS_SETTINGS_KEY = 'encryptedSecrets';
const SECRET_KEYS = [
  'apiKeys.OpenAI',
  'apiKeys.Anthropic',
  'apiKeys.Google',
  'apiKeys.DeepSeek',
  'telegramToken',
  'githubToken',
];

let _cache = null;
let _cacheLoaded = false;

function isAvailable() {
  return !!safeStorage?.isEncryptionAvailable();
}

/**
 * Read all encrypted secrets from settings and decrypt them.
 * Returns a plain object { 'apiKeys.OpenAI': 'sk-...', ... }.
 * Caches the result for the process lifetime — call invalidateCache() to
 * force a re-read after a write.
 */
function loadAll() {
  if (_cacheLoaded) return _cache;
  _cache = {};
  _cacheLoaded = true;
  const encrypted = settings.get(SECRETS_SETTINGS_KEY);
  if (!encrypted || typeof encrypted !== 'object') return _cache;
  for (const [key, blob] of Object.entries(encrypted)) {
    if (!SECRET_KEYS.includes(key)) continue;
    if (!isAvailable()) {
      // safeStorage unavailable — blob is stored as plaintext fallback.
      _cache[key] = blob;
      continue;
    }
    try {
      // blob is a base64 string (we store it that way because SQLite
      // settings JSON-serialize values, and Buffer doesn't survive that).
      const buf = Buffer.from(blob, 'base64');
      _cache[key] = safeStorage.decryptString(buf);
    } catch {
      // Decryption failed (key rotated? OS reinstalled?) — skip.
    }
  }
  return _cache;
}

/**
 * Persist the in-memory cache back to settings, encrypting each value.
 */
function persistAll() {
  if (!isAvailable()) {
    // Plaintext fallback — store as-is. Not ideal but better than losing
    // the value entirely. The redaction layer (Phase 6.1) still protects
    // against accidental cloud leakage.
    settings.set(SECRETS_SETTINGS_KEY, { ...loadAll() });
    return;
  }
  const encrypted = {};
  for (const [key, value] of Object.entries(loadAll())) {
    if (typeof value !== 'string' || !value) continue;
    try {
      const buf = safeStorage.encryptString(value);
      encrypted[key] = buf.toString('base64');
    } catch {
      // Encryption failed for this value — skip it rather than crashing.
    }
  }
  settings.set(SECRETS_SETTINGS_KEY, encrypted);
}

/**
 * Get a secret by dotted key (e.g. 'apiKeys.OpenAI').
 * Returns null if not set or if safeStorage is unavailable and no
 * plaintext fallback exists.
 */
function getSecret(key) {
  if (!SECRET_KEYS.includes(key)) return null;
  return loadAll()[key] || null;
}

/**
 * Set a secret by dotted key. Encrypts and persists immediately.
 * Pass null/undefined to delete.
 */
function setSecret(key, value) {
  if (!SECRET_KEYS.includes(key)) throw new Error(`Unknown secret key: ${key}`);
  const all = loadAll();
  if (value == null || value === '') {
    delete all[key];
  } else {
    all[key] = String(value);
  }
  persistAll();
}

/**
 * Delete a secret by key.
 */
function deleteSecret(key) {
  if (!SECRET_KEYS.includes(key)) return;
  const all = loadAll();
  delete all[key];
  persistAll();
}

/**
 * Force the next loadAll() to re-read from settings + re-decrypt.
 */
function invalidateCache() {
  _cache = null;
  _cacheLoaded = false;
}

/**
 * Migrate plaintext secrets from the existing settings keys into the
 * encrypted store. Called once on app startup. Idempotent — if a secret
 * is already in the encrypted store, the plaintext version is left alone
 * (the caller can clear it separately).
 *
 * Returns { migrated: string[], skipped: string[] }.
 */
function migrateFromPlaintext() {
  const migrated = [];
  const skipped = [];
  const all = loadAll();

  // apiKeys object
  const apiKeys = settings.get('apiKeys') || {};
  for (const provider of ['OpenAI', 'Anthropic', 'Google', 'DeepSeek']) {
    const dottedKey = `apiKeys.${provider}`;
    if (all[dottedKey]) {
      skipped.push(dottedKey);
    } else if (apiKeys[provider]) {
      setSecret(dottedKey, apiKeys[provider]);
      migrated.push(dottedKey);
    }
  }

  // telegramToken
  if (all['telegramToken']) {
    skipped.push('telegramToken');
  } else {
    const tg = settings.get('telegramToken');
    if (tg) {
      setSecret('telegramToken', tg);
      migrated.push('telegramToken');
    }
  }

  // githubToken
  if (all['githubToken']) {
    skipped.push('githubToken');
  } else {
    const gh = settings.get('githubToken');
    if (gh) {
      setSecret('githubToken', gh);
      migrated.push('githubToken');
    }
  }

  return { migrated, skipped };
}

module.exports = {
  isAvailable,
  getSecret,
  setSecret,
  deleteSecret,
  loadAll,
  invalidateCache,
  migrateFromPlaintext,
  SECRET_KEYS,
};
