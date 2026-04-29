import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio } from './tweaks-panel.jsx';
import { Icon } from './components/icons.jsx';
import { StatusBadge, Toggle } from './components/primitives.jsx';
import { TypingIndicator, AgentCard, ToolCallCard, Message } from './components/chat.jsx';
import { InputBar } from './components/chatInput.jsx';
import { ContextPanel, NotifPanel, QuickCapture, SmsFloat, SplitPane, TrayFlyout } from './components/overlays.jsx';
import { mapAgentRun } from './lib/agentRuns.js';
import { dismissNotification, markAllNotificationsRead, normalizeEventList, normalizeNotificationList, upsertEvent, upsertNotification } from './lib/activity.js';
import { formatRelativeTime } from './lib/time.js';
import { normalizeThread, normalizeThreadList } from './lib/threads.js';
import { AgentDashboard } from './views/AgentDashboard.jsx';
import { AutomationsView } from './views/AutomationsView.jsx';
import { FileBrowser } from './views/FileBrowser.jsx';
import { MobileCompanion } from './views/MobileCompanion.jsx';
import { AgentBuilder } from './views/AgentBuilder.jsx';
import { SettingsView } from './views/SettingsView.jsx';
import { TimelineView } from './views/TimelineView.jsx';
import { WorkspaceView } from './views/WorkspaceView.jsx';
import './styles.css';

/* ══════════════════════════════════════════════════════
   WINDOWS TITLE BAR
══════════════════════════════════════════════════════ */
const WinTitleBar = ({dark, onTray, unreadCount, lmStatus, updateInfo, onDownload, onInstall}) => {
  const [maximized, setMaximized] = useState(false);
  const [showUpdateMenu, setShowUpdateMenu] = useState(false);
  const api = window.electronAPI;

  const handleWinBtn = key => {
    if (key === 'min')   { api?.minimize(); }
    if (key === 'max')   { setMaximized(m => !m); api?.maximize(); }
    if (key === 'close') { api?.close(); }
  };

  return (
    <div className="titlebar-drag" style={{height:32,background:'var(--bg-sidebar)',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',flexShrink:0,userSelect:'none',zIndex:50}}>
      <div style={{width:52,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
        <div style={{width:18,height:18,borderRadius:5,background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <span style={{fontSize:10,color:'#fff',fontWeight:800,letterSpacing:'-0.04em'}}>M</span>
        </div>
      </div>
      <span style={{fontSize:12,color:'var(--text-3)',flex:1,fontWeight:400,letterSpacing:'0.01em'}}>Meg</span>

      {/* Update Status Button */}
      {updateInfo && (
        <div style={{position:'relative',marginRight:12}} className="titlebar-nodrag">
          <button onClick={()=>setShowUpdateMenu(!showUpdateMenu)} style={{height:22,padding:'0 8px',borderRadius:4,background:updateInfo.status==='ready'?'var(--green-bg)':'var(--bg-active)',border:`1px solid ${updateInfo.status==='ready'?'var(--green-border)':'var(--border)'}`,display:'flex',alignItems:'center',gap:6,cursor:'pointer',transition:'all 0.2s'}}>
            <Icon name={updateInfo.status==='downloading'?'spinner':'bolt'} size={11} color={updateInfo.status==='ready'?'var(--green)':'var(--accent)'}/>
            <span style={{fontSize:10.5,fontWeight:600,color:updateInfo.status==='ready'?'var(--green)':'var(--text)'}}>
              {updateInfo.status==='available' ? 'Update' : updateInfo.status==='downloading' ? `${updateInfo.progress}%` : 'Ready'}
            </span>
          </button>
          {showUpdateMenu && (
            <div style={{position:'absolute',top:28,right:0,width:200,background:'var(--bg-panel)',border:'1px solid var(--border)',borderRadius:8,boxShadow:'0 8px 24px var(--shadow-lg)',padding:'8px',zIndex:2000}}>
              <div style={{fontSize:11,fontWeight:600,marginBottom:8,padding:'0 4px',color:'var(--text)'}}>Version {updateInfo.version}</div>
              {updateInfo.status === 'available' && <button onClick={()=>{onDownload();setShowUpdateMenu(false);}} style={{width:'100%',padding:'6px',borderRadius:4,background:'var(--accent)',color:'#fff',border:'none',fontSize:11,fontWeight:600,cursor:'pointer'}}>Download Now</button>}
              {updateInfo.status === 'downloading' && (
                <div style={{padding:'4px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:9,marginBottom:4,color:'var(--text-3)'}}><span>Downloading…</span><span>{updateInfo.progress}%</span></div>
                  <div style={{height:4,background:'var(--border)',borderRadius:2,overflow:'hidden'}}><div style={{height:'100%',width:`${updateInfo.progress}%`,background:'var(--accent)',transition:'width 0.2s linear'}}/></div>
                </div>
              )}
              {updateInfo.status === 'ready' && <button onClick={onInstall} style={{width:'100%',padding:'6px',borderRadius:4,background:'var(--green)',color:'#fff',border:'none',fontSize:11,fontWeight:600,cursor:'pointer'}}>Restart & Install</button>}
            </div>
          )}
        </div>
      )}

      {/* LM Studio connection dot */}
      {lmStatus !== undefined && (
        <div style={{display:'flex',alignItems:'center',gap:4,marginRight:8}} title={lmStatus ? 'LM Studio connected' : 'LM Studio offline'}>
          <div style={{width:6,height:6,borderRadius:'50%',background:lmStatus?'var(--green)':'var(--red)',flexShrink:0}}/>
          <span style={{fontSize:10.5,color:'var(--text-3)'}}>{lmStatus ? 'connected' : 'offline'}</span>
        </div>
      )}
      {/* Tray indicator */}
      <button className="titlebar-nodrag win-btn" onClick={onTray} style={{width:36,height:32,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-3)',background:'transparent',border:'none',cursor:'pointer',transition:'background 0.1s',position:'relative'}} title="Tray">
        <Icon name="tray" size={14}/>
        {unreadCount>0 && <div style={{position:'absolute',top:6,right:6,width:8,height:8,borderRadius:'50%',background:'var(--orange)',border:'2px solid var(--bg-sidebar)'}}/>}
      </button>
      {/* Windows controls */}
      <div className="titlebar-nodrag" style={{display:'flex',height:'100%'}}>
        {[
          {label:'─', key:'min', cls:'win-btn'},
          {label: maximized ? '❐' : '□', key:'max', cls:'win-btn'},
          {label:'✕', key:'close', cls:'win-close'},
        ].map(btn=>(
          <button key={btn.key} className={btn.cls} onClick={()=>handleWinBtn(btn.key)} style={{width:46,height:32,display:'flex',alignItems:'center',justifyContent:'center',fontSize:btn.key==='min'?18:12,color:'var(--text-3)',background:'transparent',border:'none',cursor:'pointer',transition:'background 0.1s,color 0.1s',lineHeight:1,letterSpacing:btn.key==='min'?'-2px':'0'}}>
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   NAV TRANSITION WRAPPER
══════════════════════════════════════════════════════ */
const NavSection = ({id, children}) => (
  <div key={id} className="nav-section" style={{flex:1,display:'flex',minWidth:0,overflow:'hidden'}}>
    {children}
  </div>
);

const buildQuickCaptureItems = (threads = [], events = []) => {
  const threadItems = threads
    .filter(t => t?.title && t.title !== 'New chat')
    .slice(0, 2)
    .map(t => `Continue: ${t.title}`);
  const eventItems = events
    .filter(e => e?.title)
    .slice(0, 2)
    .map(e => `Follow up: ${e.title}`);
  return [...new Set([...threadItems, ...eventItems])].slice(0, 4);
};

const DEFAULT_THREAD_TOOLS = {
  Terminal: false,
  Browser: false,
  'File system': false,
};

const createThreadRecord = (id) => {
  const now = new Date().toISOString();
  return normalizeThread({
    id,
    iconName: 'chat',
    title: 'New chat',
    subtitle: 'Start a conversation',
    unread: false,
    messages: [],
    files: [],
    tools: { ...DEFAULT_THREAD_TOOLS },
    memory: '',
    createdAt: now,
    updatedAt: now,
  });
};

const getWorkspaceThreadFields = (workspace) => {
  if (!workspace) return {};
  return {
    workspaceId: workspace.id || null,
    workspaceName: workspace.name || null,
    workspacePath: workspace.path || null,
  };
};

const buildApprovalNotification = (approval) => ({
  id: `approval:${approval.id}`,
  kind: 'approval',
  icon: 'lock',
  color: 'var(--accent)',
  title: 'Tool approval requested',
  body: approval.tool === 'run_command' ? approval.args?.command : approval.args?.path,
  createdAt: new Date().toISOString(),
  read: false,
});

const buildTelegramNotification = (message, fallbackChatId) => ({
  id: `telegram:${message.chatId || fallbackChatId || 'unknown'}:${message.message_id || message.id || message.date || message.text || Date.now()}`,
  kind: 'telegram',
  icon: 'sms',
  color: 'var(--accent)',
  title: `Telegram from ${message.from || 'Unknown'}`,
  body: `"${message.text || ''}"`,
  createdAt: message.date ? new Date(message.date * 1000).toISOString() : new Date().toISOString(),
  read: false,
});

const buildTelegramEvent = (message) => ({
  id: `telegram-event:${message.chatId || 'unknown'}:${message.message_id || message.id || message.date || message.text || Date.now()}`,
  type: 'sms',
  icon: 'sms',
  color: 'var(--accent)',
  title: `Telegram from ${message.from || 'Unknown'}`,
  detail: `"${message.text || ''}"`,
  ws: '—',
  createdAt: message.date ? new Date(message.date * 1000).toISOString() : new Date().toISOString(),
});

const resolveThemeDarkMode = (themeChoice) => {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme:dark)').matches;
  return themeChoice === 'dark' || (themeChoice === 'system' && prefersDark);
};

const readPreviewStorage = (key, fallback) => {
  if (window.electronAPI) return fallback;
  const value = localStorage.getItem(key);
  return value ?? fallback;
};

const writePreviewStorage = (key, value) => {
  if (window.electronAPI) return;
  localStorage.setItem(key, value);
};

/* ══════════════════════════════════════════════════════
   ONBOARDING  (animated, direction-aware)
══════════════════════════════════════════════════════ */
const Onboarding = ({onDone, onModelChange, onOpenSettings, currentModel, telegramConnected, lmStatus}) => {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1); // 1=forward, -1=back
  const [model, setModel] = useState(currentModel || 'qwen/qwen3.5-9b');
  const steps = ['Welcome','Model','Setup','Done'];
  const go = d => { setDir(d); setStep(s => s + d); };

  const pickModel = m => { setModel(m); onModelChange?.(m); };

  const MODELS = [
    {id:'qwen/qwen3.5-9b',label:'qwen/qwen3.5-9b',tag:'Local',desc:'Runs via LM Studio — private & offline'},
    {id:'claude-3-5-sonnet',label:'claude-3-5-sonnet',tag:'Anthropic',desc:'Best for complex tasks & code'},
    {id:'claude-3-5-haiku',label:'claude-3-5-haiku',tag:'Anthropic',desc:'Quick responses, lower cost'},
    {id:'gpt-4o',label:'gpt-4o',tag:'OpenAI',desc:'Strong general-purpose model'},
  ];

  const animation = dir > 0 ? 'stepFwd 0.28s cubic-bezier(0.22,1,0.36,1) both' : 'stepBack 0.28s cubic-bezier(0.22,1,0.36,1) both';

  return (
    <div style={{position:'fixed',inset:0,zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',animation:'backdropIn 0.25s ease'}}>
      {/* Layered backdrop: blur + vignette */}
      <div style={{position:'absolute',inset:0,background:'rgba(8,6,18,0.72)',backdropFilter:'blur(8px) saturate(0.7)'}}/>
      <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 50% 40%, transparent 40%, rgba(0,0,0,0.3) 100%)'}}/>

      <div style={{width:500,background:'var(--bg-2)',borderRadius:20,overflow:'hidden',boxShadow:'0 48px 120px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)',position:'relative',animation:'modalIn 0.38s cubic-bezier(0.22,1,0.36,1)'}}>
        {/* Top progress track — gradient fill */}
        <div style={{height:3,background:'var(--border)'}}>
          <div style={{height:'100%',width:`${(step/(steps.length-1))*100}%`,background:'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #fff))',transition:'width 0.4s cubic-bezier(0.22,1,0.36,1)',borderRadius:99,boxShadow:'0 0 8px var(--accent-border)'}}/>
        </div>

        {/* Step dots */}
        <div style={{display:'flex',gap:0,padding:'20px 36px 0',alignItems:'center'}}>
          {steps.map((s,i)=>(
            <React.Fragment key={i}>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                <div style={{width:22,height:22,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:i<step?'var(--accent)':i===step?'var(--accent)':'var(--bg-active)',border:`2px solid ${i<=step?'var(--accent)':'var(--border)'}`,transition:'all 0.25s',boxShadow:i===step?`0 0 0 3px var(--accent-bg)`:'none'}}>
                  {i<step ? <Icon name="check" size={11} color="var(--bg-2)"/> : <span style={{fontSize:9,color:i===step?'var(--bg-2)':'var(--text-3)',fontWeight:700}}>{i+1}</span>}
                </div>
                <span style={{fontSize:10,color:i===step?'var(--text)':i<step?'var(--accent)':'var(--text-3)',fontWeight:i===step?600:400,transition:'color 0.2s'}}>{s}</span>
              </div>
              {i<steps.length-1 && <div style={{flex:1,height:1.5,background:i<step?'var(--accent)':'var(--border)',margin:'0 4px 14px',transition:'background 0.3s'}}/>}
            </React.Fragment>
          ))}
        </div>

        {/* Step content — keyed so it re-mounts and re-animates */}
        <div key={step} style={{padding:'24px 36px 8px',minHeight:300,animation}}>

          {step===0 && (
            <div>
              <div style={{width:48,height:48,borderRadius:12,background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:16,boxShadow:`0 8px 20px rgba(59,110,255,0.35)`}}>
                <span style={{fontSize:22,color:'#fff',fontWeight:800,letterSpacing:'-0.04em'}}>M</span>
              </div>
              <h1 style={{fontSize:21,fontWeight:700,color:'var(--text)',marginBottom:8,letterSpacing:'-0.02em'}}>Meet Meg</h1>
              <p style={{fontSize:13.5,color:'var(--text-2)',lineHeight:1.7,marginBottom:20}}>
                Meg runs locally, can work across your files and tools, and can message you through connected integrations.
              </p>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {[
                  {icon:'agent',label:'Runs agents autonomously in the background'},
                  {icon:'code',label:'Writes, executes, and debugs code'},
                  {icon:'sms',label:'Uses Telegram when you connect it'},
                  {icon:'memory',label:'Keeps session state and saved memories'},
                ].map((f,i)=>(
                  <div key={i} className="ob-feature" style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0'}}>
                    <div style={{width:28,height:28,borderRadius:7,background:'var(--accent-bg)',border:'1px solid var(--accent-border)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <Icon name={f.icon} size={14} color="var(--accent)"/>
                    </div>
                    <span style={{fontSize:13,color:'var(--text-2)'}}>{f.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step===1 && (
            <div>
              <h2 style={{fontSize:18,fontWeight:700,color:'var(--text)',marginBottom:6,letterSpacing:'-0.02em'}}>Choose your model</h2>
              <p style={{fontSize:13,color:'var(--text-3)',marginBottom:16,lineHeight:1.6}}>Default for all tasks. You can change it anytime in Settings.</p>
              <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:16}}>
                {MODELS.map(m=>(
                  <label key={m.id} onClick={()=>pickModel(m.id)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:8,border:`1.5px solid ${model===m.id?'var(--accent-border)':'var(--border)'}`,background:model===m.id?'var(--accent-bg)':'var(--bg-panel)',cursor:'pointer',transition:'all 0.15s'}}>
                    <div style={{width:16,height:16,borderRadius:'50%',border:`2px solid ${model===m.id?'var(--accent)':'var(--border)'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'border-color 0.15s'}}>
                      {model===m.id && <div style={{width:7,height:7,borderRadius:'50%',background:'var(--accent)'}}/>}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12.5,fontFamily:'"JetBrains Mono",monospace',color:model===m.id?'var(--accent)':'var(--text)',fontWeight:model===m.id?500:400}}>{m.label}</div>
                      <div style={{fontSize:11,color:'var(--text-3)',marginTop:1}}>{m.desc}</div>
                    </div>
                    <span style={{fontSize:10,padding:'2px 6px',borderRadius:99,background:model===m.id?'var(--accent)':'var(--bg-active)',color:model===m.id?'#fff':'var(--text-3)',fontWeight:500,flexShrink:0,transition:'all 0.15s'}}>{m.tag}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step===2 && (
            <div>
              <h2 style={{fontSize:18,fontWeight:700,color:'var(--text)',marginBottom:6,letterSpacing:'-0.02em'}}>Complete setup in Settings</h2>
              <p style={{fontSize:13,color:'var(--text-3)',marginBottom:18,lineHeight:1.6}}>Connections, API keys, and tool permissions are configured in Settings. This screen shows the current live status instead of simulating setup.</p>
              {[
                {label:'LM Studio',detail:lmStatus === true ? 'Connected' : lmStatus === false ? 'Offline' : 'Not checked yet', icon:'terminal', ok:lmStatus === true},
                {label:'Telegram',detail:telegramConnected ? 'Connected' : 'Not connected', icon:'sms', ok:telegramConnected},
                {label:'Tool permissions',detail:'Manage read/write/terminal/web access in Settings', icon:'lock', ok:null},
                {label:'Provider keys',detail:'Configure cloud provider keys in Settings if needed', icon:'key', ok:null},
              ].map((item)=>(
                <div key={item.label} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid var(--border-light)'}}>
                  <div style={{width:32,height:32,borderRadius:8,background:item.ok === true ? 'var(--accent-bg)' : 'var(--bg-active)',border:`1px solid ${item.ok === true ? 'var(--accent-border)' : 'var(--border)'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <Icon name={item.icon} size={15} color={item.ok === true ? 'var(--accent)' : 'var(--text-3)'}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:500,color:'var(--text)'}}>{item.label}</div>
                    <div style={{fontSize:11.5,color:'var(--text-3)'}}>{item.detail}</div>
                  </div>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'flex-end',marginTop:16}}>
                <button onClick={onOpenSettings} style={{padding:'8px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-panel)',fontSize:12.5,color:'var(--text-2)',cursor:'pointer'}}>
                  Open Settings
                </button>
              </div>
            </div>
          )}

          {step===3 && (
            <div style={{textAlign:'center',padding:'20px 0 8px'}}>
              <div style={{width:64,height:64,borderRadius:'50%',background:'var(--green-bg)',border:'2px solid var(--green-border)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px',animation:'pulseGreen 2s ease infinite'}}>
                <Icon name="check" size={26} color="var(--green)"/>
              </div>
              <h2 style={{fontSize:20,fontWeight:700,color:'var(--text)',marginBottom:10,letterSpacing:'-0.02em'}}>Meg is ready</h2>
              <p style={{fontSize:13.5,color:'var(--text-2)',lineHeight:1.8,marginBottom:20}}>
                Model: <code style={{fontFamily:'"JetBrains Mono",monospace',fontSize:12,background:'var(--bg-active)',padding:'1px 6px',borderRadius:4,color:'var(--text)'}}>{model}</code><br/>
                <span style={{fontSize:12,color:'var(--text-3)'}}>Telegram: {telegramConnected ? 'connected' : 'not connected'} · LM Studio: {lmStatus === true ? 'connected' : lmStatus === false ? 'offline' : 'not checked'}</span>
              </p>
              <p style={{fontSize:12.5,color:'var(--text-3)',lineHeight:1.7}}>
                Start in chat, then finish any missing setup in Settings when you need a capability.<br/>
                Press <kbd style={{background:'var(--bg-active)',padding:'2px 6px',borderRadius:4,fontSize:11,border:'1px solid var(--border)',color:'var(--text)'}}>⌘K</kbd> anytime to search or run a command.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{padding:'16px 36px 28px',display:'flex',justifyContent:'space-between',alignItems:'center',borderTop:'1px solid var(--border-light)',marginTop:8}}>
          <button onClick={()=>step>0&&go(-1)} style={{fontSize:13,color:step===0?'transparent':'var(--text-3)',pointerEvents:step===0?'none':'auto',transition:'color 0.2s,transform 0.15s',padding:'6px 0',background:'none',border:'none'}}
            onMouseEnter={e=>{if(step>0){e.currentTarget.style.color='var(--text-2)';e.currentTarget.style.transform='translateX(-2px)';}}}
            onMouseLeave={e=>{e.currentTarget.style.color='var(--text-3)';e.currentTarget.style.transform='translateX(0)';}}>
            ← Back
          </button>
          <button onClick={()=>{
            step<steps.length-1?go(1):onDone();
          }} className="btn-pressable"
            style={{padding:'10px 28px',borderRadius:10,background:'var(--accent)',color:'#fff',fontSize:13.5,fontWeight:600,border:'none',cursor:'pointer',boxShadow:'0 4px 16px rgba(59,110,255,0.3)',letterSpacing:'-0.01em',transition:'opacity 0.15s,box-shadow 0.15s'}}
            onMouseEnter={e=>{e.currentTarget.style.opacity='0.9';e.currentTarget.style.boxShadow='0 6px 20px rgba(59,110,255,0.4)';}}
            onMouseLeave={e=>{e.currentTarget.style.opacity='1';e.currentTarget.style.boxShadow='0 4px 16px rgba(59,110,255,0.3)';}}>
            {step===steps.length-1?'Start using Meg →':'Continue →'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   COMMAND PALETTE
══════════════════════════════════════════════════════ */
const CMD_ITEMS = [
  {group:'Commands',icon:'timeline',label:'Activity timeline',action:'nav',id:'timeline'},
  {group:'Commands',icon:'zap',label:'Automations',action:'nav',id:'automations'},
  {group:'Commands',icon:'plus',label:'New chat',action:'new-chat'},
  {group:'Commands',icon:'workspace',label:'Workspace',action:'nav',id:'workspace'},
  {group:'Commands',icon:'agent',label:'View running agents',action:'nav',id:'agent'},
  {group:'Commands',icon:'build',label:'Agent builder',action:'nav',id:'build'},
  {group:'Commands',icon:'files',label:'File browser',action:'nav',id:'filebrowser'},
  {group:'Commands',icon:'mobile',label:'Telegram companion',action:'nav',id:'mobile'},
  {group:'Commands',icon:'settings',label:'Settings',action:'nav',id:'settings'},
  {group:'Commands',icon:'bell',label:'Notifications',action:'notif'},
];

const CommandPalette = ({onClose,onAction,threads,workspaces,activeFile}) => {
  const [query,setQuery] = useState('');
  const [cursor,setCursor] = useState(0);
  const inputRef = useRef(null);
  useEffect(()=>{inputRef.current?.focus();},[]);

  // Build dynamic items
  const threadItems = (threads||[]).map(t => ({ group:'Chats', icon:'sms', label:t.title, action:'open-chat', id:t.id }));
  const wsItems = (workspaces||[]).map(w => ({ group:'Workspaces', icon:'workspace', label:w.name, action:'nav', id:'workspace', wsId:w.id }));
  const fileItems = activeFile ? [{ group:'Active File', icon:'doc', label:activeFile.name, action:'nav', id:'filebrowser' }] : [];
  
  const allItems = [...threadItems, ...wsItems, ...fileItems, ...CMD_ITEMS.filter(i => i.group === 'Commands')];

  const filtered = query ? allItems.filter(i=>i.label.toLowerCase().includes(query.toLowerCase())) : allItems;
  const grouped = filtered.reduce((acc,item)=>{ (acc[item.group]=acc[item.group]||[]).push(item); return acc; },{});

  const handleKey = e => {
    if (e.key==='ArrowDown'){e.preventDefault();setCursor(c=>Math.min(c+1,filtered.length-1));}
    if (e.key==='ArrowUp'){e.preventDefault();setCursor(c=>Math.max(c-1,0));}
    if (e.key==='Enter'){e.preventDefault();if(filtered[cursor]){onAction(filtered[cursor]);onClose();}}
    if (e.key==='Escape') onClose();
  };
  return (
    <div style={{position:'fixed',inset:0,zIndex:900,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:80,animation:'backdropIn 0.15s ease'}} onClick={onClose}>
      <div style={{background:'rgba(10,8,20,0.6)',position:'absolute',inset:0,backdropFilter:'blur(3px)'}}/>
      <div style={{width:520,background:'var(--bg-2)',borderRadius:12,overflow:'hidden',boxShadow:`0 24px 60px var(--shadow-lg)`,animation:'modalIn 0.18s cubic-bezier(0.22,1,0.36,1)',position:'relative',border:'1px solid var(--border)'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',borderBottom:'1px solid var(--border-light)'}}>
          <Icon name="search" size={16} color="var(--text-3)"/>
          <input ref={inputRef} value={query} onChange={e=>{setQuery(e.target.value);setCursor(0);}} onKeyDown={handleKey} placeholder="Search chats, workspaces, commands…" style={{flex:1,border:'none',outline:'none',fontSize:14,color:'var(--text)',background:'none'}}/>
          <kbd style={{fontSize:11,color:'var(--text-3)',background:'var(--bg-active)',padding:'2px 6px',borderRadius:4,border:'1px solid var(--border)',flexShrink:0}}>Esc</kbd>
        </div>
        <div style={{maxHeight:360,overflowY:'auto'}}>
          {Object.entries(grouped).map(([group,items])=>(
            <div key={group}>
              <div style={{padding:'8px 16px 4px',fontSize:10.5,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em'}}>{group}</div>
              {items.map(item=>{
                const i = filtered.indexOf(item); const active = cursor===i;
                return (
                  <button key={item.label + item.id} onClick={()=>{onAction(item);onClose();}} onMouseEnter={()=>setCursor(i)}
                    style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'8px 16px',background:active?'var(--accent-bg)':'transparent',border:'none',cursor:'pointer',textAlign:'left',transition:'background 0.08s'}}>
                    <div style={{width:26,height:26,borderRadius:6,background:active?'var(--accent)':'var(--bg-active)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'background 0.08s'}}>
                      <Icon name={item.icon} size={13} color={active?'#fff':'var(--text-3)'}/>
                    </div>
                    <span style={{fontSize:13.5,color:active?'var(--accent)':'var(--text)',fontWeight:active?500:400}}>{item.label}</span>
                    <span style={{marginLeft:'auto',fontSize:11,color:'var(--text-3)'}}>{item.group}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length===0 && <div style={{padding:'24px 16px',textAlign:'center',color:'var(--text-3)',fontSize:13}}>No results for "{query}"</div>}
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   APP
══════════════════════════════════════════════════════ */
const App = () => {
  const [tweaks, setTweak] = useTweaks(/*EDITMODE-BEGIN*/{
    "accentColor": "blue",
    "sidebarWidth": "comfortable"
  }/*EDITMODE-END*/, {
    load: () => {
      if (window.electronAPI?.getSetting) return window.electronAPI.getSetting('rendererTweaks');
      try {
        return JSON.parse(localStorage.getItem('meg:tweaks') || 'null');
      } catch {
        return null;
      }
    },
    save: (next) => {
      if (window.electronAPI?.setSetting) return window.electronAPI.setSetting('rendererTweaks', next);
      localStorage.setItem('meg:tweaks', JSON.stringify(next));
      return true;
    },
  });
  const accent = tweaks.accentColor;
  const sidebarW = tweaks.sidebarWidth === 'compact' ? 190 : 230;
  const [themeChoice, setThemeChoice] = useState('light');
  const dark = resolveThemeDarkMode(themeChoice);

  const [showOnboarding, setShowOnboarding] = useState(() => readPreviewStorage('meg:onboarded', 'false') !== 'true');
  const [cmdOpen, setCmdOpen] = useState(false);
  const [quickCapOpen, setQuickCapOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(() => readPreviewStorage('meg:splitOpen', 'false') === 'true');
  const [nav, setNav] = useState('chat');
  const [activeId, setActiveId] = useState(null);
  const [threads, setThreads] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [events, setEvents] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [activeAgents, setActiveAgents] = useState([]);
  const [typing, setTyping] = useState(false);
  const [lmStatus, setLmStatus] = useState(undefined);
  const [activeModel, setActiveModel] = useState('qwen/qwen3.5-9b');
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memories, setMemories] = useState([]);
  const [integrations, setIntegrations] = useState({Telegram:false, GitHub:false});
  const [tgStatus, setTgStatus] = useState(null);
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramMessages, setTelegramMessages] = useState([]);
  const [telegramSendError, setTelegramSendError] = useState(null);

  const getTelegramToken = useCallback(() => telegramToken, [telegramToken]);
  const getTelegramChatId = useCallback(() => telegramChatId, [telegramChatId]);
  const telegramConnected = Boolean(integrations.Telegram && getTelegramToken() && getTelegramChatId());
  const telegramContactName = tgStatus?.name || tgStatus?.username ? `Meg / ${tgStatus?.name || `@${tgStatus?.username}`}` : 'Meg';

  const appendTelegramMessage = useCallback((message) => {
    setTelegramMessages(prev => {
      if (prev.some(item => item.id === message.id)) return prev;
      return [...prev, message];
    });
  }, []);

  const sendTelegramMessage = useCallback(async (text) => {
    const token = getTelegramToken();
    const chatId = getTelegramChatId();
    if (!token || !chatId || !window.electronAPI) {
      setTelegramSendError('Telegram is not connected yet.');
      return { ok: false, error: 'Telegram is not connected yet.' };
    }
    setTelegramSendError(null);
    const message = {
      id: `tg-out-${Date.now()}`,
      direction: 'outbound',
      from: 'Meg',
      text,
      chatId,
      createdAt: new Date().toISOString(),
      status: 'sent',
    };
    appendTelegramMessage(message);
    const result = await window.electronAPI.sendTelegram({ token, chatId, text });
    if (!result?.ok) {
      setTelegramSendError(result?.error || 'Failed to send Telegram message.');
      setTelegramMessages(prev => prev.map(item => item.id === message.id ? { ...item, status: 'failed' } : item));
      return result;
    }
    return result;
  }, [appendTelegramMessage, getTelegramChatId, getTelegramToken]);

  const validateTg = async (token) => {
    if(!token.trim()) return;
    setTgStatus('checking');
    const r = await window.electronAPI?.validateTelegramToken(token);
    if (!r?.ok) { setTgStatus(r || {ok:false,error:'Invalid token'}); return; }
    setTgStatus({ ok: true, username: r.username, waiting: true });
    
    let found = false;
    for (let i=0; i<60; i++) {
      const cr = await window.electronAPI?.findTelegramChatId(token);
      if (cr?.ok) {
        setTgStatus({ ok: true, username: r.username, name: cr.from });
        setIntegrations(s=>({...s,Telegram:true}));
        setTelegramToken(token);
        setTelegramChatId(cr.chatId);
        window.electronAPI?.setSetting('telegramChatId', cr.chatId);
        window.electronAPI?.startTelegramPolling(token);
        await window.electronAPI?.sendTelegram({
          token, chatId: cr.chatId,
          text: "✦ Meg: Connection Established! ✦\nI am now linked to your local system."
        });
        found = true; break;
      }
      await new Promise(res => setTimeout(res, 1000));
    }
    if (!found) setTgStatus({ ok: false, error: 'Timed out. Try again.' });
  };

  const [activeFile, setActiveFile] = useState(null); // {name, path, content, ext}
  const [hoveredThread, setHoveredThread] = useState(null);
  const [thinking, setThinking] = useState(true);
  const [updateInfo, setUpdateInfo] = useState(null); // {version, progress, status: 'available'|'downloading'|'ready'}
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const isThinkingModel = m => /qwen3|deepseek.?r1|thinking/i.test(m||'');
  const dbLoaded = useRef(false);
  const messagesEndRef = useRef(null);
  const activeIdRef = useRef(activeId);
  useEffect(()=>{ activeIdRef.current = activeId; }, [activeId]);

  const upsertAgentRun = useCallback((run) => {
    if(!run) return;
    const mapped = mapAgentRun(run);
    setActiveAgents(prev => [mapped, ...prev.filter(a => a.id !== mapped.id)]);
  }, []);

  const updateThreads = useCallback((updater) => {
    setThreads((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      return normalizeThreadList(next);
    });
  }, []);

  const thread = threads.find(t=>t.id===activeId);
  const unreadNotifs = notifs.filter(n=>!n.read).length;
  const pendingApprovalCount = approvals.filter(a=>a.status==='pending').length;
  const runningAgent = threads.some(t=>t.messages.some(m=>m.role==='agent'&&m.status==='running'));
  const quickCaptureItems = buildQuickCaptureItems(threads, events);

  const setOnboardingCompleted = useCallback((completed) => {
    setShowOnboarding(!completed);
    writePreviewStorage('meg:onboarded', completed ? 'true' : 'false');
    window.electronAPI?.setSetting?.('onboardingCompleted', completed);
  }, []);

  const applyThemeChoice = useCallback((themeChoice, { persist = true } = {}) => {
    setThemeChoice(themeChoice);
    if (persist) {
      writePreviewStorage('meg:theme', themeChoice);
      window.electronAPI?.setSetting?.('theme', themeChoice);
    }
  }, []);

  // ── Auto Updater Listeners ──────────────────────────────
  useEffect(()=>{
    if(!window.electronAPI) return;
    const api = window.electronAPI;
    api.onUpdateAvailable(info => {
      setIsCheckingUpdate(false);
      setUpdateInfo({ version: info.version, status: 'available', progress: 0 });
    });
    api.onUpdateNotAvailable(() => {
      setIsCheckingUpdate(false);
    });
    api.onUpdateProgress(prog => setUpdateInfo(prev => ({ ...prev, status: 'downloading', progress: Math.round(prog.percent) })));
    api.onUpdateDownloaded(() => setUpdateInfo(prev => ({ ...prev, status: 'ready' })));
    api.onUpdateError(err => { 
      setIsCheckingUpdate(false);
      console.error('Update error:', err); 
      setUpdateInfo(null); 
    });
  }, []);

  // Dark mode
  useEffect(()=>{
    document.body.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.getSetting('onboardingCompleted').then((value) => {
      setShowOnboarding(typeof value === 'boolean' ? !value : true);
    });
    window.electronAPI.getSetting('splitOpen').then((value) => {
      setSplitOpen(typeof value === 'boolean' ? value : false);
    });
    window.electronAPI.getSetting('theme').then((value) => {
      if (typeof value === 'string' && value.trim()) {
        applyThemeChoice(value, { persist: false });
      }
    });
  }, [applyThemeChoice]);

  // Accent color CSS vars
  useEffect(()=>{
    const map = {blue:'#3b6eff',warm:'#e07a30',green:'#1a9e5c'};
    const bgMap = {blue:'#eef3ff',warm:'#fff4ec',green:'#edfaf4'};
    const bdMap = {blue:'#c5d4ff',warm:'#fcd4b0',green:'#b8ecd6'};
    const darkBgMap = {blue:'#1a2040',warm:'#2d1a0a',green:'#0a2018'};
    const darkBdMap = {blue:'#2a3860',warm:'#3d2510',green:'#1a3828'};
    document.documentElement.style.setProperty('--accent', map[accent]||map.blue);
    document.documentElement.style.setProperty('--accent-bg', dark?(darkBgMap[accent]||darkBgMap.blue):(bgMap[accent]||bgMap.blue));
    document.documentElement.style.setProperty('--accent-border', dark?(darkBdMap[accent]||darkBdMap.blue):(bdMap[accent]||bdMap.blue));
  }, [accent, dark]);

  // ⌘K and Ctrl+Shift+M
  useEffect(()=>{
    const h = e => {
      if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();setCmdOpen(o=>!o);}
      if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key==='M'){e.preventDefault();setQuickCapOpen(o=>!o);}
    };
    window.addEventListener('keydown',h);
    return ()=>window.removeEventListener('keydown',h);
  },[]);

  // ── Auto-scroll to bottom ──
  useEffect(()=>{
    if(nav === 'chat' && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  },[activeId, threads, typing, nav]);

  const [version, setVersion] = useState('1.0.0-beta.3'); // Fallback
  const isPreviewMode = !window.electronAPI;

  useEffect(() => {
    if(window.electronAPI) {
      window.electronAPI.getVersion().then(v => setVersion(v));
    }
  }, []);

  // ── Load persisted app state on mount ────────────────────────
  useEffect(()=>{
    if(!window.electronAPI) return;
    window.electronAPI.dbLoad('threads').then(data=>{
      dbLoaded.current = true;
      if(data?.length){
        setThreads(normalizeThreadList(data));
        window.electronAPI.getSetting('lastActiveThreadId').then(id=>{
          setActiveId((id && data.find(t=>t.id===id)) ? id : data[0].id);
        });
      }
    });
    window.electronAPI.dbLoad('notifications').then(data => {
      setNotifs(normalizeNotificationList(data));
    });
    window.electronAPI.dbLoad('events').then(data=>{
      setEvents(normalizeEventList(data));
    });
    window.electronAPI.dbLoad('workspaces').then(data=>{
      if(data?.length) setWorkspaces(data);
    });
    window.electronAPI.dbLoad('telegramMessages').then(data=>{
      if(Array.isArray(data)) setTelegramMessages(data);
    });
    window.electronAPI.getSetting('memoryEnabled').then(value => {
      if (typeof value === 'boolean') setMemoryEnabled(value);
    });
    window.electronAPI.getSetting('memories').then(value => {
      if (Array.isArray(value)) setMemories(value);
    });
    window.electronAPI.getSetting('telegramToken').then(value => {
      if (typeof value === 'string') setTelegramToken(value);
    });
    window.electronAPI.getSetting('telegramChatId').then(value => {
      if (typeof value === 'string') setTelegramChatId(value);
    });
    window.electronAPI.listWorkspaces?.().then(data=>{
      if(data?.length) setWorkspaces(ws=>[
        ...data.map(w=>({
          ...w,
          branch:'main',
          dirty:0,
          ahead:0,
          lang:w.lang || '',
          color:w.color || 'var(--accent)',
          lastActive:w.lastActive || w.lastActiveAt || w.updatedAt || w.createdAt || null,
          desc:w.path,
          agents:0,
          threads:0,
          files:typeof w.files === 'number' ? w.files : 0,
          inventory:Array.isArray(w.inventory) ? w.inventory : [],
          inventoryTruncated:Boolean(w.inventoryTruncated),
        })),
        ...ws.filter(w=>!data.some(x=>x.path===w.path))
      ]);
    });
    window.electronAPI.getActiveWorkspace?.().then(w=>{
      if(w) setActiveWorkspace(w);
    });
    window.electronAPI.listAgentRuns?.().then(runs=>{
      if(runs?.length) setActiveAgents(runs.map(mapAgentRun));
    });
    window.electronAPI.listApprovals?.().then(items=>{
      if(items?.length) setApprovals(items);
    });
  },[]);

  useEffect(() => {
    if (telegramToken && telegramChatId) {
      setIntegrations(prev => ({ ...prev, Telegram: true }));
    }
  }, [telegramToken, telegramChatId]);

  useEffect(()=>{
    if(!window.electronAPI?.onAgentChange) return;
    window.electronAPI.onAgentChange(({run})=>upsertAgentRun(run));
    return ()=>window.electronAPI.removeListeners('agent:change');
  },[upsertAgentRun]);

  useEffect(()=>{
    if(!window.electronAPI?.onApprovalChange) return;
    window.electronAPI.onApprovalChange(({type, approval})=>{
      setApprovals(prev => [approval, ...prev.filter(a=>a.id!==approval.id)]);
      if(type==='approval:created') {
        setNotifs((current) => upsertNotification(current, buildApprovalNotification(approval)));
        setTrayOpen(true);
      }
    });
    return ()=>window.electronAPI.removeListeners('approval:change');
  },[]);

  const approveTool = async (id) => {
    const r = await window.electronAPI?.approveToolCall(id);
    if(r?.approval) setApprovals(prev => [r.approval, ...prev.filter(a=>a.id!==id)]);
  };

  const denyTool = async (id) => {
    const r = await window.electronAPI?.denyToolCall(id);
    if(r?.approval) setApprovals(prev => [r.approval, ...prev.filter(a=>a.id!==id)]);
  };

  // ── Save state to DB whenever it changes ──
  useEffect(()=>{
    if(!window.electronAPI||!dbLoaded.current) return;
    if(threads.some(t=>t.messages?.some(m=>m.streaming))) return;
    window.electronAPI.dbSaveAll('threads', threads);
  },[threads]);

  useEffect(()=>{
    if(!window.electronAPI||!dbLoaded.current) return;
    window.electronAPI.dbSaveAll('notifications', notifs);
  },[notifs]);

  useEffect(()=>{
    if(!window.electronAPI||!dbLoaded.current) return;
    window.electronAPI.dbSaveAll('events', events);
  },[events]);

  useEffect(()=>{
    if(!window.electronAPI||!dbLoaded.current) return;
    window.electronAPI.dbSaveAll('workspaces', workspaces);
  },[workspaces]);

  useEffect(()=>{
    if(!window.electronAPI||!dbLoaded.current) return;
    window.electronAPI.dbSaveAll('telegramMessages', telegramMessages);
  },[telegramMessages]);

  // ── Persist last active thread ────────────────────────────
  useEffect(()=>{
    if(!window.electronAPI||!dbLoaded.current) return;
    window.electronAPI.setSetting('lastActiveThreadId', activeId);
  },[activeId]);

  // ── Persist splitOpen state ──────────────────────────────
  useEffect(()=>{
    writePreviewStorage('meg:splitOpen', splitOpen ? 'true' : 'false');
    window.electronAPI?.setSetting?.('splitOpen', splitOpen);
  }, [splitOpen]);

  // ── LM Studio ping on mount ──────────────────────────────
  useEffect(()=>{
    if(!window.electronAPI) return;
    window.electronAPI.ping().then(r => setLmStatus(r.ok));
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.getSetting) return;
    window.electronAPI.getSetting('model').then(model => {
      if (typeof model === 'string' && model.trim()) {
        setActiveModel(model);
      }
    });
  }, []);

  // ── Global action bridge (components dispatch meg:action events) ──
  const addMessageRef = useRef(null);
  useEffect(()=>{ addMessageRef.current = addMessage; });

  useEffect(()=>{
    const serializeAgentStep = (step, index) => {
      if (typeof step === 'string') return `${index + 1}. ${step}`;
      const typeLabel = step?.type ? `[${step.type}] ` : '';
      const target = step?.target ? ` (${step.target})` : '';
      return `${index + 1}. ${typeLabel}${step?.label || 'Untitled step'}${target}`;
    };
    const handle = e => {
      const {action, text, screen, value} = e.detail || {};
      if(action==='sendToChat') { setNav('chat'); if(text) addMessageRef.current?.(text); }
      if(action==='navigate')   setNav(screen);
        if(action==='setModel')   { setActiveModel(value); window.electronAPI?.setSetting?.('model', value); }
        if(action==='setDark')    applyThemeChoice(value ? 'dark' : 'light');
        if(action==='setTheme')   applyThemeChoice(value);
        if(action==='lmPing')     window.electronAPI?.ping().then(r=>setLmStatus(r.ok));
        if(action==='openSplit')  setSplitOpen(true);
      if(action==='openFile')   setActiveFile(value);
      if(action==='setActiveWorkspace') {
        setActiveWorkspace(value);
        if(value?.path) window.electronAPI?.setActiveWorkspace(value);
      }
      if(action==='addEvent')   setEvents(prev => upsertEvent(prev, { createdAt: new Date().toISOString(), ...value }));
      if(action==='spawnAgent') {
        window.electronAPI?.createAgentRun?.({
          name: value.name,
          instruction: (value.steps || []).map(serializeAgentStep).join('\n'),
          model: value.model,
          source: value.source || null,
          sourceId: value.sourceId || null,
          workspaceId: activeWorkspace?.id || null,
          workspacePath: activeWorkspace?.path || null,
          parentThreadId: activeIdRef.current,
        }).then(r=>r?.run&&upsertAgentRun(r.run));
      }
      if(action==='checkForUpdates') {
        setIsCheckingUpdate(true);
        window.electronAPI?.checkForUpdates();
        // Safety timeout: stop loading after 10s if no response
        setTimeout(()=>setIsCheckingUpdate(false), 10000);
      }
    };
    window.addEventListener('meg:action', handle);
    return ()=>window.removeEventListener('meg:action', handle);
    }, [applyThemeChoice]);

  // ── Telegram incoming messages ────────────────────────────
  useEffect(()=>{
    if(!window.electronAPI) return;
    const token = getTelegramToken();
    if(token) window.electronAPI.startTelegramPolling(token);
    window.electronAPI.onTelegramMessage(msg=>{
      appendTelegramMessage({
        id: `tg-in-${msg.chatId || 'chat'}-${msg.date || Date.now()}-${msg.text || ''}`,
        direction: 'inbound',
        from: msg.from || 'Telegram',
        text: msg.text || '',
        chatId: msg.chatId || getTelegramChatId(),
        createdAt: msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString(),
        status: 'received',
      });
      setTelegramSendError(null);
      setNotifs((current) => upsertNotification(current, buildTelegramNotification(msg, getTelegramChatId())));
      window.dispatchEvent(new CustomEvent('meg:action', {
        detail: { 
          action: 'addEvent', 
          value: buildTelegramEvent(msg)
        }
      }));
    });
    return ()=>window.electronAPI.removeListeners('telegram:message');
  }, [appendTelegramMessage, getTelegramChatId, getTelegramToken]);

  // ── Streaming IPC listeners (set up once) ────────────────
  useEffect(()=>{
    const api = window.electronAPI;
    if(!api) return;

    api.onChunk(({chunk, threadId})=>{
      updateThreads(ts=>ts.map(t=>{
        if(t.id!==threadId) return t;
        const msgs=[...t.messages];
        const last=msgs[msgs.length-1];
        if(last&&last.role==='meg'&&last.streaming){
          msgs[msgs.length-1]={...last, text:last.text+chunk};
        }
        return {...t,messages:msgs, unread: threadId !== activeIdRef.current || t.unread};
      }));
    });

    api.onDone(({threadId})=>{
      setTyping(false);
      updateThreads(ts=>ts.map(t=>{
        if(t.id!==threadId) return t;
        return {...t,messages:t.messages
          .map(m=>m.streaming?{...m,streaming:false}:m)
          .filter(m=>!(m.role==='meg' && (!m.text || m.text.trim()==='')))
          , unread: threadId !== activeIdRef.current || t.unread
        };
      }));
      setActiveAgents(prev => prev.map(a => a.threadId === threadId ? {
        ...a,
        status: 'done',
        doneSteps: a.steps,
        liveSteps: a.liveSteps.map(s => s.status === 'active' ? { ...s, status: 'done' } : s)
      } : a));
    });

    api.onError(({error, threadId})=>{
      setTyping(false);
      updateThreads(ts=>ts.map(t=>{
        if(t.id!==threadId) return t;
        const msgs=[...t.messages];
        const last=msgs[msgs.length-1];
        if(last&&last.role==='meg'&&last.streaming){
          msgs[msgs.length-1]={...last, text:`Error: ${error}`, streaming:false};
        }
        return {...t,messages:msgs, unread: threadId !== activeIdRef.current || t.unread};
      }));
    });

    api.onToolCall(({id, name, args, threadId})=>{
      updateThreads(ts=>ts.map(t=>{
        if(t.id!==threadId) return t;
        // Finalize any streaming meg message (drop if empty)
        const msgs=t.messages
          .map(m=>m.streaming&&m.role==='meg'?(m.text?{...m,streaming:false}:null):m)
          .filter(m => m !== null && !(m.role==='meg' && (!m.text || m.text.trim()==='')));
        return {...t,messages:[...msgs,{id:`tc-${id}`,role:'tool_call',name,args,pending:true}], unread: threadId !== activeIdRef.current || t.unread};
      }));
      if(name === 'spawn_subagent') return;
      setActiveAgents(prev => {
        const existing = prev.find(a => a.threadId === threadId);
        const taskName = name + ': ' + (args.command || args.path || '');
        const step = { label: taskName, status: 'done' };
        
        if (existing) {
          return prev.map(a => a.threadId === threadId ? {
            ...a,
            status: 'running',
            doneSteps: a.doneSteps + 1,
            steps: a.steps + 1,
            liveSteps: [...a.liveSteps, step]
          } : a);
        } else {
          const thread = threads.find(t => t.id === threadId);
          return [...prev, {
            id: 'ag-' + Date.now(),
            threadId,
            task: thread?.title || 'Active Task',
            status: 'running',
            thread: thread?.title || 'Chat',
            model: activeModel,
            duration: 'just now',
            doneSteps: 1,
            steps: 2,
            liveSteps: [step, { label: 'Thinking…', status: 'active' }],
            tools: ['terminal','fs']
          }];
        }
      });
    });

    api.onToolResult(({id, result, threadId})=>{
      updateThreads(ts=>ts.map(t=>{
        if(t.id!==threadId) return t;
        return {...t,updatedAt:new Date().toISOString(),messages:t.messages.map(m=>
          m.role==='tool_call'&&m.id===`tc-${id}`?{...m,result,pending:false}:m
        )};
      }));
    });

    api.onResume(({threadId})=>{
      updateThreads(ts=>ts.map(t=>{
        if(t.id!==threadId) return t;
        return {...t,updatedAt:new Date().toISOString(),messages:[...t.messages,{id:Date.now(),role:'meg',text:'',streaming:true}], unread: threadId !== activeIdRef.current || t.unread};
      }));
    });

    return ()=>api.removeListeners('chat:chunk','chat:done','chat:error','chat:tool_call','chat:tool_result','chat:resume');
  }, []);

  const addMessage = text => {
    const api = window.electronAPI;
    let tid = activeIdRef.current;
    if(!tid) {
      tid = 'chat-' + Date.now();
      const newThread = normalizeThread({
        ...createThreadRecord(tid),
        ...getWorkspaceThreadFields(activeWorkspace),
      });
      updateThreads(ts=>[...ts,newThread]);
      setActiveId(tid);
      activeIdRef.current = tid;
    }
    const userMsgId = Date.now();
    const megMsgId  = Date.now()+1;

    if(api){
      // ── Inject Memories ──
      const memoryPrompt = (memoryEnabled && memories.length) 
        ? `\n\nUSER PREFERENCES & MEMORIES:\n- ${memories.join('\n- ')}`
        : '';

      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      const systemPrompt = { 
        role: 'system', 
        content: `You are Meg, a highly capable local AI assistant. 

CURRENT CONTEXT:
- Date: ${dateStr}
- Time: ${timeStr}
- Operating System: Windows
- Terminal/Shell: PowerShell (Primary) / CMD
- Active Workspace: ${activeWorkspace?.name || 'None selected'}
- Workspace Path: ${activeWorkspace?.path || 'No workspace selected'}

OPERATIONAL GUIDELINES:
1. CONCISETY: Be brief, technical, and direct. Avoid conversational filler.
2. WINDOWS AWARENESS: You are running on Windows. Use Windows-native commands. (e.g., use 'systeminfo' or 'wmic' instead of 'uname', 'dir' instead of 'ls', 'type' instead of 'cat').
3. TOOL USE: When performing complex tasks, prefer specialized tools (web_search for instant-answer lookups, send_telegram, search_files, list_directory) over raw shell commands where possible. Use spawn_subagent with 'wait: true' to delegate sub-tasks and block until they report back.
4. ERROR RECOVERY: If a command or tool returns an error, analyze the stderr, understand the failure, and try an alternative approach. DO NOT repeat the same failed command.
5. PATHS: Use backslashes '\\' for Windows paths in commands, but ensure strings are escaped correctly.
6. FINAL RESPONSE: ALWAYS provide a final, clear answer to the user's question after you have obtained the necessary information via tools. Do not just stop after the tool result.

${memoryPrompt}` 
      };

      // ── Auto-Context ──
      let contextMsg = null;
      if (activeFile && (splitOpen || nav === 'filebrowser')) {
        contextMsg = {
          role: 'system',
          content: `Current Context (The file you are looking at/editing):\nFile: ${activeFile.name}\nPath: ${activeFile.path}\nContent:\n\`\`\`${activeFile.ext || ''}\n${activeFile.content}\n\`\`\``
        };
      }

      // Snapshot history before state update
      const hist = (threads.find(t=>t.id===tid)?.messages||[])
        .filter(m=>m.role==='user'||m.role==='meg')
        .map(m=>({role:m.role==='meg'?'assistant':'user', content:m.text}));
      
      const apiMessages = [systemPrompt];
      if (contextMsg) apiMessages.push(contextMsg);
      apiMessages.push(...hist, {role:'user', content:text});

      // Add user msg + empty streaming placeholder atomically
      updateThreads(ts=>ts.map(t=>t.id!==tid?t:{
        ...t,
        ...getWorkspaceThreadFields(activeWorkspace),
        updatedAt: new Date().toISOString(),
        unread: false,
        messages:[...t.messages,
          {id:userMsgId,role:'user',text},
          {id:megMsgId,role:'meg',text:'',streaming:true},
        ]
      }));

      api.sendChat(apiMessages, tid, activeModel, thinking);
    } else {
      // Explicit limited preview when the Electron bridge is unavailable.
      updateThreads(ts=>ts.map(t=>t.id!==tid?t:{
        ...t,
        ...getWorkspaceThreadFields(activeWorkspace),
        updatedAt: new Date().toISOString(),
        unread: false,
        messages:[...t.messages,
          {id:userMsgId,role:'user',text},
          {
            id:megMsgId,
            role:'meg',
            text:'Preview mode only. Open Meg in the Electron desktop app to run chat, tools, automations, and persisted workspace features.',
          },
        ],
      }));
    }
  };

  const handleCmd = item => {
    if(item.action==='open-chat'){
      setNav('chat');
      if(item.id) setActiveId(item.id);
    }
    else if(item.action==='nav') {
      setNav(item.id);
      // If navigating to workspace and item.wsId is provided, we could set active workspace
    }
    else if(item.action==='notif') setNotifOpen(true);
    else if(item.action==='new-chat') {
      createChatThread();
    }
  };

  const createChatThread = useCallback(() => {
    const id = 'chat-' + Date.now();
    updateThreads(ts=>[...ts,normalizeThread({
      ...createThreadRecord(id),
      ...getWorkspaceThreadFields(activeWorkspace),
    })]);
    setActiveId(id);
    setNav('chat');
  }, [activeWorkspace, updateThreads]);

  const openMegFromTray = () => {
    setTrayOpen(false);
    setNav('chat');
  };

  const createTaskFromTray = () => {
    setTrayOpen(false);
    createChatThread();
  };

  const NAV = [
    {id:'chat',icon:'chat',label:'Chats'},
    {id:'workspace',icon:'workspace',label:'Workspace'},
    {id:'agent',icon:'agent',label:'Agents'},
    {id:'timeline',icon:'timeline',label:'Activity Timeline'},
    {id:'automations',icon:'zap',label:'Automations'},
    {id:'filebrowser',icon:'files',label:'File Browser'},
    {id:'build',icon:'build',label:'Agent Builder'},
    {id:'mobile',icon:'mobile',label:'Telegram'},
    {id:'settings',icon:'settings',label:'Settings'},
  ];

  return (
      <div style={{display:'flex',height:'100vh',background:'var(--bg)',overflow:'hidden',fontFamily:'"Segoe UI Variable","Segoe UI",system-ui,-apple-system,sans-serif',WebkitFontSmoothing:'antialiased',color:'var(--text)',transition:'background 0.3s,color 0.3s',flexDirection:'column'}}>

        {isPreviewMode && (
          <TweaksPanel>
            <TweakSection label="Accent color">
              <TweakRadio
                label="Palette"
                value={tweaks.accentColor}
                onChange={(value) => setTweak('accentColor', value)}
                options={[{value:'blue',label:'Blue'},{value:'warm',label:'Warm'},{value:'green',label:'Green'}]}
              />
            </TweakSection>
            <TweakSection label="Sidebar density">
              <TweakRadio
                label="Width"
                value={tweaks.sidebarWidth}
                onChange={(value) => setTweak('sidebarWidth', value)}
                options={[{value:'compact',label:'Compact'},{value:'comfortable',label:'Cozy'}]}
              />
            </TweakSection>
          </TweaksPanel>
        )}

      {showOnboarding && <Onboarding onDone={()=>setOnboardingCompleted(true)} onModelChange={m=>{setActiveModel(m);window.electronAPI?.setSetting?.('model',m);}} onOpenSettings={()=>{setOnboardingCompleted(true); setNav('settings');}} currentModel={activeModel} telegramConnected={telegramConnected} lmStatus={lmStatus}/>}
      {cmdOpen && <CommandPalette onClose={()=>setCmdOpen(false)} onAction={handleCmd} threads={threads} workspaces={workspaces} activeFile={activeFile}/>}
      {quickCapOpen && <QuickCapture onClose={()=>setQuickCapOpen(false)} onSend={(t)=>{setNav('chat');addMessage(t);}} recentItems={quickCaptureItems}/>}
      {trayOpen && <TrayFlyout notifs={notifs} approvals={approvals} onApprove={approveTool} onDeny={denyTool} onClose={()=>setTrayOpen(false)} onMarkAllRead={()=>setNotifs(n=>markAllNotificationsRead(n))} onOpenMeg={openMegFromTray} onNewTask={createTaskFromTray}/>}

      {/* Windows title bar */}
      <WinTitleBar 
        dark={dark} 
        onTray={()=>setTrayOpen(o=>!o)} 
        unreadCount={unreadNotifs + pendingApprovalCount} 
        lmStatus={lmStatus}
        updateInfo={updateInfo}
        onDownload={()=>window.electronAPI?.downloadUpdate()}
        onInstall={()=>window.electronAPI?.installUpdate()}
      />

      {/* Main body */}
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

      {/* ── Icon rail ── */}
      <div style={{width:52,background:'var(--bg-sidebar)',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',alignItems:'center',padding:'8px 0',gap:2,flexShrink:0,zIndex:10,transition:'background 0.3s,border-color 0.3s'}}>
        <div style={{width:32,height:32,borderRadius:8,background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:8,cursor:'pointer',flexShrink:0,boxShadow:'0 4px 12px rgba(0,0,0,0.2)'}} onClick={()=>setOnboardingCompleted(false)}>
          <span style={{fontSize:14,color:'#fff',fontWeight:800,letterSpacing:'-0.03em'}}>M</span>
        </div>
        {NAV.map(item=>(
          <button key={item.id} title={item.label} onClick={()=>setNav(item.id)} style={{width:34,height:34,borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',border:'none',background:nav===item.id?'var(--bg-active)':'transparent',color:nav===item.id?'var(--text)':'var(--text-3)',transition:'background 0.12s,color 0.12s',position:'relative'}}
            onMouseEnter={e=>{if(nav!==item.id){e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-2)';}}}
            onMouseLeave={e=>{if(nav!==item.id){e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-3)';}}}
          >
            <Icon name={item.icon} size={16}/>
            {item.id==='agent'&&runningAgent&&<div style={{position:'absolute',top:5,right:5,width:6,height:6,borderRadius:'50%',background:'var(--accent)',border:'2px solid var(--bg-sidebar)'}}/>}
          </button>
        ))}
        <div style={{flex:1}}/>
        {/* Dark mode quick toggle */}
          <button title={dark?'Light mode':'Dark mode'} onClick={()=>applyThemeChoice(dark ? 'light' : 'dark')} style={{width:34,height:34,borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',border:'none',background:'transparent',color:'var(--text-3)',transition:'background 0.15s,color 0.15s,transform 0.2s',marginBottom:2,flexShrink:0}}
          onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-2)';e.currentTarget.style.transform='rotate(12deg)';}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-3)';e.currentTarget.style.transform='rotate(0deg)';}}>
          <Icon name={dark?'sun':'moon'} size={15}/>
        </button>
        {/* Bell */}
        <button title="Activity" onClick={()=>setNotifOpen(o=>!o)} style={{width:34,height:34,borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',border:'none',background:notifOpen?'var(--accent-bg)':'transparent',color:notifOpen?'var(--accent)':'var(--text-3)',transition:'background 0.12s,color 0.12s',position:'relative',marginBottom:2}}
          onMouseEnter={e=>{if(!notifOpen){e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-2)';}}}
          onMouseLeave={e=>{if(!notifOpen){e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-3)';}}}
        >
          <Icon name="bell" size={16}/>
          {unreadNotifs>0&&<div style={{position:'absolute',top:4,right:4,width:14,height:14,borderRadius:'50%',background:'var(--orange)',border:'2px solid var(--bg-sidebar)',display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{fontSize:8,color:'#fff',fontWeight:700}}>{unreadNotifs}</span></div>}
        </button>
        {/* SMS */}
        <button title="SMS" onClick={()=>setSmsOpen(o=>!o)} style={{width:34,height:34,borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',border:'none',background:smsOpen?'var(--accent-bg)':'transparent',color:smsOpen?'var(--accent)':'var(--text-3)',transition:'background 0.12s,color 0.12s',marginBottom:4}}
          onMouseEnter={e=>{if(!smsOpen){e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-2)';}}}
          onMouseLeave={e=>{if(!smsOpen){e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-3)';}}}
        ><Icon name="sms" size={16}/></button>
        <div style={{fontSize:9,fontWeight:700,color:'var(--text-3)',opacity:0.5,fontFamily:'"JetBrains Mono",monospace',marginBottom:4}}>v{version}</div>
        <div style={{width:28,height:28,borderRadius:'50%',background:'var(--bg-active)',border:'1.5px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:6,cursor:'pointer',flexShrink:0}}>
          <span style={{fontSize:11,color:'var(--text-2)',fontWeight:600}}>U</span>
        </div>
      </div>

      {/* ── Thread sidebar ── */}
      {nav==='chat' && (
        <div style={{width:sidebarW,background:'var(--bg-sidebar)',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',flexShrink:0,transition:'background 0.3s,border-color 0.3s',animation:'sidebarIn 0.22s cubic-bezier(0.22,1,0.36,1) both'}}>
          <div style={{padding:'10px 12px 8px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>Chats</span>
            <button onClick={createChatThread} style={{color:'var(--text-3)',padding:3,borderRadius:5,display:'flex',transition:'background 0.12s',border:'none',background:'transparent',cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><Icon name="plus" size={15}/></button>
          </div>
          <div style={{padding:'0 10px 8px'}}>
            <div style={{height:28,background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:6,display:'flex',alignItems:'center',gap:6,padding:'0 8px',cursor:'pointer'}} onClick={()=>setCmdOpen(true)}>
              <Icon name="search" size={12} color="var(--text-3)"/>
              <span style={{fontSize:12,color:'var(--text-3)',flex:1}}>Search…</span>
              <span style={{fontSize:10,color:'var(--text-3)',background:'var(--bg-active)',padding:'1px 5px',borderRadius:3,border:'1px solid var(--border)'}}>⌘K</span>
            </div>
          </div>
          <div style={{flex:1,overflowY:'auto'}}>
            {threads.map(t=>(
              <div key={t.id} onClick={()=>{setActiveId(t.id);updateThreads(ts=>ts.map(th=>th.id===t.id?{...th,unread:false}:th));}}
                onMouseEnter={()=>setHoveredThread(t.id)} onMouseLeave={()=>setHoveredThread(null)}
                style={{width:'calc(100% - 8px)',margin:'1px 4px',padding:'8px 10px',display:'flex',gap:9,alignItems:'flex-start',cursor:'pointer',background:activeId===t.id?'var(--bg-active)':hoveredThread===t.id?'var(--bg-hover)':'transparent',borderRadius:6,transition:'background 0.1s'}}>
                <div style={{width:30,height:30,borderRadius:8,flexShrink:0,background:activeId===t.id?'var(--accent-bg)':'var(--bg-2)',border:`1px solid ${activeId===t.id?'var(--accent-border)':'var(--border)'}`,display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.1s'}}>
                  <Icon name={t.iconName} size={14} color={activeId===t.id?'var(--accent)':'var(--text-3)'}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
                    <span style={{fontSize:12.5,fontWeight:t.unread?600:500,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'70%'}}>{t.title}</span>
                    <span style={{fontSize:10.5,color:'var(--text-3)',flexShrink:0}}>{formatRelativeTime(t.updatedAt || t.createdAt) || t.time || ''}</span>
                  </div>
                  <span style={{fontSize:11.5,color:'var(--text-3)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',display:'block'}}>{t.subtitle}</span>
                </div>
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',flexShrink:0,minWidth:14}}>
                  {hoveredThread===t.id
                    ? <button onClick={e=>{e.stopPropagation();const rest=threads.filter(th=>th.id!==t.id);updateThreads(rest);if(activeId===t.id)setActiveId(rest[0]?.id||null);setHoveredThread(null);}} style={{border:'none',background:'transparent',cursor:'pointer',color:'var(--text-3)',display:'flex',padding:2,borderRadius:4,transition:'color 0.1s'}} onMouseEnter={e=>e.currentTarget.style.color='#e05252'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-3)'}><Icon name="trash" size={13}/></button>
                    : t.unread&&<div style={{width:7,height:7,borderRadius:'50%',background:'var(--accent)'}}/>
                  }
                </div>
              </div>
            ))}
          </div>
          <div style={{padding:'8px 10px',borderTop:'1px solid var(--border-light)'}}>
            <button onClick={createChatThread} style={{width:'100%',height:32,borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-2)',display:'flex',alignItems:'center',justifyContent:'center',gap:6,cursor:'pointer',fontSize:12.5,color:'var(--text-2)',fontFamily:'inherit',transition:'background 0.12s,border-color 0.12s'}}
              onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.borderColor='var(--accent-border)';}} onMouseLeave={e=>{e.currentTarget.style.background='var(--bg-2)';e.currentTarget.style.borderColor='var(--border)';}}>
              <Icon name="plus" size={13}/> New chat
            </button>
          </div>
        </div>
      )}

      {/* ── Main area ── */}
      {nav==='workspace' && <NavSection id="workspace"><WorkspaceView events={events} threads={threads} agentRuns={activeAgents} workspaces={workspaces} setWorkspaces={setWorkspaces} onActiveWorkspace={setActiveWorkspace}/></NavSection>}
      {nav==='timeline' && <NavSection id="timeline"><TimelineView events={events}/></NavSection>}
      {nav==='automations' && <NavSection id="automations"><AutomationsView/></NavSection>}
      {nav==='agent' && <NavSection id="agent"><AgentDashboard activeAgents={activeAgents}/></NavSection>}
      {nav==='filebrowser' && <NavSection id="filebrowser"><FileBrowser/></NavSection>}
      {nav==='build' && <NavSection id="build"><AgentBuilder/></NavSection>}
      {nav==='mobile' && <NavSection id="mobile"><MobileCompanion messages={telegramMessages} connected={telegramConnected} contactName={telegramContactName} onSend={sendTelegramMessage} sendError={telegramSendError}/></NavSection>}
      {nav==='settings' && <NavSection id="settings"><SettingsView isCheckingUpdate={isCheckingUpdate} updateInfo={updateInfo} version={version} tgStatus={tgStatus} setTgStatus={setTgStatus} integrations={integrations} setIntegrations={setIntegrations} validateTg={validateTg} rendererTweaks={tweaks} onRendererTweakChange={(key, value) => setTweak(key, value)}/></NavSection>}

      {nav==='chat' && (
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,position:'relative'}}>
          <div style={{height:44,padding:'0 16px',borderBottom:'1px solid var(--border-light)',display:'flex',alignItems:'center',justifyContent:'space-between',background:'var(--bg)',flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <Icon name={thread?.iconName} size={15} color="var(--text-3)"/>
              <span style={{fontSize:13.5,fontWeight:600,color:'var(--text)'}}>{thread?.title}</span>
              {thread?.messages.some(m=>m.role==='agent'&&m.status==='running') && (
                <span style={{fontSize:11,padding:'2px 7px',borderRadius:99,background:'var(--accent-bg)',color:'var(--accent)',border:'1px solid var(--accent-border)',fontWeight:500,display:'flex',alignItems:'center',gap:4}}>
                  <span style={{display:'inline-flex',animation:'spin 1.2s linear infinite'}}><Icon name="spinner" size={11} color="var(--accent)"/></span>
                  agent running
                </span>
              )}
            </div>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <button onClick={()=>setCmdOpen(true)} style={{fontSize:11,padding:'3px 8px',borderRadius:5,border:'1px solid var(--border)',color:'var(--text-3)',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:4,background:'transparent',transition:'all 0.12s'}} onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent-border)';e.currentTarget.style.color='var(--accent)';}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--text-3)';}}>⌘K</button>
              <button onClick={()=>setSplitOpen(o=>!o)} style={{fontSize:11,padding:'3px 8px',borderRadius:5,border:'1px solid var(--border)',background:splitOpen?'var(--bg-active)':'transparent',color:splitOpen?'var(--text)':'var(--text-3)',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:4,transition:'all 0.12s'}}>
                <Icon name="splitH" size={12} color={splitOpen?'var(--text)':'var(--text-3)'}/> split
              </button>
            </div>
          </div>
          <div style={{flex:1,display:'flex',overflow:'hidden'}}>
            <div style={{flex:1,overflowY:'auto',padding:'18px 20px'}}>
              {isPreviewMode && (
                <div style={{marginBottom:12,padding:'10px 12px',borderRadius:8,border:'1px solid var(--orange-border)',background:'var(--orange-bg)',fontSize:12,color:'var(--text-2)'}}>
                  Preview mode only. The desktop backend is unavailable in this browser render, so chat execution, tools, and persisted app state are disabled.
                </div>
              )}
              {!thread && (
                <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center'}}>
                  <div style={{maxWidth:340}}>
                    <div style={{width:44,height:44,borderRadius:12,background:'var(--bg-active)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
                      <Icon name="chat" size={20} color="var(--text-3)"/>
                    </div>
                    <h2 style={{fontSize:16,fontWeight:700,color:'var(--text)',marginBottom:8}}>No chats yet</h2>
                    <p style={{fontSize:13,color:'var(--text-3)',lineHeight:1.6}}>Start a conversation below or create a new task from the tray.</p>
                  </div>
                </div>
              )}
              {thread?.messages.map(msg=>{
                if(msg.role==='agent')     return <AgentCard key={msg.id} step={msg}/>;
                if(msg.role==='tool_call') return <ToolCallCard key={msg.id} msg={msg}/>;
                if(msg.role==='user')      return <Message key={msg.id} msg={msg} isUser={true} accent={accent}/>;
                return <Message key={msg.id} msg={msg} accent={accent}/>;
              })}
              {typing && <TypingIndicator/>}
              <div ref={messagesEndRef}/>
            </div>
            {splitOpen && <SplitPane activeFile={activeFile} activeWorkspace={activeWorkspace}/>}
          </div>
          <InputBar 
            onSend={addMessage} 
            onAbort={()=>window.electronAPI?.abortChat(activeId)}
            typing={typing}
            thinking={thinking} 
            onToggleThinking={isThinkingModel(activeModel)?()=>setThinking(t=>!t):null}
          />
          {smsOpen && <SmsFloat messages={telegramMessages} connected={telegramConnected} contactName={telegramContactName} onClose={()=>setSmsOpen(false)} onSend={sendTelegramMessage} sendError={telegramSendError}/>}
          
          {notifOpen && (
            <div style={{position:'absolute',top:44,right:0,zIndex:200}}>
              <NotifPanel notifs={notifs} onClose={()=>setNotifOpen(false)} onMarkAllRead={()=>setNotifs(n=>markAllNotificationsRead(n))} onDismiss={id=>setNotifs(n=>dismissNotification(n, id))}/>
            </div>
          )}
        </div>
      )}

      {nav==='chat' && thread && !splitOpen && <ContextPanel thread={thread} onAddFiles={names=>updateThreads(ts=>ts.map(t=>t.id!==activeId?t:{...t,updatedAt:new Date().toISOString(),files:[...new Set([...(t.files||[]),...names])]}))} onToggleTool={(toolName, nextValue)=>updateThreads(ts=>ts.map(t=>t.id!==activeId?t:{...t,updatedAt:new Date().toISOString(),tools:{...(t.tools||DEFAULT_THREAD_TOOLS),[toolName]:nextValue}}))}/>}
      </div>{/* end main body */}
    </div>
  );
};

export { App };

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App/>);
}
