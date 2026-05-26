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

function getDeepSeekClient() {
  const apiKeys = settings.get('apiKeys') || {};
  const apiKey = apiKeys.DeepSeek || '';
  if (!apiKey.trim()) {
    throw new Error('DeepSeek API key is missing or invalid.');
  }
  return new OpenAI({ baseURL: DEEPSEEK_URL, apiKey });
}

function resolveProvider(model = DEFAULT_MODEL) {
  return isDeepSeekModel(model) ? 'deepseek' : 'lmstudio';
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
  return provider === 'deepseek' ? getDeepSeekClient() : getLmStudioClient(baseUrl);
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

async function* streamChat(messages, threadId, model = DEFAULT_MODEL, thinking = true, baseUrl = DEFAULT_URL, toolContext = {}) {
  const provider = resolveProvider(model);
  const client = getClientForModel(model, baseUrl);
  const history = [...messages];
  const { ctrl } = toolContext;

  for (let iteration = 0; iteration < 20; iteration++) {
    if (ctrl?.cancelled) break;

    const abortCtrl = new AbortController();
    let stream;
    try {
      stream = await client.chat.completions.create({
        model,
        messages: history,
        stream: true,
      temperature: 0.3,
      tools: TOOL_DEFINITIONS,
      tool_choice: 'auto',
      extra_body: buildExtraBody(provider, model, thinking),
    }, { signal: abortCtrl.signal });
    } catch (error) {
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
      if (e.name === 'AbortError' || ctrl?.cancelled) break;
      throw normalizeProviderError(e, provider);
    }

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

      if (finishReason === 'stop' || textBuffer) return;
      break;
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
  getClient,
  getClientForModel,
  resolveProvider,
  isDeepSeekModel,
  DEFAULT_MODEL,
  DEFAULT_URL,
  DEEPSEEK_URL,
};
