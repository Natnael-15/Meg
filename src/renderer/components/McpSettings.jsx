import { useState, useEffect, useCallback } from 'react';
import { Icon } from './icons.jsx';

/**
 * MCP (Model Context Protocol) server management UI.
 *
 * Renders the list of configured MCP servers with live connection status,
 * add/remove/edit controls, and a "Test connection" button per server.
 * Servers are persisted via the mcp:saveServers IPC and connected/
 * disconnected via mcp:connect / mcp:disconnect.
 *
 * Tool discovery happens automatically on connect — the server's tools are
 * merged into Meg's tool list and become callable by the LLM without any
 * further configuration.
 */
export const McpSettings = () => {
  const [servers, setServers] = useState([]);
  const [editing, setEditing] = useState(null); // server config being edited or 'new'
  const [busy, setBusy] = useState(null); // serverId currently connecting/disconnecting

  const refresh = useCallback(async () => {
    const list = await window.electronAPI?.listMcpServers?.();
    if (Array.isArray(list)) setServers(list);
  }, []);

  useEffect(() => {
    refresh();
    // Live status updates from the main process.
    window.electronAPI?.onMcpChange?.(() => refresh());
  }, [refresh]);

  const save = async (config) => {
    const next = config.id
      ? servers.map((s) => (s.id === config.id ? { ...s, ...config } : s))
      : [...servers, { ...config, id: `mcp-${Date.now()}` }];
    setServers(next);
    await window.electronAPI?.saveMcpServers?.(next);
    setEditing(null);
    // Auto-connect on save if enabled.
    if (config.enabled !== false) {
      const saved = next.find((s) => s.id === (config.id || next[next.length - 1].id));
      if (saved) {
        setBusy(saved.id);
        await window.electronAPI?.connectMcpServer?.(saved);
        setBusy(null);
        refresh();
      }
    }
  };

  const remove = async (id) => {
    await window.electronAPI?.disconnectMcpServer?.(id);
    const next = servers.filter((s) => s.id !== id);
    setServers(next);
    await window.electronAPI?.saveMcpServers?.(next);
  };

  const toggle = async (server) => {
    if (server.status === 'connected') {
      setBusy(server.id);
      await window.electronAPI?.disconnectMcpServer?.(server.id);
      setBusy(null);
    } else {
      setBusy(server.id);
      await window.electronAPI?.connectMcpServer?.(server);
      setBusy(null);
    }
    refresh();
  };

  const statusColor = (status) => {
    if (status === 'connected') return 'var(--green, #1a9e5c)';
    if (status === 'error') return 'var(--red, #e05252)';
    return 'var(--text-3)';
  };

  return (
    <div>
      <h2 style={{fontSize:15,fontWeight:600,marginBottom:4,color:'var(--text)'}}>MCP Servers</h2>
      <p style={{fontSize:12.5,color:'var(--text-3)',marginBottom:20,lineHeight:1.6}}>
        Connect to external Model Context Protocol servers. Their tools are merged with Meg's built-in tools and become callable by the LLM. <a href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer" style={{color:'var(--accent)'}}>Learn more →</a>
      </p>

      {servers.length === 0 && !editing && (
        <div style={{padding:'24px 16px',textAlign:'center',border:'1.5px dashed var(--border)',borderRadius:10,color:'var(--text-3)',fontSize:12.5}}>
          No MCP servers configured yet.
        </div>
      )}

      {servers.map((server) => (
        <div key={server.id} style={{padding:'12px 14px',borderRadius:10,border:'1px solid var(--border)',background:'var(--bg-2)',marginBottom:10}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:statusColor(server.status),flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:500,color:'var(--text)'}}>{server.name}</div>
              <div style={{fontSize:10.5,color:'var(--text-3)',fontFamily:'"JetBrains Mono",monospace',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{server.command} {server.args?.join(' ') || ''}</div>
            </div>
            {server.status === 'connected' && typeof server.tools === 'number' && (
              <span style={{fontSize:10,padding:'2px 7px',borderRadius:99,background:'var(--green-bg, #edfaf4)',color:'var(--green, #1a9e5c)',border:'1px solid var(--green-border, #b8ecd6)',fontWeight:500}}>{server.tools} tools</span>
            )}
            <button
              onClick={() => toggle(server)}
              disabled={busy === server.id}
              title={server.status === 'connected' ? 'Disconnect' : 'Connect'}
              style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:`1px solid ${server.status === 'connected' ? 'var(--border)' : 'var(--accent-border)'}`,background:server.status === 'connected' ? 'transparent' : 'var(--accent-bg)',color:server.status === 'connected' ? 'var(--text-3)' : 'var(--accent)',cursor:busy === server.id ? 'wait' : 'pointer',opacity:busy === server.id ? 0.6 : 1}}
            >
              {busy === server.id ? '…' : server.status === 'connected' ? 'Disconnect' : 'Connect'}
            </button>
            <button onClick={() => setEditing(server)} title="Edit" style={{width:28,height:28,borderRadius:6,border:'none',background:'transparent',color:'var(--text-3)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <Icon name="settings" size={13}/>
            </button>
            <button onClick={() => remove(server.id)} title="Remove" aria-label={`Remove ${server.name}`} style={{width:28,height:28,borderRadius:6,border:'none',background:'transparent',color:'var(--text-3)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <Icon name="trash" size={13}/>
            </button>
          </div>
          {server.lastError && (
            <div style={{fontSize:11,color:'var(--red, #e05252)',padding:'4px 0 0',fontFamily:'"JetBrains Mono",monospace'}}>{server.lastError}</div>
          )}
        </div>
      ))}

      {editing && (
        <McpServerEditor
          initial={editing === 'new' ? null : editing}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      {!editing && (
        <button
          onClick={() => setEditing('new')}
          style={{marginTop:8,padding:'8px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-2)',color:'var(--text-2)',fontSize:12.5,fontWeight:500,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}
        >
          <Icon name="plus" size={13}/> Add MCP server
        </button>
      )}
    </div>
  );
};

const McpServerEditor = ({ initial, onSave, onCancel }) => {
  const [name, setName] = useState(initial?.name || '');
  const [command, setCommand] = useState(initial?.command || '');
  const [argsText, setArgsText] = useState(Array.isArray(initial?.args) ? initial.args.join(' ') : '');
  const [envText, setEnvText] = useState(
    initial?.env && typeof initial.env === 'object'
      ? Object.entries(initial.env).map(([k, v]) => `${k}=${v}`).join('\n')
      : ''
  );
  const [enabled, setEnabled] = useState(initial?.enabled !== false);

  const parseArgs = (text) => {
    // Simple shell-like splitting — handles quoted args.
    const matches = text.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    return matches.map((a) => a.replace(/^["']|["']$/g, ''));
  };

  const parseEnv = (text) => {
    const env = {};
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return env;
  };

  const handleSave = () => {
    if (!command.trim()) return;
    onSave({
      id: initial?.id,
      name: name.trim() || 'MCP Server',
      command: command.trim(),
      args: parseArgs(argsText),
      env: parseEnv(envText),
      enabled,
      status: 'disconnected',
      tools: 0,
      lastError: null,
    });
  };

  const inputStyle = {
    width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px',
    fontSize: 12, fontFamily: '"JetBrains Mono", monospace', outline: 'none',
    background: 'var(--bg-input)', color: 'var(--text)', transition: 'border-color 0.15s',
  };

  return (
    <div style={{padding:'14px',borderRadius:10,border:'1.5px solid var(--accent-border)',background:'var(--accent-bg)',marginBottom:10}}>
      <div style={{fontSize:12,fontWeight:600,color:'var(--accent)',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>
        {initial ? 'Edit server' : 'New MCP server'}
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        <div>
          <label style={{fontSize:11,color:'var(--text-3)',display:'block',marginBottom:4}}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="filesystem" style={inputStyle}/>
        </div>
        <div>
          <label style={{fontSize:11,color:'var(--text-3)',display:'block',marginBottom:4}}>Command <span style={{color:'var(--orange)'}}>*</span></label>
          <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx -y @modelcontextprotocol/server-filesystem /path/to/dir" style={inputStyle}/>
        </div>
        <div>
          <label style={{fontSize:11,color:'var(--text-3)',display:'block',marginBottom:4}}>Arguments (space-separated, quotes supported)</label>
          <input value={argsText} onChange={(e) => setArgsText(e.target.value)} placeholder="/Users/me/projects --allow-write" style={inputStyle}/>
        </div>
        <div>
          <label style={{fontSize:11,color:'var(--text-3)',display:'block',marginBottom:4}}>Environment variables (one KEY=value per line)</label>
          <textarea value={envText} onChange={(e) => setEnvText(e.target.value)} placeholder={'API_KEY=sk-...\nNODE_ENV=production'} rows={3} style={{...inputStyle,resize:'vertical',fontFamily:'"JetBrains Mono",monospace'}}/>
        </div>
        <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'var(--text-2)',cursor:'pointer'}}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{cursor:'pointer'}}/>
          Auto-connect on app startup
        </label>
      </div>
      <div style={{display:'flex',gap:8,marginTop:14,justifyContent:'flex-end'}}>
        <button onClick={onCancel} style={{padding:'7px 14px',borderRadius:6,border:'1px solid var(--border)',background:'transparent',color:'var(--text-3)',fontSize:12.5,cursor:'pointer'}}>Cancel</button>
        <button onClick={handleSave} disabled={!command.trim()} style={{padding:'7px 14px',borderRadius:6,border:'none',background:command.trim()?'var(--accent)':'var(--bg-active)',color:command.trim()?'#fff':'var(--text-3)',fontSize:12.5,fontWeight:500,cursor:command.trim()?'pointer':'not-allowed'}}>Save</button>
      </div>
    </div>
  );
};
