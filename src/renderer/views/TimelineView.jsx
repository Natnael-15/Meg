import { useState } from 'react';
import { Icon } from '../components/icons.jsx';
import { formatEventDate, formatRelativeTime } from '../lib/time.js';

const TYPE_LABELS = {all:'All',agent:'Agents',sms:'Telegram',commit:'Commits',file:'Files',memory:'Memory'};

export const TimelineView = ({events}) => {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const safeEvents = events || [];
  const filtered = safeEvents.filter((e) => {
    const title = (e?.title || '').toLowerCase();
    const detail = (e?.detail || '').toLowerCase();
    const query = search.toLowerCase();
    return (filter === 'all' || e.type === filter) && (query === '' || title.includes(query) || detail.includes(query));
  });
  const grouped = filtered.reduce((acc,e)=>{
    const groupKey = formatEventDate(e.createdAt) || e.date || 'Unknown date';
    (acc[groupKey]=acc[groupKey]||[]).push(e);
    return acc;
  },{});

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{padding:'12px 20px',borderBottom:'1px solid var(--border-light)',background:'var(--bg)',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
          <div style={{flex:1,display:'flex',alignItems:'center',gap:8,background:'var(--bg-panel)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 12px'}}>
            <Icon name="search" size={14} color="var(--text-3)"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search activity…" style={{flex:1,border:'none',outline:'none',fontSize:13,color:'var(--text)',background:'none',fontFamily:'inherit'}}/>
          </div>
          <span style={{fontSize:11.5,color:'var(--text-3)'}}>{filtered.length} events</span>
        </div>
        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
          {Object.entries(TYPE_LABELS).map(([type,label])=>(
            <button key={type} onClick={()=>setFilter(type)} style={{padding:'3px 10px',borderRadius:99,fontSize:11.5,border:`1px solid ${filter===type?'var(--accent-border)':'var(--border)'}`,background:filter===type?'var(--accent-bg)':'transparent',color:filter===type?'var(--accent)':'var(--text-3)',cursor:'pointer',transition:'all 0.12s',fontFamily:'inherit',fontWeight:filter===type?500:400}}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'0 20px'}}>
        {Object.entries(grouped).map(([date,dayEvents])=>(
          <div key={date}>
            <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',padding:'14px 0 8px',position:'sticky',top:0,background:'var(--bg)',zIndex:1}}>{date}</div>
            {dayEvents.map((e,i)=>(
              <div key={e.id} style={{display:'flex',gap:10,alignItems:'stretch',animation:`fadeUp 0.15s ${i*0.04}s both`}}>
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',width:28,flexShrink:0,paddingTop:2}}>
                  <div style={{width:26,height:26,borderRadius:'50%',background:'var(--bg-active)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <Icon name={e.icon} size={12} color={e.color}/>
                  </div>
                  {i<dayEvents.length-1 && <div style={{width:1,flex:1,background:'var(--border)',margin:'3px 0'}}/>}
                </div>
                <div style={{flex:1,paddingBottom:14,paddingTop:2}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,marginBottom:2}}>
                    <span style={{fontSize:13,color:'var(--text)',fontWeight:500,lineHeight:1.4}}>{e.title}</span>
                    <span style={{fontSize:10.5,color:'var(--text-3)',flexShrink:0}}>{formatRelativeTime(e.createdAt) || e.time || ''}</span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:11.5,color:'var(--text-3)'}}>{e.detail}</span>
                    {e.ws!=='—' && <span style={{fontSize:10,padding:'1px 5px',borderRadius:99,background:'var(--bg-active)',border:'1px solid var(--border)',color:'var(--text-3)'}}>{e.ws}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
        {filtered.length===0 && <div style={{padding:'40px 0',textAlign:'center',color:'var(--text-3)',fontSize:13}}>{search ? `No events match "${search}"` : 'No activity yet'}</div>}
      </div>
    </div>
  );
};
