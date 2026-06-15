import { getProject, currentId } from './state.js';
import { scheduleSave } from './firebase.js';

const ACT_CONFIG=[
  {id:'setup',     label:'Setup',        color:'#4ab8d8',light:'#d0eefc', pp_after:'Plot Point 1', inciting:true},
  {id:'confrontation',label:'Confrontation',color:'#f0c020',light:'#fdf0b0',pp_after:'Plot Point 2', inciting:false},
  {id:'resolution',label:'Resolution',   color:'#48a848',light:'#c8ecc8', pp_after:null,            inciting:false},
];

export function saveStoryField(field,value){
  const p=getProject(currentId);if(!p)return;
  if(!p.story)p.story={};
  p.story[field]=value;
  scheduleSave(p);
}

export function updateCharCount(elId,value,max){
  const el=document.getElementById(elId);
  if(el) el.textContent=`${value.length} / ${max}`;
}

export function autoResize(el){
  el.style.height='auto';
  el.style.height=el.scrollHeight+'px';
}

export function autoResizeAll(){
  document.querySelectorAll('.story-textarea, .scene-text').forEach(ta=>{
    ta.style.height='auto';
    ta.style.height = ta.scrollHeight+'px';
    ta.style.overflow='hidden';
  });
}

// ── READ/EDIT FIELD — campo con modalità lettura e modifica ──
function makeReadEditField(wrap, value, onSave){
  wrap.innerHTML='';

  const renderRead = () => {
    wrap.innerHTML='';
    const textEl = document.createElement('div');
    textEl.style.cssText='font-size:14px;color:var(--ink);line-height:1.75;white-space:pre-wrap;position:relative;padding-right:28px;word-break:break-word';
    textEl.textContent = value || '';

    if(!value){
      textEl.style.color='var(--ink3)';
      textEl.style.fontStyle='italic';
      textEl.textContent='Nessun testo ancora.';
    }

    const editBtn = document.createElement('button');
    editBtn.title='Modifica';
    editBtn.style.cssText='position:absolute;top:0;right:0;background:none;border:none;cursor:pointer;font-size:14px;color:var(--ink3);padding:2px 4px;opacity:.4;line-height:1';
    editBtn.textContent='✏️';
    editBtn.onmouseenter=()=>editBtn.style.opacity='1';
    editBtn.onmouseleave=()=>editBtn.style.opacity='.4';
    editBtn.onclick=()=>renderEdit();
    textEl.appendChild(editBtn);
    wrap.appendChild(textEl);
  };

  const renderEdit = () => {
    wrap.innerHTML='';
    const ta = document.createElement('textarea');
    ta.className='story-textarea';
    ta.value=value;
    ta.style.minHeight='80px';
    ta.addEventListener('input', function(){
      value=this.value;
      this.style.height='auto';
      this.style.height=this.scrollHeight+'px';
      onSave(value);
    });
    // Auto-resize
    setTimeout(()=>{ ta.style.height='auto'; ta.style.height=ta.scrollHeight+'px'; ta.focus(); },10);

    const doneBtn = document.createElement('button');
    doneBtn.style.cssText='margin-top:8px;font-size:11px;padding:5px 12px;border-radius:8px;border:none;background:var(--sky);color:#fff;cursor:pointer;font-family:\'Nunito\',sans-serif;font-weight:700;display:block';
    doneBtn.textContent='✓ Fatto';
    doneBtn.onclick=()=>renderRead();

    wrap.appendChild(ta);
    wrap.appendChild(doneBtn);
  };

  // Mostra lettura se c'è contenuto, modifica se vuoto
  if(value && value.trim()) renderRead();
  else renderEdit();
}

export function restoreStoryFields(p){
  // Soggetto
  const soggettoWrap = document.getElementById('soggetto-wrap');
  if(soggettoWrap){
    makeReadEditField(soggettoWrap, (p.story&&p.story.soggetto)||'', val=>{
      if(!p.story)p.story={};
      p.story.soggetto=val;
      scheduleSave(p);
    });
  }

  // Ambientazione
  const worldWrap = document.getElementById('world-wrap');
  if(worldWrap){
    makeReadEditField(worldWrap, (p.story&&p.story.world)||'', val=>{
      if(!p.story)p.story={};
      p.story.world=val;
      scheduleSave(p);
    });
  }

  renderActBoard(p);
  restoreWorldFields(p);
}

export function renderActBoard(p){
  const board=document.getElementById('act-board');
  if(!board)return;
  if(!p.story)p.story={};
  if(!p.story.acts) p.story.acts={setup:[],confrontation:[],resolution:[]};
  if(!p.story.pp) p.story.pp={pp1:'',pp2:'',inciting:''};

  board.innerHTML='';
  ACT_CONFIG.forEach((act,ai)=>{
    const scenes=p.story.acts[act.id]||[];

    const col=document.createElement('div');
    col.className='act-col';
    col.style.borderColor=act.color+'66';

    const hdr=document.createElement('div');
    hdr.className='act-col-header';
    hdr.style.cssText=`background:${act.light};color:${act.color}`;
    hdr.innerHTML=`<span>${act.label}</span><span style="font-size:10px;font-weight:500;opacity:.7">${scenes.length} scene</span>`;
    col.appendChild(hdr);

    if(act.inciting){
      const inc=document.createElement('div');
      inc.style.cssText='padding:8px 12px 4px;';
      const incLabel=document.createElement('div');
      incLabel.style.cssText=`font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${act.color};margin-bottom:6px`;
      incLabel.textContent='Inciting Incident';
      const incWrap=document.createElement('div');
      makeReadEditField(incWrap, p.story.pp.inciting||'', val=>{
        if(!p.story.pp) p.story.pp={pp1:'',pp2:'',inciting:''};
        p.story.pp.inciting=val;
        scheduleSave(p);
      });
      inc.appendChild(incLabel);
      inc.appendChild(incWrap);
      col.appendChild(inc);
    }

    const body=document.createElement('div');
    body.className='act-col-body';
    body.id='act-body-'+act.id;
    body.dataset.act=act.id;

    scenes.forEach((sc,i)=>{
      body.appendChild(makeSceneCard(act.id, i, sc, p));
    });

    const addBtn=document.createElement('button');
    addBtn.className='add-scene-btn';
    addBtn.textContent='+ aggiungi scena';
    addBtn.onclick=()=>addScene(act.id);
    body.appendChild(addBtn);
    col.appendChild(body);
    board.appendChild(col);

    if(act.pp_after){
      const ppKey = ai===0 ? 'pp1' : 'pp2';
      const div=document.createElement('div');
      div.className='plot-point-divider';
      div.style.flexDirection='column';
      div.style.alignItems='stretch';
      div.style.gap='6px';
      const ppHeader=document.createElement('div');
      ppHeader.style.cssText='display:flex;align-items:center;gap:8px';
      ppHeader.innerHTML=`<div style="flex:1;height:1.5px;background:var(--coral);opacity:.5"></div><div class="plot-point-label">⬡ ${act.pp_after}</div><div style="flex:1;height:1.5px;background:var(--coral);opacity:.5"></div>`;
      const ppWrap=document.createElement('div');
      makeReadEditField(ppWrap, p.story.pp[ppKey]||'', val=>{
        if(!p.story.pp) p.story.pp={pp1:'',pp2:'',inciting:''};
        p.story.pp[ppKey]=val;
        scheduleSave(p);
      });
      div.appendChild(ppHeader);
      div.appendChild(ppWrap);
      board.appendChild(div);
    }
  });

  attachDrag(p);
  requestAnimationFrame(autoResizeAll);
}

function makeSceneCard(actId, idx, text, p){
  const card=document.createElement('div');
  card.className='scene-card';
  card.draggable=true;
  card.dataset.act=actId;
  card.dataset.idx=idx;

  const handle=document.createElement('span');
  handle.className='scene-handle';
  handle.textContent='⠿';

  const ta=document.createElement('textarea');
  ta.className='scene-text';
  ta.rows=2;
  ta.placeholder='Descrivi la scena…';
  ta.value=text||'';
  ta.addEventListener('input', function(){
    autoResize(this);
    if(!p.story||!p.story.acts)return;
    p.story.acts[actId][idx]=this.value;
    scheduleSave(p);
  });

  const del=document.createElement('button');
  del.className='scene-del';
  del.textContent='×';
  del.onclick=()=>deleteScene(actId,idx);

  card.appendChild(handle);
  card.appendChild(ta);
  card.appendChild(del);
  return card;
}

export function addScene(actId){
  const p=getProject(currentId);if(!p)return;
  if(!p.story)p.story={};
  if(!p.story.acts)p.story.acts={setup:[],confrontation:[],resolution:[]};
  p.story.acts[actId].push('');
  scheduleSave(p);
  const body=document.getElementById('act-body-'+actId);
  if(body){
    const addBtn=body.querySelector('.add-scene-btn');
    const idx=p.story.acts[actId].length-1;
    const card=makeSceneCard(actId,idx,'',p);
    body.insertBefore(card,addBtn);
    card.querySelector('.scene-text').focus();
  }
  const hdr=body.closest('.act-col').querySelector('.act-col-header span:last-child');
  if(hdr) hdr.textContent=p.story.acts[actId].length+' scene';
}

export function updateScene(actId,idx,value){
  const p=getProject(currentId);if(!p||!p.story||!p.story.acts)return;
  p.story.acts[actId][idx]=value;
  scheduleSave(p);
}

export function deleteScene(actId,idx){
  const p=getProject(currentId);if(!p||!p.story||!p.story.acts)return;
  p.story.acts[actId].splice(idx,1);
  scheduleSave(p);renderActBoard(p);
}

function attachDrag(p){
  let dragAct=null,dragIdx=null;
  document.querySelectorAll('.scene-card').forEach(card=>{
    card.addEventListener('dragstart',e=>{
      dragAct=card.dataset.act; dragIdx=parseInt(card.dataset.idx);
      setTimeout(()=>card.classList.add('dragging'),0);
    });
    card.addEventListener('dragend',()=>card.classList.remove('dragging'));
  });
  document.querySelectorAll('.act-col-body').forEach(body=>{
    body.addEventListener('dragover',e=>{e.preventDefault();});
    body.addEventListener('drop',e=>{
      e.preventDefault();
      if(dragAct===null||dragIdx===null)return;
      const targetAct=body.dataset.act;
      const cards=[...body.querySelectorAll('.scene-card')];
      let dropIdx=cards.length;
      cards.forEach((c,i)=>{
        const rect=c.getBoundingClientRect();
        if(e.clientY<rect.top+rect.height/2) dropIdx=Math.min(dropIdx,i);
      });
      if(!p.story||!p.story.acts)return;
      const scene=p.story.acts[dragAct].splice(dragIdx,1)[0];
      p.story.acts[targetAct].splice(dropIdx,0,scene);
      dragAct=null;dragIdx=null;
      scheduleSave(p);renderActBoard(p);
    });
  });
}

export function toggleSubsection(id){
  const body = document.getElementById(id+'-body');
  const chev = document.getElementById(id+'-chev');
  if(!body) return;
  const open = body.classList.contains('open');
  body.classList.toggle('open', !open);
  if(chev) chev.classList.toggle('open', !open);
}

export function restoreWorldFields(p){
  // world è gestito da makeReadEditField in restoreStoryFields
  renderCharacters(p);
}

export function renderCharacters(p){
  const list = document.getElementById('chars-list');
  if(!list) return;
  if(!p.story) p.story={};
  if(!p.story.characters) p.story.characters=[];
  list.innerHTML='';
  p.story.characters.forEach((ch,i)=>{
    const card = document.createElement('div');
    card.className='char-card';

    // Header — clicca per aprire/chiudere
    const hdr = document.createElement('div');
    hdr.className='char-card-header';
    hdr.onclick=()=>toggleCharCard(i);
    hdr.innerHTML=`
      <span style="font-size:13px;color:var(--ink3);margin-right:2px">▾</span>
      <span class="char-card-name" id="char-name-display-${i}">${ch.name||'Personaggio'}</span>
      <span class="char-card-role" id="char-role-display-${i}">${ch.role||''}</span>
      <button class="char-card-del" onclick="event.stopPropagation();deleteCharacter(${i})">×</button>`;

    // Body — sola lettura di default
    const body = document.createElement('div');
    body.className='char-card-body';
    body.id='char-body-'+i;

    const renderReadMode = () => {
      body.innerHTML='';
      const readView = document.createElement('div');
      readView.style.cssText='padding:4px 0 4px;position:relative';

      if(ch.desc){
        const descEl = document.createElement('div');
        descEl.style.cssText='font-size:13px;color:var(--ink2);line-height:1.6;white-space:pre-wrap;padding-right:28px';
        descEl.textContent=ch.desc;
        readView.appendChild(descEl);
      } else {
        const empty = document.createElement('div');
        empty.style.cssText='font-size:12px;color:var(--ink3);font-style:italic;padding-right:28px';
        empty.textContent='Nessuna descrizione';
        readView.appendChild(empty);
      }

      // Icona matita in alto a destra, minimale
      const editBtn = document.createElement('button');
      editBtn.title='Modifica';
      editBtn.style.cssText='position:absolute;top:0;right:0;background:none;border:none;cursor:pointer;font-size:14px;color:var(--ink3);padding:2px 4px;opacity:.5;line-height:1';
      editBtn.textContent='✏️';
      editBtn.onmouseenter=()=>editBtn.style.opacity='1';
      editBtn.onmouseleave=()=>editBtn.style.opacity='.5';
      editBtn.onclick = e => { e.stopPropagation(); renderEditMode(); };

      readView.appendChild(editBtn);
      body.appendChild(readView);
    };

    const renderEditMode = () => {
      body.innerHTML='';
      const nameField = makeCharField('Nome', ch.name||'', 'name', i, ch);
      const roleField = makeCharField('Ruolo nella storia', ch.role||'', 'role', i, ch);
      const descField = makeCharFieldTextarea('Descrizione', ch.desc||'', 'desc', i, ch);

      // Pulsante salva/blocca
      const saveBtn = document.createElement('button');
      saveBtn.style.cssText='margin-top:10px;font-size:11px;padding:5px 12px;border-radius:8px;border:none;background:var(--sky);color:#fff;cursor:pointer;font-family:\'Nunito\',sans-serif;font-weight:700';
      saveBtn.textContent='✓ Fatto';
      saveBtn.onclick = e => {
        e.stopPropagation();
        const disp=document.getElementById('char-name-display-'+i);
        if(disp) disp.textContent=ch.name||'Personaggio';
        const roleDisp=document.getElementById('char-role-display-'+i);
        if(roleDisp) roleDisp.textContent=ch.role||'';
        renderReadMode();
      };

      body.appendChild(nameField);
      body.appendChild(roleField);
      body.appendChild(descField);
      body.appendChild(saveBtn);
    };

    // Nuovi personaggi partono in edit mode, quelli esistenti in read mode
    const isNew = !ch.name && !ch.role && !ch.desc;
    if(isNew) {
      setTimeout(()=>{ body.classList.add('open'); renderEditMode(); }, 50);
    } else {
      renderReadMode();
    }

    card.appendChild(hdr);
    card.appendChild(body);
    list.appendChild(card);
  });
}

function makeCharField(label, value, field, idx, ch){
  const wrap = document.createElement('div');
  wrap.className='char-field';
  wrap.innerHTML=`<div class="char-field-label">${label}</div>`;
  const input = document.createElement('input');
  input.className='char-input';
  input.type='text';
  input.value=value;
  input.placeholder=label+'…';
  input.addEventListener('input', function(){
    const p=getProject(currentId); if(!p||!p.story||!p.story.characters) return;
    p.story.characters[idx][field]=this.value;
    ch[field]=this.value;
    scheduleSave(p);
  });
  wrap.appendChild(input);
  return wrap;
}

function makeCharFieldTextarea(label, value, field, idx, ch){
  const wrap = document.createElement('div');
  wrap.className='char-field';
  wrap.innerHTML=`<div class="char-field-label">${label}</div>`;
  const ta = document.createElement('textarea');
  ta.className='char-input story-textarea';
  ta.style.minHeight='70px';
  ta.rows=3;
  ta.value=value;
  ta.placeholder='Descrivi il personaggio — aspetto fisico, personalità, background…';
  ta.addEventListener('input', function(){
    const p=getProject(currentId); if(!p||!p.story||!p.story.characters) return;
    p.story.characters[idx][field]=this.value;
    ch[field]=this.value;
    scheduleSave(p);
  });
  wrap.appendChild(ta);
  return wrap;
}

export function toggleCharCard(i){
  const body=document.getElementById('char-body-'+i);
  if(!body) return;
  body.classList.toggle('open');
}

export function addCharacter(){
  const p=getProject(currentId); if(!p) return;
  if(!p.story) p.story={};
  if(!p.story.characters) p.story.characters=[];
  p.story.characters.push({name:'',role:'',desc:''});
  scheduleSave(p);
  renderCharacters(p);
  setTimeout(()=>{
    const idx=p.story.characters.length-1;
    const body=document.getElementById('char-body-'+idx);
    if(body) body.classList.add('open');
    const nameInput=body&&body.querySelector('.char-input');
    if(nameInput) nameInput.focus();
  },50);
}

export function deleteCharacter(i){
  const p=getProject(currentId); if(!p||!p.story||!p.story.characters) return;
  p.story.characters.splice(i,1);
  scheduleSave(p);
  renderCharacters(p);
}
