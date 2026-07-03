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

export const InputBar = ({onSend,onAbort,typing,placeholder,thinking,onToggleThinking,activeSkill,onSkillChange,activeWorkspace}) => {
  const [val,setVal] = useState('');
  const [matchingFiles, setMatchingFiles] = useState([]);
  const [fileSearchError, setFileSearchError] = useState(false);
  const [skillOpen,setSkillOpen] = useState(false);
  const [templateOpen,setTemplateOpen] = useState(false);
  const [templates,setTemplates] = useState([]);
  // Pending image attachments (multi-modal input). Each entry is
  // { name, dataUrl, mime, sizeBytes }. Cleared on send.
  const [pendingImages, setPendingImages] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Derived autocomplete state
  const atMatch = val.match(/@([\w/.-]*)$/);
  const slashMatch = val.match(/\/(\w*)$/);
  const isAt = !!atMatch && (!slashMatch || atMatch.index >= slashMatch.index);
  const isSlash = !!slashMatch && (!atMatch || slashMatch.index > atMatch.index);
  const atQuery = atMatch ? atMatch[1] : '';
  const slashQuery = slashMatch ? slashMatch[1] : '';

  useEffect(() => {
    if (!isAt || !activeWorkspace || !window.electronAPI?.searchWorkspaceFiles) {
      setMatchingFiles([]);
      setFileSearchError(false);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      window.electronAPI.searchWorkspaceFiles(activeWorkspace.id, atQuery, 5)
        .then(res => {
          if (!active) return;
          setFileSearchError(false);
          setMatchingFiles(res?.results || []);
        })
        .catch(() => {
          if (!active) return;
          setFileSearchError(true);
          setMatchingFiles([]);
        });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [isAt, atQuery, activeWorkspace]);

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
  };

  // ── Multi-modal image attachments ──────────────────────────────────────
  // Accepts image files from: (a) the paperclip button's image picker,
  // (b) paste (Ctrl+V) into the textarea, (c) drag-and-drop onto the input.
  // Each image is read as a data URL (base64) so it can be embedded directly
  // into the OpenAI vision message format on send. We cap at 4 images and
  // 4 MB each to stay within typical model payload limits.
  const MAX_IMAGES = 4;
  const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
  const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

  const readImageAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });

  const addImageFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(f => IMAGE_MIME_TYPES.includes(f.type));
    if (!files.length) return;
    const room = MAX_IMAGES - pendingImages.length;
    if (room <= 0) return;
    const toAdd = files.slice(0, room);
    const read = [];
    for (const file of toAdd) {
      if (file.size > MAX_IMAGE_BYTES) {
        // Skip oversized images rather than rejecting the whole batch.
        continue;
      }
      try {
        const dataUrl = await readImageAsDataUrl(file);
        read.push({
          name: file.name || `image-${Date.now()}.png`,
          dataUrl,
          mime: file.type,
          sizeBytes: file.size,
        });
      } catch {
        // Skip unreadable files.
      }
    }
    if (read.length) setPendingImages(prev => [...prev, ...read].slice(0, MAX_IMAGES));
  };

  const removeImage = (idx) => setPendingImages(prev => prev.filter((_, i) => i !== idx));

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItems = Array.from(items).filter(it => it.type.startsWith('image/'));
    if (!imageItems.length) return;
    e.preventDefault();
    const files = imageItems.map(it => it.getAsFile()).filter(Boolean);
    await addImageFiles(files);
  };

  const handleDrop = async (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    setDragOver(false);
    await addImageFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    // Only clear if leaving the input container, not entering a child.
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOver(false);
  };

  const pickImages = () => fileInputRef.current?.click();

  const insertMention = (replacement) => {
    setVal(prev => {
      const match = prev.match(/@([\w/.-]*)$/);
      if (!match) return prev + replacement;
      return prev.slice(0, match.index) + replacement + ' ';
    });
    resetHeight();
  };

  const doSend = () => {
    if (typing) return;
    const text = val.trim();
    // Allow send with images even if text is empty — the user may have just
    // pasted a screenshot and hit Enter.
    if (!text && !pendingImages.length) return;
    onSend(text, { images: pendingImages });
    setVal('');
    setPendingImages([]);
    resetHeight();
  };

  const handleKey = e => {
    if (e.key==='Enter'&&!e.shiftKey){
      e.preventDefault();
      doSend();
    }
    if (e.key==='Escape') {
      setSkillOpen(false);
    }
  };

  const grouped = SKILLS.reduce((acc, s) => { (acc[s.category] = acc[s.category] || []).push(s); return acc; }, {});

  // Close skill picker when clicking outside
  useEffect(() => {
    if (!skillOpen) return;
    const handler = (e) => {
      if (!e.target.closest('[data-skill-picker]')) {
        setSkillOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [skillOpen]);

  // Load prompt templates on mount + when templateOpen is toggled
  useEffect(() => {
    if (!templateOpen) return;
    window.electronAPI?.listPromptTemplates?.().then(list => {
      if (Array.isArray(list)) setTemplates(list);
    });
  }, [templateOpen]);

  // Close template picker when clicking outside
  useEffect(() => {
    if (!templateOpen) return;
    const handler = (e) => {
      if (!e.target.closest('[data-template-picker]')) {
        setTemplateOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [templateOpen]);

  const insertTemplate = (template) => {
    setVal(prev => prev.trim() ? `${prev}\n\n${template.prompt}` : template.prompt);
    setTemplateOpen(false);
    resetHeight();
  };

  return (
    <div style={{padding:'10px 14px',borderTop:'1px solid var(--border-light)',background:'var(--bg)',flexShrink:0}}>
      {/* Skill picker popover */}
      {skillOpen && (
        <div data-skill-picker style={{marginBottom:8,background:'rgba(var(--bg-2-rgb, 255, 255, 255), 0.76)',backdropFilter:'blur(14px)',WebkitBackdropFilter:'blur(14px)',border:'1px solid var(--border)',borderRadius:12,padding:'10px',boxShadow:'0 8px 32px var(--shadow-lg)',animation:'slideDown 0.15s ease-out'}}>
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
      {/* Template picker popover */}
      {templateOpen && (
        <div data-template-picker style={{marginBottom:8,background:'rgba(var(--bg-2-rgb, 255, 255, 255), 0.76)',backdropFilter:'blur(14px)',WebkitBackdropFilter:'blur(14px)',border:'1px solid var(--border)',borderRadius:12,padding:'10px',boxShadow:'0 8px 32px var(--shadow-lg)',maxHeight:340,overflowY:'auto',animation:'slideDown 0.15s ease-out'}}>
          <div style={{fontSize:10,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>
            Prompt Templates — click to insert
          </div>
          {templates.length === 0 && (
            <div style={{fontSize:11,color:'var(--text-3)',padding:'8px 4px'}}>Loading templates…</div>
          )}
          {Object.entries(templates.reduce((acc, t) => { (acc[t.category||'Other'] = acc[t.category||'Other'] || []).push(t); return acc; }, {})).map(([cat, items]) => (
            <div key={cat} style={{marginBottom:10}}>
              <div style={{fontSize:9,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:5}}>{cat}</div>
              <div style={{display:'flex',flexDirection:'column',gap:3}}>
                {items.map(t => (
                  <button key={t.id} onClick={() => insertTemplate(t)}
                    style={{padding:'7px 10px',borderRadius:7,border:'1px solid var(--border-light)',background:'var(--bg)',cursor:'pointer',display:'flex',alignItems:'center',gap:8,textAlign:'left',transition:'all 0.12s'}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent-border)';e.currentTarget.style.background='var(--accent-bg)';}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-light)';e.currentTarget.style.background='var(--bg)';}}>
                    <span style={{fontSize:13,flexShrink:0}}>{t.icon||'📋'}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11.5,fontWeight:600,color:'var(--text)'}}>{t.name}{t.builtin && <span style={{fontSize:9,color:'var(--text-3)',fontWeight:400,marginLeft:4}}>built-in</span>}</div>
                      <div style={{fontSize:10,color:'var(--text-3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.prompt?.slice(0,80)}…</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
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
            <button onClick={()=>onSkillChange?.(null)} title="Clear skill" aria-label="Clear skill" style={{fontSize:11,color:'var(--text-3)',background:'none',border:'none',cursor:'pointer',padding:'4px 8px',minWidth:24,minHeight:24,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>✕</button>
          </div>
        ) : null;
      })()}
      {isAt && (
        <div style={{marginBottom:6,background:'rgba(var(--bg-2-rgb, 255, 255, 255), 0.76)',backdropFilter:'blur(14px)',WebkitBackdropFilter:'blur(14px)',border:'1px solid var(--border)',borderRadius:12,padding:'8px',boxShadow:'0 8px 32px var(--shadow-lg)',display:'flex',flexDirection:'column',gap:6,maxHeight:220,overflowY:'auto',zIndex:100,animation:'slideDown 0.15s ease-out'}}>
          {/* Pills row */}
          {(!atQuery || '@clipboard'.includes(atQuery) || '@memory'.includes(atQuery) || '@web'.includes(atQuery)) && (
            <div style={{display:'flex',gap:6,flexWrap:'wrap',borderBottom:matchingFiles.length?'1px solid var(--border-light)':'none',paddingBottom:matchingFiles.length?6:0,marginBottom:matchingFiles.length?2:0}}>
              {['@clipboard', '@memory', '@web'].map(p => {
                if (atQuery && !p.includes(atQuery)) return null;
                return (
                  <button key={p} onClick={() => insertMention(p)} style={{fontSize:11,padding:'3px 8px',background:'var(--accent-bg)',color:'var(--accent)',borderRadius:99,border:'1px solid var(--accent-border)',cursor:'pointer',fontWeight:500}}>
                    {p}
                  </button>
                );
              })}
            </div>
          )}
          {/* Files list */}
          {matchingFiles.map(file => {
            let relPath = file.path;
            if (activeWorkspace && file.path.startsWith(activeWorkspace.path)) {
              relPath = file.path.slice(activeWorkspace.path.length).replace(/^[\\/]/, '');
            }
            return (
              <button key={file.path} onClick={() => insertMention(`@file(${relPath})`)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  color: 'var(--text)',
                  transition: 'background 0.12s'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                <span style={{fontSize:11.5,fontWeight:600,display:'flex',alignItems:'center',gap:4}}>
                  <Icon name="file" size={11} color="var(--text-3)"/> {file.name}
                </span>
                <span style={{fontSize:9.5,color:'var(--text-3)',fontFamily:'"JetBrains Mono",monospace',wordBreak:'break-all',marginTop:2}}>
                  {relPath}
                </span>
              </button>
            );
          })}
          {matchingFiles.length === 0 && !fileSearchError && (!atQuery || !['@clipboard', '@memory', '@web'].some(p => p.includes(atQuery))) && (
            <div style={{fontSize:11,color:'var(--text-3)',padding:'4px 6px'}}>No matching files found in active workspace</div>
          )}
          {fileSearchError && (
            <div style={{fontSize:11,color:'var(--red)',padding:'4px 6px'}}>Search failed — try again</div>
          )}
        </div>
      )}
      {isSlash && (
        <div style={{marginBottom:6,background:'rgba(var(--bg-2-rgb, 255, 255, 255), 0.76)',backdropFilter:'blur(14px)',WebkitBackdropFilter:'blur(14px)',border:'1px solid var(--border)',borderRadius:12,padding:'6px',boxShadow:'0 8px 32px var(--shadow-lg)',display:'flex',flexDirection:'column',gap:4,zIndex:100,animation:'slideDown 0.15s ease-out'}}>
          {['/agent', '/goal', '/code', '/search', '/explain', '/fix'].map(cmd => {
            if (slashQuery && !cmd.startsWith('/' + slashQuery)) return null;
            return (
              <button key={cmd} onClick={() => {
                setVal(prev => {
                  const match = prev.match(/\/(\w*)$/);
                  if (!match) return prev + cmd;
                  return prev.slice(0, match.index) + cmd + ' ';
                });
                resetHeight();
              }}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 11.5,
                  fontWeight: 500,
                  color: 'var(--text)',
                  transition: 'background 0.12s'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                {cmd}
              </button>
            );
          })}
        </div>
      )}
      {/* Pending image attachments preview strip */}
      {pendingImages.length > 0 && (
        <div style={{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap'}}>
          {pendingImages.map((img, idx) => (
            <div key={idx} style={{position:'relative',width:64,height:64,borderRadius:8,overflow:'hidden',border:'1px solid var(--border)',background:'var(--bg-active)'}}>
              <img src={img.dataUrl} alt={img.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
              <button
                onClick={() => removeImage(idx)}
                title="Remove image"
                aria-label={`Remove ${img.name}`}
                style={{position:'absolute',top:2,right:2,width:18,height:18,borderRadius:'50%',background:'rgba(0,0,0,0.7)',color:'#fff',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,lineHeight:1}}
              >✕</button>
              <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'1px 4px',background:'rgba(0,0,0,0.6)',color:'#fff',fontSize:8,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{img.name}</div>
            </div>
          ))}
        </div>
      )}
      {/* Hidden file input for the image picker button */}
      <input
        ref={fileInputRef}
        type="file"
        accept={IMAGE_MIME_TYPES.join(',')}
        multiple
        style={{display:'none'}}
        onChange={async (e) => {
          await addImageFiles(e.target.files);
          // Reset so the same file can be picked again after removal.
          e.target.value = '';
        }}
      />
      <div
        style={{display:'flex',gap:8,alignItems:'flex-end',borderRadius:10,transition:'border-color 0.15s,background 0.15s',border: dragOver ? '2px dashed var(--accent)' : '2px dashed transparent',padding: dragOver ? 6 : 8,margin: dragOver ? -2 : 0,background: dragOver ? 'var(--accent-bg)' : 'transparent'}}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div style={{display:'flex',gap:2,paddingBottom:2}}>
          {[{n:'at',t:'@mention',a:()=>{setVal(v=>v+'@');}},{n:'slash',t:'/command',a:()=>{setVal(v=>v+'/');}},{n:'clip',t:'Attach',a:attachFiles}].map(b=>(
            <button key={b.n} title={b.t} onClick={b.a} style={{width:30,height:30,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-3)',transition:'background 0.12s,color 0.12s'}}
              onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-2)';}} onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.color='var(--text-3)';}}>
              <Icon name={b.n} size={15}/>
            </button>
          ))}
          {/* Image picker button (multi-modal input) */}
          <button title="Attach image (or paste / drag-drop)" onClick={pickImages} style={{width:30,height:30,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',color:pendingImages.length?'var(--accent)':'var(--text-3)',background:pendingImages.length?'var(--accent-bg)':'transparent',border:pendingImages.length?'1px solid var(--accent-border)':'none',transition:'background 0.12s,color 0.12s'}}
            onMouseEnter={e=>{if(!pendingImages.length){e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-2)';}}} onMouseLeave={e=>{if(!pendingImages.length){e.currentTarget.style.background='none';e.currentTarget.style.color='var(--text-3)';}}}>
            <Icon name="image" size={15}/>
            {pendingImages.length > 0 && (
              <span style={{position:'absolute',top:2,right:2,fontSize:8,fontWeight:700,color:'#fff',background:'var(--accent)',borderRadius:'50%',width:12,height:12,display:'flex',alignItems:'center',justifyContent:'center'}}>{pendingImages.length}</span>
            )}
          </button>
          {/* Screenshot capture button — grabs the primary screen and attaches it as an image */}
          <button
            title="Capture screenshot (attach to next message)"
            onClick={async () => {
              const result = await window.electronAPI?.captureScreen?.();
              if (result?.ok && result.dataUrl) {
                addImageFiles([new File([await (await fetch(result.dataUrl)).blob()], result.name || `screenshot-${Date.now()}.png`, { type: 'image/png' })]);
              }
            }}
            style={{width:30,height:30,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-3)',background:'transparent',border:'none',transition:'background 0.12s,color 0.12s'}}
            onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-2)';}}
            onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.color='var(--text-3)';}}
          >
            <Icon name="appearance" size={15}/>
          </button>
          <VoiceInput onTranscribe={t=>{setVal(t);resetHeight();}}/>
          {/* Template picker button */}
          <button data-template-picker onClick={()=>setTemplateOpen(o=>!o)} title="Insert prompt template"
            style={{height:30,padding:'0 8px',borderRadius:6,display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:500,border:`1px solid ${templateOpen?'var(--accent-border)':'var(--border)'}`,background:templateOpen?'var(--accent-bg)':'transparent',color:templateOpen?'var(--accent)':'var(--text-3)',cursor:'pointer',transition:'all 0.15s',flexShrink:0}}>
            <span style={{fontSize:12}}>📋</span>
            Templates
          </button>
          {/* Skill picker button */}
          <button data-skill-picker onClick={()=>setSkillOpen(o=>!o)} title="Select skill"
            style={{height:30,padding:'0 8px',borderRadius:6,display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:500,border:`1px solid ${activeSkill?'var(--accent-border)':'var(--border)'}`,background:activeSkill?'var(--accent-bg)':'transparent',color:activeSkill?'var(--accent)':'var(--text-3)',cursor:'pointer',transition:'all 0.15s',flexShrink:0}}>
            <span style={{fontSize:12}}>{activeSkill ? (SKILLS.find(s=>s.id===activeSkill)?.icon||'✦') : '✦'}</span>
            Skill
          </button>
          {onToggleThinking && <button onClick={onToggleThinking} title={thinking?'Thinking on — click to disable':'Thinking off — click to enable'} style={{height:30,padding:'0 8px',borderRadius:6,display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:500,border:`1px solid ${thinking?'var(--accent-border)':'var(--border)'}`,background:thinking?'var(--accent-bg)':'transparent',color:thinking?'var(--accent)':'var(--text-3)',cursor:'pointer',transition:'all 0.15s',flexShrink:0}}><Icon name="zap" size={11} color={thinking?'var(--accent)':'var(--text-3)'}/>Think</button>}
        </div>
        <div style={{flex:1,display:'flex',flexDirection:'column',gap:4}}>
          <textarea ref={textareaRef} value={val} onChange={handleChange} onKeyDown={handleKey} onPaste={handlePaste} placeholder={placeholder||'Ask Meg anything… (⌘K for commands, paste/drop images for vision)'} rows={1}
            style={{width:'100%',resize:'none',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:13.5,fontFamily:'inherit',color:'var(--text)',background:'var(--bg-input)',outline:'none',lineHeight:1.5,transition:'border-color 0.15s',boxShadow:'0 1px 3px var(--shadow)',overflowY:'auto'}}
            onFocus={e=>e.target.style.borderColor='var(--accent)'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
          {(val.trim().length > 0 || pendingImages.length > 0) && (
            <div style={{fontSize:10,color:'var(--text-3)',paddingLeft:4,display:'flex',gap:8,animation:'fadeIn 0.1s both'}}>
              {val.trim().length > 0 && <>
                <span>{val.length} chars</span>
                <span>•</span>
                <span>~{Math.ceil(val.length / 4)} tokens</span>
              </>}
              {pendingImages.length > 0 && <>
                {val.trim().length > 0 && <span>•</span>}
                <span>{pendingImages.length} image{pendingImages.length > 1 ? 's' : ''} attached</span>
              </>}
            </div>
          )}
        </div>
        <button onClick={doSend} className="btn-pressable" style={{width:36,height:36,borderRadius:8,flexShrink:0,background:typing?'var(--red,#e05252)':((val.trim()||pendingImages.length)?'var(--accent)':'var(--bg-active)'),display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.2s',marginBottom:(val.trim().length>0||pendingImages.length>0)?18:0}}
          onMouseDown={e=>e.currentTarget.style.transform='scale(0.9)'} onMouseUp={e=>e.currentTarget.style.transform='scale(1)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
          <Icon name={typing?'close':'send'} size={typing?12:15} color={typing||(val.trim()||pendingImages.length)?'#fff':'var(--text-3)'}/>
        </button>
      </div>
    </div>
  );
};
