// Model Context Protocol (MCP) client.
//
// MCP is an open standard (modelcontextprotocol.io) for exposing tools,
// resources, and prompts to LLMs. This module lets Meg connect to external
// MCP servers — typically spawned as local child processes communicating
// via newline-delimited JSON-RPC 2.0 over stdio — and surface their tools
// alongside Meg's built-in tools.
//
// Lifecycle:
//   1. User configures servers in Settings (name + command + args + env).
//   2. On app startup (or when settings change), connectAll() spawns each
//      server, sends the MCP `initialize` handshake, and calls `tools/list`
//      to discover available tools.
//   3. getToolDefinitions() returns OpenAI-shaped tool entries that get
//      merged into the TOOL_DEFINITIONS list sent to the LLM.
//   4. When the LLM calls an MCP tool, executeTool() routes the call to the
//      owning server via `tools/call` and returns the text result.
//   5. On app shutdown or server removal, disconnect() kills the child.
//
// We deliberately implement a focused subset of the spec: stdio transport,
// the `initialize`, `tools/list`, and `tools/call` methods. Resource and
// prompt subscriptions are out of scope for now — tools are the highest-
// value surface and what most MCP servers expose.

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const settings = require('./settings');

const MCP_SERVERS_KEY = 'mcpServers';
const INIT_TIMEOUT_MS = 10000;
const CALL_TIMEOUT_MS = 30000;
const MAX_TOOLS_PER_SERVER = 100;

const events = new EventEmitter();

// Active connections: Map<serverId, { proc, stdin, stdout, pending, tools, initialized, name }>
const connections = new Map();
let nextRequestId = 1;

/**
 * Read the user's MCP server configs from settings.
 * Each config is { id, name, command, args, env, enabled }.
 * Returns a normalized array with `enabled` defaulting to true.
 */
function listServers() {
  const raw = settings.get(MCP_SERVERS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.map((s, i) => ({
    id: s.id || `mcp-${i + 1}`,
    name: s.name || `Server ${i + 1}`,
    command: s.command || '',
    args: Array.isArray(s.args) ? s.args : [],
    env: s.env && typeof s.env === 'object' ? s.env : {},
    enabled: s.enabled !== false,
    status: s.status || 'disconnected',
    tools: Array.isArray(s.tools) ? s.tools : [],
    lastError: s.lastError || null,
  }));
}

function saveServers(servers) {
  settings.set(MCP_SERVERS_KEY, servers);
}

/**
 * Spawn an MCP server process and complete the JSON-RPC initialize handshake.
 * Resolves with the connection object once `tools/list` has been fetched.
 */
function connect(config) {
  return new Promise((resolve, reject) => {
    if (!config.command) {
      reject(new Error('MCP server command is required'));
      return;
    }
    if (connections.has(config.id)) {
      reject(new Error(`MCP server ${config.id} is already connected`));
      return;
    }

    let proc;
    try {
      const env = { ...process.env, ...config.env };
      proc = spawn(config.command, config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        windowsHide: true,
      });
    } catch (e) {
      reject(new Error(`Failed to spawn MCP server: ${e.message}`));
      return;
    }

    const conn = {
      id: config.id,
      name: config.name,
      config,
      proc,
      pending: new Map(), // requestId → { resolve, reject, timeout }
      tools: [],
      initialized: false,
      buffer: '',
    };

    connections.set(config.id, conn);

    // Buffer incoming bytes; JSON-RPC messages are newline-delimited.
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
      conn.buffer += chunk;
      let nl;
      while ((nl = conn.buffer.indexOf('\n')) !== -1) {
        const line = conn.buffer.slice(0, nl).trim();
        conn.buffer = conn.buffer.slice(nl + 1);
        if (line) handleIncoming(conn, line);
      }
    });

    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk) => {
      // MCP servers log diagnostics to stderr. Surface them as events so the
      // diagnostics module can capture them, but don't fail the connection.
      events.emit('log', { serverId: conn.id, stream: 'stderr', text: chunk });
    });

    proc.on('error', (err) => {
      failPending(conn, new Error(`MCP server process error: ${err.message}`));
      connections.delete(conn.id);
      updateServerStatus(conn.id, 'error', err.message);
    });

    proc.on('exit', (code, signal) => {
      failPending(conn, new Error(`MCP server exited (code=${code}, signal=${signal})`));
      connections.delete(conn.id);
      updateServerStatus(conn.id, 'disconnected', null);
    });

    // Send initialize, then tools/list.
    sendRequest(conn, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'meg', version: '1.0.0-beta.10' },
    }, INIT_TIMEOUT_MS)
      .then((initResult) => {
        // Send initialized notification (no response expected).
        sendNotification(conn, 'notifications/initialized', {});
        conn.initialized = true;
        return sendRequest(conn, 'tools/list', {}, INIT_TIMEOUT_MS);
      })
      .then((toolsResult) => {
        const rawTools = Array.isArray(toolsResult?.tools) ? toolsResult.tools : [];
        conn.tools = rawTools.slice(0, MAX_TOOLS_PER_SERVER).map((t) => ({
          name: t.name,
          description: t.description || '',
          inputSchema: t.inputSchema || { type: 'object', properties: {} },
        }));
        updateServerStatus(conn.id, 'connected', null, conn.tools.length);
        resolve(conn);
      })
      .catch((err) => {
        disconnect(conn.id);
        reject(err);
      });
  });
}

/** Gracefully shut down a single server. */
function disconnect(serverId) {
  const conn = connections.get(serverId);
  if (!conn) return;
  try {
    // Best-effort: ask the server to shut down cleanly.
    sendNotification(conn, 'notifications/cancelled', {});
  } catch {}
  try { conn.proc.kill(); } catch {}
  failPending(conn, new Error('Disconnected'));
  connections.delete(serverId);
  updateServerStatus(serverId, 'disconnected', null);
}

/** Disconnect all servers. Called on app shutdown. */
function disconnectAll() {
  for (const id of [...connections.keys()]) disconnect(id);
}

/** Connect to all enabled, configured servers. Called on startup. */
async function connectAll() {
  const servers = listServers();
  for (const config of servers) {
    if (!config.enabled || connections.has(config.id)) continue;
    try {
      await connect(config);
    } catch (e) {
      // Status is already updated inside connect(); just log and continue.
      events.emit('log', { serverId: config.id, stream: 'connect-error', text: e.message });
    }
  }
}

// ─── JSON-RPC plumbing ────────────────────────────────────────────────────

function sendRequest(conn, method, params, timeoutMs) {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    const timeout = setTimeout(() => {
      conn.pending.delete(id);
      reject(new Error(`MCP request timed out: ${method} (${timeoutMs}ms)`));
    }, timeoutMs);
    conn.pending.set(id, { resolve, reject, timeout });
    try {
      conn.proc.stdin.write(payload);
    } catch (e) {
      clearTimeout(timeout);
      conn.pending.delete(id);
      reject(new Error(`Failed to write to MCP server stdin: ${e.message}`));
    }
  });
}

function sendNotification(conn, method, params) {
  const payload = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
  try { conn.proc.stdin.write(payload); } catch {}
}

function handleIncoming(conn, line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // Ignore malformed lines.
  }
  if (msg.id !== undefined && conn.pending.has(msg.id)) {
    const pending = conn.pending.get(msg.id);
    conn.pending.delete(msg.id);
    clearTimeout(pending.timeout);
    if (msg.error) {
      pending.reject(new Error(msg.error.message || 'MCP error'));
    } else {
      pending.resolve(msg.result);
    }
  }
  // We don't currently handle server-initiated requests/notifications.
}

function failPending(conn, err) {
  for (const { reject, timeout } of conn.pending.values()) {
    clearTimeout(timeout);
    reject(err);
  }
  conn.pending.clear();
}

// ─── Tool surface for Meg's LLM layer ─────────────────────────────────────

/**
 * Return OpenAI-shaped tool definitions for every tool exposed by every
 * connected MCP server. Tool names are prefixed with `mcp__<server>__` to
 * avoid collisions with Meg's built-in tools (e.g. `mcp__filesystem__read`).
 */
function getToolDefinitions() {
  const defs = [];
  for (const conn of connections.values()) {
    if (!conn.initialized) continue;
    for (const tool of conn.tools) {
      defs.push({
        type: 'function',
        function: {
          name: `mcp__${conn.id}__${tool.name}`,
          description: `[MCP:${conn.name}] ${tool.description}`,
          parameters: tool.inputSchema || { type: 'object', properties: {} },
        },
        _mcp: { serverId: conn.id, toolName: tool.name }, // tag for routing
      });
    }
  }
  return defs;
}

/**
 * Return true if `toolName` is an MCP-routed tool (prefixed with mcp__).
 */
function isMcpTool(toolName) {
  return typeof toolName === 'string' && toolName.startsWith('mcp__');
}

/**
 * Parse an MCP tool name into { serverId, toolName }.
 * Returns null if the format is wrong.
 */
function parseMcpToolName(fullName) {
  const parts = fullName.split('__');
  if (parts.length < 3 || parts[0] !== 'mcp') return null;
  return { serverId: parts[1], toolName: parts.slice(2).join('__') };
}

/**
 * Call an MCP tool on the owning server. Resolves with a plain object
 * { content: string } mirroring the shape Meg's built-in tools return.
 */
async function callTool(fullName, args = {}) {
  const parsed = parseMcpToolName(fullName);
  if (!parsed) throw new Error(`Invalid MCP tool name: ${fullName}`);
  const conn = connections.get(parsed.serverId);
  if (!conn) throw new Error(`MCP server not connected: ${parsed.serverId}`);
  if (!conn.initialized) throw new Error(`MCP server not initialized: ${parsed.serverId}`);

  const result = await sendRequest(conn, 'tools/call', {
    name: parsed.toolName,
    arguments: args,
  }, CALL_TIMEOUT_MS);

  // MCP tools return content as an array of text/image blocks. We only
  // surface text for now; concatenate all text blocks.
  const content = Array.isArray(result?.content)
    ? result.content
        .filter((c) => c.type === 'text' && typeof c.text === 'string')
        .map((c) => c.text)
        .join('\n')
    : '';
  return { ok: !result?.isError, content: content || '(no output)' };
}

// ─── Settings sync ────────────────────────────────────────────────────────

/**
 * Persist the current connection status back into the server config in
 * settings, so the Settings UI can show live status without polling IPC.
 */
function updateServerStatus(serverId, status, error, toolCount) {
  const servers = listServers();
  const idx = servers.findIndex((s) => s.id === serverId);
  if (idx === -1) return;
  servers[idx] = {
    ...servers[idx],
    status,
    lastError: error || null,
    tools: typeof toolCount === 'number' ? toolCount : servers[idx].tools,
  };
  saveServers(servers);
  events.emit('change', { serverId, status, server: servers[idx] });
}

module.exports = {
  events,
  listServers,
  saveServers,
  connect,
  disconnect,
  connectAll,
  disconnectAll,
  getToolDefinitions,
  isMcpTool,
  callTool,
  parseMcpToolName,
  MCP_SERVERS_KEY,
};
