import { useMemo, useState } from 'react';
import { Icon } from '../components/icons.jsx';

export const MobileCompanion = ({ messages = [], connected = false, contactName = 'Telegram', onSend, sendError = null }) => {
  const [input, setInput] = useState('');
  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)),
    [messages],
  );

  const send = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    await onSend?.(text);
  };

  return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg-panel)',overflow:'hidden'}}>
      <div style={{display:'flex',gap:48,alignItems:'flex-start'}}>
        <div>
          <div style={{width:280,background:'#1a1a1a',borderRadius:36,padding:3,boxShadow:'0 24px 60px rgba(0,0,0,0.4)'}}>
            <div style={{background:'#f5f5f7',borderRadius:33,overflow:'hidden',height:580,display:'flex',flexDirection:'column'}}>
              <div style={{padding:'14px 20px 6px',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
                <span style={{fontSize:12,fontWeight:600,color:'#000'}}>9:41</span>
                <div style={{width:90,height:24,background:'#1a1a1a',borderRadius:99}}/>
                <span style={{fontSize:10,color:'#000',fontWeight:600}}>●●● WiFi</span>
              </div>
              <div style={{padding:'8px 16px',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid #e5e5ea',flexShrink:0}}>
                <div style={{width:32,height:32,borderRadius:'50%',background:'#3b6eff',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <Icon name="logo" size={16} color="#fff"/>
                </div>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'#000'}}>{contactName}</div>
                  <div style={{fontSize:10.5,color:'#8e8e93'}}>{connected ? 'Telegram connected' : 'Telegram not connected'}</div>
                </div>
              </div>
              <div style={{flex:1,overflowY:'auto',padding:'12px',display:'flex',flexDirection:'column',gap:8}}>
                {!connected && sortedMessages.length===0 && (
                  <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',padding:'24px 18px',color:'#8e8e93',fontSize:12.5,lineHeight:1.6}}>
                    Connect Telegram in Settings to start a conversation and sync messages here.
                  </div>
                )}
                {connected && sortedMessages.length===0 && (
                  <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',padding:'24px 18px',color:'#8e8e93',fontSize:12.5,lineHeight:1.6}}>
                    No Telegram messages yet. Send a message from your phone or from Meg to start this thread.
                  </div>
                )}
                {sortedMessages.map((m)=>(
                  <div key={m.id} style={{display:'flex',justifyContent:m.direction==='outbound'?'flex-end':'flex-start',animation:'fadeUp 0.2s ease'}}>
                    <div style={{maxWidth:'78%',padding:'8px 12px',fontSize:12.5,lineHeight:1.45,borderRadius:m.direction==='outbound'?'16px 16px 4px 16px':'16px 16px 16px 4px',background:m.direction==='outbound'?'#3b6eff':'#e9e9eb',color:m.direction==='outbound'?'#fff':'#000'}}>
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
              {sendError && (
                <div style={{padding:'8px 12px',fontSize:11,color:'#d64545',borderTop:'1px solid #f0d1d1',background:'#fff6f6',flexShrink:0}}>
                  {sendError}
                </div>
              )}
              <div style={{padding:'8px 12px 16px',display:'flex',gap:8,alignItems:'center',borderTop:'1px solid #e5e5ea',flexShrink:0}}>
                <div style={{flex:1,background:'#e9e9eb',borderRadius:20,padding:'7px 12px'}}>
                  <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder={connected ? 'Message…' : 'Connect Telegram to send messages'} disabled={!connected} style={{background:'none',border:'none',outline:'none',width:'100%',fontSize:12.5,color:'#000'}}/>
                </div>
                <button onClick={send} disabled={!connected || !input.trim()} style={{width:28,height:28,borderRadius:'50%',background:connected && input.trim()?'#3b6eff':'#e9e9eb',display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.15s'}}>
                  <Icon name="send" size={12} color={connected && input.trim()?'#fff':'#8e8e93'}/>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div style={{maxWidth:260,paddingTop:20}}>
          <h3 style={{fontSize:17,fontWeight:700,color:'var(--text)',marginBottom:8,letterSpacing:'-0.02em'}}>Telegram Companion</h3>
          <p style={{fontSize:13,color:'var(--text-2)',lineHeight:1.7,marginBottom:20}}>Meg messages you on Telegram when agents finish, tasks complete, or you get replies. Reply naturally — she understands context.</p>
          {[{icon:'agent',label:'Agent completions',desc:'Notified when background tasks finish'},{icon:'sms',label:'Two-way messaging',desc:'Reply from your phone, Meg acts on it'},{icon:'memory',label:'Context-aware',desc:"Meg knows what she's working on"}].map((f,i)=>(
            <div key={i} style={{display:'flex',gap:10,alignItems:'flex-start',marginBottom:12}}>
              <div style={{width:28,height:28,borderRadius:7,background:'var(--bg-active)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <Icon name={f.icon} size={13} color="var(--text-3)"/>
              </div>
              <div>
                <div style={{fontSize:12.5,fontWeight:500,color:'var(--text)'}}>{f.label}</div>
                <div style={{fontSize:11.5,color:'var(--text-3)'}}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
