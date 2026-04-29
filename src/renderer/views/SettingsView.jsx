import { useEffect, useState } from 'react';
import { Icon } from '../components/icons.jsx';
import { Toggle } from '../components/primitives.jsx';

export const SettingsView = ({
  isCheckingUpdate,
  updateInfo,
  version,
  tgStatus,
  setTgStatus,
  integrations,
  setIntegrations,
  validateTg,
  rendererTweaks,
  onRendererTweakChange,
}) => {
  const [section,setSection] = useState('model');
  const [showTgInfo, setShowTgInfo] = useState(false);
  const [model,setModel] = useState('qwen/qwen3.5-9b');
  const [memOn,setMemOn] = useState(true);
  const [memories,setMemories] = useState([]);
  const deleteMemory = i => {
    const next=memories.filter((_,j)=>j!==i);
    setMemories(next);
    window.electronAPI?.setSetting('memories', next);
  };
  const [themeChoice,setThemeChoice] = useState('light');
  const [telegramToken,setTelegramToken] = useState('');
  const [telegramChatId,setTelegramChatId] = useState('');
  const [apiKeys,setApiKeys] = useState({});
  const [lmUrl,setLmUrl] = useState('http://127.0.0.1:1234');
  const [localModels,setLocalModels] = useState([]);
  const [lmUrlStatus, setLmUrlStatus] = useState(null); // null | 'checking' | {ok,count} | {ok:false,error}
  const DEFAULT_TOOL_PERMS = {readFiles:true,writeFiles:false,runCommands:false,webSearch:true,telegram:true,spawnAgents:true,requireApprovalForWrites:true,requireApprovalForCommands:true};
  const [toolPerms,setToolPerms] = useState(DEFAULT_TOOL_PERMS);
  const sections=[{id:'model',icon:'model',label:'Model'},{id:'integrations',icon:'integration',label:'Integrations'},{id:'permissions',icon:'lock',label:'Tool Permissions'},{id:'memory',icon:'memory',label:'Memory'},{id:'appearance',icon:'appearance',label:'Appearance'},{id:'updates',icon:'bolt',label:'Updates'}];
  const CLOUD_MODELS=['claude-3-5-sonnet','claude-3-5-haiku','claude-3-opus','gpt-4o','gpt-4o-mini','gemini-1.5-pro'];
  const isThinkingModel = m => /qwen3|deepseek.?r1|thinking/i.test(m||'');
  const accentChoice = rendererTweaks?.accentColor || 'blue';
  const sidebarChoice = rendererTweaks?.sidebarWidth || 'comfortable';

  const saveLmUrl = async (url) => {
    setLmUrl(url);
    window.electronAPI?.setSetting('lmStudioUrl', url);
    window.dispatchEvent(new CustomEvent('meg:action', {detail:{action:'lmPing'}}));
  };
  const testLmUrl = async () => {
    setLmUrlStatus('checking');
    window.electronAPI?.setSetting('lmStudioUrl', lmUrl);
    const r = await window.electronAPI?.ping();
    setLmUrlStatus(r || {ok:false,error:'No response'});
    if (r?.ok) {
      const mods = await window.electronAPI?.getModels();
      setLocalModels((mods||[]).map(m=>m.id||m));
    }
  };
  useEffect(()=>{
    if(!window.electronAPI) return;
    window.electronAPI.getModels().then(mods=>setLocalModels((mods||[]).map(m=>m.id||m)));
    window.electronAPI.getSetting('model').then(m => {
      if (typeof m === 'string' && m.trim()) setModel(m);
    });
    window.electronAPI.getSetting('apiKeys').then(keys => {
      if (keys && typeof keys === 'object') setApiKeys(keys);
    });
    window.electronAPI.getSetting('memoryEnabled').then(value => {
      if (typeof value === 'boolean') setMemOn(value);
    });
    window.electronAPI.getSetting('memories').then(value => {
      if (Array.isArray(value)) setMemories(value);
    });
    window.electronAPI.getSetting('lmStudioUrl').then(url => {
      if (typeof url === 'string' && url.trim()) setLmUrl(url);
    });
    window.electronAPI.getSetting('telegramToken').then(value => {
      if (typeof value === 'string') setTelegramToken(value);
    });
    window.electronAPI.getSetting('telegramChatId').then(value => {
      if (typeof value === 'string') setTelegramChatId(value);
    });
    window.electronAPI.getSetting('theme').then(value => {
      if (typeof value === 'string' && value.trim()) setThemeChoice(value);
    });
    window.electronAPI.getSetting('toolPermissions').then(p=>{
      if(p) {
        const next = {...DEFAULT_TOOL_PERMS,...p};
        setToolPerms(next);
      }
    });
  },[]);

  const saveModel = m => {
    setModel(m);
    window.electronAPI?.setSetting('model', m);
    window.dispatchEvent(new CustomEvent('meg:action', {detail:{action:'setModel',value:m}}));
  };
  const saveTgToken = t => { setTelegramToken(t); window.electronAPI?.setSetting('telegramToken',t); };
  const saveTgChatId = id => { setTelegramChatId(id); window.electronAPI?.setSetting('telegramChatId',id); };
  const saveApiKey = (provider,val) => { const next={...apiKeys,[provider]:val}; setApiKeys(next); window.electronAPI?.setSetting('apiKeys',next); };
  const saveToolPerm = (key,val) => {
    const next = {...toolPerms,[key]:val};
    setToolPerms(next);
    window.electronAPI?.setSetting('toolPermissions',next);
  };

  return (
    <div style={{flex:1,display:'flex',minWidth:0,overflow:'hidden'}}>
      <div style={{width:200,borderRight:'1px solid var(--border)',background:'var(--bg-panel)',flexShrink:0,padding:'12px 8px'}}>
        <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',letterSpacing:'0.06em',textTransform:'uppercase',padding:'0 8px',marginBottom:8}}>Settings</div>
        {sections.map(s=>(
          <button key={s.id} onClick={()=>setSection(s.id)} style={{width:'100%',padding:'8px 10px',borderRadius:6,display:'flex',alignItems:'center',gap:8,background:section===s.id?'var(--bg-active)':'transparent',border:'none',cursor:'pointer',marginBottom:2,textAlign:'left',transition:'background 0.1s'}}>
            <Icon name={s.icon} size={14} color={section===s.id?'var(--accent)':'var(--text-3)'}/>
            <span style={{fontSize:12.5,fontWeight:section===s.id?500:400,color:section===s.id?'var(--text)':'var(--text-2)'}}>{s.label}</span>
          </button>
        ))}
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'24px 28px'}}>
        {section==='model' && <div>
          <h2 style={{fontSize:15,fontWeight:600,marginBottom:4,color:'var(--text)'}}>AI Model</h2>
          <p style={{fontSize:12.5,color:'var(--text-3)',marginBottom:16,lineHeight:1.6}}>Default model for all tasks. Override per-chat anytime.</p>

          {/* LM Studio connection */}
          <div style={{marginBottom:20,padding:'12px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-2)'}}>
            <div style={{fontSize:12,fontWeight:600,color:'var(--text)',marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
              <Icon name="terminal" size={13} color="var(--text-3)"/>Local AI (LM Studio)
            </div>
            <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:8}}>
              <input value={lmUrl} onChange={e=>setLmUrl(e.target.value)} onBlur={e=>{e.target.style.borderColor='var(--border)';saveLmUrl(e.target.value);}} placeholder="http://127.0.0.1:1234" style={{flex:1,border:'1px solid var(--border)',borderRadius:6,padding:'6px 10px',fontSize:12,fontFamily:'"JetBrains Mono",monospace',outline:'none',background:'var(--bg-input)',color:'var(--text)',transition:'border-color 0.15s'}} onFocus={e=>e.target.style.borderColor='var(--accent)'}/>
              <button onClick={testLmUrl} disabled={lmUrlStatus==='checking'} style={{padding:'6px 12px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',fontSize:12,color:'var(--text-2)',cursor:'pointer',flexShrink:0,transition:'border-color 0.12s'}} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                {lmUrlStatus==='checking'?'Testing…':'Test'}
              </button>
            </div>
            {lmUrlStatus && lmUrlStatus!=='checking' && (
              <div style={{fontSize:11.5,display:'flex',alignItems:'center',gap:5,color:lmUrlStatus.ok?'var(--green)':'var(--red,#e05252)'}}>
                <Icon name={lmUrlStatus.ok?'check':'close'} size={11} color={lmUrlStatus.ok?'var(--green)':'var(--red,#e05252)'}/>
                {lmUrlStatus.ok?`Connected · ${lmUrlStatus.count} model${lmUrlStatus.count!==1?'s':''} found`:lmUrlStatus.error}
              </div>
            )}
          </div>

          {/* Local models */}
          {localModels.length>0 && <>
            <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Local</div>
            <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:16}}>
              {localModels.map((m,i)=>(
                <label key={m} onClick={()=>saveModel(m)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:7,border:`1px solid ${model===m?'var(--accent-border)':'var(--border)'}`,background:model===m?'var(--accent-bg)':'var(--bg-2)',cursor:'pointer',transition:'all 0.15s',animation:`fadeUp 0.2s ${i*0.04}s both`}}>
                  <div style={{width:16,height:16,borderRadius:'50%',border:`2px solid ${model===m?'var(--accent)':'var(--border)'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'border-color 0.15s'}}>
                    {model===m && <div style={{width:7,height:7,borderRadius:'50%',background:'var(--accent)'}}/>}
                  </div>
                  <span style={{fontFamily:'"JetBrains Mono",monospace',fontSize:12,color:model===m?'var(--accent)':'var(--text-2)',fontWeight:model===m?500:400,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m}</span>
                  {isThinkingModel(m) && <span style={{display:'flex',alignItems:'center',gap:3,fontSize:10,color:'var(--accent)',background:'var(--accent-bg)',border:'1px solid var(--accent-border)',borderRadius:99,padding:'1px 6px',flexShrink:0}}><Icon name="zap" size={9} color="var(--accent)"/>Thinking</span>}
                  <span style={{fontSize:10.5,color:'var(--text-3)',background:'var(--bg-active)',padding:'1px 7px',borderRadius:99,flexShrink:0}}>Local</span>
                </label>
              ))}
            </div>
          </>}

          {/* Cloud models */}
          <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Cloud</div>
          <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:28}}>
            {CLOUD_MODELS.map((m,i)=>(
              <label key={m} onClick={()=>saveModel(m)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:7,border:`1px solid ${model===m?'var(--accent-border)':'var(--border)'}`,background:model===m?'var(--accent-bg)':'var(--bg-2)',cursor:'pointer',transition:'all 0.15s',animation:`fadeUp 0.2s ${i*0.04}s both`}}>
                <div style={{width:16,height:16,borderRadius:'50%',border:`2px solid ${model===m?'var(--accent)':'var(--border)'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'border-color 0.15s'}}>
                  {model===m && <div style={{width:7,height:7,borderRadius:'50%',background:'var(--accent)'}}/>}
                </div>
                <span style={{fontFamily:'"JetBrains Mono",monospace',fontSize:12.5,color:model===m?'var(--accent)':'var(--text-2)',fontWeight:model===m?500:400,transition:'color 0.15s'}}>{m}</span>
                <span style={{marginLeft:'auto',fontSize:10.5,color:'var(--text-3)',background:'var(--bg-active)',padding:'1px 7px',borderRadius:99,flexShrink:0}}>{m.startsWith('claude')?'Anthropic':m.startsWith('gpt')?'OpenAI':'Google'}</span>
              </label>
            ))}
          </div>

          {/* API Keys */}
          <div style={{borderTop:'1px solid var(--border-light)',paddingTop:20}}>
            <h3 style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:4}}>API Keys</h3>
            <p style={{fontSize:12,color:'var(--text-3)',marginBottom:14,lineHeight:1.6}}>Optional — leave blank to use built-in access. Keys are stored locally and never sent to our servers.</p>
            {[
              {provider:'Anthropic',placeholder:'sk-ant-api03-…',color:'#d97706',models:['claude-3-5-sonnet','claude-3-5-haiku','claude-3-opus']},
              {provider:'OpenAI',placeholder:'sk-proj-…',color:'#10a37f',models:['gpt-4o','gpt-4o-mini']},
              {provider:'Google',placeholder:'AIzaSy…',color:'#4285f4',models:['gemini-1.5-pro']},
            ].map(({provider,placeholder,color,models:provModels},i)=>{
              const isRelevant = provModels.includes(model);
              return (
                <div key={provider} style={{marginBottom:12,padding:'10px 12px',borderRadius:8,border:`1px solid ${isRelevant?'var(--accent-border)':'var(--border)'}`,background:isRelevant?'var(--accent-bg)':'var(--bg-panel)',transition:'all 0.2s',animation:`fadeUp 0.2s ${0.05+i*0.06}s both`}}>
                  <label style={{display:'flex',alignItems:'center',gap:7,marginBottom:7,cursor:'default'}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:color,flexShrink:0,boxShadow:`0 0 0 2px ${color}33`}}/>
                    <span style={{fontSize:12,fontWeight:600,color:'var(--text)'}}>{provider}</span>
                    {isRelevant && <span style={{fontSize:10,color:'var(--accent)',background:'var(--accent-bg)',padding:'1px 5px',borderRadius:99,border:'1px solid var(--accent-border)',marginLeft:2}}>active</span>}
                    <span style={{marginLeft:'auto',fontSize:10.5,color:'var(--text-3)'}}>{provModels.join(', ')}</span>
                  </label>
                  <div style={{position:'relative'}}>
                    <input type="password" value={apiKeys[provider]||''} onChange={e=>saveApiKey(provider,e.target.value)} placeholder={placeholder} style={{width:'100%',border:`1px solid var(--border)`,borderRadius:6,padding:'7px 36px 7px 10px',fontSize:12,fontFamily:'"JetBrains Mono",monospace',outline:'none',background:'var(--bg-input)',color:'var(--text)',transition:'border-color 0.15s'}} onFocus={e=>e.target.style.borderColor='var(--accent)'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
                    <span style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',display:'flex',alignItems:'center'}}><Icon name={apiKeys[provider]?'check':'key'} size={12} color={apiKeys[provider]?'var(--green)':'var(--text-3)'}/></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>}
        {section==='integrations' && <div>
          <h2 style={{fontSize:15,fontWeight:600,marginBottom:4,color:'var(--text)'}}>Integrations</h2>
          <p style={{fontSize:12.5,color:'var(--text-3)',marginBottom:20,lineHeight:1.6}}>Connect Telegram so Meg can message you and act on replies.</p>

          {/* Telegram */}
          <div style={{padding:'16px',borderRadius:10,border:`1.5px solid ${integrations.Telegram?'var(--accent-border)':'var(--border)'}`,background:integrations.Telegram?'var(--accent-bg)':'var(--bg-2)',marginBottom:16,transition:'all 0.2s'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:integrations.Telegram?0:12}}>
              <div style={{width:32,height:32,borderRadius:8,background:'#229ed9',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <Icon name="sms" size={16} color="#fff"/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>Telegram Bot</div>
                <div style={{fontSize:11.5,color:'var(--text-3)'}}>
                  {integrations.Telegram ? `Connected · @${tgStatus?.username||'bot'}` : 'Not connected'}
                </div>
              </div>
              <Toggle on={integrations.Telegram} onToggle={()=>{
                if(integrations.Telegram) {
                  setIntegrations(s=>({...s,Telegram:false}));
                  setTgStatus(null);
                  window.electronAPI?.stopTelegramPolling(telegramToken);
                } else {
                  // If clicking toggle while off, just show the form
                }
              }}/>
            </div>
            
            {!integrations.Telegram && (
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <div style={{marginTop:4}}>
                  <label style={{fontSize:11.5,fontWeight:500,color:'var(--text-3)',display:'block',marginBottom:4}}>Bot Token <span style={{fontWeight:400}}>— from @BotFather</span></label>
                  <input type="password" value={telegramToken} onChange={e=>saveTgToken(e.target.value)} placeholder="123456789:ABCdef…" style={{width:'100%',border:'1px solid var(--border)',borderRadius:6,padding:'8px 10px',fontSize:12,fontFamily:'"JetBrains Mono",monospace',outline:'none',background:'var(--bg-input)',color:'var(--text)',transition:'border-color 0.15s'}} onFocus={e=>e.target.style.borderColor='var(--accent)'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
                </div>

                <div style={{border:'1px solid var(--border)',borderRadius:8,overflow:'hidden',background:'rgba(0,0,0,0.02)'}}>
                  <button onClick={()=>setShowTgInfo(!showTgInfo)} style={{width:'100%',padding:'8px 12px',background:'none',border:'none',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',color:'var(--text-2)',fontSize:11.5,fontWeight:500}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}><Icon name="info" size={12} color="var(--accent)"/> How it works</div>
                    <Icon name={showTgInfo?'up':'down'} size={12} color="var(--text-3)"/>
                  </button>
                  {showTgInfo && (
                    <div style={{padding:'0 12px 12px',fontSize:11.5,color:'var(--text-3)',lineHeight:1.5,animation:'fadeUp 0.2s ease'}}>
                      <p style={{marginBottom:8}}>Telegram has a security rule: <b>Bots cannot message humans first.</b></p>
                      <ol style={{paddingLeft:16,display:'flex',flexDirection:'column',gap:4}}>
                        <li>Paste your bot token above.</li>
                        <li>Click <b>Verify & Connect</b>.</li>
                        <li>Open Telegram and send <b>any message</b> to your bot.</li>
                      </ol>
                      <p style={{marginTop:8}}>Meg will see your message, grab your ID, and reply instantly to confirm the link.</p>
                    </div>
                  )}
                </div>
                
                <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:4}}>
                  <button onClick={()=>validateTg(telegramToken)} disabled={!telegramToken.trim()||(tgStatus==='checking'||tgStatus?.waiting)} style={{padding:'7px 16px',borderRadius:6,background:tgStatus?.waiting?'var(--orange)':'var(--accent)',color:'#fff',fontSize:12.5,fontWeight:500,border:'none',cursor:telegramToken.trim()?'pointer':'not-allowed',opacity:telegramToken.trim()?1:0.5,transition:'all 0.15s'}}>
                    {tgStatus==='checking'?'Validating…':tgStatus?.waiting?'Waiting for message…':'Verify & Connect'}
                  </button>
                  {tgStatus?.waiting && (
                    <div style={{fontSize:11.5,color:'var(--orange)',background:'var(--orange)11',padding:'8px 10px',borderRadius:6,border:'1px solid var(--orange)33',animation:'pulse 2s infinite'}}>
                      <b>Action Required:</b> Send any message to your bot <b>@{tgStatus.username}</b> on Telegram now to complete the connection.
                    </div>
                  )}

                  {tgStatus&&tgStatus!=='checking'&&!tgStatus.waiting&&(
                    <span style={{fontSize:12,color:tgStatus.ok?'var(--green)':'var(--red)',fontWeight:500}}>
                      {!tgStatus.ok && <span style={{display:'flex',alignItems:'center',gap:4}}><Icon name="close" size={12} color="var(--red,#e05252)"/>{tgStatus.error}</span>}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* GitHub */}
          <div style={{padding:'12px 16px',borderRadius:10,border:'1px solid var(--border)',background:'var(--bg-2)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:32,height:32,borderRadius:8,background:integrations.GitHub?'var(--accent-bg)':'var(--bg-active)',border:`1px solid ${integrations.GitHub?'var(--accent-border)':'var(--border)'}`,display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.2s'}}>
                <Icon name="git" size={15} color={integrations.GitHub?'var(--accent)':'var(--text-3)'}/>
              </div>
              <div><div style={{fontSize:13,fontWeight:500,color:'var(--text)'}}>GitHub</div><div style={{fontSize:11.5,color:'var(--text-3)'}}>{integrations.GitHub?'Connected':'Not connected'}</div></div>
            </div>
            <Toggle on={integrations.GitHub} onToggle={()=>setIntegrations(s=>({...s,GitHub:!s.GitHub}))}/>
          </div>
        </div>}
        {section==='permissions' && <div>
          <h2 style={{fontSize:15,fontWeight:600,marginBottom:4,color:'var(--text)'}}>Tool Permissions</h2>
          <p style={{fontSize:12.5,color:'var(--text-3)',marginBottom:20,lineHeight:1.6}}>Control what Meg and background agents can do from model tool calls.</p>

          {[
            {key:'readFiles',title:'Read files and list folders',desc:'Allows file reads, directory listing, and workspace search.'},
            {key:'writeFiles',title:'Write files',desc:'Allows Meg to create or overwrite files inside the active workspace.'},
            {key:'runCommands',title:'Run terminal commands',desc:'Allows non-destructive commands in the active workspace.'},
            {key:'webSearch',title:'Instant web answers',desc:'Allows DuckDuckGo instant-answer lookups for current information. This is not full web browsing.'},
            {key:'telegram',title:'Send Telegram messages',desc:'Allows Meg to send Telegram messages through your connected bot.'},
            {key:'spawnAgents',title:'Spawn background agents',desc:'Allows the model to create focused background agent runs.'},
          ].map((p,i)=>(
            <div key={p.key} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,padding:'12px 0',borderBottom:'1px solid var(--border-light)',animation:`fadeUp 0.18s ${i*0.04}s both`}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:13,fontWeight:500,color:'var(--text)',marginBottom:2}}>{p.title}</div>
                <div style={{fontSize:11.5,color:'var(--text-3)',lineHeight:1.45}}>{p.desc}</div>
              </div>
              <Toggle on={!!toolPerms[p.key]} onToggle={()=>saveToolPerm(p.key,!toolPerms[p.key])}/>
            </div>
          ))}

          <div style={{marginTop:22,padding:'14px 16px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-2)'}}>
            <div style={{fontSize:12,fontWeight:600,color:'var(--text)',marginBottom:10,display:'flex',alignItems:'center',gap:6}}>
              <Icon name="lock" size={13} color="var(--text-3)"/>Approval Gates
            </div>
            {[
              {key:'requireApprovalForWrites',title:'Require approval for file writes',desc:'When enabled, model file writes are blocked until an approval flow exists.'},
              {key:'requireApprovalForCommands',title:'Require approval for terminal commands',desc:'When enabled, model terminal commands are blocked until an approval flow exists.'},
            ].map(p=>(
              <div key={p.key} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,padding:'10px 0',borderTop:'1px solid var(--border-light)'}}>
                <div>
                  <div style={{fontSize:12.5,fontWeight:500,color:'var(--text)'}}>{p.title}</div>
                  <div style={{fontSize:11.5,color:'var(--text-3)',lineHeight:1.45}}>{p.desc}</div>
                </div>
                <Toggle on={!!toolPerms[p.key]} onToggle={()=>saveToolPerm(p.key,!toolPerms[p.key])}/>
              </div>
            ))}
          </div>
        </div>}
        {section==='memory' && <div>
          <h2 style={{fontSize:15,fontWeight:600,marginBottom:4,color:'var(--text)'}}>Memory</h2>
          <p style={{fontSize:12.5,color:'var(--text-3)',marginBottom:20,lineHeight:1.6}}>Meg remembers facts across conversations.</p>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderBottom:'1px solid var(--border-light)',marginBottom:16}}>
            <div><div style={{fontSize:13,fontWeight:500,color:'var(--text)'}}>Enable memory</div><div style={{fontSize:11.5,color:'var(--text-3)'}}>Persist facts across sessions</div></div>
            <Toggle on={memOn} onToggle={()=>{ const next=!memOn; setMemOn(next); window.electronAPI?.setSetting('memoryEnabled',next); }}/>
          </div>
          {memOn && memories.length===0 && (
            <div style={{padding:'10px 12px',background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:6,fontSize:12.5,color:'var(--text-3)',lineHeight:1.5}}>
              No saved memories yet.
            </div>
          )}
          {memOn && memories.map((m,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 10px',background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:6,marginBottom:5}}>
              <span style={{fontSize:12.5,color:'var(--text-2)'}}>{m}</span>
              <button onClick={()=>deleteMemory(i)} style={{color:'var(--text-3)',display:'flex',padding:2,background:'none',border:'none',cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.color='var(--red)'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-3)'}><Icon name="close" size={12}/></button>
            </div>
          ))}
        </div>}
        {section==='appearance' && <div>
          <h2 style={{fontSize:15,fontWeight:600,marginBottom:4,color:'var(--text)'}}>Appearance</h2>
          <p style={{fontSize:12.5,color:'var(--text-3)',marginBottom:20,lineHeight:1.6}}>Customize theme and interface density for the shipped app surface.</p>
          <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',letterSpacing:'0.05em',textTransform:'uppercase',marginBottom:10}}>Theme</div>
          <div style={{display:'flex',gap:8}}>
            {['Light','Dark','System'].map((t,i)=>{
              const active = themeChoice===t.toLowerCase();
              const applyTheme = () => {
                const val = t.toLowerCase();
                setThemeChoice(val);
                window.electronAPI?.setSetting('theme', val);
                window.dispatchEvent(new CustomEvent('meg:action', {detail:{action:'setTheme',value:val}}));
              };
              return (
                <div key={t} onClick={applyTheme} style={{padding:'10px 16px',borderRadius:7,border:`1px solid ${active?'var(--accent-border)':'var(--border)'}`,background:active?'var(--accent-bg)':'var(--bg-2)',cursor:'pointer',fontSize:12.5,color:active?'var(--accent)':'var(--text-2)',fontWeight:active?500:400,display:'flex',alignItems:'center',gap:6,transition:'all 0.15s'}}>
                  <Icon name={t==='Dark'?'moon':'sun'} size={13} color={active?'var(--accent)':'var(--text-3)'}/>{t}
                </div>
              );
            })}
          </div>
          <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',letterSpacing:'0.05em',textTransform:'uppercase',margin:'18px 0 10px'}}>Accent</div>
          <div style={{display:'flex',gap:8,marginBottom:18}}>
            {[
              {label:'Blue', value:'blue'},
              {label:'Warm', value:'warm'},
              {label:'Green', value:'green'},
            ].map((option) => {
              const active = accentChoice === option.value;
              return (
                <div
                  key={option.value}
                  onClick={() => onRendererTweakChange?.('accentColor', option.value)}
                  style={{padding:'10px 16px',borderRadius:7,border:`1px solid ${active?'var(--accent-border)':'var(--border)'}`,background:active?'var(--accent-bg)':'var(--bg-2)',cursor:'pointer',fontSize:12.5,color:active?'var(--accent)':'var(--text-2)',fontWeight:active?500:400,display:'flex',alignItems:'center',gap:6,transition:'all 0.15s'}}
                >
                  <Icon name="appearance" size={13} color={active?'var(--accent)':'var(--text-3)'}/>{option.label}
                </div>
              );
            })}
          </div>
          <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',letterSpacing:'0.05em',textTransform:'uppercase',marginBottom:10}}>Sidebar Density</div>
          <div style={{display:'flex',gap:8}}>
            {[
              {label:'Compact', value:'compact'},
              {label:'Cozy', value:'comfortable'},
            ].map((option) => {
              const active = sidebarChoice === option.value;
              return (
                <div
                  key={option.value}
                  onClick={() => onRendererTweakChange?.('sidebarWidth', option.value)}
                  style={{padding:'10px 16px',borderRadius:7,border:`1px solid ${active?'var(--accent-border)':'var(--border)'}`,background:active?'var(--accent-bg)':'var(--bg-2)',cursor:'pointer',fontSize:12.5,color:active?'var(--accent)':'var(--text-2)',fontWeight:active?500:400,display:'flex',alignItems:'center',gap:6,transition:'all 0.15s'}}
                >
                  <Icon name="sidebar" size={13} color={active?'var(--accent)':'var(--text-3)'}/>{option.label}
                </div>
              );
            })}
          </div>
        </div>}
        {section==='updates' && <div>
          <h2 style={{fontSize:15,fontWeight:600,marginBottom:4,color:'var(--text)'}}>Software Updates</h2>
          <p style={{fontSize:12.5,color:'var(--text-3)',marginBottom:20,lineHeight:1.6}}>Check for new versions and manage app updates.</p>
          
          <div style={{padding:'16px',borderRadius:10,border:'1px solid var(--border)',background:'var(--bg-2)',display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>Version {version}</div>
              <div style={{fontSize:11.5,color:'var(--text-3)'}}>
                {isCheckingUpdate ? 'Checking for updates…' :
                  updateInfo?.status === 'available' ? `Version ${updateInfo.version} is available to download.` :
                  updateInfo?.status === 'downloading' ? `Downloading version ${updateInfo.version} (${updateInfo.progress}%).` :
                  updateInfo?.status === 'ready' ? `Version ${updateInfo.version} is ready to install.` :
                  'No update check has run in this session.'}
              </div>
            </div>
            <button 
              disabled={isCheckingUpdate}
              onClick={()=>window.dispatchEvent(new CustomEvent('meg:action',{detail:{action:'checkForUpdates'}}))} 
              style={{padding:'6px 12px',borderRadius:6,border:'1px solid var(--border)',fontSize:12,color:isCheckingUpdate?'var(--text-3)':'var(--text-2)',background:isCheckingUpdate?'var(--bg-active)':'var(--bg)',cursor:isCheckingUpdate?'default':'pointer',display:'flex',alignItems:'center',gap:6,transition:'border-color 0.12s'}}
            >
              {isCheckingUpdate && <span style={{display:'inline-flex',animation:'spin 1s linear infinite'}}><Icon name="spinner" size={12}/></span>}
              {isCheckingUpdate ? 'Checking…' : 'Check now'}
            </button>
          </div>

          <div style={{fontSize:11,color:'var(--text-3)',fontStyle:'italic'}}>
            {updateInfo?.status ? `Updater state: ${updateInfo.status}` : 'Updater idle'}
          </div>
        </div>}
      </div>
    </div>
  );
};
