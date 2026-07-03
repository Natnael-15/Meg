// @vitest-environment node
//
// Phase 5 plugin system tests.
// Verifies:
//   P-1  normalizeSkill validates required fields + defaults optional fields
//   P-2  loadCustomSkills reads JSON files from the skills directory
//   P-3  loadCustomSkills skips malformed JSON + invalid skill objects
//   P-4  loadCustomSkills caches results; invalidateCache forces re-read
//   P-5  mergeSkills: custom skills override built-ins on id collision
//   P-6  ensureSkillsDir creates the directory if missing

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function loadCustomSkillsModule({ userDataPath }) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/customSkills.js'), 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);
  runModule((id) => {
    if (id === 'electron') return { app: { getPath: () => userDataPath } };
    if (id === 'fs') return require('fs');
    if (id === 'path') return require('path');
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/customSkills.js'));
  return module.exports;
}

describe('P-1: normalizeSkill validation', () => {
  const { normalizeSkill } = loadCustomSkillsModule({ userDataPath: '/tmp' });

  it('normalizes a valid skill with all fields', () => {
    const raw = {
      id: 'rust-embedded',
      name: 'Rust Embedded',
      icon: '🦀',
      color: '#ce422b',
      category: 'Language',
      desc: 'no_std Rust for MCUs',
      keywords: ['rust', 'embedded', 'no_std'],
      prompt: 'ACTIVE SKILL — RUST EXPERT:\n- Use no_std...',
    };
    const skill = normalizeSkill(raw, 'rust.json');
    expect(skill).toMatchObject({
      id: 'rust-embedded',
      name: 'Rust Embedded',
      icon: '🦀',
      color: '#ce422b',
      category: 'Language',
      desc: 'no_std Rust for MCUs',
      keywords: ['rust', 'embedded', 'no_std'],
      _custom: true,
      _source: 'rust.json',
    });
  });

  it('returns null when required fields are missing', () => {
    expect(normalizeSkill({ name: 'NoId' }, 'a.json')).toBeNull();
    expect(normalizeSkill({ id: 'x' }, 'b.json')).toBeNull();
    expect(normalizeSkill({ id: 'x', name: 'X' }, 'c.json')).toBeNull(); // missing prompt
    expect(normalizeSkill({ id: '', name: 'X', prompt: 'p' }, 'd.json')).toBeNull();
  });

  it('defaults optional fields', () => {
    const skill = normalizeSkill({ id: 'x', name: 'X', prompt: 'p' }, 'x.json');
    expect(skill.icon).toBe('✦');
    expect(skill.color).toBe('var(--accent)');
    expect(skill.category).toBe('Custom');
    expect(skill.desc).toBe('');
    expect(skill.keywords).toEqual([]);
  });

  it('filters non-string keywords', () => {
    const skill = normalizeSkill({ id: 'x', name: 'X', prompt: 'p', keywords: ['a', 42, 'b', null] }, 'x.json');
    expect(skill.keywords).toEqual(['a', 'b']);
  });
});

describe('P-2 + P-3: loadCustomSkills filesystem reading', () => {
  let tempDir, customSkills;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meg-skills-'));
    customSkills = loadCustomSkillsModule({ userDataPath: tempDir });
    // Each test gets a fresh module instance, so the cache is empty.
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns an empty array when the skills directory does not exist', () => {
    expect(customSkills.loadCustomSkills()).toEqual([]);
  });

  it('reads valid skill JSON files from the skills directory', () => {
    const skillsDir = path.join(tempDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'rust.json'), JSON.stringify({
      id: 'rust', name: 'Rust', prompt: 'Rust expert', keywords: ['rust', 'cargo'],
    }));
    fs.writeFileSync(path.join(skillsDir, 'go.json'), JSON.stringify({
      id: 'go', name: 'Go', prompt: 'Go expert', icon: '🐹',
    }));

    const skills = customSkills.loadCustomSkills();
    expect(skills).toHaveLength(2);
    expect(skills.map(s => s.id).sort()).toEqual(['go', 'rust']);
    expect(skills.find(s => s.id === 'rust').keywords).toEqual(['rust', 'cargo']);
  });

  it('skips malformed JSON files without throwing', () => {
    const skillsDir = path.join(tempDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'broken.json'), '{ not valid json');
    fs.writeFileSync(path.join(skillsDir, 'good.json'), JSON.stringify({ id: 'good', name: 'Good', prompt: 'p' }));

    const skills = customSkills.loadCustomSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe('good');
  });

  it('skips skill files with invalid skill objects', () => {
    const skillsDir = path.join(tempDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'no-id.json'), JSON.stringify({ name: 'NoId', prompt: 'p' }));
    fs.writeFileSync(path.join(skillsDir, 'valid.json'), JSON.stringify({ id: 'valid', name: 'V', prompt: 'p' }));

    const skills = customSkills.loadCustomSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe('valid');
  });

  it('skips duplicate ids within the custom set', () => {
    const skillsDir = path.join(tempDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'a.json'), JSON.stringify({ id: 'dup', name: 'A', prompt: 'p' }));
    fs.writeFileSync(path.join(skillsDir, 'b.json'), JSON.stringify({ id: 'dup', name: 'B', prompt: 'p' }));

    const skills = customSkills.loadCustomSkills();
    expect(skills).toHaveLength(1);
  });

  it('ignores non-JSON files', () => {
    const skillsDir = path.join(tempDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'readme.txt'), 'not a skill');
    fs.writeFileSync(path.join(skillsDir, 'valid.json'), JSON.stringify({ id: 'v', name: 'V', prompt: 'p' }));

    const skills = customSkills.loadCustomSkills();
    expect(skills).toHaveLength(1);
  });
});

describe('P-4: caching + invalidateCache', () => {
  let tempDir, customSkills;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meg-skills-cache-'));
    customSkills = loadCustomSkillsModule({ userDataPath: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('caches results — second call does not re-read the filesystem', () => {
    const skillsDir = path.join(tempDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'a.json'), JSON.stringify({ id: 'a', name: 'A', prompt: 'p' }));

    const first = customSkills.loadCustomSkills();
    expect(first).toHaveLength(1);

    // Add another skill file after the first load.
    fs.writeFileSync(path.join(skillsDir, 'b.json'), JSON.stringify({ id: 'b', name: 'B', prompt: 'p' }));

    const second = customSkills.loadCustomSkills();
    // Should still be 1 — cached.
    expect(second).toHaveLength(1);
  });

  it('invalidateCache forces a re-read on the next loadCustomSkills call', () => {
    const skillsDir = path.join(tempDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'a.json'), JSON.stringify({ id: 'a', name: 'A', prompt: 'p' }));

    customSkills.loadCustomSkills();
    fs.writeFileSync(path.join(skillsDir, 'b.json'), JSON.stringify({ id: 'b', name: 'B', prompt: 'p' }));

    customSkills.invalidateCache();
    const skills = customSkills.loadCustomSkills();
    expect(skills).toHaveLength(2);
  });
});

describe('P-5: mergeSkills override behavior', () => {
  let tempDir, customSkills;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meg-skills-merge-'));
    customSkills = loadCustomSkillsModule({ userDataPath: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('custom skills override built-ins on id collision', () => {
    const skillsDir = path.join(tempDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'python.json'), JSON.stringify({
      id: 'python',
      name: 'Python (Custom)',
      prompt: 'CUSTOM PYTHON PROMPT',
    }));

    customSkills.loadCustomSkills(); // populate cache
    const builtins = [
      { id: 'python', name: 'Python', prompt: 'BUILTIN', category: 'Language' },
      { id: 'nodejs', name: 'Node', prompt: 'BUILTIN NODE', category: 'Language' },
    ];
    const merged = customSkills.mergeSkills(builtins);

    expect(merged).toHaveLength(2);
    const python = merged.find(s => s.id === 'python');
    expect(python.name).toBe('Python (Custom)');
    expect(python.prompt).toBe('CUSTOM PYTHON PROMPT');
    expect(python._custom).toBe(true);
  });

  it('returns builtins unchanged when no custom skills exist', () => {
    const builtins = [{ id: 'a', name: 'A', prompt: 'p' }];
    const merged = customSkills.mergeSkills(builtins);
    expect(merged).toBe(builtins);
  });
});

describe('P-6: ensureSkillsDir', () => {
  it('creates the skills directory if it does not exist', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meg-skills-ensure-'));
    try {
      const customSkills = loadCustomSkillsModule({ userDataPath: tempDir });
      const expectedDir = path.join(tempDir, 'skills');
      expect(fs.existsSync(expectedDir)).toBe(false);
      const created = customSkills.ensureSkillsDir();
      expect(created).toBe(expectedDir);
      expect(fs.existsSync(expectedDir)).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('is a no-op if the directory already exists', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meg-skills-exists-'));
    try {
      const customSkills = loadCustomSkillsModule({ userDataPath: tempDir });
      const skillsDir = path.join(tempDir, 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });
      fs.writeFileSync(path.join(skillsDir, 'existing.json'), '{}');
      customSkills.ensureSkillsDir(); // should not throw or wipe
      expect(fs.existsSync(path.join(skillsDir, 'existing.json'))).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
