import { useEffect, useState } from 'react';
import { Icon } from '../components/icons.jsx';
import { StatusBadge } from '../components/primitives.jsx';

export const AgentDashboard = ({ activeAgents = [] }) => {
  const [selected, setSelected] = useState(activeAgents[0]?.id || null);
  const allAgents = activeAgents;

  useEffect(() => {
    if (!allAgents.length) {
      setSelected(null);
      return;
    }
    if (!selected || !allAgents.find((agent) => agent.id === selected)) {
      setSelected(allAgents[0].id);
    }
  }, [allAgents, selected]);

  const agent = allAgents.find(a=>a.id===selected) || allAgents[0];
  if(!agent) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-3)'}}>No agent runs yet</div>;

  const steps = agent.liveSteps || [{label:'Initializing…',status:'active'}];
  const pct = agent.steps ? Math.round((agent.doneSteps/agent.steps)*100) : 0;

  return (
    <div style={{flex:1,display:'flex',minWidth:0,overflow:'hidden'}}>
      {/* List */}
      <div style={{width:260,borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',background:'var(--bg)',flexShrink:0}}>
        <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border-light)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:12,fontWeight:600,color:'var(--text)'}}>All Agents</span>
          {allAgents.some(a=>a.status==='running') && (
            <span style={{fontSize:11,padding:'2px 7px',borderRadius:99,background:'var(--accent-bg)',color:'var(--accent)',border:'1px solid var(--accent-border)',fontWeight:500,display:'flex',alignItems:'center',gap:4}}>
              <span style={{display:'inline-flex',animation:'spin 1.2s linear infinite'}}><Icon name="spinner" size={10} color="var(--accent)"/></span>
              {allAgents.filter(a=>a.status==='running').length} running
            </span>
          )}
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'6px 8px'}}>
          {allAgents.map(a=>{
            const isSub = !!a.parentId;
            const parent = isSub ? allAgents.find(x => x.id === a.parentId) : null;
            return (
              <button key={a.id} onClick={()=>setSelected(a.id)} style={{width:'100%',padding:'10px',paddingLeft:isSub?28:10,borderRadius:6,display:'flex',flexDirection:'column',gap:5,background:selected===a.id?'var(--bg-active)':'transparent',border:'none',cursor:'pointer',textAlign:'left',marginBottom:2,transition:'background 0.1s',position:'relative'}}
                onMouseEnter={e=>{if(selected!==a.id)e.currentTarget.style.background='var(--bg-hover)';}} onMouseLeave={e=>{if(selected!==a.id)e.currentTarget.style.background='transparent';}}>
                {isSub && <div style={{position:'absolute',left:14,top:14,bottom:14,width:1.5,background:'var(--border)',borderRadius:99}}/>}
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:6}}>
                  <span style={{fontFamily:'"JetBrains Mono",monospace',fontSize:11.5,color:'var(--text)',fontWeight:500,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {isSub && <span style={{color:'var(--text-3)',marginRight:4}}>↳</span>}
                    {a.task}
                  </span>
                  <StatusBadge status={a.status} small/>
                </div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{fontSize:11,color:'var(--text-3)'}}>{isSub ? `Parent: ${parent?.task || 'Unknown'}` : a.thread}</span>
                  <span style={{fontSize:10.5,fontFamily:'"JetBrains Mono",monospace',color:'var(--text-3)'}}>{a.duration}</span>
                </div>
                {(a.status==='running'||a.status==='done') && (
                  <div style={{height:3,background:'var(--border)',borderRadius:99,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${a.steps ? Math.round((a.doneSteps/a.steps)*100) : 0}%`,background:a.status==='done'?'var(--green)':'var(--accent)',borderRadius:99,transition:'width 0.6s ease'}}/>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* Header */}
        <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border-light)',background:'var(--bg)',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
            <span style={{display:'inline-flex',animation:agent.status==='running'?'spin 1.2s linear infinite':'none'}}>
              {agent.status==='done'?<Icon name="check" size={16} color="var(--green)"/>:<Icon name="spinner" size={16} color={agent.status==='running'?'var(--accent)':'var(--text-3)'}/>}
            </span>
            <span style={{fontFamily:'"JetBrains Mono",monospace',fontSize:14,fontWeight:600,color:'var(--text)'}}>{agent.task}</span>
            <StatusBadge status={agent.status}/>
            </div>
            <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>            {[{label:'Model',val:agent.model},{label:'Duration',val:agent.duration},{label:'Steps',val:`${agent.doneSteps}/${agent.steps}`},{label:'Thread',val:agent.thread}].map(m=>(
              <div key={m.label}>
                <div style={{fontSize:10,color:'var(--text-3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:2}}>{m.label}</div>
                <div style={{fontSize:12,color:'var(--text-2)',fontFamily:['Model','Duration','Steps'].includes(m.label)?'"JetBrains Mono",monospace':'inherit'}}>{m.val}</div>
              </div>
            ))}
            {agent.parentId && (
              <div>
                <div style={{fontSize:10,color:'var(--text-3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:2}}>Parent Agent</div>
                <div style={{fontSize:12,color:'var(--accent)',fontWeight:500,cursor:'pointer'}} onClick={()=>setSelected(agent.parentId)}>
                  {allAgents.find(x=>x.id===agent.parentId)?.task || 'Unknown'}
                </div>
              </div>
            )}
            {allAgents.some(x=>x.parentId===agent.id) && (
              <div>
                <div style={{fontSize:10,color:'var(--text-3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:2}}>Sub-agents</div>
                <div style={{display:'flex',gap:6}}>
                  {allAgents.filter(x=>x.parentId===agent.id).map(s=>(
                    <div key={s.id} style={{fontSize:12,color:'var(--accent)',fontWeight:500,cursor:'pointer'}} onClick={()=>setSelected(s.id)}>
                      {s.task}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {(agent.status==='running'||agent.status==='done') && (
            <div style={{marginTop:10}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                <span style={{fontSize:10,color:'var(--text-3)'}}>Progress</span>
                <span style={{fontSize:10,fontFamily:'"JetBrains Mono",monospace',color:'var(--text-3)'}}>{pct}%</span>
              </div>
              <div style={{height:4,background:'var(--border)',borderRadius:99,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${pct}%`,background:agent.status==='done'?'var(--green)':'var(--accent)',borderRadius:99,transition:'width 0.6s ease'}}/>
              </div>
            </div>
          )}
        </div>

        <div style={{flex:1,overflowY:'auto',padding:'16px 18px',display:'flex',gap:16}}>
          {/* Steps */}
          <div style={{flex:1}}>
            <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',letterSpacing:'0.05em',textTransform:'uppercase',marginBottom:12}}>Steps</div>
            {steps.map((s,i)=>(
              <div key={i} style={{display:'flex',gap:10,marginBottom:14,animation:s.status==='done'&&i===steps.filter(x=>x.status==='done').length-1?'fadeUp 0.4s ease':'none'}}>
                <div style={{width:22,height:22,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,background:s.status==='done'?'var(--green-bg)':s.status==='active'?'var(--accent-bg)':'var(--bg-active)',border:`1.5px solid ${s.status==='done'?'var(--green-border)':s.status==='active'?'var(--accent-border)':'var(--border)'}`,animation:s.status==='active'?'spin 1.2s linear infinite':'none',transition:'background 0.3s,border-color 0.3s'}}>
                  {s.status==='done'?<Icon name="check" size={11} color="var(--green)"/>:s.status==='active'?<Icon name="spinner" size={11} color="var(--accent)"/>:<span style={{width:5,height:5,borderRadius:'50%',background:'var(--border)',display:'block'}}/>}
                </div>
                <div style={{flex:1,paddingTop:2}}>
                  <div style={{fontSize:12.5,color:s.status==='waiting'?'var(--text-3)':'var(--text)',fontWeight:s.status==='active'?500:400,transition:'color 0.3s'}}>{s.label}</div>
                  {s.status==='active' && <div style={{fontSize:11,color:'var(--accent)',marginTop:2,animation:'fadeUp 0.2s ease'}}>Running…</div>}
                  {s.status==='done' && <div style={{fontSize:11,color:'var(--green)',marginTop:2}}>Complete</div>}
                </div>
              </div>
            ))}
          </div>

          {/* Tool log */}
          <div style={{width:200,flexShrink:0}}>
            <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',letterSpacing:'0.05em',textTransform:'uppercase',marginBottom:8}}>Tool log</div>
            <div style={{background:'var(--code-bg)',borderRadius:6,padding:'10px 12px',border:'1px solid var(--code-border)',marginBottom:12}}>
              {(agent.logs?.length ? agent.logs.map(l=>`${l.level || 'info'}: ${l.message}`) : ['read: middleware/auth.ts','read: lib/jwt.ts','exec: grep "refresh" **/*.ts','read: routes/auth.ts',agent.status==='running'?'…identifying pattern':'✓ found: race in refresh()']).map((l,i)=>(
                <div key={i} style={{fontFamily:'"JetBrains Mono",monospace',fontSize:10,color:i===4?(agent.status==='done'?'var(--code-green)':'#555'):'var(--code-blue)',lineHeight:1.8,transition:'color 0.4s'}}>{l}</div>
              ))}
            </div>
            <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:6}}>Tools</div>
            {(agent.tools || []).map(t=>(
              <span key={t} style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,padding:'2px 7px',background:'var(--bg-panel)',border:'1px solid var(--border)',borderRadius:99,color:'var(--text-2)',marginRight:4,marginBottom:4}}>
                <Icon name={t==='fs'?'files':t==='terminal'?'terminal':'integration'} size={11} color="var(--text-3)"/>
                {t==='fs'?'File system':t==='terminal'?'Terminal':'Browser'}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
