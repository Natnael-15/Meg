const OpenAI = require('openai');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_URL   = 'http://127.0.0.1:1234';
const DEFAULT_MODEL = 'qwen/qwen3.5-9b';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command and return its output',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to run' },
          cwd: { type: 'string', description: 'Working directory (optional)' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file from disk',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Absolute or relative file path' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write or overwrite a file on disk',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and subdirectories in a directory',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for a string pattern in all files within a directory (recursive)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory to search in' },
          pattern: { type: 'string', description: 'The text or regex to search for' },
        },
        required: ['path', 'pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for real-time information using DuckDuckGo.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_telegram',
      description: 'Send a message to the user via Telegram.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The message text to send' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spawn_subagent',
      description: 'Delegate a specific, isolated sub-task to a specialized sub-agent. The sub-agent will work in the background and report back its findings.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Descriptive name for the sub-agent (e.g., "Refactor-Helper")' },
          instruction: { type: 'string', description: 'The specific goal and context for the sub-agent' },
        },
        required: ['name', 'instruction'],
      },
    },
  },
];

function executeTool(name, args, threadId) {
  return new Promise(async resolve => {
    if (name === 'run_command') {
      if (!args.command) return resolve({ error: 'No command provided' });
      exec(args.command, { cwd: args.cwd || process.cwd(), timeout: 30000, shell: true }, (err, stdout, stderr) => {
        resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: err ? (err.code ?? 1) : 0 });
      });
    } else if (name === 'read_file') {
      if (!args.path) return resolve({ error: 'No path provided' });
      try {
        resolve({ content: fs.readFileSync(args.path, 'utf8') });
      } catch (e) {
        resolve({ error: e.message });
      }
    } else if (name === 'write_file') {
      if (!args.path) return resolve({ error: 'No path provided' });
      try {
        const fullPath = path.resolve(args.path);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, args.content || '', 'utf8');
        resolve({ ok: true });
      } catch (e) {
        resolve({ error: e.message });
      }
    } else if (name === 'list_directory') {
      try {
        const entries = fs.readdirSync(args.path, { withFileTypes: true });
        resolve({
          entries: entries.map(e => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' })),
        });
      } catch (e) {
        resolve({ error: e.message });
      }
    } else if (name === 'search_files') {
      // Use findstr on Windows for recursive search
      const cmd = `findstr /s /i /n /c:"${args.pattern}" *`;
      exec(cmd, { cwd: args.path, timeout: 30000 }, (err, stdout, stderr) => {
        // findstr returns exit code 1 if no matches found, which is fine
        resolve({ results: stdout || 'No matches found.' });
      });
    } else if (name === 'web_search') {
      try {
        const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json`);
        const json = await res.json();
        const results = json.AbstractText || (json.RelatedTopics?.slice(0, 3).map(t => t.Text).join('\n')) || 'No specific results found. Try a different query.';
        resolve({ results });
      } catch (e) {
        resolve({ error: e.message });
      }
    } else if (name === 'send_telegram') {
      try {
        const s = require('./settings');
        const token = s.get('telegramToken');
        const chatId = s.get('telegramChatId');
        if (!token || !chatId) {
          resolve({ error: 'Telegram not connected. Ask user to connect it in Settings.' });
          return;
        }
        const { getBot } = require('./telegram');
        const bot = getBot(token);
        await bot.sendMessage(chatId, args.text);
        resolve({ ok: true, result: 'Message sent successfully.' });
      } catch (e) {
        resolve({ error: e.message });
      }
    } else if (name === 'spawn_subagent') {
      // This tool simulates a background task that reports back.
      // In a full implementation, this would trigger a new streamChat call.
      // For now, we signal the start and then provide a simulated result after a delay
      // to demonstrate the orchestration UI.
      resolve({ 
        status: 'spawned', 
        agentName: args.name, 
        message: `Sub-agent "${args.name}" is now working on: ${args.instruction}` 
      });
    } else {
      resolve({ error: `Unknown tool: ${name}` });
    }
  });
}

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

async function* streamChat(messages, threadId, model = DEFAULT_MODEL, thinking = true, baseUrl = DEFAULT_URL) {
  const client = getClient(baseUrl);
  const history = [...messages];

  for (let iteration = 0; iteration < 10; iteration++) {
    const stream = await client.chat.completions.create({
      model,
      messages: history,
      stream: true,
      temperature: 0.7,
      tools: TOOLS,
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

    const pendingCalls = Object.values(toolCallBuffers);

    if (pendingCalls.length === 0) {
      // Normal text response, nothing more to do
      return;
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
      try { parsedArgs = JSON.parse(tc.arguments || '{}'); } catch {}

      yield { type: 'tool_call', id: tc.id, name: tc.name, args: parsedArgs };

      const result = await executeTool(tc.name, parsedArgs, threadId);

      yield { type: 'tool_result', id: tc.id, name: tc.name, result };

      history.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }

    // Signal frontend to prepare for next model response
    yield { type: 'resume' };
  }
}

module.exports = { getModels, ping, streamChat, DEFAULT_MODEL, DEFAULT_URL };
