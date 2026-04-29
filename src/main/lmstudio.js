const OpenAI = require('openai');
const { TOOL_DEFINITIONS, executeTool, summarizeToolResult } = require('./tools');

const DEFAULT_URL   = 'http://127.0.0.1:1234';
const DEFAULT_MODEL = 'qwen/qwen3.5-9b';

function getClient(baseUrl = DEFAULT_URL) {
  return new OpenAI({ baseURL: `${baseUrl}/v1`, apiKey: 'lm-studio' });
}

async function getModels(baseUrl = DEFAULT_URL) {
  const client = getClient(baseUrl);
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
  const client = getClient(baseUrl);
  const history = [...messages];

  for (let iteration = 0; iteration < 10; iteration++) {
    const stream = await client.chat.completions.create({
      model,
      messages: history,
      stream: true,
      temperature: 0.7,
      tools: TOOL_DEFINITIONS,
      tool_choice: 'auto',
      extra_body: { enable_thinking: thinking },
    });

    let textBuffer = '';
    const toolCallBuffers = {};
    let finishReason = null;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        textBuffer += delta.content;
        yield { type: 'text', content: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCallBuffers[idx]) {
            toolCallBuffers[idx] = { id: tc.id || `tc-${idx}`, name: '', arguments: '' };
          }
          if (tc.id)                  toolCallBuffers[idx].id        = tc.id;
          if (tc.function?.name)      toolCallBuffers[idx].name      += tc.function.name;
          if (tc.function?.arguments) toolCallBuffers[idx].arguments += tc.function.arguments;
        }
      }

      finishReason = chunk.choices[0]?.finish_reason || finishReason;
    }

    const pendingCalls = Object.values(toolCallBuffers).filter(tc => {
      return tc.name && tc.arguments && tc.arguments.trim() !== '' && tc.arguments.trim() !== '{}';
    });

    if (pendingCalls.length === 0) {
      if (finishReason === 'stop' || textBuffer) return;
      // If we got here with no calls and no text, break to avoid infinite loop
      break; 
    }

    // Build assistant message with tool calls for history
    history.push({
      role: 'assistant',
      content: textBuffer || null,
      tool_calls: pendingCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    // Execute each tool call sequentially
    for (const tc of pendingCalls) {
      let parsedArgs = {};
      try { 
        parsedArgs = JSON.parse(tc.arguments); 
      } catch (e) {
        yield { type: 'tool_result', id: tc.id, name: tc.name, result: { error: 'Invalid JSON arguments' } };
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
        yield { type: 'tool_result', id: tc.id, name: tc.name, result: { error: err.message } };
      }
    }

    // After tools are executed, we MUST continue the loop to let the model see the results
    // and decide what to do next. We don't yield 'resume' if there's more to do.
    continue;
  }
}

module.exports = { getModels, ping, streamChat, DEFAULT_MODEL, DEFAULT_URL };
