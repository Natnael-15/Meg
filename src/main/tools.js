const { app } = require('electron');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const workspace = require('./workspace');

const MAX_TOOL_OUTPUT = 12000;
const DEFAULT_TIMEOUT_MS = 30000;

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a PowerShell command on the user\'s Windows machine. Returns stdout, stderr, and exit code. IMPORTANT: Use PowerShell syntax only — # for comments, Set-Content/Out-File for writing, Get-Content for reading, Test-Path for existence checks. NEVER use Unix commands (ls, cat, touch, mkdir -p, grep). Use this to run scripts, install packages, compile code, run tests, or check system state. Always check stderr and exitCode in the result.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The PowerShell command to execute. Use proper PowerShell syntax.' },
          cwd: { type: 'string', description: 'Working directory for the command. Defaults to the active workspace path.' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the full contents of a text file (UTF-8). Use this to inspect file content, verify what was written, check configuration, or understand existing code. Returns the file content as a string. Fails if the file does not exist — use list_directory first if unsure whether the file exists.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path, absolute or relative to the active workspace.' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file with the given content. The parent directory is created automatically if needed. CRITICAL: After calling write_file, you MUST call list_directory on the parent folder to verify the file actually exists. Never tell the user "I created X" without confirming via list_directory. The content parameter should contain the complete file content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path, absolute or relative to the active workspace.' },
          content: { type: 'string', description: 'The full file content to write. Must be a complete, valid file — not a snippet or partial content.' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rename_path',
      description: 'Rename or move a file or directory. Both paths must be within allowed workspace boundaries.',
      parameters: {
        type: 'object',
        properties: {
          oldPath: { type: 'string', description: 'Current path of the file or directory.' },
          newPath: { type: 'string', description: 'New path (can be in a different directory to move it).' },
        },
        required: ['oldPath', 'newPath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_path',
      description: 'Permanently delete a file or directory (directories are deleted recursively). Use with caution — this cannot be undone.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file or directory to delete.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'make_directory',
      description: 'Create a directory (and any missing parent directories). Use this before write_file if you need to create a project structure. Safe to call on directories that already exist.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path of the directory to create.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List all files and subdirectories in a directory. Returns each entry with name, type (file/dir), and extension. Use this to: (1) verify files exist after write_file, (2) explore project structure, (3) check what files are in a folder before operating on them. This is your primary tool for confirming the filesystem state.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Path to the directory to list.' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for a text pattern (string or regex) across all files in a directory tree. Skips node_modules, .git, dist, build, and other generated folders. Returns matching lines with file paths and line numbers. Use this to find where functions are defined, locate configuration values, or find all usages of a variable.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Root directory to search in.' },
          pattern: { type: 'string', description: 'Text or regex pattern to search for (case-insensitive).' },
        },
        required: ['path', 'pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Get instant answers from the web via DuckDuckGo. Best for factual lookups, API documentation, syntax references, and error message solutions. Returns short text answers, not full web pages. Use specific, targeted queries for best results.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query — be specific for better results.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_telegram',
      description: 'Send a notification message to the user via their connected Telegram account. Use for important updates or when the user asks to be notified.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The message text to send.' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spawn_subagent',
      description: 'Create a background task for parallel work. The sub-agent runs independently. Only use this for genuinely parallel tasks — do NOT use it for sequential steps. For normal step-by-step work, just use tools directly.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short name describing the task.' },
          instruction: { type: 'string', description: 'Detailed instructions for what the sub-agent should accomplish.' },
        },
        required: ['name', 'instruction'],
      },
    },
  },
];

const GENERATED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  'build',
  '.next',
  '.vite',
  'coverage',
]);

function defaultCwd(cwd, context = {}) {
  return context.workspacePath || workspace.getRootFallback(cwd);
}

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+(-[^\s]*r[^\s]*f|-rf|-fr)\b/i,
  /\bRemove-Item\b[\s\S]*-Recurse\b/i,
  /\brmdir\s+\/s\b/i,
  /\bdel\s+\/[fsq]/i,
  /\bformat\b/i,
  /\bdiskpart\b/i,
  /\bshutdown\b/i,
  /\brestart-computer\b/i,
  /\breg\s+delete\b/i,
  /\bSet-ExecutionPolicy\b/i,
  /\b(base64|FromBase64String|EncodedCommand)\b/i,
  /\b(iwr|irm|Invoke-WebRequest|curl|wget)\b[\s\S]*\|\s*(iex|Invoke-Expression)/i,
];

function truncate(value, max = MAX_TOOL_OUTPUT) {
  if (typeof value !== 'string') return value;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n\n[output truncated: ${value.length - max} more characters]`;
}

function getAuditPath() {
  const userData = app?.getPath ? app.getPath('userData') : process.cwd();
  return path.join(userData, 'meg-tool-audit.jsonl');
}

function auditTool(event) {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
    fs.appendFileSync(getAuditPath(), line, 'utf8');
  } catch {
    // Audit logging should never break a user-facing tool call.
  }
}

function resolveExistingPath(inputPath, cwd = process.cwd()) {
  if (!inputPath || typeof inputPath !== 'string') throw new Error('Path is required');
  return path.resolve(cwd || process.cwd(), inputPath);
}

function assertPathExists(fullPath) {
  if (!fs.existsSync(fullPath)) throw new Error(`Path does not exist: ${fullPath}`);
}

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function getAllowedWriteRoots(context = {}) {
  const active = workspace.getActive();
  const roots = context.workspacePath ? [context.workspacePath] : active?.path ? [active.path] : [process.cwd()];
  try {
    const settings = require('./settings');
    const configured = settings.get('toolWriteRoots');
    if (Array.isArray(configured)) roots.push(...configured);
  } catch {
    // Settings may not be available during isolated tests.
  }
  return roots.map(root => path.resolve(root)).filter(Boolean);
}

function assertWriteAllowed(fullPath, context = {}) {
  const allowed = getAllowedWriteRoots(context);
  if (!allowed.some(root => isInside(root, fullPath))) {
    throw new Error(`Write blocked outside allowed roots. Allowed roots: ${allowed.join('; ')}`);
  }
}

function validateCommand(command) {
  if (!command || typeof command !== 'string') throw new Error('No command provided');
  if (command.length > 4000) throw new Error('Command is too long');
  const matched = DANGEROUS_COMMAND_PATTERNS.find(pattern => pattern.test(command));
  if (matched) throw new Error('Command blocked by safety policy');
}

function getToolPermissions() {
  try {
    const settings = require('./settings');
    return settings.get('toolPermissions') || {};
  } catch {
    return {};
  }
}

function assertToolPermission(name, context = {}) {
  if (context.bypassPermissions) return;
  if (context.approvalId) return;
  const p = getToolPermissions();
  const checks = {
    run_command: ['runCommands', 'requireApprovalForCommands', 'Command execution is disabled in Settings > Tool Permissions.', 'Command execution requires approval.'],
    write_file: ['writeFiles', 'requireApprovalForWrites', 'File writes are disabled in Settings > Tool Permissions.', 'File write requires approval.'],
    rename_path: ['writeFiles', 'requireApprovalForWrites', 'File writes are disabled in Settings > Tool Permissions.', 'File rename requires approval.'],
    delete_path: ['writeFiles', 'requireApprovalForWrites', 'File writes are disabled in Settings > Tool Permissions.', 'File delete requires approval.'],
    make_directory: ['writeFiles', 'requireApprovalForWrites', 'File writes are disabled in Settings > Tool Permissions.', 'Directory creation requires approval.'],
    read_file: ['readFiles', null, 'File reads are disabled in Settings > Tool Permissions.'],
    list_directory: ['readFiles', null, 'Directory listing is disabled in Settings > Tool Permissions.'],
    search_files: ['readFiles', null, 'File search is disabled in Settings > Tool Permissions.'],
    web_search: ['webSearch', null, 'Instant web answers are disabled in Settings > Tool Permissions.'],
    send_telegram: ['telegram', null, 'Telegram sending is disabled in Settings > Tool Permissions.'],
    spawn_subagent: ['spawnAgents', null, 'Agent spawning is disabled in Settings > Tool Permissions.'],
  };
  const check = checks[name];
  if (!check) return;
  const [allowKey, approvalKey, deniedMessage, approvalMessage] = check;
  if (p[allowKey] === false) throw new Error(deniedMessage);
  if (context.skipApproval) return;
  if (approvalKey && p[approvalKey] !== false) {
    const approvalQueue = require('./approvalQueue');
    const approval = approvalQueue.create({ tool: name, args: context.currentArgs || {}, context, reason: approvalMessage });
    const err = new Error(`${approvalMessage} Approval ID: ${approval.id}`);
    err.approvalRequired = true;
    err.approval = approval;
    throw err;
  }
}

function execCommand(command, cwd) {
  return new Promise(resolve => {
    exec(command, {
      cwd: cwd || process.cwd(),
      timeout: DEFAULT_TIMEOUT_MS,
      shell: true,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 4,
    }, (err, stdout, stderr) => {
      resolve({
        stdout: truncate(stdout || ''),
        stderr: truncate(stderr || ''),
        exitCode: err ? (err.code ?? 1) : 0,
      });
    });
  });
}

function listDirectory(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries
    .map(e => ({
      name: e.name,
      type: e.isDirectory() ? 'dir' : 'file',
      isDir: e.isDirectory(),
      path: path.join(dirPath, e.name),
      ext: e.isDirectory() ? null : path.extname(e.name).slice(1),
    }))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
}

function searchFiles(rootPath, pattern) {
  if (!pattern || typeof pattern !== 'string') throw new Error('Pattern is required');
  const regex = new RegExp(pattern, 'i');
  const matches = [];

  function visit(dir) {
    if (matches.length >= 200) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!workspace.isGeneratedDir(entry.name)) visit(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (fs.statSync(fullPath).size > 1024 * 1024) continue;
      let content;
      try {
        content = fs.readFileSync(fullPath, 'utf8');
      } catch {
        continue;
      }
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matches.push(`${fullPath}:${i + 1}: ${lines[i]}`);
          if (matches.length >= 200) return;
        }
      }
    }
  }

  visit(rootPath);
  return matches.length ? matches.join('\n') : 'No matches found.';
}

async function executeTool(name, args = {}, context = {}) {
  const threadId = typeof context === 'string' ? context : context.threadId;
  const startedAt = Date.now();
  let result;

  try {
    context.currentArgs = args;
    assertToolPermission(name, context);
    if (name === 'run_command') {
      validateCommand(args.command);
      const cwd = args.cwd ? resolveExistingPath(args.cwd, defaultCwd(undefined, context)) : defaultCwd(undefined, context);
      assertPathExists(cwd);
      result = await execCommand(args.command, cwd);
    } else if (name === 'read_file') {
      const fullPath = resolveExistingPath(args.path, defaultCwd(args.cwd, context));
      assertPathExists(fullPath);
      result = { content: truncate(fs.readFileSync(fullPath, 'utf8')) };
    } else if (name === 'write_file') {
      const fullPath = resolveExistingPath(args.path, defaultCwd(args.cwd, context));
      assertWriteAllowed(fullPath, context);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, args.content || '', 'utf8');
      result = { ok: true, path: fullPath };
    } else if (name === 'rename_path') {
      const oldPath = resolveExistingPath(args.oldPath, defaultCwd(args.cwd, context));
      const newPath = resolveExistingPath(args.newPath, defaultCwd(args.cwd, context));
      assertPathExists(oldPath);
      assertWriteAllowed(oldPath, context);
      assertWriteAllowed(newPath, context);
      fs.mkdirSync(path.dirname(newPath), { recursive: true });
      fs.renameSync(oldPath, newPath);
      result = { ok: true, oldPath, newPath };
    } else if (name === 'delete_path') {
      const fullPath = resolveExistingPath(args.path, defaultCwd(args.cwd, context));
      assertPathExists(fullPath);
      assertWriteAllowed(fullPath, context);
      if (fs.lstatSync(fullPath).isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
      result = { ok: true, path: fullPath };
    } else if (name === 'make_directory') {
      const fullPath = resolveExistingPath(args.path, defaultCwd(args.cwd, context));
      assertWriteAllowed(fullPath, context);
      fs.mkdirSync(fullPath, { recursive: true });
      result = { ok: true, path: fullPath };
    } else if (name === 'list_directory') {
      const fullPath = resolveExistingPath(args.path, defaultCwd(args.cwd, context));
      assertPathExists(fullPath);
      result = { entries: listDirectory(fullPath) };
    } else if (name === 'search_files') {
      const fullPath = resolveExistingPath(args.path, defaultCwd(args.cwd, context));
      assertPathExists(fullPath);
      result = { results: truncate(searchFiles(fullPath, args.pattern)) };
    } else if (name === 'web_search') {
      if (!args.query) throw new Error('Query is required');
      const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json`);
      const json = await res.json();
      result = {
        mode: 'instant_answer',
        source: 'duckduckgo',
        results: json.AbstractText ||
          (json.RelatedTopics?.slice(0, 3).map(t => t.Text).filter(Boolean).join('\n')) ||
          'No specific results found. Try a different query.',
      };
    } else if (name === 'send_telegram') {
      if (!args.text) throw new Error('Text is required');
      const settings = require('./settings');
      const token = settings.get('telegramToken');
      const chatId = settings.get('telegramChatId');
      if (!token || !chatId) throw new Error('Telegram not connected. Connect it in Settings first.');
      const { getBot } = require('./telegram');
      const bot = getBot(token);
      await bot.sendMessage(chatId, args.text);
      result = { ok: true, result: 'Message sent successfully.' };
    } else if (name === 'spawn_subagent') {
      const agentRunner = require('./agentRunner');
      const run = agentRunner.createRun({
        name: args.name,
        instruction: args.instruction,
        parentThreadId: threadId,
        parentRunId: context.agentRunId || null,
      });
      if (args.wait) {
        const completedRun = await agentRunner.waitForRun(run.id);
        result = {
          ok: true,
          status: completedRun.status,
          runId: completedRun.id,
          agentName: completedRun.name,
          message: completedRun.status === 'done' ? 'Sub-agent completed successfully.' : `Sub-agent ended with status: ${completedRun.status}`,
          output: completedRun.output?.text || completedRun.error || 'No output.',
        };
      } else {
        result = {
          ok: true,
          status: 'spawned',
          runId: run.id,
          agentName: run.name,
          message: `Sub-agent "${run.name}" is queued for: ${run.instruction}`,
        };
      }
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
  } catch (e) {
    result = e.approvalRequired
      ? { error: e.message, approvalRequired: true, approval: e.approval }
      : { error: e.message };
  }

  auditTool({
    threadId,
    tool: name,
    ok: !result.error,
    durationMs: Date.now() - startedAt,
    args: sanitizeArgs(args),
    error: result.error,
  });

  return result;
}

function sanitizeArgs(args = {}) {
  const clean = { ...args };
  if (typeof clean.content === 'string') clean.content = `[${clean.content.length} chars]`;
  if (typeof clean.text === 'string' && clean.text.length > 240) {
    clean.text = `${clean.text.slice(0, 240)}...`;
  }
  return clean;
}

function summarizeToolResult(result, args = {}) {
  if (result?.status === 'spawned') return result;
  if (result?.error) return result;
  if (result?.entries) return { ok: true, entries: result.entries.map(e => `${e.type === 'dir' ? '[DIR]' : '[FILE]'} ${e.name}`).join(', ') };
  if (result?.content != null) return { ok: true, content: result.content };
  if (result?.results != null) return { ok: true, results: result.results };
  if (result?.stdout != null) return { ok: true, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
  if (result?.ok) return { ok: true, path: result.path || args.path };
  return result;
}

module.exports = {
  TOOL_DEFINITIONS,
  executeTool,
  summarizeToolResult,
  validateCommand,
};
