import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio } from './tweaks-panel.jsx';
import { Icon } from './components/icons.jsx';
import { StatusBadge, Toggle } from './components/primitives.jsx';
import { TypingIndicator, AgentCard, ToolCallCard, Message } from './components/chat.jsx';
import { InputBar } from './components/chatInput.jsx';
import { ThreadSearch } from './components/ThreadSearch.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { ContextPanel, NotifPanel, QuickCapture, SmsFloat, SplitPane, TrayFlyout } from './components/overlays.jsx';
import { WinTitleBar } from './components/WinTitleBar.jsx';
import { Onboarding } from './components/Onboarding.jsx';
import { CommandPalette } from './components/CommandPalette.jsx';
import { TokenBudgetBar } from './components/TokenBudgetBar.jsx';
import { ShortcutsOverlay } from './components/ShortcutsOverlay.jsx';
import { mapAgentRun } from './lib/agentRuns.js';
import { SKILLS, autoDetectSkill, loadCustomSkills, getAllSkills } from './lib/skills.js';
import { dismissNotification, markAllNotificationsRead, normalizeEventList, normalizeNotificationList, upsertEvent, upsertNotification } from './lib/activity.js';
import { formatRelativeTime } from './lib/time.js';
import { normalizeThread, normalizeThreadList } from './lib/threads.js';
import { AgentDashboard } from './views/AgentDashboard.jsx';
import { AutomationsView } from './views/AutomationsView.jsx';
import {
  buildQuickCaptureItems,
  DEFAULT_THREAD_TOOLS,
  createThreadRecord,
  getWorkspaceThreadFields,
  buildApprovalNotification,
  buildTelegramNotification,
  buildTelegramEvent,
  resolveThemeDarkMode,
  readPreviewStorage,
  writePreviewStorage,
} from './lib/appHelpers.js';
import { buildSystemPrompt, buildFileContextMessage } from './lib/systemPrompt.js';
import { isThinkingModel } from './lib/models.js';
import { reviewFile, addEvent } from './lib/actions.js';
import { useUpdater } from './hooks/useUpdater.js';
import { useApprovals } from './hooks/useApprovals.js';
import { useTelegram } from './hooks/useTelegram.js';
import { useWorkspaces } from './hooks/useWorkspaces.js';
import { useChatState } from './hooks/useChatState.js';
import { FileBrowser } from './views/FileBrowser.jsx';
import { MobileCompanion } from './views/MobileCompanion.jsx';
import { AgentBuilder } from './views/AgentBuilder.jsx';
import { SettingsView } from './views/SettingsView.jsx';
import { TimelineView } from './views/TimelineView.jsx';
import { WorkspaceView } from './views/WorkspaceView.jsx';
import './styles.css';
import logoImg from './assets/logo-m.jpg';
import splashImg from './assets/splash-text.jpg';

/* ══════════════════════════════════════════════════════
   NAV TRANSITION WRAPPER
══════════════════════════════════════════════════════ */
const NavSection = ({id, children}) => (
  <div key={id} className="nav-section" style={{flex:1,display:'flex',minWidth:0,overflow:'hidden'}}>
    {children}
  </div>
);

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
  const [themeChoice, setThemeChoice] = useState('dark');
  const dark = resolveThemeDarkMode(themeChoice);

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [quickCapOpen, setQuickCapOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [wsDropOpen, setWsDropOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [activeSkill, setActiveSkill] = useState(null);
  const [splitOpen, setSplitOpen] = useState(() => readPreviewStorage('meg:splitOpen', 'false') === 'true');
  const [nav, setNav] = useState('chat');
  const [activeId, setActiveId] = useState(null);
  const [threads, setThreads] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const handleApprovalCreated = useCallback((approval) => {
    setNotifs((current) => upsertNotification(current, buildApprovalNotification(approval)));
    setTrayOpen(true);
  }, []);
  const handleStagedWrite = useCallback((approval) => {
    reviewFile({ approval });
  }, []);
  const { approvals, setApprovals, approve: approveTool, deny: denyTool } = useApprovals({
    onCreated: handleApprovalCreated,
    onStagedWrite: handleStagedWrite,
  });
  const [events, setEvents] = useState([]);
  const { workspaces, setWorkspaces, activeWorkspace, setActiveWorkspace, activeWorkspaceRef } = useWorkspaces();
  const [terminalHistory, setTerminalHistory] = useState([]);

  const onTerminalHistoryChange = useCallback((updater) => {
    setTerminalHistory(curr => {
      const next = typeof updater === 'function' ? updater(curr) : updater;
      window.electronAPI?.setSetting?.('splitTerminalHistory', next);
      return next;
    });
  }, []);
  const [activeAgents, setActiveAgents] = useState([]);
  const [loading, setLoading] = useState(() => {
    return !(typeof process !== 'undefined' && process.env?.NODE_ENV === 'test');
  });

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setLoading(false);
    }, 3500);
    return () => clearTimeout(timer);
  }, [loading]);
  const [lmStatus, setLmStatus] = useState(undefined);
  const [activeModel, setActiveModel] = useState('qwen/qwen3.5-9b');
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memories, setMemories] = useState([]);
  // Ref mirror for telegramChatId — declared before the callback so the
  // memoized onIncomingMessage closure can read the latest chatId without
  // re-binding the entire telegram hook on every chatId change.
  const telegramChatIdRef = useRef('');
  const handleTelegramIncoming = useCallback((msg) => {
    setNotifs((current) => upsertNotification(current, buildTelegramNotification(msg, telegramChatIdRef.current)));
    addEvent(buildTelegramEvent(msg));
  }, []);
  const {
    integrations, setIntegrations,
    tgStatus, setTgStatus,
    telegramToken, setTelegramToken,
    telegramChatId, setTelegramChatId,
    telegramMessages, setTelegramMessages,
    telegramSendError,
    telegramConnected,
    telegramContactName,
    sendTelegramMessage,
    validateTg,
  } = useTelegram({ onIncomingMessage: handleTelegramIncoming });
  useEffect(() => { telegramChatIdRef.current = telegramChatId; }, [telegramChatId]);

  const [activeFile, setActiveFile] = useState(null); // {name, path, content, ext}
  const [hoveredThread, setHoveredThread] = useState(null);
  const [thinking, setThinking] = useState(true);
  const { updateInfo, isCheckingUpdate, triggerUpdateCheck } = useUpdater();
  const dbLoaded = useRef(false);
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const isAutoScrollingRef = useRef(false);
  const activeIdRef = useRef(activeId);
  useEffect(()=>{ activeIdRef.current = activeId; }, [activeId]);
  const activeFileRef = useRef(activeFile);
  useEffect(()=>{ activeFileRef.current = activeFile; }, [activeFile]);
  // activeWorkspaceRef is owned by the useWorkspaces hook now.
  const threadsRef = useRef(threads);
  useEffect(()=>{ threadsRef.current = threads; }, [threads]);

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

  // Chat streaming state + IPC listeners. Placed after updateThreads so it
  // can close over it. Owns `typing`, `redactionNotices`, and the 7 chat:*
  // event listeners that update thread messages + agent activity in real time.
  const { typing, setTyping, redactionNotices, setRedactionNotices } = useChatState({
    updateThreads,
    setActiveAgents,
    activeIdRef,
    threads,
    activeModel,
  });

  const thread = threads.find(t=>t.id===activeId);

  useEffect(() => {
    if (thread?.model && thread.model !== activeModel) {
      setActiveModel(thread.model);
    }
  }, [activeId, thread?.model]);

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
    window.electronAPI.getSetting('splitTerminalHistory').then((value) => {
      setTerminalHistory(value || []);
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

  // ⌘K, Ctrl+F, Ctrl+Shift+M, and ? (shortcuts overlay)
  useEffect(()=>{
    const h = e => {
      if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();setCmdOpen(o=>!o);}
      if((e.ctrlKey||e.metaKey)&&e.key==='f'){e.preventDefault();setIsSearchOpen(true);}
      if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key==='M'){e.preventDefault();setQuickCapOpen(o=>!o);}
      if(e.key==='?'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&e.target.tagName!=='INPUT'&&e.target.tagName!=='TEXTAREA'){e.preventDefault();setShortcutsOpen(o=>!o);}
    };
    window.addEventListener('keydown',h);
    return ()=>window.removeEventListener('keydown',h);
  },[]);

  // ── Smart scroll: track whether user has scrolled up ──
  const handleScroll = useCallback(() => {
    if (isAutoScrollingRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setUserScrolledUp(distFromBottom > 120);
  }, []);

  // ── Auto-scroll to bottom (only when user is near bottom) ──
  useEffect(()=>{
    if(nav === 'chat' && messagesEndRef.current && !userScrolledUp) {
      isAutoScrollingRef.current = true;
      const el = scrollContainerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
      setTimeout(() => { isAutoScrollingRef.current = false; }, 80);
    }
  },[activeId, threads, typing, nav, userScrolledUp]);

  const [version, setVersion] = useState('1.0.0-beta.7'); // Fallback
  const isPreviewMode = !window.electronAPI;

  useEffect(() => {
    if(window.electronAPI) {
      window.electronAPI.getVersion().then(v => setVersion(v));
    }
  }, []);

  // ── Load persisted app state on mount ────────────────────────
  useEffect(()=>{
    if(!window.electronAPI) return;
    // Load custom skills (plugin system) in the background. They merge with
    // the built-in SKILLS array; the InputBar and auto-detect pick them up
    // via getAllSkills() on the next render.
    loadCustomSkills().then(() => { /* triggers re-render via ref reads */ });
    window.electronAPI.listThreads().then(data=>{
      dbLoaded.current = true;
      if(data?.length){
        setThreads(normalizeThreadList(data));
        window.electronAPI.getSetting('lastActiveThreadId').then(id=>{
          setActiveId((id && data.find(t=>t.id===id)) ? id : data[0].id);
        });
      }
    });
    window.electronAPI.listNotifications().then(data => {
      setNotifs(normalizeNotificationList(data));
    });
    window.electronAPI.listEvents().then(data=>{
      setEvents(normalizeEventList(data));
    });
    // Note: workspaces + activeWorkspace are loaded by the useWorkspaces hook.
    // Note: telegramToken, telegramChatId, and telegramMessages are loaded
    // by the useTelegram hook on mount.
    window.electronAPI.getSetting('memoryEnabled').then(value => {
      if (typeof value === 'boolean') setMemoryEnabled(value);
    });
    window.electronAPI.getSetting('memories').then(value => {
      if (Array.isArray(value)) setMemories(value);
    });
    window.electronAPI.listAgentRuns?.().then(runs=>{
      if(runs?.length) setActiveAgents(runs.map(mapAgentRun));
    });
    // Note: approvals are loaded by the useApprovals hook on mount.
    // Note: integrations.Telegram sync is handled by the useTelegram hook.
  },[]);

  useEffect(()=>{
    if(!window.electronAPI?.onAgentChange) return;
    window.electronAPI.onAgentChange(({run})=>upsertAgentRun(run));
    return ()=>window.electronAPI.removeListeners('agent:change');
  },[upsertAgentRun]);

  // ── Save state to DB whenever it changes ──
  useEffect(()=>{
    if(!window.electronAPI||!dbLoaded.current) return;
    const timer = setTimeout(() => {
      window.electronAPI.saveThreads(threads);
    }, 1500);
    return () => clearTimeout(timer);
  },[threads]);

  useEffect(()=>{
    if(!window.electronAPI||!dbLoaded.current) return;
    window.electronAPI.saveNotifications(notifs);
  },[notifs]);

  useEffect(()=>{
    if(!window.electronAPI||!dbLoaded.current) return;
    window.electronAPI.saveEvents(events);
  },[events]);

  // Workspace persistence is handled by the useWorkspaces hook.

  useEffect(()=>{
    if(!window.electronAPI||!dbLoaded.current) return;
    window.electronAPI.saveTelegramMessages(telegramMessages);
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

  // ── LM Studio ping and polling loop ───────────────────────
  useEffect(()=>{
    if(!window.electronAPI) return;
    const hasActiveWork = threads.some(t => t.messages?.some(m => m.streaming))
      || activeAgents.some(a => a.status === 'running');
    if (!hasActiveWork) return;
    const checkPing = () => {
      window.electronAPI.ping().then(r => setLmStatus(r.ok));
    };
    checkPing();
    const interval = setInterval(checkPing, 5000);
    return () => clearInterval(interval);
  }, [threads, activeAgents]);

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
      if(action==='sendToChat' || action==='appendCommandResultToChat') { setNav('chat'); if(text) addMessageRef.current?.(text); }
      if(action==='navigate')   setNav(screen);
        if(action==='setModel')   {
          setActiveModel(value);
          window.electronAPI?.setSetting?.('model', value);
          if (activeIdRef.current) {
            updateThreads(ts => ts.map(t => t.id === activeIdRef.current ? { ...t, model: value, updatedAt: new Date().toISOString() } : t));
          }
        }
        if(action==='setDark')    applyThemeChoice(value ? 'dark' : 'light');
        if(action==='setTheme')   applyThemeChoice(value);
        if(action==='lmPing')     window.electronAPI?.ping().then(r=>setLmStatus(r.ok));
        if(action==='openSplit')  setSplitOpen(true);
      if(action==='openFile')   { setActiveFile(value); activeFileRef.current = value; }
      if(action==='reviewFile') {
        const { approval, path: fp } = value;
        if (approval) { const n = { approvalId: approval.id, name: (approval.result?.path || approval.rawArgs?.path || 'file').split(/[\/\\]/).pop(), path: approval.result?.path || approval.rawArgs?.path, content: approval.result?.originalContent || '', draftContent: approval.rawArgs?.content || '', ext: (approval.result?.path || approval.rawArgs?.path || '').split('.').pop() }; setActiveFile(n); activeFileRef.current = n; setSplitOpen(true); }
        else if (fp) { window.electronAPI?.readFile(fp).then(r => { const n = { name: fp.split(/[\/\\]/).pop(), path: fp, content: r.content || '', ext: fp.split('.').pop() }; setActiveFile(n); activeFileRef.current = n; setSplitOpen(true); }); }
      }
      if(action==='applyCode') { if (!activeFileRef.current) return; window.electronAPI?.readFile(activeFileRef.current.path).then(r => { const n = { ...activeFileRef.current, content: r.content || activeFileRef.current.content, draftContent: value }; setActiveFile(n); activeFileRef.current = n; setSplitOpen(true); }); }
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
          workspaceId: value.workspaceId || value.workspace?.id || activeWorkspaceRef.current?.id || null,
          workspacePath: value.workspacePath || value.workspace?.path || activeWorkspaceRef.current?.path || null,
          parentThreadId: activeIdRef.current,
        }).then(r=>r?.run&&upsertAgentRun(r.run));
      }
      if(action==='checkForUpdates') {
        triggerUpdateCheck();
      }
    };
    window.addEventListener('meg:action', handle);
    return ()=>window.removeEventListener('meg:action', handle);
    }, [applyThemeChoice, triggerUpdateCheck]);

  // Note: Telegram incoming-message handling, polling lifecycle, and
  // initial state load now live in the useTelegram hook (above).

  // Note: streaming IPC listeners (chat:chunk, chat:done, etc.) are owned
  // by the useChatState hook above.

  const addMessage = async (text, opts = {}) => {
    const { images = [] } = opts;
    const api = window.electronAPI;
    setUserScrolledUp(false);
    let tid = activeIdRef.current;
    if(!tid) {
      tid = 'chat-' + Date.now();
      const newThread = normalizeThread({
        ...createThreadRecord(tid),
        ...getWorkspaceThreadFields(activeWorkspaceRef.current),
      });
      updateThreads(ts=>[...ts,newThread]);
      setActiveId(tid);
      activeIdRef.current = tid;
    }
    const userMsgId = Date.now();
    const megMsgId  = Date.now()+1;

    if(api){
      const trimmed = text.trim();
      const systemMessages = [];
      let resolvedText = text;

      if (trimmed === '/goal' || trimmed.startsWith('/goal ')) {
        const ins = trimmed.slice(5).trim();
        if (!ins) {
          updateThreads(ts=>ts.map(t=>t.id!==tid?t:{...t, messages:[...t.messages,{id:userMsgId,role:'user',text},{id:megMsgId,role:'meg',text:'Usage: /goal <instruction>',status:'done'}]}));
          return;
        }
        const r = await api.createAgentRun?.({ goal: true, instruction: ins, workspacePath: activeWorkspaceRef.current?.path, source: 'slash-command', parentThreadId: tid });
        if (r?.ok) {
          updateThreads(ts=>ts.map(t=>t.id!==tid?t:{...t, messages:[...t.messages,{id:userMsgId,role:'user',text},{id:megMsgId,role:'meg',text:`Queued autonomous goal planner & runner for: ${ins}`,status:'done'}]}));
          if (r.run) upsertAgentRun(r.run);
        }
        return;
      }

      if (trimmed === '/agent' || trimmed.startsWith('/agent ')) {
        const ins = trimmed.slice(6).trim();
        if (!ins) {
          updateThreads(ts=>ts.map(t=>t.id!==tid?t:{...t, messages:[...t.messages,{id:userMsgId,role:'user',text},{id:megMsgId,role:'meg',text:'Usage: /agent <instruction>',status:'done'}]}));
          return;
        }
        const r = await api.createAgentRun?.({ instruction: ins, workspacePath: activeWorkspaceRef.current?.path, source: 'slash-command', parentThreadId: tid });
        if (r?.ok) {
          updateThreads(ts=>ts.map(t=>t.id!==tid?t:{...t, messages:[...t.messages,{id:userMsgId,role:'user',text},{id:megMsgId,role:'meg',text:`Queued agent run for: ${ins}`,status:'done'}]}));
          if (r.run) upsertAgentRun(r.run);
        }
        return;
      }

      if (trimmed.startsWith('/search ')) { systemMessages.push({ role:'system', content:'The user invoked /search.' }); resolvedText = trimmed.slice(8).trim(); }
      else if (trimmed.startsWith('/fix ')) { systemMessages.push({ role:'system', content:'The user invoked /fix.' }); resolvedText = trimmed.slice(5).trim(); }
      else if (trimmed.startsWith('/explain ')) { systemMessages.push({ role:'system', content:'The user invoked /explain.' }); resolvedText = trimmed.slice(9).trim(); }
      else if (trimmed.startsWith('/code ')) { systemMessages.push({ role:'system', content:'The user invoked /code.' }); resolvedText = trimmed.slice(6).trim(); }
      
      const fileMatches = resolvedText.matchAll(/@file\(([^)]+)\)/g);
      for (const match of fileMatches) {
        let fp = match[1]; if (activeWorkspaceRef.current?.path && !/^[a-zA-Z]:/.test(fp) && !fp.startsWith('/')) fp = activeWorkspaceRef.current.path + (activeWorkspaceRef.current.path.endsWith('\\')||activeWorkspaceRef.current.path.endsWith('/')?'':'\\') + fp;
        const res = await api.readFile(fp); if (res.content !== null && !res.error) systemMessages.push({ role:'system', content: `The user is referencing a file. Referenced file context: ${fp}: ${res.content}` });
        resolvedText = resolvedText.replace(match[0], '').trim();
      }
      if (resolvedText.includes('@clipboard')) { const clip = await navigator.clipboard.readText(); systemMessages.push({ role:'system', content: `The user is referencing the clipboard. Clipboard content: ${clip}` }); resolvedText = resolvedText.replace('@clipboard','').trim(); }

      // ── Inject Memories ──
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      const systemPrompt = buildSystemPrompt({
        dateStr,
        timeStr,
        workspaceName: activeWorkspaceRef.current?.name,
        workspacePath: activeWorkspaceRef.current?.path,
        memories,
        memoryEnabled,
      });

      // ── Auto-Context ──
      const contextMsg = (activeFileRef.current && (splitOpen || nav === 'filebrowser'))
        ? buildFileContextMessage(activeFileRef.current)
        : null;

      // Snapshot history before state update
      const hist = (threadsRef.current.find(t=>t.id===tid)?.messages||[])
        .filter(m=>m.role==='user'||m.role==='meg')
        .map(m=>({role:m.role==='meg'?'assistant':'user', content:m.text}));
      
      // Use manually-selected skill or auto-detect from message
      let resolvedSkill = activeSkill;
      if (!resolvedSkill) {
        resolvedSkill = autoDetectSkill(text);
        if (resolvedSkill) setActiveSkill(resolvedSkill);
      }

      const apiMessages = [systemPrompt];
      if (resolvedSkill) {
        const skill = getAllSkills().find(s => s.id === resolvedSkill) || SKILLS.find(s => s.id === resolvedSkill);
        if (skill) apiMessages.push({ role: 'system', content: skill.prompt });
      }
      if (systemMessages.length) apiMessages.push(...systemMessages);
      if (contextMsg) apiMessages.push(contextMsg);

      // Multi-modal: when images are attached, send the user message as an
      // OpenAI vision content array (text + image_url parts). LM Studio and
      // all OpenAI-compatible providers (OpenAI, Anthropic via translation,
      // Google, DeepSeek) accept this shape. Local text-only models will
      // simply ignore the image parts.
      const userApiMessage = images.length
        ? {
            role: 'user',
            content: [
              { type: 'text', text: resolvedText || 'Describe this image.' },
              ...images.map(img => ({
                type: 'image_url',
                image_url: { url: img.dataUrl, detail: 'auto' },
              })),
            ],
          }
        : { role: 'user', content: resolvedText };
      apiMessages.push(...hist, userApiMessage);

      // Add user msg + empty streaming placeholder atomically.
      // Store image thumbnails on the user message so the chat UI can render
      // them inline next to the user's text.
      updateThreads(ts=>ts.map(t=>t.id!==tid?t:{
        ...t,
        ...getWorkspaceThreadFields(activeWorkspaceRef.current),
        updatedAt: new Date().toISOString(),
        unread: false,
        messages:[...t.messages,
          {id:userMsgId,role:'user',text:resolvedText,images:images.length?images.map(i=>({name:i.name,dataUrl:i.dataUrl})):undefined},
          {id:megMsgId,role:'meg',text:'',streaming:true},
        ]
      }));

      api.sendChat(apiMessages, tid, activeModel, thinking);
    } else {
      // Explicit limited preview when the Electron bridge is unavailable.
      updateThreads(ts=>ts.map(t=>t.id!==tid?t:{
        ...t,
        ...getWorkspaceThreadFields(activeWorkspaceRef.current),
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
      model: activeModel,
    })]);
    setActiveId(id);
    setNav('chat');
  }, [activeWorkspace, updateThreads, activeModel]);

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
    {id:'filebrowser',icon:'files',label:'File Browser'},
    {id:'agent',icon:'agent',label:'Agents'},
    {id:'build',icon:'build',label:'Agent Builder'},
    {id:'automations',icon:'zap',label:'Automations'},
    {id:'timeline',icon:'activity',label:'Activity Timeline'},
    {id:'mobile',icon:'sms',label:'Telegram'},
    {id:'settings',icon:'settings',label:'Settings'},
  ];

  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        color: 'var(--text)',
        fontFamily: 'inherit',
        userSelect: 'none'
      }}>
        {/* Subtle accent glow */}
        <div style={{
          position: 'absolute',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, var(--accent-bg) 0%, transparent 70%)',
          filter: 'blur(50px)',
          animation: 'pulseGlow 6s infinite alternate'
        }} />

        {/* Logo + progress */}
        <div style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          animation: 'splashFadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) both'
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px var(--accent-bg)',
            animation: 'zoomSlow 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards'
          }}>
            <span style={{fontSize:24,color:'#fff',fontWeight:800,letterSpacing:'-0.03em'}}>M</span>
          </div>

          {/* Minimal progress bar */}
          <div style={{
            width: 120,
            height: 2,
            background: 'var(--border)',
            borderRadius: 99,
            overflow: 'hidden',
            position: 'relative'
          }}>
            <div style={{
              position: 'absolute',
              height: '100%',
              background: 'var(--accent)',
              borderRadius: 99,
              animation: 'loadProgress 2.5s cubic-bezier(0.65, 0, 0.35, 1) forwards'
            }} />
          </div>

          <span style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--text-3)',
            marginTop: 10,
            animation: 'pulseText 2.5s infinite alternate'
          }}>
            Initializing System
          </span>
        </div>
      </div>
    );
  }

  return (
      <div style={{display:'flex',height:'100vh',background:'var(--bg)',overflow:'hidden',fontFamily:'"Inter",-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif',WebkitFontSmoothing:'antialiased',color:'var(--text)',transition:'background 0.3s,color 0.3s',flexDirection:'column'}}>

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
      {shortcutsOpen && <ShortcutsOverlay onClose={()=>setShortcutsOpen(false)}/>}
      {quickCapOpen && <QuickCapture onClose={()=>setQuickCapOpen(false)} onSend={(t)=>{setNav('chat');addMessage(t);}} recentItems={quickCaptureItems}/>}
      {trayOpen && <TrayFlyout notifs={notifs} approvals={approvals} onApprove={approveTool} onDeny={denyTool} onClose={()=>setTrayOpen(false)} onMarkAllRead={()=>{ setNotifs(current => { const next = markAllNotificationsRead(current); next.filter(n => n.read && !current.find(c => c.id === n.id)?.read).forEach(n => window.electronAPI?.upsertNotification?.(n)); return next; }); }} onOpenMeg={openMegFromTray} onNewTask={createTaskFromTray}/>}

      {/* Windows title bar */}
      <WinTitleBar
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
      <div style={{width:54,background:'var(--bg-sidebar)',borderRight:'1px solid var(--border-light)',display:'flex',flexDirection:'column',alignItems:'center',padding:'10px 0',gap:3,flexShrink:0,zIndex:10,transition:'background 0.3s,border-color 0.3s'}}>
        <div style={{width:34,height:34,borderRadius:9,background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:10,cursor:'pointer',flexShrink:0,boxShadow:'0 4px 14px rgba(107,140,255,0.3)'}} onClick={()=>setOnboardingCompleted(false)}>
          <span style={{fontSize:15,color:'#fff',fontWeight:800,letterSpacing:'-0.03em'}}>M</span>
        </div>
        {NAV.map(item=>(
          <button key={item.id} title={item.label} aria-label={item.label} onClick={()=>setNav(item.id)} style={{width:36,height:36,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',border:'none',background:nav===item.id?'var(--bg-active)':'transparent',color:nav===item.id?'var(--text)':'var(--text-3)',transition:'background 0.12s,color 0.12s',position:'relative'}}
            onMouseEnter={e=>{if(nav!==item.id){e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-2)';}}}
            onMouseLeave={e=>{if(nav!==item.id){e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-3)';}}}
          >
            <Icon name={item.icon} size={17}/>
            {nav===item.id&&<div style={{position:'absolute',left:-4,top:8,bottom:8,width:3,borderRadius:99,background:'var(--accent)'}}/>}
            {item.id==='agent'&&runningAgent&&<div style={{position:'absolute',top:6,right:6,width:6,height:6,borderRadius:'50%',background:'var(--green)',boxShadow:'0 0 6px var(--green)'}}/>}
          </button>
        ))}
        <div style={{flex:1}}/>
        {/* Dark mode quick toggle */}
          <button title={dark?'Light mode':'Dark mode'} aria-label={dark?'Switch to light mode':'Switch to dark mode'} onClick={()=>applyThemeChoice(dark ? 'light' : 'dark')} style={{width:36,height:36,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',border:'none',background:'transparent',color:'var(--text-3)',transition:'background 0.15s,color 0.15s,transform 0.2s',marginBottom:3,flexShrink:0}}
          onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-2)';e.currentTarget.style.transform='rotate(12deg)';}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-3)';e.currentTarget.style.transform='rotate(0deg)';}}>
          <Icon name={dark?'sun':'moon'} size={16}/>
        </button>
        {/* Bell */}
        <button title="Activity" aria-label="Activity" onClick={()=>setNotifOpen(o=>!o)} style={{width:36,height:36,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',border:'none',background:notifOpen?'var(--accent-bg)':'transparent',color:notifOpen?'var(--accent)':'var(--text-3)',transition:'background 0.12s,color 0.12s',position:'relative',marginBottom:3}}
          onMouseEnter={e=>{if(!notifOpen){e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-2)';}}}
          onMouseLeave={e=>{if(!notifOpen){e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-3)';}}}
        >
          <Icon name="bell" size={17}/>
          {unreadNotifs>0&&<div style={{position:'absolute',top:5,right:5,width:15,height:15,borderRadius:'50%',background:'var(--orange)',border:'2px solid var(--bg-sidebar)',display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{fontSize:8,color:'#fff',fontWeight:700}}>{unreadNotifs}</span></div>}
        </button>
        {/* SMS */}
        <button title="SMS" aria-label="Telegram messages" onClick={()=>setSmsOpen(o=>!o)} style={{width:36,height:36,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',border:'none',background:smsOpen?'var(--accent-bg)':'transparent',color:smsOpen?'var(--accent)':'var(--text-3)',transition:'background 0.12s,color 0.12s',marginBottom:6}}
          onMouseEnter={e=>{if(!smsOpen){e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-2)';}}}
          onMouseLeave={e=>{if(!smsOpen){e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-3)';}}}
        ><Icon name="sms" size={17}/></button>
        <div style={{fontSize:8.5,fontWeight:600,color:'var(--text-3)',opacity:0.4,fontFamily:'"JetBrains Mono",monospace',marginBottom:6}}>v{version}</div>
        <div style={{width:28,height:28,borderRadius:'50%',background:'var(--bg-active)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
          <span style={{fontSize:11,color:'var(--text-2)',fontWeight:600}}>U</span>
        </div>
      </div>

      {/* ── Thread sidebar ── */}
      {nav==='chat' && (
        <div style={{width:sidebarW,background:'var(--bg-sidebar)',borderRight:'1px solid var(--border-light)',display:'flex',flexDirection:'column',flexShrink:0,transition:'background 0.3s,border-color 0.3s',animation:'sidebarIn 0.2s cubic-bezier(0.22,1,0.36,1) both'}}>
          <div style={{padding:'14px 14px 10px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontSize:13,fontWeight:700,color:'var(--text)',letterSpacing:'-0.01em'}}>Chats</span>
            <button onClick={createChatThread} title="New chat" style={{color:'var(--text-3)',padding:4,borderRadius:6,display:'flex',transition:'background 0.12s',border:'none',background:'transparent',cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><Icon name="plus" size={16}/></button>
          </div>
          <div style={{padding:'0 12px 10px'}}>
            <div style={{height:30,background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:7,display:'flex',alignItems:'center',gap:6,padding:'0 10px',cursor:'pointer',transition:'border-color 0.12s'}} onClick={()=>setCmdOpen(true)} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent-border)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
              <Icon name="search" size={13} color="var(--text-3)"/>
              <span style={{fontSize:12,color:'var(--text-3)',flex:1}}>Search…</span>
              <span style={{fontSize:9.5,color:'var(--text-3)',background:'var(--bg-active)',padding:'2px 5px',borderRadius:4,border:'1px solid var(--border)',fontFamily:'"JetBrains Mono",monospace'}}>⌘K</span>
            </div>
          </div>
          <div style={{flex:1,overflowY:'auto',padding:'0 6px'}}>
            {threads.map(t=>(
              <div key={t.id} onClick={()=>{setActiveId(t.id);updateThreads(ts=>ts.map(th=>th.id===t.id?{...th,unread:false}:th));}}
                onMouseEnter={()=>setHoveredThread(t.id)} onMouseLeave={()=>setHoveredThread(null)}
                style={{width:'100%',margin:'1px 0',padding:'9px 10px',display:'flex',gap:10,alignItems:'center',cursor:'pointer',background:activeId===t.id?'var(--bg-active)':hoveredThread===t.id?'var(--bg-hover)':'transparent',borderRadius:8,transition:'background 0.1s',borderLeft:activeId===t.id?'2px solid var(--accent)':'2px solid transparent'}}>
                <div style={{width:30,height:30,borderRadius:8,flexShrink:0,background:activeId===t.id?'var(--accent-bg)':'var(--bg-2)',border:`1px solid ${activeId===t.id?'var(--accent-border)':'var(--border)'}`,display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.1s'}}>
                  <Icon name={t.iconName} size={14} color={activeId===t.id?'var(--accent)':'var(--text-3)'}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
                    <span style={{fontSize:12.5,fontWeight:t.unread?600:500,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.title}</span>
                    <span style={{fontSize:10,color:'var(--text-3)',flexShrink:0,marginLeft:6}}>{formatRelativeTime(t.updatedAt || t.createdAt) || t.time || ''}</span>
                  </div>
                  <span style={{fontSize:11,color:'var(--text-3)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',display:'block'}}>{t.subtitle}</span>
                </div>
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',flexShrink:0,minWidth:14}}>
                  {hoveredThread===t.id
                    ? <button aria-label={`Delete ${t.title || 'chat'}`} onClick={e=>{e.stopPropagation();if(window.confirm(`Delete "${t.title || 'this chat'}"? This cannot be undone.`)){const rest=threads.filter(th=>th.id!==t.id);updateThreads(rest);if(activeId===t.id)setActiveId(rest[0]?.id||null);setHoveredThread(null);}}} style={{border:'none',background:'transparent',cursor:'pointer',color:'var(--text-3)',display:'flex',padding:2,borderRadius:4,transition:'color 0.1s'}} onMouseEnter={e=>e.currentTarget.style.color='var(--red)'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-3)'}><Icon name="trash" size={13}/></button>
                    : t.unread&&<div style={{width:7,height:7,borderRadius:'50%',background:'var(--accent)'}}/>
                  }
                </div>
              </div>
            ))}
          </div>
          <div style={{padding:'8px 12px 12px',borderTop:'1px solid var(--border-light)'}}>
            <button onClick={createChatThread} style={{width:'100%',height:34,borderRadius:7,border:'1px solid var(--border)',background:'var(--bg-2)',display:'flex',alignItems:'center',justifyContent:'center',gap:6,cursor:'pointer',fontSize:12.5,fontWeight:500,color:'var(--text-2)',fontFamily:'inherit',transition:'background 0.12s,border-color 0.12s'}}
              onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.borderColor='var(--accent-border)';}} onMouseLeave={e=>{e.currentTarget.style.background='var(--bg-2)';e.currentTarget.style.borderColor='var(--border)';}}>
              <Icon name="plus" size={14}/> New chat
            </button>
          </div>
        </div>
      )}

      {/* ── Main area ── */}
      {nav==='workspace' && <NavSection id="workspace"><WorkspaceView events={events} threads={threads} agentRuns={activeAgents} workspaces={workspaces} setWorkspaces={setWorkspaces} onActiveWorkspace={setActiveWorkspace}/></NavSection>}
      {nav==='timeline' && <NavSection id="timeline"><TimelineView events={events}/></NavSection>}
      {nav==='automations' && <NavSection id="automations"><AutomationsView/></NavSection>}
      {nav==='agent' && <NavSection id="agent"><AgentDashboard activeAgents={activeAgents} onReviewFile={reviewFile}/></NavSection>}
      {nav==='filebrowser' && <NavSection id="filebrowser"><FileBrowser/></NavSection>}
      {nav==='build' && <NavSection id="build"><AgentBuilder/></NavSection>}
      {nav==='mobile' && <NavSection id="mobile"><MobileCompanion messages={telegramMessages} connected={telegramConnected} contactName={telegramContactName} onSend={sendTelegramMessage} sendError={telegramSendError}/></NavSection>}
      {nav==='settings' && <NavSection id="settings"><SettingsView isCheckingUpdate={isCheckingUpdate} updateInfo={updateInfo} version={version} onCheckForUpdates={triggerUpdateCheck} tgStatus={tgStatus} setTgStatus={setTgStatus} integrations={integrations} setIntegrations={setIntegrations} validateTg={validateTg} rendererTweaks={tweaks} onRendererTweakChange={(key, value) => setTweak(key, value)}/></NavSection>}

      {nav==='chat' && (
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,position:'relative'}}>
          {/* ── Chat header — clean, minimal ── */}
          <div style={{height:48,padding:'0 20px',borderBottom:'1px solid var(--border-light)',display:'flex',alignItems:'center',justifyContent:'space-between',background:'var(--bg)',flexShrink:0}}>
            {/* Left: title + status */}
            <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0,flex:1}}>
              <Icon name={thread?.iconName} size={15} color="var(--text-3)"/>
              <span style={{fontSize:14,fontWeight:600,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{thread?.title || 'New chat'}</span>
              {thread?.messages.some(m=>m.role==='agent'&&m.status==='running') && (
                <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,background:'var(--accent-bg)',color:'var(--accent)',border:'1px solid var(--accent-border)',fontWeight:500,display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                  <span style={{display:'inline-flex',animation:'spin 1.2s linear infinite'}}><Icon name="spinner" size={10} color="var(--accent)"/></span>
                  agent
                </span>
              )}
              {thread?.messages?.length > 0 && (
                <TokenBudgetBar messages={thread.messages} model={activeModel} />
              )}
            </div>
            {/* Right: workspace + more menu only */}
            <div style={{display:'flex',gap:4,alignItems:'center',flexShrink:0}}>
              {/* Workspace switcher — compact */}
              {workspaces.length > 0 && (
                <div style={{position:'relative'}} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setWsDropOpen(false);}} tabIndex={-1}>
                  <button onClick={()=>setWsDropOpen(o=>!o)} title="Switch workspace"
                    style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:`1px solid ${activeWorkspace?'var(--accent-border)':'var(--border)'}`,background:activeWorkspace?'var(--accent-bg)':'transparent',color:activeWorkspace?'var(--accent)':'var(--text-3)',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:5,transition:'all 0.12s',maxWidth:140}}
                    onMouseEnter={e=>{if(!activeWorkspace){e.currentTarget.style.borderColor='var(--accent-border)';e.currentTarget.style.color='var(--accent)';e.currentTarget.style.background='var(--accent-bg)';}}}
                    onMouseLeave={e=>{if(!activeWorkspace){e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--text-3)';e.currentTarget.style.background='transparent';}}}>
                    <Icon name="workspace" size={11} color={activeWorkspace?'var(--accent)':'var(--text-3)'}/>
                    <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:80}}>{activeWorkspace?.name||'Workspace'}</span>
                    <Icon name="chevronDown" size={8} color={activeWorkspace?'var(--accent)':'var(--text-3)'}/>
                  </button>
                  {wsDropOpen && (
                    <div style={{position:'absolute',top:'calc(100% + 4px)',right:0,minWidth:200,background:'rgba(var(--bg-2-rgb, 255, 255, 255), 0.76)',backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)',border:'1px solid var(--border)',borderRadius:10,boxShadow:'0 8px 32px var(--shadow-lg)',zIndex:999,overflow:'hidden',animation:'slideDown 0.15s ease-out'}}>
                      <div style={{padding:'6px 10px 4px',fontSize:9,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Switch workspace</div>
                      {workspaces.map(w=>(
                        <button key={w.id} onClick={()=>{
                          setActiveWorkspace(w);
                          window.electronAPI?.setActiveWorkspace(w);
                          setWsDropOpen(false);
                        }} style={{width:'100%',padding:'8px 10px',display:'flex',alignItems:'center',gap:8,border:'none',background:activeWorkspace?.id===w.id?'var(--bg-active)':'transparent',cursor:'pointer',textAlign:'left',transition:'background 0.1s'}}
                          onMouseEnter={e=>{if(activeWorkspace?.id!==w.id)e.currentTarget.style.background='var(--bg-hover)';}}
                          onMouseLeave={e=>{if(activeWorkspace?.id!==w.id)e.currentTarget.style.background='transparent';}}>
                          <div style={{width:20,height:20,borderRadius:5,background:w.color+'22',border:`1.5px solid ${w.color}55`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                            <span style={{fontSize:10,fontWeight:700,color:w.color}}>{w.name[0]}</span>
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:12,fontWeight:activeWorkspace?.id===w.id?600:400,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.name}</div>
                          </div>
                          {activeWorkspace?.id===w.id && <span style={{fontSize:9,color:'var(--accent)',fontWeight:600}}>✓</span>}
                        </button>
                      ))}
                      <div style={{borderTop:'1px solid var(--border-light)',padding:6}}>
                        <button onClick={()=>{setWsDropOpen(false);setNav('workspace');}} style={{width:'100%',padding:'6px 8px',borderRadius:5,border:'none',background:'transparent',color:'var(--text-3)',fontSize:11,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:5}}
                          onMouseEnter={e=>e.currentTarget.style.color='var(--text)'}
                          onMouseLeave={e=>e.currentTarget.style.color='var(--text-3)'}>
                          <Icon name="workspace" size={11}/> Manage workspaces
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* Split toggle — icon only */}
              <button onClick={()=>setSplitOpen(o=>!o)} title={splitOpen?'Close split view':'Open split view'} aria-label="split"
                style={{width:30,height:30,borderRadius:6,border:'none',background:splitOpen?'var(--bg-active)':'transparent',color:splitOpen?'var(--text)':'var(--text-3)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.12s'}}
                onMouseEnter={e=>{if(!splitOpen)e.currentTarget.style.background='var(--bg-hover)';}}
                onMouseLeave={e=>{if(!splitOpen)e.currentTarget.style.background='transparent';}}>
                <Icon name="splitH" size={14} color={splitOpen?'var(--text)':'var(--text-3)'}/>
              </button>
              {/* More menu — Export + Search */}
              <div style={{position:'relative'}} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setHeaderMenuOpen(false);}} tabIndex={-1}>
                <button onClick={()=>setHeaderMenuOpen(o=>!o)} title="More actions"
                  style={{width:30,height:30,borderRadius:6,border:'none',background:headerMenuOpen?'var(--bg-active)':'transparent',color:'var(--text-3)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.12s'}}
                  onMouseEnter={e=>{if(!headerMenuOpen)e.currentTarget.style.background='var(--bg-hover)';}}
                  onMouseLeave={e=>{if(!headerMenuOpen)e.currentTarget.style.background='transparent';}}>
                  <Icon name="chevronDown" size={16}/>
                </button>
                {headerMenuOpen && (
                  <div style={{position:'absolute',top:'calc(100% + 4px)',right:0,minWidth:180,background:'rgba(var(--bg-2-rgb, 255, 255, 255), 0.86)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',border:'1px solid var(--border)',borderRadius:10,boxShadow:'0 8px 32px var(--shadow-lg)',zIndex:999,overflow:'hidden',animation:'slideDown 0.15s ease-out',padding:4}}>
                    <button onClick={()=>{setIsSearchOpen(true);setHeaderMenuOpen(false);}} style={{width:'100%',padding:'8px 10px',display:'flex',alignItems:'center',gap:8,border:'none',background:'transparent',color:'var(--text-2)',fontSize:12,cursor:'pointer',textAlign:'left',borderRadius:6,transition:'background 0.1s'}}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <Icon name="search" size={13} color="var(--text-3)"/>
                      Search in conversation
                      <span style={{marginLeft:'auto',fontSize:9,color:'var(--text-3)'}}>Ctrl+F</span>
                    </button>
                    {activeId && (
                      <button onClick={async ()=>{setHeaderMenuOpen(false);const r=await window.electronAPI?.exportThread?.(activeId,'markdown');if(r?.ok){const blob=new Blob([r.content],{type:'text/markdown'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=r.filename;a.click();URL.revokeObjectURL(url);}}} style={{width:'100%',padding:'8px 10px',display:'flex',alignItems:'center',gap:8,border:'none',background:'transparent',color:'var(--text-2)',fontSize:12,cursor:'pointer',textAlign:'left',borderRadius:6,transition:'background 0.1s'}}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <Icon name="extern" size={13} color="var(--text-3)"/>
                        Export as Markdown
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div style={{flex:1,display:'flex',overflow:'hidden'}}>
            <div ref={scrollContainerRef} onScroll={handleScroll} style={{flex:1,overflowY:'auto',padding:'24px 24px',position:'relative'}} aria-live="polite" aria-relevant="additions">
              {isPreviewMode && (
                <div style={{marginBottom:12,padding:'10px 12px',borderRadius:8,border:'1px solid var(--orange-border)',background:'var(--orange-bg)',fontSize:12,color:'var(--text-2)'}}>
                  Preview mode only. The desktop backend is unavailable in this browser render, so chat execution, tools, and persisted app state are disabled.
                </div>
              )}
              {!thread && (
                <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center'}}>
                  <div style={{maxWidth:360}}>
                    <div style={{width:56,height:56,borderRadius:14,background:'var(--accent-bg)',border:'1px solid var(--accent-border)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 18px'}}>
                      <Icon name="chat" size={24} color="var(--accent)"/>
                    </div>
                    <h2 style={{fontSize:17,fontWeight:700,color:'var(--text)',marginBottom:6,letterSpacing:'-0.01em'}}>Start a conversation</h2>
                    <p style={{fontSize:13,color:'var(--text-3)',lineHeight:1.6}}>Ask Meg anything, paste code for review, or drop an image to analyze. Use <kbd style={{background:'var(--bg-active)',padding:'1px 5px',borderRadius:4,fontSize:11,border:'1px solid var(--border)',color:'var(--text-2)'}}>⌘K</kbd> to search.</p>
                  </div>
                </div>
              )}
              {thread?.messages.map(msg=>{
                if(msg.role==='agent')     return <AgentCard key={msg.id} step={msg}/>;
                if(msg.role==='tool_call') return <ToolCallCard key={msg.id} msg={msg}/>;
                if(msg.role==='user')      return <Message key={msg.id} msg={msg} isUser={true} accent={accent} onFork={async (messageId) => {
                  const r = await window.electronAPI?.forkThread?.(activeId, messageId);
                  if (r?.ok && r.thread) {
                    updateThreads(ts => [normalizeThread(r.thread), ...ts]);
                    setActiveId(r.thread.id);
                  }
                }}/>;
                return <Message key={msg.id} msg={msg} accent={accent}/>;
              })}
              {typing && <TypingIndicator/>}
              {userScrolledUp && typing && (
                <div style={{position:'sticky',bottom:12,display:'flex',justifyContent:'flex-end',paddingRight:8,pointerEvents:'none'}}>
                  <button
                    onClick={()=>{ setUserScrolledUp(false); messagesEndRef.current?.scrollIntoView({behavior:'smooth'}); }}
                    style={{pointerEvents:'all',height:28,padding:'0 12px',borderRadius:99,background:'var(--accent)',color:'#fff',border:'none',fontSize:11.5,fontWeight:600,cursor:'pointer',boxShadow:'0 2px 8px var(--shadow-lg)',display:'flex',alignItems:'center',gap:5,animation:'fadeUp 0.15s ease'}}
                  >
                    <Icon name="chevronDown" size={11} color="#fff"/> new message
                  </button>
                </div>
              )}
              <div ref={messagesEndRef}/>
            </div>
          </div>
          {redactionNotices[activeId] && (
            <div style={{padding:'3px 20px',background:'rgba(124,58,237,0.06)',borderTop:'1px solid rgba(124,58,237,0.15)',display:'flex',alignItems:'center',gap:6,fontSize:10,color:'#7c3aed'}}
              title={`${redactionNotices[activeId].count} secret${redactionNotices[activeId].count > 1 ? 's' : ''} were redacted before sending to ${redactionNotices[activeId].provider}. Your API keys and tokens are stripped from the context before it leaves your machine.`}>
              🔒 {redactionNotices[activeId].count} secret{redactionNotices[activeId].count > 1 ? 's' : ''} redacted before sending to {redactionNotices[activeId].provider}
            </div>
          )}
          <InputBar
            onSend={addMessage}
            onAbort={()=>window.electronAPI?.abortChat(activeId)}
            typing={typing}
            thinking={thinking}
            onToggleThinking={isThinkingModel(activeModel)?()=>setThinking(t=>!t):null}
            activeSkill={activeSkill}
            onSkillChange={setActiveSkill}
            activeWorkspace={activeWorkspace}
          />
          {smsOpen && <SmsFloat messages={telegramMessages} connected={telegramConnected} contactName={telegramContactName} onClose={()=>setSmsOpen(false)} onSend={sendTelegramMessage} sendError={telegramSendError}/>}
          
          {notifOpen && (
            <div style={{position:'absolute',top:44,right:0,zIndex:200}}>
              <NotifPanel notifs={notifs} onClose={()=>setNotifOpen(false)} onMarkAllRead={()=>{ setNotifs(current => { const next = markAllNotificationsRead(current); next.filter(n => n.read && !current.find(c => c.id === n.id)?.read).forEach(n => window.electronAPI?.upsertNotification?.(n)); return next; }); }} onDismiss={id=>{ setNotifs(curr => { const n = dismissNotification(curr, id); window.electronAPI?.deleteNotification?.(id); return n; }); }}/>
            </div>
          )}
        </div>
      )}

      {nav==='chat' && thread && !splitOpen && <ContextPanel thread={thread} onAddFiles={names=>updateThreads(ts=>ts.map(t=>t.id!==activeId?t:{...t,updatedAt:new Date().toISOString(),files:[...new Set([...(t.files||[]),...names])]}))} onToggleTool={(toolName, nextValue)=>{
        updateThreads(ts=>ts.map(t=>{
          if(t.id!==activeId) return t;
          const next = {...t,updatedAt:new Date().toISOString(),tools:{...(t.tools||DEFAULT_THREAD_TOOLS),[toolName]:nextValue}};
          window.electronAPI?.upsertThread?.(next);
          return next;
        }));
      }}/>}
      {splitOpen && <SplitPane activeFile={activeFile} activeWorkspace={activeWorkspace} terminalHistory={terminalHistory} onTerminalHistoryChange={onTerminalHistoryChange}/>}
      </div>{/* end main body */}
    </div>
  );
};

export { App };

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App/>);
}
