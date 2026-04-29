import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';

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

export const InputBar = ({onSend,onAbort,typing,placeholder,thinking,onToggleThinking}) => {
  const [val,setVal] = useState('');
  const [hint,setHint] = useState(null);
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
      if(typing) return; // Prevent double send
      if(val.trim()){onSend(val.trim());setVal('');setHint(null);}
    }
    if (e.key==='@') setHint('@');
    else if (e.key==='/') setHint('/');
    else if (e.key==='Escape') setHint(null);
  };
  return (
    <div style={{padding:'10px 14px',borderTop:'1px solid var(--border-light)',background:'var(--bg)',flexShrink:0}}>
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
          {onToggleThinking && <button onClick={onToggleThinking} title={thinking?'Thinking on — click to disable':'Thinking off — click to enable'} style={{height:30,padding:'0 8px',borderRadius:6,display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:500,border:`1px solid ${thinking?'var(--accent-border)':'var(--border)'}`,background:thinking?'var(--accent-bg)':'transparent',color:thinking?'var(--accent)':'var(--text-3)',cursor:'pointer',transition:'all 0.15s',flexShrink:0}}><Icon name="zap" size={11} color={thinking?'var(--accent)':'var(--text-3)'}/>Think</button>}
        </div>
        <textarea value={val} onChange={e=>setVal(e.target.value)} onKeyDown={handleKey} placeholder={placeholder||'Ask Meg anything… (⌘K for commands)'} rows={1}
          style={{flex:1,resize:'none',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:13.5,fontFamily:'inherit',color:'var(--text)',background:'var(--bg-input)',outline:'none',lineHeight:1.5,transition:'border-color 0.15s',boxShadow:'0 1px 3px var(--shadow)'}}
          onFocus={e=>e.target.style.borderColor='var(--accent)'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
        <button onClick={()=>{
          if(typing) onAbort?.();
          else if(val.trim()){onSend(val.trim());setVal('');setHint(null);}
        }} className="btn-pressable" style={{width:36,height:36,borderRadius:8,flexShrink:0,background:typing?'var(--red,#e05252)':(val.trim()?'var(--accent)':'var(--bg-active)'),display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.2s'}}
          onMouseDown={e=>e.currentTarget.style.transform='scale(0.9)'} onMouseUp={e=>e.currentTarget.style.transform='scale(1)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
          <Icon name={typing?'close':'send'} size={typing?12:15} color={typing||val.trim()?'#fff':'var(--text-3)'}/>
        </button>
      </div>
    </div>
  );
};
