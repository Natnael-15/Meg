export const StatusBadge = ({status,small}) => {
  const map = {
    running:{bg:'var(--accent-bg)',color:'var(--accent)',border:'var(--accent-border)',label:'running'},
    done:{bg:'var(--green-bg)',color:'var(--green)',border:'var(--green-border)',label:'done'},
    queued:{bg:'var(--bg-active)',color:'var(--text-3)',border:'var(--border)',label:'queued'},
    active:{bg:'var(--accent-bg)',color:'var(--accent)',border:'var(--accent-border)',label:'running'},
    waiting:{bg:'var(--bg-active)',color:'var(--text-3)',border:'var(--border)',label:'waiting'},
    error:{bg:'#300',color:'var(--red)',border:'#600',label:'error'},
    cancelled:{bg:'var(--bg-active)',color:'var(--text-3)',border:'var(--border)',label:'cancelled'},
  };
  const s = map[status]||map.queued;
  return <span style={{fontSize:small?10:11,fontWeight:500,padding:small?'1px 5px':'2px 7px',borderRadius:99,background:s.bg,color:s.color,border:`1px solid ${s.border}`}}>{s.label}</span>;
};

export const Toggle = ({on,onToggle}) => (
  <button onClick={onToggle} style={{width:32,height:18,borderRadius:99,position:'relative',background:on?'var(--accent)':'var(--bg-active)',transition:'background 0.2s',flexShrink:0}}>
    <div style={{width:12,height:12,borderRadius:'50%',background:'var(--bg-2)',position:'absolute',top:3,left:on?17:3,transition:'left 0.2s',boxShadow:'0 1px 3px rgba(0,0,0,0.25)'}}/>
  </button>
);
