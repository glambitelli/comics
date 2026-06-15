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

export function restoreStoryFields(p){
  const soggetto=document.getElementById('soggetto-text');
  if(soggetto){
    soggetto.value=(p.story&&p.story.soggetto)||'';
    updateCharCount('soggetto-count',soggetto.value,800);
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
      const incTa=document.createElement('textarea');
      incTa.className='story-textarea';
      incTa.style.cssText='font-size:14px;min-height:52px;';
      incTa.placeholder="L'evento che mette in moto la storia…";
      incTa.value=p.story.pp.inciting||'';
      incTa.addEventListener('input', function(){
        if(!p.story.pp) p.story.pp={pp1:'',pp2:'',inciting:''};
        p.story.pp.inciting=this.value;
        scheduleSave(p);
      });
      inc.appendChild(incLabel);
      inc.appendChild(incTa);
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
      const ppTa=document.createElement('textarea');
      ppTa.className='story-textarea';
      ppTa.style.cssText='font-size:14px;min-height:52px;';
      ppTa.placeholder=`Descrivi il ${act.pp_after}…`;
      ppTa.value=p.story.pp[ppKey]||'';
      ppTa.addEventListener('input', function(){
        if(!p.story.pp) p.story.pp={pp1:'',pp2:'',inciting:''};
        p.story.pp[ppKey]=this.value;
        scheduleSave(p);
      });
      div.appendChild(ppHeader);
      div.appendChild(ppTa);
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
  const world = document.getElementById('world-text');
  if(world) world.value = (p.story&&p.story.world)||'';
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
    const hdr = document.createElement('div');
    hdr.className='char-card-header';
    hdr.onclick=()=>toggleCharCard(i);
    hdr.innerHTML=`
      <span class="char-card-name" id="char-name-display-${i}">${ch.name||'Personaggio'}</span>
      <span class="char-card-role">${ch.role||''}</span>
      <button class="char-card-del" onclick="event.stopPropagation();deleteCharacter(${i})">×</button>`;
    const body = document.createElement('div');
    body.className='char-card-body';
    body.id='char-body-'+i;
    const nameField = makeCharField('Nome', ch.name||'', 'name', i);
    const roleField = makeCharField('Ruolo nella storia', ch.role||'', 'role', i);
    const descField = makeCharFieldTextarea('Descrizione', ch.desc||'', 'desc', i);
    body.appendChild(nameField);
    body.appendChild(roleField);
    body.appendChild(descField);
    card.appendChild(hdr);
    card.appendChild(body);
    list.appendChild(card);
  });
}

function makeCharField(label, value, field, idx){
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
    if(field==='name'){
      const disp=document.getElementById('char-name-display-'+idx);
      if(disp) disp.textContent=this.value||'Personaggio';
    }
    scheduleSave(p);
  });
  wrap.appendChild(input);
  return wrap;
}

function makeCharFieldTextarea(label, value, field, idx){
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
