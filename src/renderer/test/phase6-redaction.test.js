// @vitest-environment node
//
// Phase 6.1 cloud context redaction tests.
// Verifies:
//   R-1  detectSecrets finds all known secret formats
//   R-2  redactString replaces secrets with [REDACTED:...] placeholders
//   R-3  redactMessages handles string + array (vision) content shapes
//   R-4  isCloudModel correctly identifies cloud vs local models
//   R-5  redaction is non-destructive to non-secret code

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

function loadRedactModule() {
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/redact.js'), 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);
  runModule(() => { throw new Error('no requires expected'); }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/redact.js'));
  return module.exports;
}

const redact = loadRedactModule();

describe('R-1: detectSecrets', () => {
  it('detects OpenAI API keys', () => {
    const found = redact.detectSecrets('my key is sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx234');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].pattern).toBe('openai-key');
  });

  it('detects Anthropic API keys', () => {
    const found = redact.detectSecrets('sk-ant-api03-' + 'x'.repeat(60));
    // Note: sk-ant-... also matches the generic openai-key pattern (sk-...),
    // so we expect at least 1 detection that includes the anthropic-key pattern.
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found.some(f => f.pattern === 'anthropic-key')).toBe(true);
  });

  it('detects GitHub PATs', () => {
    const found = redact.detectSecrets('ghp_' + 'a'.repeat(36));
    expect(found.length).toBe(1);
    expect(found[0].pattern).toBe('github-pat');
  });

  it('detects Slack tokens', () => {
    const found = redact.detectSecrets('xoxb-' + '1234567890123-0987654321098765');
    expect(found.length).toBe(1);
    expect(found[0].pattern).toBe('slack-token');
  });

  it('detects Stripe keys', () => {
    const found = redact.detectSecrets('sk_live_' + 'a'.repeat(24));
    expect(found.length).toBe(1);
    expect(found[0].pattern).toBe('stripe-key');
  });

  it('detects AWS access keys', () => {
    const found = redact.detectSecrets('AKIA' + 'IOSFODNN7EXAMPLE');
    expect(found.length).toBe(1);
    expect(found[0].pattern).toBe('aws-key');
  });

  it('detects Google API keys', () => {
    const found = redact.detectSecrets('AIza' + 'a'.repeat(35));
    expect(found.length).toBe(1);
    expect(found[0].pattern).toBe('google-key');
  });

  it('detects JWTs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.eyJzdWJuYW1lIjoiSm9obiBEb2Ui';
    const found = redact.detectSecrets(jwt);
    expect(found.length).toBe(1);
    expect(found[0].pattern).toBe('jwt');
  });

  it('detects PEM private keys', () => {
    const pem = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA1234567890abcdefghijklmnopqrstuvwxyz
-----END RSA PRIVATE KEY-----`;
    const found = redact.detectSecrets(pem);
    expect(found.length).toBe(1);
    expect(found[0].pattern).toBe('pem-key');
  });

  it('detects env-style password assignments', () => {
    const found = redact.detectSecrets('password = "supersecret123"');
    expect(found.length).toBe(1);
    expect(found[0].pattern).toBe('env-password');
  });

  it('detects api_key assignments', () => {
    const found = redact.detectSecrets("api_key: 'sk-abcdef123456'");
    // Note: the api_key assignment matches env-password pattern. The sk-
    // prefix might also match openai-key depending on length.
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it('returns an empty array for plain text', () => {
    expect(redact.detectSecrets('just a normal message about code')).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(redact.detectSecrets('')).toEqual([]);
    expect(redact.detectSecrets(null)).toEqual([]);
  });
});

describe('R-2: redactString', () => {
  it('replaces secrets with [REDACTED:...] placeholders', () => {
    const { redacted, count } = redact.redactString('key=ghp_' + 'a'.repeat(36));
    expect(count).toBeGreaterThanOrEqual(1);
    expect(redacted).toContain('[REDACTED:');
    expect(redacted).not.toContain('ghp_');
  });

  it('preserves non-secret content', () => {
    const { redacted } = redact.redactString('function hello() { return "world"; }');
    expect(redacted).toBe('function hello() { return "world"; }');
  });

  it('deduplicates identical secrets', () => {
    const key = 'ghp_' + 'a'.repeat(36);
    const { redacted, count } = redact.redactString(`first: ${key}, second: ${key}`);
    // Both occurrences should be replaced, but count may reflect dedup behavior.
    expect(redacted).not.toContain(key);
    expect(redacted.match(/\[REDACTED:/g).length).toBe(2);
  });

  it('handles empty input', () => {
    expect(redact.redactString('')).toEqual({ redacted: '', count: 0, secrets: [] });
    expect(redact.redactString(null)).toEqual({ redacted: null, count: 0, secrets: [] });
  });
});

describe('R-3: redactMessages', () => {
  it('redacts string content in messages', () => {
    const messages = [
      { role: 'user', content: 'here is my key: ghp_' + 'a'.repeat(36) },
    ];
    const { messages: redacted, totalRedacted } = redact.redactMessages(messages);
    expect(totalRedacted).toBeGreaterThanOrEqual(1);
    expect(redacted[0].content).toContain('[REDACTED:');
    expect(redacted[0].content).not.toContain('ghp_');
  });

  it('redacts array content (vision messages)', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'my token: ghp_' + 'a'.repeat(36) },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
        ],
      },
    ];
    const { messages: redacted, totalRedacted } = redact.redactMessages(messages);
    expect(totalRedacted).toBeGreaterThanOrEqual(1);
    expect(redacted[0].content[0].text).toContain('[REDACTED:');
    // Image part should be untouched.
    expect(redacted[0].content[1].image_url.url).toBe('data:image/png;base64,abc');
  });

  it('does not mutate the input array', () => {
    const original = [{ role: 'user', content: 'ghp_' + 'a'.repeat(36) }];
    const originalCopy = JSON.parse(JSON.stringify(original));
    redact.redactMessages(original);
    expect(original).toEqual(originalCopy);
  });

  it('returns empty for non-array input', () => {
    expect(redact.redactMessages(null)).toEqual({ messages: [], totalRedacted: 0 });
    expect(redact.redactMessages('not an array')).toEqual({ messages: [], totalRedacted: 0 });
  });

  it('handles messages with no content', () => {
    const messages = [{ role: 'system' }, { role: 'user', content: '' }];
    const { messages: redacted, totalRedacted } = redact.redactMessages(messages);
    expect(totalRedacted).toBe(0);
    expect(redacted).toHaveLength(2);
  });
});

describe('R-4: isCloudModel', () => {
  it('identifies OpenAI models as cloud', () => {
    expect(redact.isCloudModel('gpt-4o')).toBe(true);
    expect(redact.isCloudModel('gpt-4o-mini')).toBe(true);
    expect(redact.isCloudModel('gpt-3.5-turbo')).toBe(true);
  });

  it('identifies Anthropic models as cloud', () => {
    expect(redact.isCloudModel('claude-3-5-sonnet')).toBe(true);
    expect(redact.isCloudModel('claude-3-opus')).toBe(true);
  });

  it('identifies Google models as cloud', () => {
    expect(redact.isCloudModel('gemini-1.5-pro')).toBe(true);
    expect(redact.isCloudModel('gemini-2.0-flash')).toBe(true);
  });

  it('identifies DeepSeek models as cloud', () => {
    expect(redact.isCloudModel('deepseek-chat')).toBe(true);
    expect(redact.isCloudModel('deepseek-reasoner')).toBe(true);
  });

  it('identifies local LM Studio models as NOT cloud', () => {
    expect(redact.isCloudModel('qwen/qwen3-8b')).toBe(false);
    expect(redact.isCloudModel('llama-3.1-8b-instruct')).toBe(false);
    expect(redact.isCloudModel('')).toBe(false);
    expect(redact.isCloudModel(null)).toBe(false);
  });
});

describe('R-5: non-destructive to code', () => {
  it('does not redact normal code snippets', () => {
    const code = `
const express = require('express');
const app = express();
app.get('/', (req, res) => res.json({ ok: true }));
app.listen(3000);
    `;
    const { redacted, count } = redact.redactString(code);
    expect(count).toBe(0);
    expect(redacted).toBe(code);
  });

  it('does not redact placeholder passwords', () => {
    // "password" with a short value (< 8 chars) should not match.
    const { count } = redact.redactString('password = "abc"');
    expect(count).toBe(0);
  });

  it('does not redact base64-encoded normal data', () => {
    // Random base64 that isn't a JWT or PEM should be left alone.
    const { count } = redact.redactString('data:application/octet-stream;base64,SGVsbG8gV29ybGQ=');
    expect(count).toBe(0);
  });
});
