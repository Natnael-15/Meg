import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { Toggle } from './primitives.jsx';
import { formatRelativeTime } from '../lib/time.js';

const buildDiffLines = (originalText = '', nextText = '') => {
  const originalLines = String(originalText).split('\n');
  const nextLines = String(nextText).split('\n');
  const max = Math.max(originalLines.length, nextLines.length);
  const lines = [];
  for (let index = 0; index < max; index += 1) {
    const before = originalLines[index];
    const after = nextLines[index];
    if (before === after) {
      if (before !== undefined) {
        lines.push({ type: 'context', text: before, line: index + 1 });
      }
      continue;
    }
    if (before !== undefined) {
      lines.push({ type: 'remove', text: before, line: index + 1 });
    }
    if (after !== undefined) {
      lines.push({ type: 'add', text: after, line: index + 1 });
    }
  }
  return lines;
};

export const NotifPanel = ({notifs, onClose, onMarkAllRead, onDismiss}) => (
  <div style={{position:'absolute',top:50,right:16,width:300,background:'var(--bg-2)',borderRadius:10,border:'1px solid var(--border)',boxShadow:`0 12px 36px var(--shadow-lg)`,zIndex:200,overflow:'hidden',animation:'slideDown 0.18s ease'}}>
    <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border-light)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <span style={{fontSize:12.5,fontWeight:600,color:'var(--text)'}}>Activity</span>
      <button onClick={onMarkAllRead} style={{fontSize:11,color:'var(--accent)',fontWeight:500}}>Mark all read</button>
    </div>
    <div style={{maxHeight:320,overflowY:'auto'}}>
      {notifs.map(n=>(
        <div key={n.id} style={{padding:'10px 14px',borderBottom:'1px solid var(--border-light)',display:'flex',gap:10,alignItems:'flex-start',background:n.read?'transparent':'var(--accent-bg)',transition:'background 0.2s'}}>
          <div style={{width:28,height:28,borderRadius:'50%',background:'var(--bg-active)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <Icon name={n.icon} size={13} color={n.color}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:12.5,fontWeight:n.read?400:500,color:'var(--text)',marginBottom:2}}>{n.title}</div>
            <div style={{fontSize:11.5,color:'var(--text-3)',lineHeight:1.45}}>{n.body}</div>
            <div style={{fontSize:10.5,color:'var(--text-3)',marginTop:3}}>{formatRelativeTime(n.createdAt) || n.time || ''}</div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:4,flexShrink:0,marginTop:2,alignItems:'flex-end'}}>
            {!n.read && <div style={{width:7,height:7,borderRadius:'50%',background:'var(--accent)'}}/>}
            <button onClick={()=>onDismiss&&onDismiss(n.id)} style={{border:'none',background:'transparent',cursor:'pointer',color:'var(--text-3)',display:'flex',opacity:0.5,padding:0}} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='0.5'}><Icon name="close" size={12}/></button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const QuickCapture = ({onClose, onSend, recentItems = []}) => {
  const [val, setVal] = useState('');
  useEffect(() => {
    const id = setTimeout(() => document.activeElement?.blur?.(), 0);
    return () => clearTimeout(id);
  }, []);
  const submit = (text) => { if (text.trim()) { onSend(text.trim()); onClose(); } };

  return (
    <div style={{position:'fixed',inset:0,zIndex:950,display:'flex',alignItems:'center',justifyContent:'center',animation:'backdropIn 0.15s ease'}} onClick={onClose}>
      <div style={{position:'absolute',inset:0,background:'rgba(8,6,18,0.6)',backdropFilter:'blur(6px)'}}/>
      <div style={{width:540,position:'relative',animation:'modalIn 0.22s cubic-bezier(0.22,1,0.36,1)'}} onClick={e=>e.stopPropagation()}>
        <div style={{background:'var(--bg-2)',borderRadius:14,border:'1px solid var(--border)',boxShadow:`0 32px 80px var(--shadow-lg), 0 0 0 1px rgba(255,255,255,0.05)`,overflow:'hidden'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 18px',borderBottom:'1px solid var(--border-light)'}}>
            <div style={{width:28,height:28,borderRadius:8,background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <Icon name="logo" size={14} color="#fff"/>
            </div>
            <input value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey)submit(val);if(e.key==='Escape')onClose();}} placeholder="Ask Meg anything, or drop a task…" style={{flex:1,border:'none',outline:'none',fontSize:15,color:'var(--text)',background:'none',fontFamily:'inherit'}} autoFocus/>
            <kbd style={{fontSize:10,color:'var(--text-3)',background:'var(--bg-active)',padding:'2px 6px',borderRadius:4,border:'1px solid var(--border)',flexShrink:0}}>Esc</kbd>
          </div>
          <div style={{padding:'6px 8px 8px'}}>
            {recentItems.length > 0 ? (
              <>
                <div style={{fontSize:10.5,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',padding:'4px 10px 6px'}}>Recent</div>
                {recentItems.map((r,i)=>(
                  <button key={`${r}-${i}`} onClick={()=>submit(r)} style={{width:'100%',display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:7,background:'transparent',border:'none',cursor:'pointer',textAlign:'left',transition:'background 0.08s',animation:`fadeUp 0.15s ${i*0.04}s both`}}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <Icon name="chat" size={13} color="var(--text-3)"/>
                    <span style={{fontSize:13.5,color:'var(--text-2)'}}>{r}</span>
                    <span style={{marginLeft:'auto',display:'inline-flex'}}><Icon name="chevronRight" size={13} color="var(--text-3)"/></span>
                  </button>
                ))}
              </>
            ) : (
              <div style={{padding:'12px 10px 10px',fontSize:12.5,color:'var(--text-3)',lineHeight:1.5}}>
                No recent captures yet.
              </div>
            )}
          </div>
          {val.trim() && (
            <div style={{padding:'8px 16px',borderTop:'1px solid var(--border-light)',display:'flex',justifyContent:'flex-end'}}>
              <button onClick={()=>submit(val)} className="btn-pressable" style={{padding:'7px 18px',borderRadius:8,background:'var(--accent)',color:'#fff',fontSize:13,fontWeight:600,border:'none',cursor:'pointer'}}>
                Send to Meg →
              </button>
            </div>
          )}
        </div>
        <div style={{textAlign:'center',marginTop:8}}>
          <span style={{fontSize:11,color:'rgba(255,255,255,0.3)'}}>Ctrl+Shift+M to open anywhere</span>
        </div>
      </div>
    </div>
  );
};

export const TrayFlyout = ({notifs, approvals, onApprove, onDeny, onClose, onMarkAllRead, onOpenMeg, onNewTask}) => {
  const unread = notifs.filter(n=>!n.read);
  const pendingApprovals = (approvals || []).filter(a=>a.status==='pending');
  const actions = [
    {icon:'chat',label:'Open Meg',onClick:onOpenMeg},
    {icon:'plus',label:'New task',onClick:onNewTask},
    {icon:'check',label:'Mark all read',onClick:onMarkAllRead},
  ];
  return (
    <div style={{position:'absolute',bottom:0,right:0,width:320,background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:'12px 12px 0 0',boxShadow:`0 -8px 40px var(--shadow-lg)`,zIndex:300,overflow:'hidden',animation:'slideDown 0.22s cubic-bezier(0.22,1,0.36,1)'}}>
      <div style={{padding:'12px 16px 10px',borderBottom:'1px solid var(--border-light)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:20,height:20,borderRadius:6,background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <Icon name="logo" size={12} color="#fff"/>
          </div>
          <span style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>Meg</span>
          {unread.length>0 && <span style={{fontSize:10.5,background:'var(--orange)',color:'#fff',padding:'1px 6px',borderRadius:99,fontWeight:600}}>{unread.length} new</span>}
          {pendingApprovals.length>0 && <span style={{fontSize:10.5,background:'var(--accent)',color:'#fff',padding:'1px 6px',borderRadius:99,fontWeight:600}}>{pendingApprovals.length} approval</span>}
        </div>
        <button onClick={onClose} style={{color:'var(--text-3)',display:'flex'}} onMouseEnter={e=>e.currentTarget.style.color='var(--text)'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-3)'}><Icon name="close" size={13}/></button>
      </div>
      {pendingApprovals.length>0 && (
        <div style={{borderBottom:'1px solid var(--border-light)',background:'var(--bg-panel)'}}>
          <div style={{padding:'8px 16px 4px',fontSize:10.5,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Pending Approval</div>
          {pendingApprovals.slice(0,3).map((a,i)=>(
            <div key={a.id} style={{padding:'8px 16px 10px',borderTop:i?'1px solid var(--border-light)':'none',animation:`fadeUp 0.15s ${i*0.04}s both`}}>
              <div style={{display:'flex',gap:9,alignItems:'flex-start',marginBottom:8}}>
                <div style={{width:26,height:26,borderRadius:'50%',background:'var(--accent-bg)',border:'1px solid var(--accent-border)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <Icon name={a.tool==='run_command'?'terminal':'save'} size={12} color="var(--accent)"/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,color:'var(--text)',marginBottom:2}}>{a.tool==='run_command'?'Run command':'Write file'}</div>
                  <div style={{fontSize:10.5,color:'var(--text-3)',fontFamily:'"JetBrains Mono",monospace',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.args?.command || a.args?.path || a.reason}</div>
                </div>
              </div>
              <div style={{display:'flex',gap:6}}>
                <button onClick={()=>onApprove?.(a.id)} style={{flex:1,padding:'5px 8px',borderRadius:6,border:'none',background:'var(--accent)',color:'#fff',fontSize:11.5,fontWeight:600,cursor:'pointer'}}>Approve</button>
                <button onClick={()=>onDeny?.(a.id)} style={{flex:1,padding:'5px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text-2)',fontSize:11.5,cursor:'pointer'}}>Deny</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{maxHeight:220,overflowY:'auto'}}>
        {notifs.slice(0,4).map((n,i)=>(
          <div key={n.id} style={{padding:'8px 16px',display:'flex',gap:10,alignItems:'flex-start',background:n.read?'transparent':'var(--accent-bg)',borderBottom:'1px solid var(--border-light)',animation:`fadeUp 0.15s ${i*0.04}s both`}}>
            <div style={{width:26,height:26,borderRadius:'50%',background:'var(--bg-active)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>
              <Icon name={n.icon} size={12} color={n.color}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:n.read?400:500,color:'var(--text)',marginBottom:1}}>{n.title}</div>
              <div style={{fontSize:11,color:'var(--text-3)'}}>{n.body}</div>
            </div>
            {!n.read && <div style={{width:6,height:6,borderRadius:'50%',background:'var(--accent)',flexShrink:0,marginTop:5}}/>}
          </div>
        ))}
      </div>
      <div style={{padding:'8px 12px',borderTop:'1px solid var(--border-light)',display:'flex',gap:6}}>
        {actions.map((a,i)=>(
          <button key={i} onClick={a.onClick} style={{flex:1,padding:'6px 4px',borderRadius:7,border:'1px solid var(--border)',background:'var(--bg)',display:'flex',flexDirection:'column',alignItems:'center',gap:3,cursor:'pointer',fontSize:10.5,color:'var(--text-2)',transition:'all 0.12s'}}
            onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.borderColor='var(--accent-border)';}}
            onMouseLeave={e=>{e.currentTarget.style.background='var(--bg)';e.currentTarget.style.borderColor='var(--border)';}}>
            <Icon name={a.icon} size={14} color="var(--text-3)"/>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export const SmsFloat = ({messages = [], connected = false, contactName = 'Telegram', onClose, onSend, sendError = null}) => {
  const [msg,setMsg] = useState('');
  const sortedMessages = [...messages].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  const send = async () => {
    if(!msg.trim()) return;
    const text = msg.trim();
    setMsg('');
    await onSend?.(text);
  };
  return (
    <div style={{position:'absolute',bottom:16,right:16,width:260,zIndex:100,background:'var(--bg-2)',borderRadius:12,border:'1px solid var(--border)',boxShadow:`0 8px 32px var(--shadow-lg)`,overflow:'hidden',display:'flex',flexDirection:'column',animation:'slideDown 0.18s ease'}}>
      <div style={{padding:'10px 14px',background:'var(--bg-panel)',borderBottom:'1px solid var(--border-light)',display:'flex',alignItems:'center',gap:8}}>
        <div style={{width:28,height:28,borderRadius:'50%',background:'var(--bg-active)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <span style={{fontSize:12,fontWeight:600,color:'var(--text-2)'}}>T</span>
        </div>
        <div style={{flex:1}}><div style={{fontSize:12.5,fontWeight:600,color:'var(--text)'}}>{contactName}</div><div style={{fontSize:10.5,color:'var(--text-3)'}}>{connected ? 'Telegram connected' : 'Telegram not connected'}</div></div>
        <button onClick={onClose} style={{color:'var(--text-3)',display:'flex',padding:2}} onMouseEnter={e=>e.currentTarget.style.color='var(--text)'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-3)'}><Icon name="close" size={13}/></button>
      </div>
      <div style={{padding:'10px 12px',maxHeight:180,overflowY:'auto',display:'flex',flexDirection:'column',gap:6}}>
        {!connected && sortedMessages.length===0 && (
          <div style={{padding:'12px 8px',fontSize:12,color:'var(--text-3)',lineHeight:1.5,textAlign:'center'}}>
            Connect Telegram in Settings to start replying from here.
          </div>
        )}
        {connected && sortedMessages.length===0 && (
          <div style={{padding:'12px 8px',fontSize:12,color:'var(--text-3)',lineHeight:1.5,textAlign:'center'}}>
            No Telegram messages yet.
          </div>
        )}
        {sortedMessages.map((m)=>(
          <div key={m.id} style={{display:'flex',justifyContent:m.direction==='outbound'?'flex-end':'flex-start'}}>
            <div style={{maxWidth:'80%',padding:'6px 10px',fontSize:12.5,lineHeight:1.45,borderRadius:m.direction==='outbound'?'10px 10px 3px 10px':'3px 10px 10px 10px',background:m.direction==='outbound'?'var(--accent)':'var(--bg-panel)',color:m.direction==='outbound'?'#fff':'var(--text)'}}>
              {m.text}
            </div>
          </div>
        ))}
      </div>
      {sendError && (
        <div style={{padding:'8px 10px',fontSize:11,color:'var(--red,#e05252)',borderTop:'1px solid var(--border-light)',background:'var(--bg-panel)'}}>
          {sendError}
        </div>
      )}
      <div style={{padding:'8px 10px',borderTop:'1px solid var(--border-light)',display:'flex',gap:6}}>
        <input value={msg} onChange={e=>setMsg(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder={connected ? 'Reply…' : 'Connect Telegram to reply'} disabled={!connected} style={{flex:1,border:'1px solid var(--border)',borderRadius:6,padding:'6px 10px',fontSize:12.5,fontFamily:'inherit',background:'var(--bg-input)',outline:'none',color:'var(--text)'}} onFocus={e=>e.target.style.borderColor='var(--accent)'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
        <button onClick={send} disabled={!connected || !msg.trim()} style={{width:30,height:30,borderRadius:6,background:connected && msg.trim()?'var(--accent)':'var(--bg-active)',display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.15s'}}>
          <Icon name="send" size={13} color={connected && msg.trim()?'#fff':'var(--text-3)'}/>
        </button>
      </div>
    </div>
  );
};

export const ContextPanel = ({thread, onAddFiles, onToggleTool}) => {
  const tools = thread.tools||{};
  const addFiles = async () => {
    const r = await window.electronAPI?.openFile();
    if(r?.filePaths?.length) onAddFiles?.(r.filePaths.map(p=>p.split(/[\\/]/).pop()));
  };
  return (
    <div style={{width:220,background:'var(--bg-panel)',borderLeft:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden',flexShrink:0}}>
      <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border-light)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span style={{fontSize:11,fontWeight:600,color:'var(--text-3)',letterSpacing:'0.06em',textTransform:'uppercase'}}>Context</span>
        <button onClick={addFiles} title="Add files" style={{color:'var(--text-3)',display:'flex',background:'none',border:'none',cursor:'pointer',padding:2,borderRadius:4,transition:'color 0.12s,background 0.12s'}} onMouseEnter={e=>{e.currentTarget.style.color='var(--accent)';e.currentTarget.style.background='var(--accent-bg)';}} onMouseLeave={e=>{e.currentTarget.style.color='var(--text-3)';e.currentTarget.style.background='none';}}><Icon name="plus" size={14}/></button>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'12px 14px',display:'flex',flexDirection:'column',gap:18}}>
        {thread.files?.length>0 && <div>
          <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:7}}>Files</div>
          {thread.files.map((f,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:7,padding:'5px 8px',borderRadius:5,cursor:'pointer',marginBottom:2}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <Icon name="doc" size={13} color="var(--text-3)"/>
              <span style={{fontFamily:'"JetBrains Mono",monospace',fontSize:11,color:'var(--text-2)'}}>{f}</span>
            </div>
          ))}
        </div>}
        {Object.keys(tools).length>0 && <div>
          <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:7}}>Tools</div>
          {Object.entries(tools).map(([name,on])=>(
            <div key={name} style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <span style={{fontSize:12.5,color:'var(--text-2)'}}>{name}</span>
              <Toggle on={on} onToggle={()=>onToggleTool?.(name, !on)}/>
            </div>
          ))}
        </div>}
        {thread.memory && <div>
          <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:7}}>Memory</div>
          <div style={{padding:'8px 10px',borderRadius:6,background:'var(--bg-2)',border:'1px dashed var(--border)',fontSize:12,color:'var(--text-2)',lineHeight:1.55}}>{thread.memory}</div>
        </div>}
      </div>
    </div>
  );
};

export const SplitPane = ({activeFile, activeWorkspace, terminalHistory = [], onTerminalHistoryChange}) => {
  const [tab,setTab] = useState('code');
  const [termInput,setTermInput] = useState('');
  const [saveState, setSaveState] = useState(null);
  const [codeViewMode, setCodeViewMode] = useState('edit');
  const lastFilePathRef = useRef(null);
  const appendTerminalEntry = (entry) => {
    onTerminalHistoryChange?.((current = []) => [...current, entry].slice(-200));
  };
  const runCmd = async () => {
    const cmd = termInput.trim();
    if(!cmd) return;
    appendTerminalEntry({ id:`term-cmd-${Date.now()}`, type:'cmd', text:'$ '+cmd, command:cmd, cwd:activeWorkspace?.path || null, createdAt:new Date().toISOString() });
    setTermInput('');
    if(window.electronAPI) {
      const r = await window.electronAPI.execCommand(cmd, activeWorkspace?.path);
      const out = (r.stdout||'')+(r.stderr?'\n'+r.stderr:'');
      appendTerminalEntry({ id:`term-out-${Date.now()}`, type:r.exitCode===0?'out':'err', text:out||'(no output)', command:cmd, cwd:activeWorkspace?.path || null, exitCode:r.exitCode, createdAt:new Date().toISOString() });
      window.dispatchEvent(new CustomEvent('meg:action', {
        detail: {
          action: 'addEvent',
          value: { type: 'agent', icon: 'terminal', color: r.exitCode===0?'var(--green)':'var(--red)', title: `Ran: ${cmd}`, detail: r.exitCode===0 ? `Command finished in ${activeWorkspace?.path || 'current shell'}` : `Command failed with exit code ${r.exitCode ?? 'unknown'}`, ws: activeWorkspace?.name || activeFile?.path || 'Local' }
        }
      }));
    } else {
      appendTerminalEntry({ id:`term-preview-${Date.now()}`, type:'out', text:'(terminal only available in Electron)', command:cmd, cwd:activeWorkspace?.path || null, createdAt:new Date().toISOString() });
    }
  };
  const [isEditing, setIsEditing] = useState(false);
  const [editedCode, setEditedCode] = useState('');

  useEffect(() => {
    const nextPath = activeFile?.path || null;
    const draftContent = typeof activeFile?.draftContent === 'string' ? activeFile.draftContent : null;
    const hasDraft = draftContent !== null && draftContent !== (activeFile?.content || '');
    setEditedCode(hasDraft ? draftContent : (activeFile?.content || ''));
    setIsEditing(hasDraft);
    setCodeViewMode(hasDraft ? 'diff' : 'edit');
    if (lastFilePathRef.current !== nextPath) {
      setSaveState(null);
    }
    lastFilePathRef.current = nextPath;
  }, [activeFile]);

  const save = async () => {
    if (!activeFile) return;
    const r = await window.electronAPI?.writeFile(activeFile.path, editedCode);
    if (r?.ok) {
      if (activeFile.approvalId) {
        await window.electronAPI?.applyStagedApproval?.(activeFile.approvalId, activeFile.path);
      }
      setIsEditing(false);
      setCodeViewMode('edit');
      setSaveState({ type: 'success', message: `Saved ${activeFile.name}`, path: activeFile.path, at: new Date().toISOString() });
      const { draftContent, approvalId, ...nextFile } = activeFile;
      window.dispatchEvent(new CustomEvent('meg:action', { detail: { action: 'openFile', value: { ...nextFile, content: editedCode } } }));
      window.dispatchEvent(new CustomEvent('meg:action', { detail: { action: 'addEvent', value: { type: 'file', icon: 'save', color: 'var(--green)', title: `Saved: ${activeFile.name}`, detail: `Manual edit saved to ${activeFile.path}`, ws: activeWorkspace?.name || activeFile.path } } }));
    } else {
      setSaveState({ type: 'error', message: r?.error || 'Could not save this file.', path: activeFile.path, at: new Date().toISOString() });
    }
  };

  const displayCode = activeFile?.content || '';
  const fileName = activeFile?.name || 'No file';
  const diffLines = buildDiffLines(displayCode, editedCode);
  const changedLines = diffLines.filter((line) => line.type !== 'context').length;
  const hasUnsavedChanges = isEditing && editedCode !== displayCode;

  return (
    <div style={{width:360,display:'flex',flexDirection:'column',background:'var(--code-bg)',borderLeft:'1px solid var(--border)',flexShrink:0}}>
      <div style={{display:'flex',borderBottom:'1px solid var(--code-border)',background:'rgba(0,0,0,0.2)',flexShrink:0,justifyContent:'space-between',alignItems:'center'}}>
        <div style={{display:'flex'}}>
          {[{id:'code',icon:'code',label:fileName},{id:'terminal',icon:'terminal',label:'Terminal'}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:'8px 14px',display:'flex',alignItems:'center',gap:5,background:'none',border:'none',cursor:'pointer',borderBottom:`2px solid ${tab===t.id?'var(--accent)':'transparent'}`,color:tab===t.id?'#c8c8e0':'#555',fontSize:11.5,fontFamily:'inherit',transition:'color 0.15s'}}>
              <Icon name={t.icon} size={13} color={tab===t.id?'#9090c0':'#555'}/><span style={{fontFamily:'"JetBrains Mono",monospace'}}>{t.label}</span>
            </button>
          ))}
        </div>
        <div style={{padding:'0 10px',display:'flex',alignItems:'center',gap:8}}>
          {tab==='code' && activeFile && (
            isEditing ? (
              <>
                <div style={{display:'flex',alignItems:'center',gap:4,padding:'2px 7px',borderRadius:4,background:'rgba(255,255,255,0.05)',color:hasUnsavedChanges?'var(--orange)':'#777',fontSize:10.5,fontFamily:'"JetBrains Mono",monospace'}}>
                  {hasUnsavedChanges ? `Unsaved changes: ${changedLines}` : 'No changes'}
                </div>
                <div style={{display:'flex',border:'1px solid var(--code-border)',borderRadius:4,overflow:'hidden'}}>
                  {[
                    { id: 'edit', label: 'Edit' },
                    { id: 'diff', label: 'Diff' },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setCodeViewMode(mode.id)}
                      style={{padding:'2px 8px',border:'none',background:codeViewMode===mode.id?'rgba(255,255,255,0.12)':'transparent',color:codeViewMode===mode.id?'#fff':'#777',fontSize:10.5,cursor:'pointer'}}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                <button onClick={save} style={{padding:'2px 8px',borderRadius:4,background:'var(--green)',color:'#fff',fontSize:10.5,border:'none',cursor:'pointer',fontWeight:600}}>Save</button>
              </>
            ) : (
              <button onClick={()=>setIsEditing(true)} style={{padding:'2px 8px',borderRadius:4,background:'var(--bg-active)',color:'var(--text-2)',fontSize:10.5,border:'1px solid var(--border)',cursor:'pointer'}}>Edit</button>
            )
          )}
          <span style={{fontFamily:'"JetBrains Mono",monospace',fontSize:10,color:'#555',background:'rgba(255,255,255,0.05)',padding:'2px 7px',borderRadius:3}}>{activeFile?'Local File':'localhost:3000'}</span>
        </div>
      </div>
      {tab==='code'?(
        <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',background:'var(--code-bg)'}}>
          {saveState && <div style={{padding:'8px 12px',borderBottom:'1px solid var(--code-border)',fontSize:11.5,color:saveState.type==='success'?'var(--green)':'var(--red)',background:'rgba(255,255,255,0.03)'}}>{saveState.message}</div>}
          {isEditing && codeViewMode === 'edit' ? (
            <textarea value={editedCode} onChange={e=>setEditedCode(e.target.value)} style={{flex:1,width:'100%',background:'none',border:'none',outline:'none',padding:'12px 16px',color:'var(--code-text)',fontFamily:'"JetBrains Mono",monospace',fontSize:11,lineHeight:1.7,resize:'none'}}/>
          ) : isEditing && codeViewMode === 'diff' ? (
            <div style={{flex:1,overflowY:'auto',padding:'12px 16px'}}>
              {hasUnsavedChanges ? (
                <div style={{display:'flex',flexDirection:'column',gap:2}}>
                  {diffLines.map((line, index) => (
                    <div key={`${line.type}-${line.line}-${index}`} style={{display:'grid',gridTemplateColumns:'44px 14px 1fr',gap:8,fontFamily:'"JetBrains Mono",monospace',fontSize:11,lineHeight:1.7,color:line.type==='add'?'var(--green)':line.type==='remove'?'var(--red)':'var(--code-text)',background:line.type==='add'?'rgba(26,158,92,0.08)':line.type==='remove'?'rgba(224,82,82,0.08)':'transparent',borderRadius:4,padding:'1px 6px'}}>
                      <span style={{color:'#666'}}>{line.line}</span>
                      <span>{line.type==='add' ? '+' : line.type==='remove' ? '-' : ' '}</span>
                      <span style={{whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{line.text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',textAlign:'center'}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>No unsaved changes</div>
                    <div style={{fontSize:11.5,color:'var(--text-3)',marginTop:6,lineHeight:1.5}}>Edit the file to preview a line-by-line diff before saving.</div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            displayCode ? (
              <div style={{flex:1,overflowY:'auto',padding:'12px 16px'}}>
                <pre style={{fontFamily:'"JetBrains Mono",monospace',fontSize:11,lineHeight:1.7,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
                  {displayCode.split('\n').map((line,i)=>{
                    const isTag=/^\s*</.test(line);const hasClass=line.includes('class=');const hasStr=(line.includes('"')&&!hasClass)||line.includes("'");
                    return <span key={i} style={{color:isTag?'var(--code-blue)':hasClass?'var(--code-green)':hasStr?'var(--code-orange)':'var(--code-text)'}}>{line+'\n'}</span>;
                  })}
                </pre>
              </div>
            ) : (
              <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px',textAlign:'center'}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>No file open</div>
                  <div style={{fontSize:11.5,color:'var(--text-3)',marginTop:6,lineHeight:1.5}}>Open a file from the browser or workspace to inspect and edit it here.</div>
                </div>
              </div>
            )
          )}
        </div>
      ):(
        <div style={{flex:1,display:'flex',flexDirection:'column'}}>
          <div style={{flex:1,overflowY:'auto',padding:'12px 14px',display:'flex',flexDirection:'column',gap:3}}>
            {terminalHistory.length === 0 ? (
              <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center'}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>No terminal history</div>
                  <div style={{fontSize:11.5,color:'var(--text-3)',marginTop:6,lineHeight:1.5}}>Run a command to start a terminal session for this workspace.</div>
                </div>
              </div>
            ) : terminalHistory.map((l,i)=><div key={l.id || i} style={{fontFamily:'"JetBrains Mono",monospace',fontSize:11.5,lineHeight:1.6,color:l.type==='cmd'?'var(--code-green)':l.type==='err'?'var(--red)':'var(--code-text)',whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{l.text}</div>)}
          </div>
          <div style={{padding:'8px 12px',borderTop:'1px solid var(--code-border)',display:'flex',gap:6,alignItems:'center',flexShrink:0}}>
            <span style={{fontFamily:'"JetBrains Mono",monospace',fontSize:11.5,color:'var(--code-green)',flexShrink:0}}>$</span>
            <input value={termInput} onChange={e=>setTermInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&runCmd()} placeholder="run a command…" style={{flex:1,background:'none',border:'none',outline:'none',fontFamily:'"JetBrains Mono",monospace',fontSize:11.5,color:'var(--code-text)',caretColor:'var(--code-green)'}}/>
          </div>
        </div>
      )}
    </div>
  );
};
