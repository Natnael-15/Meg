import { useState } from 'react';
import { Icon } from '../components/icons.jsx';
import { ConfirmDialog, TextEntryDialog } from '../components/dialogs.jsx';

const EXT_COLORS = {tsx:'#5a84ff',ts:'#5a84ff',js:'#f5c542',jsx:'#f5c542',css:'#e07a30',html:'#e07a30',json:'#1a9e5c',env:'#a09c97',md:'#a09c97'};
const LANGUAGE_LABELS = {tsx:'TypeScript',ts:'TypeScript',js:'JavaScript',jsx:'JavaScript',css:'CSS',html:'HTML',json:'JSON',env:'Env',md:'Markdown'};

const mapEntry = (entry) => ({
  name: entry.name,
  type: entry.isDir ? 'folder' : 'file',
  ext: entry.ext || '',
  path: entry.path,
  open: false,
  children: entry.isDir ? [] : undefined,
});

const getParentPath = (fullPath) => {
  const parts = fullPath.split(/[\\/]/);
  parts.pop();
  return parts.join('\\');
};

const joinPath = (base, child) => `${base.replace(/[\\/]+$/, '')}\\${child}`;

const countTreeStats = (items) => items.reduce((totals, item) => {
  if (item.type === 'folder') {
    totals.folders += 1;
    if (item.children?.length) {
      const childTotals = countTreeStats(item.children);
      totals.files += childTotals.files;
      totals.folders += childTotals.folders;
    }
  } else {
    totals.files += 1;
  }
  return totals;
}, { files: 0, folders: 0 });

const FileBrowserTree = ({items, depth=0, selected, onSelect, onToggle}) => (
  <div>
    {items.map((item,i)=>(
      <div key={i}>
        <div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 8px',paddingLeft:8+depth*14,borderRadius:5,cursor:'pointer',background:selected===item.name?'var(--accent-bg)':'transparent',margin:'1px 4px',transition:'background 0.1s'}}
          onClick={()=>item.type==='folder'?onToggle(item):onSelect(item)}
          onMouseEnter={e=>{if(selected!==item.name)e.currentTarget.style.background='var(--bg-hover)';}}
          onMouseLeave={e=>{if(selected!==item.name)e.currentTarget.style.background='transparent';}}>
          {item.type==='folder' && (
            <span style={{display:'inline-flex',color:'var(--text-3)',transform:item.open?'rotate(0deg)':'rotate(-90deg)',transition:'transform 0.15s',flexShrink:0}}>
              <Icon name="chevronDown" size={13} color="var(--text-3)"/>
            </span>
          )}
          <Icon name={item.type==='folder'?(item.open?'folderOpen':'folder'):'doc'} size={13} color={item.type==='folder'?'#e07a30':(EXT_COLORS[item.ext]||'var(--text-3)')}/>
          <span style={{fontSize:12,color:selected===item.name?'var(--accent)':'var(--text)',fontFamily:'"JetBrains Mono",monospace',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</span>
          {item.type==='file' && <span style={{fontSize:10,color:'var(--text-3)',flexShrink:0}}>{item.ext}</span>}
        </div>
        {item.type==='folder' && item.open && item.children && (
          <FileBrowserTree items={item.children} depth={depth+1} selected={selected} onSelect={onSelect} onToggle={onToggle}/>
        )}
      </div>
    ))}
  </div>
);

export const FileBrowser = () => {
  const [tree, setTree] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [rootPath, setRootPath] = useState(null);
  const [fileContent, setFileContent] = useState(null);
  const [dialog, setDialog] = useState(null);

  const openFolder = async () => {
    const r = await window.electronAPI?.openFolder();
    if(r?.filePaths?.[0]) {
      const dir = r.filePaths[0];
      setRootPath(dir);
      const name = dir.split(/[\\/]/).pop();
      const saved = await window.electronAPI?.upsertWorkspace({id:'ws-'+Date.now(),name,path:dir});
      window.dispatchEvent(new CustomEvent('meg:action', {
        detail: { action:'setActiveWorkspace', value: saved?.workspace || {name,path:dir} }
      }));
      const entries = await window.electronAPI.listDir(dir);
      if(!entries.error) {
        setTree(entries.map(mapEntry));
      }
    }
  };

  const refresh = async () => {
    if(!rootPath) return;
    const entries = await window.electronAPI.listDir(rootPath);
    if(!entries.error) {
      setTree(entries.map(mapEntry));
    }
  };

  const toggleFolder = async (target) => {
    if(target.type==='folder' && window.electronAPI && !target.loaded) {
      const entries = await window.electronAPI.listDir(target.path);
      const children = entries.error ? [] : entries.map(mapEntry);
      const patch = items => items.map(item =>
        item===target ? {...item,open:true,loaded:true,children} :
        item.children ? {...item,children:patch(item.children)} : item
      );
      setTree(t=>patch(t));
    } else {
      const toggle = items => items.map(item =>
        item===target ? {...item,open:!item.open} :
        item.children ? {...item,children:toggle(item.children)} : item
      );
      setTree(t=>toggle(t));
    }
  };

  const selectFile = async (item) => {
    setSelected(item);
    if(item.type==='file' && window.electronAPI) {
      const r = await window.electronAPI.readFile(item.path);
      const content = r.content || r.error || '// Could not read file';
      setFileContent(content);
      window.dispatchEvent(new CustomEvent('meg:action', {
        detail: { action: 'openFile', value: { name: item.name, path: item.path, content, ext: item.ext } }
      }));
    }
  };

  const createFile = async () => {
    if (!rootPath) {
      await openFolder();
      return;
    }
    const result = await window.electronAPI?.writeFile(joinPath(rootPath, dialog.value.trim()), '');
    if (result?.ok) refresh();
    setDialog(null);
  };

  const stats = countTreeStats(tree);
  const languageLabel = LANGUAGE_LABELS[selected?.ext] || (selected?.ext ? selected.ext.toUpperCase() : 'Text');

  const preview = fileContent || (selected ? `// ${selected.name}\n// No preview available` : null);

  return (
    <div style={{flex:1,display:'flex',minWidth:0,overflow:'hidden'}}>
      {dialog?.type === 'new-file' && (
        <TextEntryDialog
          title="Create file"
          description="Add a new file in the current workspace root."
          label="File name"
          placeholder="notes.md"
          value={dialog.value}
          confirmLabel="Create"
          onChange={(value) => setDialog((current) => ({ ...current, value }))}
          onCancel={() => setDialog(null)}
          onConfirm={createFile}
        />
      )}
      {dialog?.type === 'new-folder' && (
        <TextEntryDialog
          title="Create folder"
          description="Add a new folder in the current workspace root."
          label="Folder name"
          placeholder="docs"
          value={dialog.value}
          confirmLabel="Create"
          onChange={(value) => setDialog((current) => ({ ...current, value }))}
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            const p = joinPath(rootPath, dialog.value.trim());
            const result = await window.electronAPI?.mkdir(p);
            if (result?.ok !== false) refresh();
            setDialog(null);
          }}
        />
      )}
      {dialog?.type === 'rename' && selected && (
        <TextEntryDialog
          title="Rename item"
          description={`Rename ${selected.name} in place.`}
          label="New name"
          value={dialog.value}
          confirmLabel="Rename"
          onChange={(value) => setDialog((current) => ({ ...current, value }))}
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            const oldP = selected.path;
            const newP = joinPath(getParentPath(oldP), dialog.value.trim());
            if (dialog.value.trim() && dialog.value.trim() !== selected.name) {
              const r = await window.electronAPI?.renameFile(oldP, newP);
              if (r?.ok) { setSelected(null); setFileContent(null); refresh(); }
            }
            setDialog(null);
          }}
        />
      )}
      {dialog?.type === 'delete' && selected && (
        <ConfirmDialog
          title="Delete item"
          description={`Delete ${selected.name}? This removes it from the current workspace.`}
          confirmLabel="Delete"
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            const r = await window.electronAPI?.deleteFile(selected.path);
            if (r?.ok) { setSelected(null); setFileContent(null); refresh(); }
            setDialog(null);
          }}
        />
      )}
      {/* Tree */}
      <div style={{width:240,borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',background:'var(--bg)',flexShrink:0}}>
        <div style={{padding:'10px 12px 8px',borderBottom:'1px solid var(--border-light)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span style={{fontSize:12,fontWeight:600,color:'var(--text)'}}>Files</span>
          <div style={{display:'flex',gap:2}}>
            <button onClick={() => rootPath && setDialog({ type: 'new-folder', value: '' })} style={{width:24,height:24,borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-3)',transition:'background 0.1s',border:'none',background:'transparent',cursor:rootPath?'pointer':'default',opacity:rootPath?1:0.5}} title="New folder" onMouseEnter={e=>rootPath && (e.currentTarget.style.background='var(--bg-hover)')} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <Icon name="folder" size={13}/>
            </button>
            <button onClick={() => rootPath ? setDialog({ type: 'new-file', value: '' }) : createFile()} style={{width:24,height:24,borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-3)',transition:'background 0.1s',border:'none',background:'transparent',cursor:'pointer'}} title="New file" onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <Icon name="plus" size={13}/>
            </button>
          </div>
        </div>
        <div style={{padding:'6px 4px 4px'}}>
          <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 8px',background:'var(--bg-active)',borderRadius:6,margin:'0 6px'}}>
            <Icon name="search" size={11} color="var(--text-3)"/>
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filter files…" style={{flex:1,border:'none',outline:'none',fontSize:11.5,color:'var(--text)',background:'none',fontFamily:'"JetBrains Mono",monospace'}}/>
          </div>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'4px 0'}}>
          <FileBrowserTree items={tree} selected={selected?.name} onSelect={selectFile} onToggle={toggleFolder}/>
        </div>
        <div style={{padding:'8px 12px',borderTop:'1px solid var(--border-light)'}}>
          <div style={{fontSize:10.5,color:'var(--text-3)'}}>{stats.files} file{stats.files!==1?'s':''} · {stats.folders} folder{stats.folders!==1?'s':''}</div>
        </div>
      </div>

      {/* Preview */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {selected ? (
          <>
            <div style={{padding:'10px 18px',borderBottom:'1px solid var(--border-light)',display:'flex',alignItems:'center',gap:10,flexShrink:0,background:'var(--bg)'}}>
              <Icon name="doc" size={14} color={EXT_COLORS[selected.ext]||'var(--text-3)'}/>
              <span style={{fontSize:13,fontWeight:600,color:'var(--text)',fontFamily:'"JetBrains Mono",monospace'}}>{selected.name}</span>
              <span style={{fontSize:11,color:'var(--text-3)',marginLeft:4}}>{selected.ext?.toUpperCase()}</span>
              <div style={{marginLeft:'auto',display:'flex',gap:6}}>
                <button onClick={() => setDialog({ type: 'rename', value: selected.name })} style={{padding:'4px 10px',borderRadius:5,border:'1px solid var(--border)',fontSize:11.5,color:'var(--text-2)',display:'flex',alignItems:'center',gap:4,background:'var(--bg)',cursor:'pointer',transition:'border-color 0.12s'}} title="Rename" onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                  <Icon name="edit" size={11} color="var(--text-3)"/> Rename
                </button>
                <button onClick={() => setDialog({ type: 'delete' })} style={{padding:'4px 10px',borderRadius:5,border:'1px solid var(--border)',fontSize:11.5,color:'var(--red,#e05252)',display:'flex',alignItems:'center',gap:4,background:'var(--bg)',cursor:'pointer',transition:'border-color 0.12s'}} title="Delete" onMouseEnter={e=>e.currentTarget.style.borderColor='var(--red)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                  <Icon name="trash" size={11} color="var(--red)"/> Delete
                </button>
                <button onClick={()=>window.dispatchEvent(new CustomEvent('meg:action',{detail:{action:'sendToChat',text:`Edit this file (${selected.name}):\n\`\`\`${selected.ext||''}\n${preview||''}\n\`\`\`\nWhat changes should I make?`}}))} style={{padding:'4px 10px',borderRadius:5,border:'1px solid var(--border)',fontSize:11.5,color:'var(--text-2)',display:'flex',alignItems:'center',gap:4,background:'var(--bg)',cursor:'pointer',transition:'border-color 0.12s'}} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                  <Icon name="build" size={11} color="var(--text-3)"/> Edit
                </button>
                <button onClick={()=>window.dispatchEvent(new CustomEvent('meg:action',{detail:{action:'sendToChat',text:`Review this file and explain what it does:\n\`\`\`${selected?.ext||''}\n${preview}\n\`\`\``}}))} style={{padding:'4px 10px',borderRadius:5,border:'none',background:'var(--accent)',color:'#fff',fontSize:11.5,display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
                  <Icon name="agent" size={11} color="#fff"/> Ask Meg
                </button>
              </div>
            </div>
            <div style={{flex:1,overflowY:'auto',background:'var(--code-bg)',padding:'16px 20px'}}>
              <pre style={{fontFamily:'"JetBrains Mono",monospace',fontSize:12,lineHeight:1.7,color:'var(--code-text)',whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
                {preview.split('\n').map((line,i)=>{
                  const isComment = line.trim().startsWith('//');
                  const isImport = line.trim().startsWith('import')||line.trim().startsWith('export');
                  const hasStr = /['"`]/.test(line)&&!isComment;
                  return <span key={i} style={{color:isComment?'#555':isImport?'var(--code-blue)':hasStr?'var(--code-orange)':'var(--code-text)'}}>{line+'\n'}</span>;
                })}
              </pre>
            </div>
            <div style={{padding:'6px 18px',borderTop:'1px solid var(--code-border)',background:'var(--code-bg)',display:'flex',alignItems:'center',gap:12}}>
              <span style={{fontSize:10.5,fontFamily:'"JetBrains Mono",monospace',color:'#555'}}>{preview.split('\n').length} lines</span>
              <span style={{fontSize:10.5,fontFamily:'"JetBrains Mono",monospace',color:'#555'}}>{languageLabel}</span>
              <span style={{fontSize:10.5,fontFamily:'"JetBrains Mono",monospace',color:'#555',marginLeft:'auto'}}>UTF-8</span>
            </div>
          </>
        ) : (
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,color:'var(--text-3)'}}>
            <Icon name="files" size={32} color="var(--border)"/>
            <span style={{fontSize:13}}>{rootPath ? 'Select a file to preview' : 'No folder open'}</span>
            {!rootPath && (
              <button onClick={openFolder} style={{padding:'7px 16px',borderRadius:7,border:'1px solid var(--accent-border)',background:'var(--accent-bg)',color:'var(--accent)',fontSize:12.5,fontWeight:500,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
                <Icon name="folder" size={13} color="var(--accent)"/> Open folder
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
