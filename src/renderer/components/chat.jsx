import React, { useState, useEffect } from 'react';
import { Icon } from './icons.jsx';
import { StatusBadge } from './primitives.jsx';
import MarkdownRenderer from './MarkdownRenderer.jsx';
import { SpeakButton } from './SpeakButton.jsx';

export const TypingIndicator = () => (
  <div className="msg-enter" style={{display:'flex',gap:8,marginBottom:14,alignItems:'flex-start'}}>
    <div style={{width:26,height:26,borderRadius:8,background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>
      <span style={{fontSize:12,color:'#fff',fontWeight:700,letterSpacing:'-0.02em'}}>M</span>
    </div>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:11,color:'var(--text-3)',marginBottom:4,fontWeight:500}}>Meg</div>
      <div style={{padding:'10px 14px',background:'var(--bg-2)',borderRadius:'3px 10px 10px 10px',width:'fit-content',display:'flex',alignItems:'center',gap:8,border:'1px solid var(--border-light)',boxShadow:'0 1px 3px var(--shadow)'}}>
        <span style={{fontSize:12.5,color:'var(--text-2)',fontWeight:500}}>Meg is thinking</span>
        <div className="typing-dots" style={{display:'flex',gap:3}}>
          <span>.</span><span>.</span><span>.</span>
        </div>
      </div>
    </div>
  </div>
);

export const AgentCard = ({step}) => {
  const [expanded,setExpanded] = useState(step.status==='running');
  const running = step.status==='running';
  return (
    <div style={{margin:'8px 0',border:`1px solid ${running?'var(--accent-border)':'var(--border-light)'}`,borderRadius:8,background:running?'var(--accent-bg)':'var(--bg-panel)',overflow:'hidden',transition:'border-color 0.3s,background 0.3s'}}>
      <button onClick={()=>setExpanded(e=>!e)} style={{width:'100%',display:'flex',alignItems:'center',gap:8,padding:'9px 12px',background:'none',border:'none',cursor:'pointer',textAlign:'left'}}>
        <span style={{flexShrink:0,display:'inline-flex',animation:running?'spin 1.2s linear infinite':'none'}}>
          {running?<Icon name="spinner" size={14} color="var(--accent)"/>:<Icon name="check" size={14} color="var(--green)"/>}
        </span>
        <span style={{fontSize:12,fontWeight:500,color:running?'var(--accent)':'var(--text-2)',flex:1,fontFamily:'"JetBrains Mono",monospace'}}>{step.task}</span>
        <StatusBadge status={step.status} small/>
        <span style={{transform:expanded?'rotate(180deg)':'none',transition:'transform 0.2s',display:'inline-flex'}}><Icon name="chevronDown" size={14} color="var(--text-3)"/></span>
      </button>
      {expanded && (
        <div style={{padding:'2px 12px 10px',borderTop:`1px solid ${running?'var(--accent-border)':'var(--border-light)'}`}}>
          {step.steps.map((s,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 0'}}>
              <span style={{display:'inline-flex',animation:s.status==='active'?'spin 1.2s linear infinite':'none'}}>
                {s.status==='done'?<Icon name="check" size={13} color="var(--green)"/>:s.status==='active'?<Icon name="spinner" size={13} color="var(--accent)"/>:<svg width={13} height={13} viewBox="0 0 13 13"><circle cx="6.5" cy="6.5" r="3" fill="var(--border)"/></svg>}
              </span>
              <span style={{fontSize:12,color:s.status==='waiting'?'var(--text-3)':'var(--text-2)',fontWeight:s.status==='active'?500:400,transition:'color 0.3s'}}>{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Inline markdown renderer (used for user-message text) ── */
export const renderInline = (text) => {
  if(!text) return null;
  const hash = text.length;
  return text.split(/(`[^`\n]+`)/g).flatMap((seg,i)=>{
    if(seg.startsWith('`')&&seg.endsWith('`'))
      return [<code key={`code-${hash}-${i}`} style={{fontFamily:'"JetBrains Mono",monospace',fontSize:'0.88em',background:'rgba(128,128,128,0.12)',padding:'1px 5px',borderRadius:3,color:'var(--orange)'}}>{seg.slice(1,-1)}</code>];
    return seg.split(/(\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g).map((p,j)=>{
      const kj = `p-${hash}-${i}-${j}`;
      if(/^\*\*\*/.test(p)) return <strong key={kj}><em>{p.slice(3,-3)}</em></strong>;
      if(/^\*\*/.test(p)||/^__/.test(p)) return <strong key={kj} style={{fontWeight:600}}>{p.slice(2,-2)}</strong>;
      if(/^\*/.test(p)||/^_/.test(p)) return <em key={kj}>{p.slice(1,-1)}</em>;
      return <React.Fragment key={kj}>{p.split('\n').map((l,k,a)=><React.Fragment key={`${kj}-${k}`}>{l}{k<a.length-1&&<br/>}</React.Fragment>)}</React.Fragment>;
    });
  });
};

export const ToolCallCard = ({msg}) => {
  const [open,setOpen] = useState(!!msg.pending);
  useEffect(() => {
    if (msg.pending) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [msg.pending]);
  const TOOL_ICONS = {run_command:'terminal',read_file:'files',write_file:'save',list_directory:'folder',search_files:'search',web_search:'web',send_telegram:'sms',spawn_subagent:'agent'};
  
  const actionLabel = msg.name === 'write_file' ? `Writing ${msg.args.path?.split(/[\/\\]/).pop() || 'file'}` 
                  : msg.name === 'run_command' ? `Running command`
                  : msg.name === 'read_file' ? `Reading ${msg.args.path?.split(/[\/\\]/).pop() || 'file'}`
                  : msg.name === 'web_search' ? `Looking up instant web answer: ${msg.args.query}`
                  : msg.name === 'spawn_subagent' ? `Spawning agent: ${msg.args.name}`
                  : msg.name.replace(/_/g,' ');

  return (
    <div className="msg-enter" style={{display:'flex',gap:8,marginBottom:14,alignItems:'flex-start'}}>
      <div style={{width:26,height:26,borderRadius:8,background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>
        <span style={{fontSize:12,color:'#fff',fontWeight:700,letterSpacing:'-0.02em'}}>M</span>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:11,color:'var(--text-3)',marginBottom:5,fontWeight:500}}>Meg</div>
        <div style={{background:'var(--bg-2)',border:'1px solid var(--border-light)',borderRadius:'4px 12px 12px 12px',overflow:'hidden',maxWidth:'88%',transition:'border-color 0.15s'}}>
          <button onClick={()=>setOpen(o=>!o)} style={{width:'100%',display:'flex',alignItems:'center',gap:8,padding:'9px 13px',background:'none',border:'none',cursor:'pointer',textAlign:'left',transition:'background 0.1s'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'}
            onMouseLeave={e=>e.currentTarget.style.background='none'}>
            <div style={{width:22,height:22,borderRadius:6,background:msg.pending?'var(--accent-bg)':'var(--bg-active)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              {msg.pending
                ? <div style={{width:10,height:10,borderRadius:'50%',border:'2px solid var(--accent)',borderTopColor:'transparent',animation:'spin 0.7s linear infinite'}}/>
                : <Icon name={TOOL_ICONS[msg.name]||'terminal'} size={11} color="var(--text-3)"/>
              }
            </div>
            <span style={{fontSize:12.5,color:'var(--text)',fontWeight:500,flex:1}}>{actionLabel}</span>
            {msg.pending && <div style={{fontSize:9,color:'var(--accent)',background:'var(--accent-bg)',padding:'2px 7px',borderRadius:99,fontWeight:700,letterSpacing:'0.04em'}}>RUNNING</div>}
            <Icon name={open?'chevronDown':'chevronRight'} size={11} color="var(--text-3)"/>
          </button>
          {msg.name === 'write_file' && msg.result?.staged && (
            <div style={{padding:'0 13px 9px'}}>
              <button onClick={() => window.dispatchEvent(new CustomEvent('meg:action', { detail: { action: 'reviewFile', value: { approval: { rawArgs: msg.args, result: msg.result } } } }))}
                style={{width:'100%',padding:'7px',borderRadius:7,border:'1px solid var(--accent-border)',background:'var(--accent-bg)',color:'var(--accent)',fontSize:11,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6,transition:'all 0.12s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='var(--accent)';e.currentTarget.style.color='#fff';}}
                onMouseLeave={e=>{e.currentTarget.style.background='var(--accent-bg)';e.currentTarget.style.color='var(--accent)';}}>
                <Icon name="splitH" size={12} color="var(--accent)"/>
                Review Draft
              </button>
            </div>
          )}
          {open && (
            <div style={{borderTop:'1px solid var(--border-light)',padding:'10px 13px',display:'flex',flexDirection:'column',gap:8,background:'var(--code-bg)'}}>
              <div style={{fontSize:9,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Input</div>
              <pre style={{fontFamily:'"JetBrains Mono",monospace',fontSize:11,color:'var(--code-blue)',margin:0,whiteSpace:'pre-wrap',wordBreak:'break-all',lineHeight:1.5}}>{JSON.stringify(msg.args,null,2)}</pre>
              {msg.result && (
                <>
                  <div style={{fontSize:9,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',marginTop:4}}>Output</div>
                  <div style={{fontFamily:'"JetBrains Mono",monospace',fontSize:11,color:'var(--code-text)',whiteSpace:'pre-wrap',wordBreak:'break-all',maxHeight:220,overflowY:'auto',lineHeight:1.5}}>{typeof msg.result==='string'?msg.result:JSON.stringify(msg.result,null,2)}</div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ThinkBlock = ({text, unfinished}) => {
  const [open,setOpen] = useState(!!unfinished);
  const [seconds,setSeconds] = useState(0);
  const timerRef = React.useRef(null);

  useEffect(() => {
    if (unfinished && !timerRef.current) {
      timerRef.current = setInterval(() => setSeconds(s => s + 0.1), 100);
    } else if (!unfinished && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [unfinished]);

  useEffect(() => {
    if (!unfinished) {
      const t = setTimeout(() => setOpen(false), 800);
      return () => clearTimeout(t);
    }
  }, [unfinished]);

  return (
    <div style={{marginBottom:6}}>
      <button onClick={()=>setOpen(o=>!o)} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:unfinished?'var(--accent)':'var(--text-3)',background:'var(--bg-active)',border:`1px solid ${unfinished?'var(--accent-border)':'var(--border)'}`,borderRadius:99,padding:'2px 8px',cursor:'pointer',fontWeight:500,transition:'color 0.12s,border-color 0.12s'}} onMouseEnter={e=>e.currentTarget.style.color='var(--text-2)'} onMouseLeave={e=>e.currentTarget.style.color=unfinished?'var(--accent)':'var(--text-3)'}>
        {unfinished && <span style={{display:'inline-flex',animation:'spin 1.2s linear infinite'}}><Icon name="spinner" size={9} color="var(--accent)"/></span>}
        <Icon name={open?'chevronDown':'chevronRight'} size={10}/>
        {unfinished ? 'Thinking…' : open ? 'Hide thinking' : 'Show thinking'}
        {seconds > 0 && <span style={{marginLeft:2,opacity:0.55,fontWeight:400}}>{unfinished ? `${seconds.toFixed(1)}s` : `${seconds.toFixed(1)}s`}</span>}
      </button>
      {open && <div style={{marginTop:6,padding:'10px 14px',background:'var(--bg-active)',border:'1px solid var(--border-light)',borderRadius:8,fontSize:12,color:'var(--text-3)',lineHeight:1.6,fontStyle:'italic'}}><MarkdownRenderer>{text.trim() || '...'}</MarkdownRenderer></div>}
    </div>
  );
};

export const Message = ({msg,isUser,accent,onFork}) => {
  const renderBody = (text, streaming) => (text||'').split(/(<think>[\s\S]*?<\/think>)/g).map((p,i)=>
    p.startsWith('<think>')&&p.endsWith('<\/think>')
      ?<ThinkBlock key={`think-${i}`} text={p.slice(7,-8)} unfinished={streaming}/>
      :<React.Fragment key={`text-${i}`}><MarkdownRenderer>{p}</MarkdownRenderer></React.Fragment>
  );
  if(isUser) return (
    <div className="msg-enter" style={{display:'flex',flexDirection:'column',alignItems:'flex-end',marginBottom:18,gap:4}}>
      <div style={{maxWidth:'72%',padding:'10px 15px',background:accent==='warm'?'#3d2b1f':accent==='green'?'#1a3d2b':'var(--accent)',color:'#fff',borderRadius:'12px 12px 4px 12px',fontSize:13.5,lineHeight:1.55,boxShadow:'0 1px 3px rgba(0,0,0,0.15)'}}>
        {msg.images && msg.images.length > 0 && (
          <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:msg.text?8:0}}>
            {msg.images.map((img, i) => (
              <img key={i} src={img.dataUrl} alt={img.name} style={{width:120,height:120,objectFit:'cover',borderRadius:6,display:'block'}}/>
            ))}
          </div>
        )}
        {renderInline(msg.text)}
      </div>
      {onFork && !msg.streaming && (
        <button
          onClick={() => onFork(msg.id)}
          title="Fork conversation from this message — creates a new chat with everything up to here"
          style={{fontSize:10,color:'var(--text-3)',background:'transparent',border:'none',cursor:'pointer',padding:'2px 6px',borderRadius:4,opacity:0,transition:'opacity 0.15s',display:'flex',alignItems:'center',gap:3}}
          className="msg-fork-btn"
          onMouseEnter={e=>{e.currentTarget.style.opacity='1';e.currentTarget.style.color='var(--accent)';}}
          onMouseLeave={e=>{e.currentTarget.style.opacity='0';e.currentTarget.style.color='var(--text-3)';}}
        >
          <Icon name="splitH" size={10}/> Fork from here
        </button>
      )}
    </div>
  );
  if(!msg.text && !msg.streaming && !isUser) return null;
  return (
    <div className="msg-enter" style={{display:'flex',gap:10,marginBottom:18,alignItems:'flex-start'}}>
      <div style={{width:28,height:28,borderRadius:8,background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>
        <span style={{fontSize:12,color:'#fff',fontWeight:700,letterSpacing:'-0.02em'}}>M</span>
      </div>
      <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',alignItems:'flex-start'}}>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
          <span style={{fontSize:11,color:'var(--text-3)',fontWeight:600}}>Meg</span>
        </div>
        <div style={{padding:'12px 16px',background:'var(--bg-2)',color:'var(--text)',borderRadius:'4px 12px 12px 12px',border:'1px solid var(--border-light)',boxShadow:'0 1px 2px var(--shadow)',maxWidth:'88%',width:'fit-content',display:'inline-block',minHeight:38,overflowWrap:'anywhere'}}>
          {msg.thinking && <ThinkBlock text={msg.thinking} unfinished={msg.streaming && !msg.text}/>}
          {renderBody(msg.text, msg.streaming)}
          {msg.streaming && !msg.text && !msg.thinking && (
            <div style={{display:'flex',gap:4,alignItems:'center',height:20}}>
              <div style={{width:8,height:8,borderRadius:'50%',border:'2px solid var(--accent)',borderTopColor:'transparent',animation:'spin 0.7s linear infinite'}}/>
              <span style={{fontSize:12,color:'var(--text-3)',fontStyle:'italic'}}>Thinking…</span>
            </div>
          )}
        </div>
        {!msg.streaming && msg.text && (
          <div style={{display:'flex',alignItems:'center',gap:4,marginTop:5,opacity:0.5,transition:'opacity 0.15s'}} className="msg-actions">
            <SpeakButton text={msg.text} compact/>
          </div>
        )}
      </div>
    </div>
  );
};
