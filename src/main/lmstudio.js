const OpenAI = require('openai');
const settings = require('./settings');
const { TOOL_DEFINITIONS, executeTool, summarizeToolResult } = require('./tools');

const DEFAULT_URL = 'http://127.0.0.1:1234';
const DEFAULT_MODEL = 'qwen/qwen3-8b';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1';
const DEEPSEEK_MODELS = new Set(['deepseek-chat', 'deepseek-reasoner']);

function isDeepSeekModel(model = '') {
  return DEEPSEEK_MODELS.has(String(model || '').trim());
}

function normalizeProviderError(error, provider) {
  if (provider !== 'deepseek') return error;
  const status = error?.status || error?.code || error?.response?.status;
  if (status === 401 || status === 403) {
    return new Error('DeepSeek API key is missing or invalid.');
  }
  return error;
}

function getLmStudioClient(baseUrl = DEFAULT_URL) {
  return new OpenAI({ baseURL: `${baseUrl}/v1`, apiKey: 'lm-studio' });
}

function getClientForProvider(provider, baseUrl = DEFAULT_URL) {
  const apiKeys = settings.get('apiKeys') || {};
  if (provider === 'openai') {
    const key = apiKeys.OpenAI || '';
    if (!key.trim()) throw new Error('OpenAI API key is missing. Please configure it in settings.');
    return new OpenAI({ baseURL: 'https://api.openai.com/v1', apiKey: key });
  }
  if (provider === 'google') {
    const key = apiKeys.Google || '';
    if (!key.trim()) throw new Error('Google Gemini API key is missing. Please configure it in settings.');
    return new OpenAI({ baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: key });
  }
  if (provider === 'deepseek') {
    const key = apiKeys.DeepSeek || '';
    if (!key.trim()) throw new Error('DeepSeek API key is missing or invalid.');
    return new OpenAI({ baseURL: DEEPSEEK_URL, apiKey: key });
  }
  return getLmStudioClient(baseUrl);
}

function resolveProvider(model = DEFAULT_MODEL) {
  const m = String(model || '').toLowerCase().trim();
  if (m.startsWith('gpt-')) return 'openai';
  if (m.startsWith('gemini-')) return 'google';
  if (m.startsWith('claude-')) return 'anthropic';
  if (m.startsWith('deepseek-') || DEEPSEEK_MODELS.has(m)) return 'deepseek';
  return 'lmstudio';
}

function buildExtraBody(provider, model, thinking) {
  if (provider !== 'lmstudio') return undefined;
  return /qwen3|deepseek.?r1|thinking/i.test(model)
    ? { enable_thinking: !!thinking }
    : undefined;
}

function getClient(baseUrl = DEFAULT_URL) {
  return getLmStudioClient(baseUrl);
}

function getClientForModel(model = DEFAULT_MODEL, baseUrl = DEFAULT_URL) {
  const provider = resolveProvider(model);
  return getClientForProvider(provider, baseUrl);
}

function translateMessagesToAnthropic(openAiMessages) {
  const systemMsgs = openAiMessages.filter(m => m.role === 'system');
  const system = systemMsgs.map(m => m.content).join('\n\n');

  const nonSystem = openAiMessages.filter(m => m.role !== 'system');
  const anthropicMessages = [];

  for (let i = 0; i < nonSystem.length; i++) {
    const msg = nonSystem[i];
    if (msg.role === 'user') {
      anthropicMessages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      const content = [];
      if (msg.content) content.push({ type: 'text', text: msg.content });
      if (msg.tool_calls) {
        msg.tool_calls.forEach(tc => {
          let input = {};
          try { input = JSON.parse(tc.function.arguments); } catch {}
          content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
        });
      }
      anthropicMessages.push({ role: 'assistant', content });
    } else if (msg.role === 'tool') {
      let last = anthropicMessages[anthropicMessages.length - 1];
      if (!last || last.role !== 'user' || typeof last.content === 'string') {
        last = { role: 'user', content: [] };
        anthropicMessages.push(last);
      }
      last.content.push({
        type: 'tool_result',
        tool_use_id: msg.tool_call_id,
        content: msg.content || '',
      });
    }
  }
  return { system, messages: anthropicMessages };
}

function translateToolsToAnthropic(openAiTools = []) {
  return openAiTools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

async function* getAnthropicStream(model, messages, tools, apiKey, abortSignal) {
  const Anthropic = require('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey });
  const { system, messages: anthropicMessages } = translateMessagesToAnthropic(messages);
  const anthropicTools = translateToolsToAnthropic(tools);

  const params = {
    model: model || 'claude-3-5-sonnet-20241022',
    max_tokens: 4000,
    messages: anthropicMessages,
    tools: anthropicTools,
  };
  if (system) params.system = system;

  // Pass the abort signal to the SDK so in-flight requests can be cancelled
  // immediately (not just between streamed chunks).
  const stream = await anthropic.messages.create({
    ...params,
    stream: true,
  }, abortSignal ? { signal: abortSignal } : undefined);

  for await (const event of stream) {
    if (abortSignal?.aborted) break;

    if (event.type === 'content_block_start') {
      const block = event.content_block;
      if (block.type === 'tool_use') {
        yield {
          choices: [{
            delta: {
              tool_calls: [{
                index: event.index,
                id: block.id,
                type: 'function',
                function: { name: block.name, arguments: '' }
              }]
            }
          }]
        };
      }
    } else if (event.type === 'content_block_delta') {
      const delta = event.delta;
      if (delta.type === 'text_delta') {
        yield {
          choices: [{
            delta: { content: delta.text }
          }]
        };
      } else if (delta.type === 'input_json_delta') {
        yield {
          choices: [{
            delta: {
              tool_calls: [{
                index: event.index,
                function: { arguments: delta.partial_json }
              }]
            }
          }]
        };
      }
    } else if (event.type === 'message_delta') {
      const stopReason = event.delta.stop_reason;
      let finish_reason = null;
      if (stopReason === 'tool_use') finish_reason = 'tool_calls';
      else if (stopReason === 'end_turn') finish_reason = 'stop';
      
      yield {
        choices: [{
          delta: {},
          finish_reason
        }]
      };
    }
  }
}

async function getModels(baseUrl = DEFAULT_URL) {
  const client = getLmStudioClient(baseUrl);
  const list = await client.models.list();
  return list.data;
}

async function ping(baseUrl = DEFAULT_URL) {
  try {
    const models = await getModels(baseUrl);
    return { ok: true, count: models.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function estimateTokens(text = '') {
  if (typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}

function estimateMessagesTokens(messages) {
  return messages.reduce((acc, m) => {
    let contentLen = 0;
    if (typeof m.content === 'string') contentLen = m.content.length;
    else if (Array.isArray(m.content)) {
      contentLen = m.content.reduce((cAcc, part) => {
        if (typeof part.text === 'string') return cAcc + part.text.length;
        if (part.content && typeof part.content === 'string') return cAcc + part.content.length;
        return cAcc;
      }, 0);
    }
    return acc + contentLen + 40; // 40 char overhead
  }, 0) / 4;
}

async function summarizeMessages(client, model, messagesToSummarize, provider) {
  const textToSummarize = messagesToSummarize.map(m => {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return `${m.role.toUpperCase()}: ${content}`;
  }).join('\n\n');

  try {
    let summaryText = '';
    if (provider === 'anthropic') {
      const Anthropic = require('@anthropic-ai/sdk');
      const apiKeys = settings.get('apiKeys') || {};
      const key = apiKeys.Anthropic || '';
      const anthropic = new Anthropic({ apiKey: key });
      const resp = await anthropic.messages.create({
        model: model || 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `CONCISELY summarize this conversation history segment, preserving all critical file paths, code block changes, and decisions. Be brief:\n\n${textToSummarize}`
        }]
      });
      summaryText = resp.content.map(c => c.text || '').join('\n');
    } else {
      const resp = await client.chat.completions.create({
        model,
        messages: [{
          role: 'user',
          content: `CONCISELY summarize this conversation history segment, preserving all critical file paths, code block changes, and decisions. Be brief:\n\n${textToSummarize}`
        }],
        temperature: 0.3,
        max_tokens: 500,
      });
      summaryText = resp.choices[0]?.message?.content || '';
    }
    return summaryText.trim();
  } catch (err) {
    console.error('Failed to summarize history:', err.message);
    return '[Older conversation history omitted to fit context window]';
  }
}

// Tool category → tool name mapping. Used by agentRunner to build a per-agent
// tool allowlist, and respected by streamChat to both filter the tool
// definitions sent to the LLM and reject disallowed tool calls at execution.
const TOOL_CATEGORY_MAP = {
  terminal: ['run_command'],
  fs: ['read_file', 'write_file', 'rename_path', 'delete_path', 'make_directory', 'list_directory', 'search_files'],
  browser: ['web_search'],
};

/**
 * Non-streaming one-shot completion. Used by automationRunner for `document`
 * actions that just need a single block of generated text.
 * Routes through the same provider logic as streamChat.
 */
async function completeChat(messages, model = DEFAULT_MODEL, baseUrl = DEFAULT_URL) {
  const provider = resolveProvider(model);
  const apiKeys = settings.get('apiKeys') || {};

  if (provider === 'anthropic') {
    const Anthropic = require('@anthropic-ai/sdk');
    const key = apiKeys.Anthropic || '';
    if (!key.trim()) throw new Error('Anthropic API key is missing. Please configure it in settings.');
    const anthropic = new Anthropic({ apiKey: key });
    const { system, messages: anthropicMessages } = translateMessagesToAnthropic(messages);
    const params = {
      model: model || 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: anthropicMessages,
    };
    if (system) params.system = system;
    const resp = await anthropic.messages.create(params);
    return resp.content.map((c) => c.text || '').join('').trim();
  }

  const client = getClientForModel(model, baseUrl);
  const resp = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.3,
    max_tokens: 2000,
  });
  return (resp.choices[0]?.message?.content || '').trim();
}

async function* streamChat(messages, threadId, model = DEFAULT_MODEL, thinking = true, baseUrl = DEFAULT_URL, toolContext = {}) {
  const provider = resolveProvider(model);
  const { ctrl } = toolContext;

  // ── Cloud context redaction ──────────────────────────────────────────
  // When sending to a cloud provider (OpenAI/Anthropic/Google/DeepSeek),
  // scan the message history for secrets (API keys, tokens, PEM blocks,
  // env-style passwords) and replace them with [REDACTED:...] placeholders
  // BEFORE the request leaves the process. Local LM Studio models skip
  // this — the data never leaves the user's machine.
  let history = [...messages];
  let redactionCount = 0;
  if (provider !== 'lmstudio') {
    try {
      const { redactMessages } = require('./redact');
      const result = redactMessages(history);
      history = result.messages;
      redactionCount = result.totalRedacted;
      if (redactionCount > 0) {
        // Surface the redaction to the renderer so the UI can show a
        // "X secrets were redacted before sending to <provider>" badge.
        // We yield a special non-text event that the IPC layer forwards.
        yield { type: 'redacted', count: redactionCount, provider };
      }
    } catch {
      // Redaction should never block a chat turn — if it fails, send the
      // original history. Better to risk a secret than to break the chat.
    }
  }

  const apiKeys = settings.get('apiKeys') || {};

  // Per-agent tool allowlist. When set (a Set of tool names), the LLM only
  // sees those tools and disallowed tool calls are rejected at execution.
  const allowedToolNames = toolContext.allowedToolNames instanceof Set && toolContext.allowedToolNames.size > 0
    ? toolContext.allowedToolNames
    : null;

  // Merge in tools from connected MCP servers. MCP tools are prefixed with
  // `mcp__` so they never collide with Meg's built-in tools. We fetch them
  // fresh on every streamChat call so newly-connected servers are picked up
  // without restarting the chat. The merge is best-effort — if mcpClient
  // throws (e.g. during tests where the module isn't loaded), we silently
  // fall back to built-in tools only.
  let mcpTools = [];
  try {
    const mcp = require('./mcpClient');
    mcpTools = mcp.getToolDefinitions();
  } catch {
    // mcpClient not available (e.g. isolated test) — proceed without it.
  }
  const allTools = [...TOOL_DEFINITIONS, ...mcpTools];
  const effectiveTools = allowedToolNames
    ? allTools.filter((t) => allowedToolNames.has(t.function.name))
    : allTools;

  // Auto-Summarize history if exceeding the threshold
  const totalTokens = estimateMessagesTokens(history);
  if (totalTokens > 8000 && history.length > 6) {
    const systemPromptIndex = history.findIndex(m => m.role === 'system');
    let systemPrompt = null;
    let mainHistory = [...history];
    if (systemPromptIndex !== -1) {
      systemPrompt = history[systemPromptIndex];
      mainHistory.splice(systemPromptIndex, 1);
    }
    const keepLastCount = 4;
    if (mainHistory.length > keepLastCount + 2) {
      const toSummarize = mainHistory.slice(0, -keepLastCount);
      const toKeep = mainHistory.slice(-keepLastCount);
      try {
        let client = null;
        if (provider !== 'anthropic') {
          client = getClientForModel(model, baseUrl);
        }
        const summary = await summarizeMessages(client, model, toSummarize, provider);
        const compressed = [];
        if (systemPrompt) compressed.push(systemPrompt);
        compressed.push({
          role: 'system',
          content: `SUMMARY OF EARLIER CONVERSATION (for context):\n${summary}`
        });
        compressed.push(...toKeep);
        history.length = 0;
        history.push(...compressed);
      } catch (e) {
        console.error('Context compression failed:', e);
      }
    }
  }

  for (let iteration = 0; iteration < 20; iteration++) {
    if (ctrl?.cancelled) break;

    const abortCtrl = new AbortController();
    // Poll for external cancellation (ctrl.cancelled) so that an in-flight
    // HTTP request is aborted immediately, not just between streamed chunks.
    // Without this, `chat:abort` / `cancelRun` could hang for several seconds
    // on cloud providers while the initial fetch completes.
    const cancelWatcher = ctrl
      ? setInterval(() => { if (ctrl.cancelled) abortCtrl.abort(); }, 50)
      : null;

    let stream;
    try {
      if (provider === 'anthropic') {
        const key = apiKeys.Anthropic || '';
        if (!key.trim()) throw new Error('Anthropic API key is missing. Please configure it in settings.');
        stream = getAnthropicStream(model, history, effectiveTools, key, abortCtrl.signal);
      } else {
        const client = getClientForModel(model, baseUrl);
        stream = await client.chat.completions.create({
          model,
          messages: history,
          stream: true,
          temperature: 0.3,
          tools: effectiveTools,
          tool_choice: 'auto',
          extra_body: buildExtraBody(provider, model, thinking),
        }, { signal: abortCtrl.signal });
      }
    } catch (error) {
      if (cancelWatcher) clearInterval(cancelWatcher);
      throw normalizeProviderError(error, provider);
    }

    let textBuffer = '';
    const toolCallBuffers = {};
    let finishReason = null;
    let streamBuffer = '';
    let isThinking = false;

    try {
      for await (const chunk of stream) {
        if (ctrl?.cancelled) { abortCtrl.abort(); break; }

        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        if (delta.reasoning_content) {
          yield { type: 'thinking', content: delta.reasoning_content };
          continue;
        }

        if (delta.content) {
          streamBuffer += delta.content;

          while (streamBuffer.length > 0) {
            if (isThinking) {
              const endIdx = streamBuffer.indexOf('</think>');
              if (endIdx !== -1) {
                const thought = streamBuffer.slice(0, endIdx);
                if (thought) yield { type: 'thinking', content: thought };
                isThinking = false;
                streamBuffer = streamBuffer.slice(endIdx + 8);
              } else {
                if (streamBuffer.length > 8) {
                  const toYield = streamBuffer.slice(0, -8);
                  if (toYield) yield { type: 'thinking', content: toYield };
                  streamBuffer = streamBuffer.slice(-8);
                }
                break;
              }
            } else {
              const startIdx = streamBuffer.indexOf('<think>');
              if (startIdx !== -1) {
                const text = streamBuffer.slice(0, startIdx);
                if (text) {
                  textBuffer += text;
                  yield { type: 'text', content: text };
                }
                isThinking = true;
                streamBuffer = streamBuffer.slice(startIdx + 7);
              } else {
                if (streamBuffer.length > 7) {
                  const toYield = streamBuffer.slice(0, -7);
                  textBuffer += toYield;
                  yield { type: 'text', content: toYield };
                  streamBuffer = streamBuffer.slice(-7);
                }
                break;
              }
            }
          }
        }

        if (delta.tool_calls) {
          if (streamBuffer) {
            if (isThinking) yield { type: 'thinking', content: streamBuffer };
            else {
              textBuffer += streamBuffer;
              yield { type: 'text', content: streamBuffer };
            }
            streamBuffer = '';
          }
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallBuffers[idx]) {
              toolCallBuffers[idx] = { id: tc.id || `tc-${idx}`, name: '', arguments: '' };
            }
            if (tc.id) toolCallBuffers[idx].id = tc.id;
            if (tc.function?.name) toolCallBuffers[idx].name += tc.function.name;
            if (tc.function?.arguments) toolCallBuffers[idx].arguments += tc.function.arguments;
          }
        }

        finishReason = chunk.choices[0]?.finish_reason || finishReason;
      }

      if (streamBuffer) {
        if (isThinking) yield { type: 'thinking', content: streamBuffer };
        else {
          textBuffer += streamBuffer;
          yield { type: 'text', content: streamBuffer };
        }
        streamBuffer = '';
      }
    } catch (e) {
      if (cancelWatcher) clearInterval(cancelWatcher);
      if (e.name === 'AbortError' || ctrl?.cancelled) break;
      throw normalizeProviderError(e, provider);
    }

    if (cancelWatcher) clearInterval(cancelWatcher);

    if (ctrl?.cancelled) break;

    const pendingCalls = Object.values(toolCallBuffers).filter(tc => {
      return tc.name && tc.arguments && tc.arguments.trim() !== '' && tc.arguments.trim() !== '{}';
    });

    if (pendingCalls.length === 0) {
      const lastMsg = history[history.length - 1];
      const isPostTool = lastMsg && lastMsg.role === 'tool';

      if (finishReason === 'stop' && !textBuffer && (iteration > 0 || isPostTool)) {
        history.push({
          role: 'system',
          content: 'You used tools but did not provide a response to the user. You MUST now provide a concise, direct report: what you did, what the results were, and any issues found. Do not use tools again — just respond.',
        });
        yield { type: 'resume', threadId };
        continue;
      }

      if (finishReason === 'stop' || textBuffer) {
        if (toolContext.autonomous && iteration < 10) {
          if (!/\[DONE\]/i.test(textBuffer)) {
            history.push({
              role: 'assistant',
              content: textBuffer || null,
            });
            history.push({
              role: 'user',
              content: 'Proceed with the next steps of the task.',
            });
            yield { type: 'resume', threadId };
            continue;
          }
        }
        return;
      }
    }

    history.push({
      role: 'assistant',
      content: textBuffer || null,
      tool_calls: pendingCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    for (const tc of pendingCalls) {
      if (ctrl?.cancelled) break;

      // Enforce the per-agent tool allowlist. Even though effectiveTools
      // filters what the LLM sees, a model can still hallucinate a tool name
      // that was hidden — reject it explicitly so the LLM gets clear feedback.
      if (allowedToolNames && !allowedToolNames.has(tc.name)) {
        const denyMsg = `Tool "${tc.name}" is not allowed for this agent. Only the following tools are available: ${[...allowedToolNames].join(', ')}.`;
        yield { type: 'tool_result', id: tc.id, name: tc.name, result: { error: denyMsg } };
        history.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({ error: denyMsg }),
        });
        continue;
      }

      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(tc.arguments);
      } catch (e) {
        yield { type: 'tool_result', id: tc.id, name: tc.name, result: { error: `Invalid JSON arguments: ${e.message}. Your tool call had malformed JSON — fix the syntax and try again.` } };
        history.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({ error: `Invalid JSON: ${e.message}. Fix the argument syntax.` }),
        });
        continue;
      }

      yield { type: 'tool_call', id: tc.id, name: tc.name, args: parsedArgs };

      try {
        const result = await executeTool(tc.name, parsedArgs, { threadId, ...toolContext });
        const summary = summarizeToolResult(result, parsedArgs);
        yield { type: 'tool_result', id: tc.id, name: tc.name, result: summary };

        history.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: typeof result === 'string' ? result : JSON.stringify(result || { status: 'ok' }),
        });
      } catch (err) {
        const errorMsg = `Tool error: ${err.message}`;
        yield { type: 'tool_result', id: tc.id, name: tc.name, result: { error: errorMsg } };
        history.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({ error: errorMsg }),
        });
      }
    }

    yield { type: 'resume', threadId };
  }
}

module.exports = {
  getModels,
  ping,
  streamChat,
  completeChat,
  getClient,
  getClientForModel,
  resolveProvider,
  isDeepSeekModel,
  TOOL_CATEGORY_MAP,
  DEFAULT_MODEL,
  DEFAULT_URL,
  DEEPSEEK_URL,
};
