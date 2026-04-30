import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { SKILLS } from '../lib/skills.js';

const VoiceInput = ({onTranscribe}) => {
  const [state, setState] = useState('idle'); // idle | listening | error
  const recogRef = useRef(null);

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  const toggle = () => {
    if(!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser/environment.');
      return;
    }
    if(state !== 'idle') {
      recogRef.current?.stop();
      setState('idle');
      return;
    }
    const recog = new SpeechRecognition();
    recog.lang = 'en-US';
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    recogRef.current = recog;

    recog.onstart  = () => setState('listening');
    recog.onresult = e => {
      const transcript = e.results[0][0].transcript;
      onTranscribe(transcript);
      setState('idle');
    };
    recog.onerror  = () => setState('idle');
    recog.onend    = () => setState('idle');
    recog.start();
  };

  useEffect(() => () => recogRef.current?.stop(), []);

  return (
    <button onClick={toggle} title={state==='idle'?'Voice input':'Stop listening'} className="btn-pressable"
      style={{width:30,height:30,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',background:state!=='idle'?'var(--accent-bg)':'transparent',border:state!=='idle'?'1px solid var(--accent-border)':'none',color:state!=='idle'?'var(--accent)':'var(--text-3)',transition:'background 0.15s,color 0.15s,border-color 0.15s',flexShrink:0}}
      onMouseEnter={e=>{if(state==='idle'){e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-2)';}}}
      onMouseLeave={e=>{if(state==='idle'){e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-3)';}}}
    >
      {state==='listening' ? (
        <div style={{display:'flex',gap:2,alignItems:'center'}}>
          {[0,1,2,3,4].map(i=><div key={i} className="wave-bar"/>)}
        </div>
      ) : (
        <Icon name="mic" size={14}/>
      )}
    </button>
  );
};

export const InputBar = ({onSend,onAbort,typing,placeholder,thinking,onToggleThinking,activeSkill,onSkillChange}) => {
  const [val,setVal] = useState('');
  const [hint,setHint] = useState(null);
  const [skillOpen,setSkillOpen] = useState(false);
  const textareaRef = useRef(null);
  const handleChange = e => {
    setVal(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  };
  const resetHeight = () => { if (textareaRef.current) textareaRef.current.style.height = 'auto'; };
  const attachFiles = async () => {
    const result = await window.electronAPI?.openFile?.();
    const names = result?.filePaths?.map(p => p.split(/[\\/]/).pop()).filter(Boolean) || [];
    if (!names.length) return;
    const additions = names.map(name => `@file(${name})`).join(' ');
    setVal(prev => prev.trim() ? `${prev} ${additions} ` : `${additions} `);
    setHint(null);
  };
  const handleKey = e => {
    if (e.key==='Enter'&&!e.shiftKey){
      e.preventDefault();
      if(typing) return;
      if(val.trim()){onSend(val.trim());setVal('');setHint(null);resetHeight();}
    }
    if (e.key==='@') setHint('@');
    else if (e.key==='/') setHint('/');
    else if (e.key==='Escape') { setHint(null); setSkillOpen(false); }
  };

  const grouped = SKILLS.reduce((acc, s) => { (acc[s.category] = acc[s.category] || []).push(s); return acc; }, {});

  return (
    <div style={{padding:'10px 14px',borderTop:'1px solid var(--border-light)',background:'var(--bg)',flexShrink:0}}>
      {/* Skill picker popover */}
      {skillOpen && (
        <div style={{marginBottom:8,background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:10,padding:'10px',boxShadow:'0 4px 20px var(--shadow-lg)'}}>
          <div style={{fontSize:10,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>
            Skill — auto-detected from message when none selected
          </div>
          <div style={{maxHeight:340,overflowY:'auto',paddingRight:2}}>
            {/* None / auto-detect */}
            <button onClick={()=>{onSkillChange?.(null);setSkillOpen(false);}}
              style={{marginBottom:10,padding:'5px 10px',borderRadius:7,border:`1.5px solid ${activeSkill===null?'var(--accent-border)':'var(--border-light)'}`,background:activeSkill===null?'var(--accent-bg)':'var(--bg)',cursor:'pointer',display:'flex',alignItems:'center',gap:8,transition:'all 0.12s'}}>
              <span style={{fontSize:14}}>✦</span>
              <div style={{textAlign:'left'}}>
                <div style={{fontSize:10.5,fontWeight:600,color:activeSkill===null?'var(--accent)':'var(--text-2)'}}>None (auto-detect)</div>
                <div style={{fontSize:9.5,color:'var(--text-3)'}}>Meg picks the best skill based on your message</div>
              </div>
            </button>
            {/* Category groups */}
            {Object.entries(grouped).map(([cat, skills]) => (
              <div key={cat} style={{marginBottom:10}}>
                <div style={{fontSize:9,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:5,paddingLeft:1}}>{cat}</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:4}}>
                  {skills.map(s => {
                    const isActive = activeSkill===s.id;
                    return (
                      <button key={s.id} onClick={()=>{onSkillChange?.(s.id);setSkillOpen(false);}}
                        style={{padding:'6px 3px',borderRadius:7,border:`1.5px solid ${isActive?(s.color||'var(--accent)')+'88':'var(--border-light)'}`,background:isActive?(s.color||'var(--accent)')+'15':'var(--bg)',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,transition:'all 0.12s',minWidth:0}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor=(s.color||'var(--accent)')+'88';e.currentTarget.style.background=(s.color||'var(--accent)')+'15';}}
                        onMouseLeave={e=>{if(!isActive){e.currentTarget.style.borderColor='var(--border-light)';e.currentTarget.style.background='var(--bg)';}}}>
                        <span style={{fontSize:13}}>{s.icon}</span>
                        <span style={{fontSize:9.5,fontWeight:600,color:isActive?(s.color||'var(--accent)'):'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'100%',textAlign:'center'}}>{s.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Active skill badge */}
      {activeSkill && (() => {
        const s = SKILLS.find(x=>x.id===activeSkill);
        return s ? (
          <div style={{marginBottom:6,display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:11,padding:'2px 8px',borderRadius:99,background:s.color+'18',border:`1px solid ${s.color}44`,color:s.color,fontWeight:500,display:'flex',alignItems:'center',gap:4}}>
              <span>{s.icon}</span>{s.name} skill active
            </span>
            <button onClick={()=>onSkillChange?.(null)} style={{fontSize:10,color:'var(--text-3)',background:'none',border:'none',cursor:'pointer',padding:'0 2px'}} title="Clear skill">✕</button>
          </div>
        ) : null;
      })()}
      {hint && (
        <div style={{marginBottom:6,background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 8px',display:'flex',gap:4,flexWrap:'wrap',boxShadow:'0 4px 16px var(--shadow)'}}>
          {hint==='@'&&['@file','@clipboard','@memory','@web'].map(t=>(
            <span key={t} onClick={()=>{setVal(v=>v+t+' ');setHint(null);}} style={{fontSize:11.5,padding:'3px 8px',background:'var(--accent-bg)',color:'var(--accent)',borderRadius:99,border:'1px solid var(--accent-border)',cursor:'pointer',fontWeight:500}}>{t}</span>
          ))}
          {hint==='/'&&['/agent','/code','/search','/explain','/fix'].map(t=>(
            <span key={t} onClick={()=>{setVal(v=>v+t+' ');setHint(null);}} style={{fontSize:11.5,padding:'3px 8px',background:'var(--bg-panel)',color:'var(--text-2)',borderRadius:99,border:'1px solid var(--border)',cursor:'pointer',fontWeight:500}}>{t}</span>
          ))}
        </div>
      )}
      <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
        <div style={{display:'flex',gap:2,paddingBottom:2}}>
          {[{n:'at',t:'@mention',a:()=>{setVal(v=>v+'@');setHint('@');}},{n:'slash',t:'/command',a:()=>{setVal(v=>v+'/');setHint('/');}},{n:'clip',t:'Attach',a:attachFiles}].map(b=>(
            <button key={b.n} title={b.t} onClick={b.a} style={{width:30,height:30,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-3)',transition:'background 0.12s,color 0.12s'}}
              onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-2)';}} onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.color='var(--text-3)';}}>
              <Icon name={b.n} size={15}/>
            </button>
          ))}
          <VoiceInput onTranscribe={t=>{setVal(t);setHint(null);}}/>
          {/* Skill picker button */}
          <button onClick={()=>setSkillOpen(o=>!o)} title="Select skill"
            style={{height:30,padding:'0 8px',borderRadius:6,display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:500,border:`1px solid ${activeSkill?'var(--accent-border)':'var(--border)'}`,background:activeSkill?'var(--accent-bg)':'transparent',color:activeSkill?'var(--accent)':'var(--text-3)',cursor:'pointer',transition:'all 0.15s',flexShrink:0}}>
            <span style={{fontSize:12}}>{activeSkill ? (SKILLS.find(s=>s.id===activeSkill)?.icon||'✦') : '✦'}</span>
            Skill
          </button>
          {onToggleThinking && <button onClick={onToggleThinking} title={thinking?'Thinking on — click to disable':'Thinking off — click to enable'} style={{height:30,padding:'0 8px',borderRadius:6,display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:500,border:`1px solid ${thinking?'var(--accent-border)':'var(--border)'}`,background:thinking?'var(--accent-bg)':'transparent',color:thinking?'var(--accent)':'var(--text-3)',cursor:'pointer',transition:'all 0.15s',flexShrink:0}}><Icon name="zap" size={11} color={thinking?'var(--accent)':'var(--text-3)'}/>Think</button>}
        </div>
        <textarea ref={textareaRef} value={val} onChange={handleChange} onKeyDown={handleKey} placeholder={placeholder||'Ask Meg anything… (⌘K for commands)'} rows={1}
          style={{flex:1,resize:'none',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:13.5,fontFamily:'inherit',color:'var(--text)',background:'var(--bg-input)',outline:'none',lineHeight:1.5,transition:'border-color 0.15s',boxShadow:'0 1px 3px var(--shadow)',overflowY:'auto'}}
          onFocus={e=>e.target.style.borderColor='var(--accent)'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
        <button onClick={()=>{
          if(typing) onAbort?.();
          else if(val.trim()){onSend(val.trim());setVal('');setHint(null);resetHeight();}
        }} className="btn-pressable" style={{width:36,height:36,borderRadius:8,flexShrink:0,background:typing?'var(--red,#e05252)':(val.trim()?'var(--accent)':'var(--bg-active)'),display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.2s'}}
          onMouseDown={e=>e.currentTarget.style.transform='scale(0.9)'} onMouseUp={e=>e.currentTarget.style.transform='scale(1)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
          <Icon name={typing?'close':'send'} size={typing?12:15} color={typing||val.trim()?'#fff':'var(--text-3)'}/>
        </button>
      </div>
    </div>
  );
};
