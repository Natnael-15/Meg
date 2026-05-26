// @vitest-environment node

import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

function loadLmstudioModule({ OpenAIImpl, settings }) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/lmstudio.js'), 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);

  runModule((id) => {
    if (id === 'openai') return OpenAIImpl;
    if (id === './settings') return settings;
    if (id === './tools') {
      return {
        TOOL_DEFINITIONS: [],
        executeTool: vi.fn(),
        summarizeToolResult: vi.fn((result) => result),
      };
    }
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/lmstudio.js'));

  return module.exports;
}

describe('lmstudio provider routing', () => {
  it('routes DeepSeek models through the official API URL with the stored key', () => {
    const openAiCtor = vi.fn(function OpenAI(config) {
      this.config = config;
      return { config };
    });
    const settings = {
      get: vi.fn((key) => {
        if (key === 'apiKeys') return { DeepSeek: 'deepseek-key' };
        return null;
      }),
    };
    const lmstudio = loadLmstudioModule({ OpenAIImpl: openAiCtor, settings });

    const client = lmstudio.getClientForModel('deepseek-chat', 'http://127.0.0.1:1234');

    expect(client.config).toMatchObject({
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: 'deepseek-key',
    });
  });

  it('routes local models through LM Studio', () => {
    const openAiCtor = vi.fn(function OpenAI(config) {
      this.config = config;
      return { config };
    });
    const settings = { get: vi.fn(() => ({})) };
    const lmstudio = loadLmstudioModule({ OpenAIImpl: openAiCtor, settings });

    const client = lmstudio.getClientForModel('qwen/qwen3-8b', 'http://127.0.0.1:1234');

    expect(client.config).toMatchObject({
      baseURL: 'http://127.0.0.1:1234/v1',
      apiKey: 'lm-studio',
    });
  });

  it('fails clearly when a DeepSeek key is missing', () => {
    const openAiCtor = vi.fn(function OpenAI(config) {
      this.config = config;
      return { config };
    });
    const settings = {
      get: vi.fn((key) => {
        if (key === 'apiKeys') return { DeepSeek: '' };
        return null;
      }),
    };
    const lmstudio = loadLmstudioModule({ OpenAIImpl: openAiCtor, settings });

    expect(() => lmstudio.getClientForModel('deepseek-reasoner', 'http://127.0.0.1:1234')).toThrow('DeepSeek API key is missing or invalid.');
  });
});
