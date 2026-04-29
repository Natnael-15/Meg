import React, { useState } from 'react';
import { Icon } from './icons.jsx';
import { StatusBadge } from './primitives.jsx';

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

/* ── Markdown renderer ─────────────────────────────────────── */
export const CodeBlock = ({lang,code}) => {
  const [copied,setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(()=>setCopied(false),1500); };
  return (
    <div style={{margin:'8px 0',borderRadius:8,overflow:'hidden',border:'1px solid var(--border)'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'5px 12px',background:'var(--bg-active)',borderBottom:'1px solid var(--border)'}}>
        <span style={{fontSize:11,fontFamily:'"JetBrains Mono",monospace',color:'var(--text-3)',fontWeight:500}}>{lang||'code'}</span>
        <button onClick={copy} style={{fontSize:11,color:copied?'var(--green)':'var(--text-3)',border:'none',background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',gap:4,padding:0}}>
          <Icon name={copied?'check':'doc'} size={11} color={copied?'var(--green)':'var(--text-3)'}/>{copied?'Copied':'Copy'}
        </button>
      </div>
      <pre style={{margin:0,padding:'12px 14px',fontSize:12.5,fontFamily:'"JetBrains Mono",monospace',lineHeight:1.55,overflowX:'auto',background:'var(--bg-2)',color:'var(--text)',whiteSpace:'pre'}}><code>{code}</code></pre>
    </div>
  );
};

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

export const renderMarkdown = (raw, prefix = 'md') => {
  if(!raw) return null;
  const lines = raw.split('\n');
  const out = []; let i = 0;
  while(i < lines.length){
    const line = lines[i];
    // fenced code block
    if(/^```/.test(line)){
      const lang = line.slice(3).trim().toLowerCase();
      const codeLines = []; i++;
      while(i<lines.length && !/^```/.test(lines[i])){ codeLines.push(lines[i]); i++; }
      out.push(<CodeBlock key={`${prefix}-cb-${i}`} lang={lang} code={codeLines.join('\n')}/>);
      i++; continue;
    }
    // heading
    const hm = line.match(/^(#{1,3})\s+(.+)/);
    if(hm){
      const lvl=hm[1].length; const sz=[0,17,14,13][lvl]; const mt=[0,14,10,8][lvl];
      out.push(<div key={`${prefix}-h-${i}`} style={{fontSize:sz,fontWeight:700,color:'var(--text)',marginTop:mt,marginBottom:3}}>{renderInline(hm[2])}</div>);
      i++; continue;
    }
    // table
    if(/^\|/.test(line)){
      const rows=[]; while(i<lines.length&&/^\|/.test(lines[i])){ rows.push(lines[i]); i++; }
      const isDiv = l => /^\|[\s\-:|]+\|$/.test(l.replace(/\s/g,''));
      const data = rows.filter(l=>!isDiv(l));
      const parseRow = l => l.split('|').filter((_,x,a)=>x>0&&x<a.length-1).map(c=>c.trim());
      if(data.length){
        const [hdr,...body] = data;
        out.push(<div key={`${prefix}-tbl-${i}`} style={{overflowX:'auto',margin:'8px 0'}}><table style={{borderCollapse:'collapse',fontSize:12.5,width:'100%'}}>
          <thead><tr>{parseRow(hdr).map((c,j)=><th key={j} style={{padding:'6px 12px',textAlign:'left',borderBottom:'2px solid var(--border)',fontWeight:600,color:'var(--text)',whiteSpace:'nowrap'}}>{renderInline(c)}</th>)}</tr></thead>
          <tbody>{body.map((row,ri)=><tr key={ri}>{parseRow(row).map((c,j)=><td key={j} style={{padding:'5px 12px',borderBottom:'1px solid var(--border-light)',color:'var(--text-2)'}}>{renderInline(c)}</td>)}</tr>)}</tbody>
        </table></div>);
      }
      continue;
    }
    // blockquote
    if(/^>\s?/.test(line)){
      const qls=[]; while(i<lines.length&&/^>\s?/.test(lines[i])){ qls.push(lines[i].replace(/^>\s?/,'')); i++; }
      out.push(<div key={`${prefix}-bq-${i}`} style={{borderLeft:'3px solid var(--accent)',paddingLeft:12,margin:'6px 0',color:'var(--text-2)'}}>{qls.map((l,j)=><div key={`${prefix}-ql-${i}-${j}`} style={{fontSize:13,lineHeight:1.5}}>{renderInline(l)}</div>)}</div>);
      continue;
    }
    // hr
    if(/^[-*_]{3,}$/.test(line.trim())){
      out.push(<hr key={`hr-${i}`} style={{border:'none',borderTop:'1px solid var(--border)',margin:'10px 0'}}/>);
      i++; continue;
    }
    // unordered list
    if(/^[\-*+] /.test(line)){
      const items=[]; while(i<lines.length&&/^[\-*+] /.test(lines[i])){ items.push(lines[i].replace(/^[\-*+] /,'')); i++; }
      out.push(<ul key={`ul-${i}`} style={{margin:'4px 0',paddingLeft:20,display:'flex',flexDirection:'column',gap:2}}>{items.map((it,j)=><li key={`li-${i}-${j}`} style={{fontSize:13.5,lineHeight:1.55,color:'var(--text)'}}>{renderInline(it)}</li>)}</ul>);
      continue;
    }
    // ordered list
    if(/^\d+\. /.test(line)){
      const items=[]; while(i<lines.length&&/^\d+\. /.test(lines[i])){ items.push(lines[i].replace(/^\d+\. /,'')); i++; }
      out.push(<ol key={`ol-${i}`} style={{margin:'4px 0',paddingLeft:20,display:'flex',flexDirection:'column',gap:2}}>{items.map((it,j)=><li key={`li-${i}-${j}`} style={{fontSize:13.5,lineHeight:1.55,color:'var(--text)'}}>{renderInline(it)}</li>)}</ol>);
      continue;
    }
    // blank
    if(!line.trim()){ if(out.length) out.push(<div key={`sp${i}`} style={{height:5}}/>); i++; continue; }
    // paragraph
    out.push(<div key={i} style={{fontSize:13.5,lineHeight:1.65,color:'var(--text)'}}>{renderInline(line)}</div>);
    i++;
  }
  return out.length ? out : null;
};

export const ToolCallCard = ({msg}) => {
  const [open,setOpen] = useState(false);
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
        <div style={{fontSize:11,color:'var(--text-3)',marginBottom:4,fontWeight:500}}>Meg</div>
        <div style={{background:'var(--bg-2)',border:'1px solid var(--border-light)',borderRadius:'3px 10px 10px 10px',overflow:'hidden',maxWidth:'90%',boxShadow:'0 1px 3px var(--shadow)'}}>
          <button onClick={()=>setOpen(o=>!o)} style={{width:'100%',display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'none',border:'none',cursor:'pointer',textAlign:'left'}}>
            <div style={{width:20,height:20,borderRadius:5,background:msg.pending?'var(--accent-bg)':'var(--bg-active)',border:`1px solid ${msg.pending?'var(--accent-border)':'var(--border)'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              {msg.pending
                ? <div style={{width:10,height:10,borderRadius:'50%',border:'2px solid var(--accent)',borderTopColor:'transparent',animation:'spin 0.7s linear infinite'}}/>
                : <Icon name={TOOL_ICONS[msg.name]||'terminal'} size={10} color="var(--text-3)"/>
              }
            </div>
            <span style={{fontSize:12,color:'var(--text)',fontWeight:500,flex:1}}>{actionLabel}</span>
            {msg.pending && <div style={{fontSize:10,color:'var(--accent)',background:'var(--accent-bg)',padding:'1px 6px',borderRadius:4,fontWeight:600}}>RUNNING</div>}
            <Icon name={open?'chevronDown':'chevronRight'} size={10} color="var(--text-3)"/>
          </button>
          {open && (
            <div style={{borderTop:'1px solid var(--border-light)',padding:'8px 12px',display:'flex',flexDirection:'column',gap:6,background:'var(--code-bg)'}}>
              <div style={{fontSize:10,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase'}}>Input</div>
              <pre style={{fontFamily:'"JetBrains Mono",monospace',fontSize:11,color:'var(--code-blue)',margin:0,whiteSpace:'pre-wrap',wordBreak:'break-all'}}>{JSON.stringify(msg.args,null,2)}</pre>
              {msg.result && (
                <>
                  <div style={{fontSize:10,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',marginTop:4}}>Output</div>
                  <div style={{fontFamily:'"JetBrains Mono",monospace',fontSize:11,color:'var(--code-text)',whiteSpace:'pre-wrap',wordBreak:'break-all',maxHeight:200,overflowY:'auto'}}>{typeof msg.result==='string'?msg.result:JSON.stringify(msg.result,null,2)}</div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ThinkBlock = ({text}) => {
  const [open,setOpen] = useState(false);
  return (
    <div style={{marginBottom:6}}>
      <button onClick={()=>setOpen(o=>!o)} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'var(--text-3)',background:'var(--bg-active)',border:'1px solid var(--border)',borderRadius:99,padding:'2px 8px',cursor:'pointer',fontWeight:500,transition:'color 0.12s'}} onMouseEnter={e=>e.currentTarget.style.color='var(--text-2)'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-3)'}>
        <Icon name={open?'chevronDown':'chevronRight'} size={10}/>
        {open?'Hide thinking':'Show thinking'}
      </button>
      {open && <div style={{marginTop:6,padding:'10px 14px',background:'var(--bg-active)',border:'1px solid var(--border-light)',borderRadius:8,fontSize:12,color:'var(--text-3)',lineHeight:1.6}}>{renderMarkdown(text.trim())}</div>}
    </div>
  );
};

export const Message = ({msg,isUser,accent}) => {
  const renderBody = (text) => (text||'').split(/(<think>[\s\S]*?<\/think>)/g).map((p,i)=>
    p.startsWith('<think>')&&p.endsWith('<\/think>')
      ?<ThinkBlock key={`think-${i}`} text={p.slice(7,-8)}/>
      :<React.Fragment key={`text-${i}`}>{renderMarkdown(p)}</React.Fragment>
  );
  if(isUser) return (
    <div className="msg-enter" style={{display:'flex',justifyContent:'flex-end',marginBottom:14}}>
      <div style={{maxWidth:'70%',padding:'9px 13px',background:accent==='warm'?'#3d2b1f':accent==='green'?'#1a3d2b':'var(--accent)',color:'#fff',borderRadius:'10px 10px 3px 10px',fontSize:13.5,lineHeight:1.55,boxShadow:'0 1px 3px rgba(0,0,0,0.15)'}}>
        {renderInline(msg.text)}
      </div>
    </div>
  );
  if(!msg.text && !isUser) return null; // Don't render empty meg messages
  return (
    <div className="msg-enter" style={{display:'flex',gap:8,marginBottom:14,alignItems:'flex-start'}}>
      <div style={{width:26,height:26,borderRadius:8,background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>
        <span style={{fontSize:12,color:'#fff',fontWeight:700,letterSpacing:'-0.02em'}}>M</span>
      </div>
      <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',alignItems:'flex-start'}}>
        <div style={{fontSize:11,color:'var(--text-3)',marginBottom:4,fontWeight:500}}>Meg</div>
        <div style={{padding:'10px 14px',background:'var(--bg-2)',color:'var(--text)',borderRadius:'3px 10px 10px 10px',border:'1px solid var(--border-light)',boxShadow:'0 1px 2px var(--shadow)',maxWidth:'90%',width:'fit-content',display:'inline-block',minHeight:36,overflowWrap:'anywhere'}}>
          {renderBody(msg.text)}
        </div>
      </div>
    </div>
  );
};
