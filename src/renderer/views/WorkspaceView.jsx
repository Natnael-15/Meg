import { useEffect, useState } from 'react';
import { Icon } from '../components/icons.jsx';
import { formatRelativeTime } from '../lib/time.js';

const EXT_C = {html:'#e07a30',css:'#e07a30',ts:'#5a84ff',js:'#f5c542',md:'#10a37f',jsx:'#5a84ff',tsx:'#5a84ff'};

const getEntryExt = (name = '') => {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext && ext !== name.toLowerCase() ? ext : '';
};

const buildWorkspaceWorkflow = (workspace, workflowId) => {
  const workspaceTarget = workspace?.path || workspace?.name || 'workspace';
  if (workflowId === 'code-review') {
    return {
      name: `workspace-review-${workspace?.name || 'project'}`,
      source: 'workspace-quick-action',
      sourceId: `workspace:${workspace?.id || 'unknown'}:code-review`,
      steps: [
        { type: 'read_files', label: 'Inspect workspace layout and key source files', target: workspaceTarget },
        { type: 'run_command', label: 'Check project status and available validation commands', target: workspaceTarget },
        { type: 'write_output', label: 'Summarize concrete bugs, risks, and missing tests', target: 'workspace review report' },
      ],
    };
  }
  if (workflowId === 'docs-draft') {
    return {
      name: `workspace-docs-${workspace?.name || 'project'}`,
      source: 'workspace-quick-action',
      sourceId: `workspace:${workspace?.id || 'unknown'}:docs-draft`,
      steps: [
        { type: 'read_files', label: 'Inspect package metadata, entrypoints, and developer-facing files', target: workspaceTarget },
        { type: 'read_files', label: 'Identify setup, usage, and architecture details worth documenting', target: workspaceTarget },
        { type: 'write_output', label: 'Draft concise workspace documentation with setup and usage guidance', target: 'workspace docs draft' },
      ],
    };
  }
  if (workflowId === 'progress-report') {
    return {
      name: `workspace-progress-${workspace?.name || 'project'}`,
      source: 'workspace-quick-action',
      sourceId: `workspace:${workspace?.id || 'unknown'}:progress-report`,
      steps: [
        { type: 'read_files', label: 'Inspect recent workspace state, linked chats, and current files', target: workspaceTarget },
        { type: 'run_command', label: 'Check repository status for outstanding work signals', target: workspaceTarget },
        { type: 'send_update', label: 'Produce a short progress report with current status and next actions', target: 'workspace status report' },
      ],
    };
  }
  return null;
};

const buildWorkspaceOverviewWorkflow = (workspace) => ({
  name: `workspace-next-step-${workspace?.name || 'project'}`,
  source: 'workspace-header-action',
  sourceId: `workspace:${workspace?.id || 'unknown'}:next-step`,
  instruction: `Assess the ${workspace?.name || 'current'} workspace at ${workspace?.path || 'the current path'}. Consider branch ${workspace?.branch || 'unknown'} and recommend the most important next work with concise reasoning.`,
  steps: [
    { type: 'read_files', label: 'Inspect the workspace structure and recent files', target: workspace?.path || workspace?.name || 'workspace' },
    { type: 'run_command', label: 'Check repository status and current branch state', target: workspace?.path || workspace?.name || 'workspace' },
    { type: 'send_update', label: 'Recommend the next concrete work items for this workspace', target: 'workspace next-step summary' },
  ],
});

export const WorkspaceView = ({events, threads, agentRuns, workspaces, setWorkspaces, onActiveWorkspace}) => {
  const [activeWs, setActiveWs] = useState(workspaces[0]?.id || null);
  const [tab, setTab] = useState('overview');
  const [fileQuery, setFileQuery] = useState('');
  const [fileSearchResults, setFileSearchResults] = useState([]);
  const [fileSearchMeta, setFileSearchMeta] = useState({ total: 0, truncated: false, active: false });
  const ws = workspaces.find(w=>w.id===activeWs) || workspaces[0] || null;

  useEffect(() => {
    if (!workspaces.length) {
      setActiveWs(null);
      return;
    }
    if (!workspaces.some(w => w.id === activeWs)) {
      setActiveWs(workspaces[0].id);
    }
  }, [workspaces, activeWs]);

  useEffect(() => {
    if (!window.electronAPI?.refreshWorkspaceMeta || !ws?.id) return;
    let cancelled = false;
    const syncMeta = async () => {
      const result = await window.electronAPI.refreshWorkspaceMeta(ws.id);
      const nextWorkspace = result?.workspace;
      if (cancelled || !nextWorkspace) return;
      setWorkspaces((current) => {
        let changed = false;
        const updated = current.map((item) => {
          if (item.id !== nextWorkspace.id) return item;
          const nextItem = {
            ...item,
            ...nextWorkspace,
            branch: item.branch,
            dirty: item.dirty,
            ahead: item.ahead,
            color: item.color,
            desc: item.desc || nextWorkspace.path,
          };
          const same =
            item.files === nextItem.files &&
            item.lang === nextItem.lang &&
            item.inventoryUpdatedAt === nextItem.inventoryUpdatedAt &&
            item.inventoryTruncated === nextItem.inventoryTruncated &&
            JSON.stringify(item.inventory || []) === JSON.stringify(nextItem.inventory || []);
          if (same) return item;
          changed = true;
          return nextItem;
        });
        return changed ? updated : current;
      });
    };
    syncMeta();
    const poll = setInterval(syncMeta, 15000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [ws?.id, setWorkspaces]);

  useEffect(() => {
    if (tab !== 'files') return;
    if (!ws?.id) {
      setFileSearchResults([]);
      setFileSearchMeta({ total: 0, truncated: false, active: false });
      return;
    }
    const query = fileQuery.trim();
    if (!query) {
      setFileSearchResults([]);
      setFileSearchMeta({ total: 0, truncated: Boolean(ws.inventoryTruncated), active: false });
      return;
    }
    if (!window.electronAPI?.searchWorkspaceFiles) return;
    let cancelled = false;
    const runSearch = async () => {
      const result = await window.electronAPI.searchWorkspaceFiles(ws.id, query, 100);
      if (cancelled) return;
      const matches = Array.isArray(result?.results) ? result.results : [];
      setFileSearchResults(matches);
      setFileSearchMeta({
        total: typeof result?.total === 'number' ? result.total : matches.length,
        truncated: Boolean(result?.truncated),
        active: true,
      });
    };
    runSearch();
    return () => {
      cancelled = true;
    };
  }, [tab, ws?.id, ws?.inventoryTruncated, fileQuery]);

  const activateWorkspace = async (w) => {
    setActiveWs(w.id);
    onActiveWorkspace?.(w);
    if(window.electronAPI && w?.path && !w.path.startsWith('~')) {
      await window.electronAPI.setActiveWorkspace({id:w.id,name:w.name,path:w.path});
    }
  };

  const addWorkspace = async () => {
    const r = await window.electronAPI?.openFolder();
    if(r?.filePaths?.[0]) {
      const p = r.filePaths[0];
      const name = p.split(/[\\/]/).pop();
      const id = 'ws-'+Date.now();
      const timestamp = new Date().toISOString();
      const next = {id,name,path:p,branch:'main',dirty:0,ahead:0,lang:'',color:'var(--accent)',lastActive:timestamp,desc:p,agents:0,threads:0,files:0,createdAt:timestamp,updatedAt:timestamp};
      const saved = await window.electronAPI?.upsertWorkspace({id,name,path:p});
      const finalWs = saved?.workspace ? {
        ...next,
        ...saved.workspace,
        color: next.color,
        lastActive: saved.workspace.lastActive || saved.workspace.lastActiveAt || next.lastActive,
        desc: p,
        branch: next.branch,
        dirty: 0,
        ahead: 0,
        agents: 0,
        threads: 0,
        files: typeof saved.workspace.files === 'number' ? saved.workspace.files : next.files,
        lang: saved.workspace.lang || next.lang,
        inventory: Array.isArray(saved.workspace.inventory) ? saved.workspace.inventory : [],
        inventoryTruncated: Boolean(saved.workspace.inventoryTruncated),
        inventoryUpdatedAt: saved.workspace.inventoryUpdatedAt || null,
      } : next;
      await window.electronAPI?.setActiveWorkspace(finalWs);
      setWorkspaces(ws=>[finalWs,...ws.filter(w=>w.path!==p)]);
      setActiveWs(finalWs.id);
      onActiveWorkspace?.(finalWs);
    }
  };

  // ── Sync with real Git status ──
  useEffect(() => {
    if(!window.electronAPI || workspaces.length === 0) return;
    const poll = async () => {
      const updated = await Promise.all(workspaces.map(async w => {
        if(!w.path) return w;
        const status = await window.electronAPI.gitStatus(w.path);
        if(status) return { ...w, branch: status.branch, dirty: status.dirty, ahead: status.ahead };
        return w;
      }));
      // Only update if something actually changed to avoid infinite loop
      if (JSON.stringify(updated) !== JSON.stringify(workspaces)) {
        setWorkspaces(updated);
      }
    };
    poll();
    const inv = setInterval(poll, 15000);
    return () => clearInterval(inv);
  }, [workspaces]);

  const wsEntries = ws ? (Array.isArray(ws.inventory) ? ws.inventory : []) : [];
  const wsFiles = wsEntries.map((entry) => ({
    name: entry.name,
    ext: entry.ext || getEntryExt(entry.name),
    size: typeof entry.size === 'number' ? `${entry.size} B` : '—',
    modified: entry.mtime ? formatRelativeTime(entry.mtime) : '—',
    path: entry.path || `${ws.path}\\${entry.name}`,
  }));
  const visibleFiles = fileSearchMeta.active
    ? fileSearchResults.map((entry) => ({
      name: entry.name,
      ext: entry.ext || getEntryExt(entry.name),
      size: typeof entry.size === 'number' ? `${entry.size} B` : '—',
      modified: entry.mtime ? formatRelativeTime(entry.mtime) : '—',
      path: entry.path || `${ws.path}\\${entry.name}`,
    }))
    : wsFiles;
  const linkedThreads = ws ? (threads || []).filter((thread) => thread.workspaceId === ws.id || thread.workspacePath === ws.path) : [];
  const linkedAgents = ws ? (agentRuns || []).filter((run) => run.workspaceId === ws.id || run.workspacePath === ws.path || linkedThreads.some((thread) => thread.id === run.threadId)) : [];
  const wsEvents = ws ? events.filter((event) => event.ws === ws.name) : [];
  const wsStats = ws ? {
    files: wsFiles.length,
    threads: linkedThreads.length,
    agents: linkedAgents.length,
  } : { files: 0, threads: 0, agents: 0 };
  const workspaceQuickActions = [
    { icon:'terminal', label:'Run dev server', cmd:'npm run dev' },
    { icon:'play', label:'Run tests', cmd:'npm test' },
    { icon:'agent', label:'Code review', workflowId:'code-review' },
    { icon:'doc', label:'Docs draft', workflowId:'docs-draft' },
    { icon:'chart', label:'Progress report', workflowId:'progress-report' },
  ];

  return (
    <div style={{flex:1,display:'flex',minWidth:0,overflow:'hidden'}}>

      {/* ── Left: workspace list ── */}
      <div style={{width:220,borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',background:'var(--bg)',flexShrink:0}}>
        <div style={{padding:'10px 14px 8px',borderBottom:'1px solid var(--border-light)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span style={{fontSize:12,fontWeight:600,color:'var(--text)'}}>Workspaces</span>
          <button onClick={addWorkspace} style={{color:'var(--accent)',display:'flex',transition:'transform 0.15s',border:'none',background:'transparent',cursor:'pointer'}} title="Open folder" onMouseEnter={e=>e.currentTarget.style.transform='scale(1.15)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
            <Icon name="plus" size={15} color="var(--accent)"/>
          </button>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:'6px 8px'}}>
          {workspaces.map((w,i)=>(
            <div key={w.id} style={{position:'relative',marginBottom:3}} className="ws-item">
            <button onClick={()=>activateWorkspace(w)} style={{width:'100%',padding:'10px 10px',borderRadius:8,display:'flex',gap:10,alignItems:'flex-start',background:activeWs===w.id?'var(--bg-active)':'transparent',border:'none',cursor:'pointer',textAlign:'left',transition:'background 0.12s',animation:`fadeUp 0.2s ${i*0.05}s both`}}
              onMouseEnter={e=>{if(activeWs!==w.id)e.currentTarget.style.background='var(--bg-hover)';}} onMouseLeave={e=>{if(activeWs!==w.id)e.currentTarget.style.background='transparent';}}>
              <div style={{width:32,height:32,borderRadius:8,background:w.color+'22',border:`1.5px solid ${w.color}44`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'border-color 0.15s'}}>
                <span style={{fontSize:13,fontWeight:700,color:w.color,letterSpacing:'-0.03em'}}>{w.name[0]}</span>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:2}}>
                  <span style={{fontSize:12.5,fontWeight:600,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.name}</span>
                  {activeWs===w.id && <span style={{fontSize:9,color:'var(--accent)',flexShrink:0,marginLeft:4,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase'}}>active</span>}
                  {w.dirty>0 && <span style={{fontSize:10,color:'var(--orange)',flexShrink:0,marginLeft:4}}>●{w.dirty}</span>}
                </div>
                <div style={{fontSize:11,color:'var(--text-3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:2}}>{w.path}</div>
                <div style={{display:'flex',alignItems:'center',gap:5}}>
                  <Icon name="git" size={10} color="var(--text-3)"/>
                  <span style={{fontSize:10,fontFamily:'"JetBrains Mono",monospace',color:'var(--text-3)'}}>{w.branch}</span>
                </div>
              </div>
            </button>
            <button
              title="Remove workspace from Meg (does not delete files)"
              onClick={async e=>{
                e.stopPropagation();
                const next = workspaces.filter(x=>x.id!==w.id);
                setWorkspaces(next);
                if(activeWs===w.id) {
                  const fallback = next[0]||null;
                  setActiveWs(fallback?.id||null);
                  onActiveWorkspace?.(fallback);
                  if(fallback) await window.electronAPI?.setActiveWorkspace(fallback);
                }
              }}
              style={{position:'absolute',top:6,right:6,width:20,height:20,borderRadius:4,border:'none',background:'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',opacity:0,transition:'opacity 0.15s,background 0.12s',color:'var(--text-3)'}}
              className="ws-delete-btn"
              onMouseEnter={e=>{e.currentTarget.style.background='var(--red,#e05252)22';e.currentTarget.style.color='var(--red,#e05252)';}}
              onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-3)';}}
            >✕</button>
            </div>
          ))}
        </div>

        <div style={{padding:'8px 10px',borderTop:'1px solid var(--border-light)'}}>
          <button onClick={addWorkspace} style={{width:'100%',height:30,borderRadius:6,border:'1px dashed var(--border)',background:'transparent',display:'flex',alignItems:'center',justifyContent:'center',gap:5,cursor:'pointer',fontSize:12,color:'var(--text-3)',transition:'all 0.15s'}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)';}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--text-3)';}}>
            <Icon name="extern" size={12}/> Open folder
          </button>
        </div>
      </div>

      {/* ── Right: workspace detail ── */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',animation:'navIn 0.22s cubic-bezier(0.22,1,0.36,1)'}}>
        {!ws ? (
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'32px'}}>
            <div style={{maxWidth:360,textAlign:'center'}}>
              <div style={{width:44,height:44,borderRadius:12,background:'var(--bg-active)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
                <Icon name="workspace" size={20} color="var(--text-3)"/>
              </div>
              <h2 style={{fontSize:16,fontWeight:700,color:'var(--text)',marginBottom:8}}>No workspaces yet</h2>
              <p style={{fontSize:13,color:'var(--text-3)',lineHeight:1.6,marginBottom:16}}>Open a project folder to track git status, run quick actions, and attach workspace context to chat.</p>
              <button onClick={addWorkspace} style={{padding:'8px 16px',borderRadius:7,border:'1px solid var(--accent-border)',background:'var(--accent-bg)',color:'var(--accent)',fontSize:12.5,fontWeight:500,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:6}}>
                <Icon name="folder" size={13} color="var(--accent)"/> Open folder
              </button>
            </div>
          </div>
        ) : (
        <>

        {/* Header */}
        <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border-light)',background:'var(--bg)',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:10}}>
            <div style={{width:40,height:40,borderRadius:10,background:ws.color+'22',border:`2px solid ${ws.color}55`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <span style={{fontSize:18,fontWeight:700,color:ws.color,letterSpacing:'-0.04em'}}>{ws.name[0]}</span>
            </div>
            <div style={{flex:1}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                <h2 style={{fontSize:15,fontWeight:700,color:'var(--text)',letterSpacing:'-0.02em'}}>{ws.name}</h2>
                <span style={{fontFamily:'"JetBrains Mono",monospace',fontSize:10.5,color:'var(--text-3)',background:'var(--bg-active)',padding:'2px 7px',borderRadius:99,border:'1px solid var(--border)'}}>{ws.lang || 'Unknown'}</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                <span style={{fontSize:12,color:'var(--text-3)',fontFamily:'"JetBrains Mono",monospace'}}>{ws.path}</span>
                <div style={{display:'flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:99,background:'var(--bg-panel)',border:'1px solid var(--border)'}}>
                  <Icon name="git" size={11} color="#8b5cf6"/>
                  <span style={{fontFamily:'"JetBrains Mono",monospace',fontSize:11,color:'var(--text-2)'}}>{ws.branch}</span>
                  {ws.dirty>0 && <span style={{fontSize:10,color:'var(--orange)',marginLeft:2}}>{ws.dirty} changed</span>}
                  {ws.ahead>0 && <span style={{fontSize:10,color:'var(--green)',marginLeft:2}}>↑{ws.ahead}</span>}
                </div>
              </div>
            </div>
            <div style={{display:'flex',gap:6,flexShrink:0}}>
              <button onClick={()=>{
                window.dispatchEvent(new CustomEvent('meg:action',{detail:{action:'navigate',screen:'chat'}}));
                window.dispatchEvent(new CustomEvent('meg:action',{detail:{action:'openSplit'}}));
              }} style={{padding:'6px 12px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',fontSize:12,color:'var(--text-2)',display:'flex',alignItems:'center',gap:5,cursor:'pointer',transition:'border-color 0.12s'}} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent-border)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                <Icon name="terminal" size={12} color="var(--text-3)"/> Terminal
              </button>
              <button onClick={() => {
                const workflow = buildWorkspaceOverviewWorkflow(ws);
                window.dispatchEvent(new CustomEvent('meg:action', { detail: { action: 'navigate', screen: 'agents' } }));
                window.dispatchEvent(new CustomEvent('meg:action', {
                  detail: {
                    action: 'spawnAgent',
                    value: {
                      ...workflow,
                      workspace: ws,
                    },
                  },
                }));
              }} style={{padding:'6px 12px',borderRadius:6,border:'none',background:'var(--accent)',color:'#fff',fontSize:12,fontWeight:500,display:'flex',alignItems:'center',gap:5,cursor:'pointer'}}>
                <Icon name="agent" size={12} color="#fff"/> Ask Meg
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div style={{display:'flex',gap:10}}>
            {[{label:'Files',val:wsStats.files,icon:'files',color:'var(--text-3)'},{label:'Threads',val:wsStats.threads,icon:'chat',color:'var(--accent)'},{label:'Agents run',val:wsStats.agents,icon:'agent',color:wsStats.agents>0?'var(--green)':'var(--text-3)'}].map((s,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:6,background:'var(--bg-panel)',border:'1px solid var(--border-light)',flex:1}}>
                <Icon name={s.icon} size={13} color={s.color}/>
                <span style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{s.val}</span>
                <span style={{fontSize:11,color:'var(--text-3)'}}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',borderBottom:'1px solid var(--border-light)',background:'var(--bg)',flexShrink:0}}>
          {[{id:'overview',label:'Overview'},{id:'files',label:'Files'},{id:'activity',label:'Activity'},{id:'threads',label:'Threads'}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:'8px 16px',fontSize:12.5,color:tab===t.id?'var(--text)':'var(--text-3)',background:'none',border:'none',borderBottom:`2px solid ${tab===t.id?'var(--accent)':'transparent'}`,cursor:'pointer',transition:'color 0.12s',fontFamily:'inherit'}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div key={tab} style={{flex:1,overflowY:'auto',animation:'navIn 0.18s ease'}}>

          {tab==='overview' && (
            <div style={{padding:'18px 20px',display:'flex',gap:18}}>
              {/* Left: recent files + quick actions */}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10}}>Recent files</div>
                {wsFiles.length > 0 ? wsFiles.slice(0, 6).map((f,i)=>(
                  <div key={f.path || `${f.name}-${i}`} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderBottom:'1px solid var(--border-light)',animation:`fadeUp 0.15s ${i*0.04}s both`}}>
                    <div style={{width:6,height:6,borderRadius:'50%',background:'transparent',flexShrink:0}}/>
                    <Icon name="doc" size={13} color={EXT_C[f.ext]||'var(--text-3)'}/>
                    <span style={{fontFamily:'"JetBrains Mono",monospace',fontSize:11.5,color:'var(--text)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</span>
                    <span style={{fontSize:10.5,color:'var(--text-3)',flexShrink:0}}>{f.size}</span>
                    <span style={{fontSize:10.5,color:'var(--text-3)',flexShrink:0,minWidth:50,textAlign:'right'}}>{f.modified}</span>
                  </div>
                )) : (
                  <div style={{padding:'16px 0',fontSize:12.5,color:'var(--text-3)'}}>No workspace file inventory yet.</div>
                )}
                {ws?.inventoryTruncated && (
                  <div style={{paddingTop:10,fontSize:11.5,color:'var(--text-3)'}}>Showing the first cached workspace files. Open the file browser for targeted navigation in larger projects.</div>
                )}

                <div style={{marginTop:18}}>
                  <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10}}>Quick actions</div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    {workspaceQuickActions.map((a,i)=>(
                      <button key={i} onClick={async()=>{
                        if(a.cmd){
                          const r=await window.electronAPI?.execCommand(a.cmd, ws?.path);
                          const out=(r?.stdout||'')+(r?.stderr?'\n'+r.stderr:'');
                          window.dispatchEvent(new CustomEvent('meg:action',{detail:{action:'appendCommandResultToChat',text:`Ran \`${a.cmd}\`:\n\`\`\`\n${out||'(no output)'}\n\`\`\``}}));
                        } else if(a.workflowId){
                          const workflow = buildWorkspaceWorkflow(ws, a.workflowId);
                          if (!workflow) return;
                          window.dispatchEvent(new CustomEvent('meg:action', { detail: { action:'navigate', screen:'agents' } }));
                          window.dispatchEvent(new CustomEvent('meg:action', {
                            detail: {
                              action:'spawnAgent',
                              value: {
                                ...workflow,
                                workspace: ws,
                              },
                            },
                          }));
                        }
                      }} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 12px',borderRadius:7,border:'1px solid var(--border)',background:'var(--bg-2)',fontSize:12,color:'var(--text-2)',cursor:'pointer',transition:'all 0.12s',animation:`fadeUp 0.2s ${0.1+i*0.04}s both`}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent-border)';e.currentTarget.style.background='var(--accent-bg)';e.currentTarget.style.color='var(--accent)';}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.background='var(--bg-2)';e.currentTarget.style.color='var(--text-2)';}}>
                        <Icon name={a.icon} size={12}/> {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: recent activity */}
              <div style={{width:240,flexShrink:0}}>
                <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10}}>Activity</div>
                {wsEvents.length===0 && <div style={{fontSize:12.5,color:'var(--text-3)'}}>No workspace activity yet.</div>}
                {wsEvents.slice(0,5).map((a,i)=>(
                  <div key={i} style={{display:'flex',gap:8,marginBottom:12,alignItems:'flex-start',animation:`fadeUp 0.15s ${i*0.05}s both`}}>
                    <div style={{width:24,height:24,borderRadius:'50%',background:'var(--bg-active)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>
                      <Icon name={a.icon} size={11} color={a.color}/>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,color:'var(--text)',fontWeight:500,lineHeight:1.4}}>{a.title || a.label}</div>
                      <div style={{fontSize:11,color:'var(--text-3)',marginTop:1}}>{a.detail || a.sub}</div>
                      <div style={{fontSize:10,color:'var(--text-3)',marginTop:2}}>{formatRelativeTime(a.createdAt) || a.time || ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab==='files' && (
            <div style={{padding:'14px 20px'}}>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:12}}>All files — {ws.name}</div>
              <div style={{marginBottom:12}}>
                <input
                  value={fileQuery}
                  onChange={(e)=>setFileQuery(e.target.value)}
                  placeholder="Search cached workspace files"
                  style={{width:'100%',height:34,borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-2)',padding:'0 12px',fontSize:12.5,color:'var(--text)',outline:'none'}}
                />
                {fileSearchMeta.active && (
                  <div style={{fontSize:11,color:'var(--text-3)',marginTop:8}}>
                    {fileSearchMeta.total} matching file{fileSearchMeta.total === 1 ? '' : 's'} in cached workspace inventory.
                  </div>
                )}
              </div>
              {visibleFiles.length===0 && <div style={{fontSize:12.5,color:'var(--text-3)'}}>{fileSearchMeta.active ? 'No cached workspace files matched this search.' : 'No workspace files indexed here yet.'}</div>}
              {!fileSearchMeta.active && ws?.inventoryTruncated && <div style={{fontSize:11.5,color:'var(--text-3)',marginBottom:10}}>Large workspace: this list is capped to the cached inventory limit.</div>}
              {fileSearchMeta.active && fileSearchMeta.truncated && <div style={{fontSize:11.5,color:'var(--text-3)',marginBottom:10}}>Search results come from the cached workspace inventory limit.</div>}
              {visibleFiles.map((f,i)=>(
                <div key={f.path || `${f.name}-${i}`} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 10px',borderRadius:7,marginBottom:3,cursor:'pointer',transition:'background 0.1s',animation:`fadeUp 0.15s ${i*0.04}s both`}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <Icon name="doc" size={14} color={EXT_C[f.ext]||'var(--text-3)'}/>
                  <span style={{fontFamily:'"JetBrains Mono",monospace',fontSize:12,color:'var(--text)',flex:1}}>{f.name}</span>
                  <span style={{fontSize:11,color:'var(--text-3)'}}>{f.size}</span>
                  <span style={{fontSize:11,color:'var(--text-3)',minWidth:64,textAlign:'right'}}>{f.modified}</span>
                </div>
              ))}
            </div>
          )}

          {tab==='activity' && (
            <div style={{padding:'14px 20px'}}>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:14}}>Timeline</div>
              {wsEvents.length===0 && <div style={{fontSize:12.5,color:'var(--text-3)'}}>No workspace activity yet.</div>}
              {wsEvents.map((a,i)=>(
                <div key={i} style={{display:'flex',gap:10,marginBottom:0,alignItems:'stretch',animation:`fadeUp 0.15s ${i*0.05}s both`}}>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',width:24,flexShrink:0}}>
                    <div style={{width:24,height:24,borderRadius:'50%',background:'var(--bg-active)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <Icon name={a.icon} size={11} color={a.color}/>
                    </div>
                    {i<wsEvents.length-1 && <div style={{width:1,flex:1,background:'var(--border)',margin:'3px 0 3px'}}/>}
                  </div>
                  <div style={{flex:1,paddingBottom:14}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:2}}>
                      <span style={{fontSize:12.5,color:'var(--text)',fontWeight:500}}>{a.title || a.label}</span>
                      <span style={{fontSize:10.5,color:'var(--text-3)',flexShrink:0,marginLeft:8}}>{formatRelativeTime(a.createdAt) || a.time || ''}</span>
                    </div>
                    <div style={{fontSize:11.5,color:'var(--text-3)'}}>{a.detail || a.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab==='threads' && (
            <div style={{padding:'14px 20px'}}>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:12}}>Chats in this workspace</div>
              {linkedThreads.length===0 && <div style={{fontSize:12.5,color:'var(--text-3)'}}>No workspace chats linked yet.</div>}
              {linkedThreads.map((t,i)=>(
                <div key={t.id} style={{display:'flex',gap:10,padding:'10px',borderRadius:8,marginBottom:4,cursor:'pointer',transition:'background 0.1s',animation:`fadeUp 0.15s ${i*0.06}s both`}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div style={{width:32,height:32,borderRadius:8,background:'var(--accent-bg)',border:'1px solid var(--accent-border)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <Icon name={t.iconName || 'chat'} size={14} color="var(--accent)"/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:2}}>
                      <span style={{fontSize:12.5,fontWeight:500,color:'var(--text)'}}>{t.title}</span>
                      <span style={{fontSize:10.5,color:'var(--text-3)'}}>{formatRelativeTime(t.updatedAt || t.createdAt) || ''}</span>
                    </div>
                    <span style={{fontSize:11.5,color:'var(--text-3)'}}>{t.subtitle}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
        </>
        )}
      </div>
    </div>
  );
};
