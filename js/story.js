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
  document.querySelectorAll('.story-textarea,.scene-text,.char-textarea').forEach(ta=>{
    ta.style.height='auto';
    ta.style.height=ta.scrollHeight+'px';
    ta.style.overflow='hidden';
  });
}

// ── CAMPO TESTO DIRETTO — stile uniforme, niente matite ──
function makeTextField(wrap, value, onSave, opts={}){
  wrap.innerHTML='';
  const ta = document.createElement('textarea');
  ta.className='story-textarea';
  ta.value = value||'';
  ta.placeholder = opts.placeholder||'';
  ta.style.cssText=`font-size:13px;min-height:${opts.minHeight||'60px'};overflow:hidden;${opts.bg?'background:'+opts.bg+';border-color:'+opts.border+';':'' }`;
  ta.addEventListener('input', function(){
    this.style.height='auto';
    this.style.height=this.scrollHeight+'px';
    onSave(this.value);
  });
  requestAnimationFrame(()=>{
    ta.style.height='auto';
    ta.style.height=ta.scrollHeight+'px';
  });
  wrap.appendChild(ta);
}

export function restoreStoryFields(p){
  const taccuinoWrap = document.getElementById('taccuino-wrap');
  if(taccuinoWrap){
    makeTextField(taccuinoWrap, (p.story&&p.story.taccuino)||'', val=>{
      if(!p.story)p.story={};
      p.story.taccuino=val;
      scheduleSave(p);
    }, {placeholder:'Scrivi liberamente — idee, spunti, direzioni narrative…', minHeight:'80px', bg:'#fdf8e8', border:'#e8d898'});
  }

  const soggettoWrap = document.getElementById('soggetto-wrap');
  if(soggettoWrap){
    makeTextField(soggettoWrap, (p.story&&p.story.soggetto)||'', val=>{
      if(!p.story)p.story={};
      p.story.soggetto=val;
      scheduleSave(p);
    }, {placeholder:'Chi è il protagonista, cosa vuole, cosa glielo impedisce, come finisce…', minHeight:'80px'});
  }

  const worldWrap = document.getElementById('world-wrap');
  if(worldWrap){
    makeTextField(worldWrap, (p.story&&p.story.world)||'', val=>{
      if(!p.story)p.story={};
      p.story.world=val;
      scheduleSave(p);
    }, {placeholder:'Dove e quando si svolge la storia? Che tipo di mondo è?', minHeight:'60px'});
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
      inc.style.cssText='padding:8px 12px 4px';
      const incLabel=document.createElement('div');
      incLabel.style.cssText=`font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${act.color};margin-bottom:6px`;
      incLabel.textContent='Inciting Incident';
      const incWrap=document.createElement('div');
      makeTextField(incWrap, p.story.pp.inciting||'', val=>{
        if(!p.story.pp) p.story.pp={pp1:'',pp2:'',inciting:''};
        p.story.pp.inciting=val;
        scheduleSave(p);
      }, {placeholder:"L'evento che mette in moto la storia…", minHeight:'44px'});
      inc.appendChild(incLabel);
      inc.appendChild(incWrap);
      col.appendChild(inc);
    }

    const body=document.createElement('div');
    body.className='act-col-body';
    body.id='act-body-'+act.id;
    body.dataset.act=act.id;

    scenes.forEach((sc,i)=>{ body.appendChild(makeSceneCard(act.id,i,sc,p)); });

    const addBtn=document.createElement('button');
    addBtn.className='add-scene-btn';
    addBtn.textContent='+ aggiungi scena';
    addBtn.onclick=e=>{ e.preventDefault(); addScene(act.id); };
    body.appendChild(addBtn);
    col.appendChild(body);
    board.appendChild(col);

    if(act.pp_after){
      const ppKey=ai===0?'pp1':'pp2';
      const div=document.createElement('div');
      div.className='plot-point-divider';
      div.style.cssText='flex-direction:column;align-items:stretch;gap:6px';
      const ppHeader=document.createElement('div');
      ppHeader.style.cssText='display:flex;align-items:center;gap:8px';
      ppHeader.innerHTML=`<div style="flex:1;height:1.5px;background:var(--coral);opacity:.5"></div><div class="plot-point-label">⬡ ${act.pp_after}</div><div style="flex:1;height:1.5px;background:var(--coral);opacity:.5"></div>`;
      const ppWrap=document.createElement('div');
      makeTextField(ppWrap, p.story.pp[ppKey]||'', val=>{
        if(!p.story.pp) p.story.pp={pp1:'',pp2:'',inciting:''};
        p.story.pp[ppKey]=val;
        scheduleSave(p);
      }, {placeholder:`Descrivi il ${act.pp_after}…`, minHeight:'44px'});
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
  del.onclick=e=>{ e.preventDefault(); deleteScene(actId,idx); };

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
  const hdr=document.getElementById('act-body-'+actId)?.closest('.act-col')?.querySelector('.act-col-header span:last-child');
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
      dragAct=card.dataset.act;dragIdx=parseInt(card.dataset.idx);
      setTimeout(()=>card.classList.add('dragging'),0);
    });
    card.addEventListener('dragend',()=>card.classList.remove('dragging'));
  });
  document.querySelectorAll('.act-col-body').forEach(body=>{
    body.addEventListener('dragover',e=>e.preventDefault());
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
  const body=document.getElementById(id+'-body');
  const chev=document.getElementById(id+'-chev');
  if(!body)return;
  const open=body.classList.contains('open');
  body.classList.toggle('open',!open);
  if(chev)chev.classList.toggle('open',!open);
}

export function restoreWorldFields(p){
  renderCharacters(p);
}

const CHAR_COLORS = ['#4ab8d8','#e84848','#48a848','#f0c020','#7F77DD','#e89020','#c060a0','#2a88b8'];

export function renderCharacters(p){
  const list=document.getElementById('chars-list');
  if(!list)return;
  if(!p.story)p.story={};
  if(!p.story.characters)p.story.characters=[];
  list.innerHTML='';
  p.story.characters.forEach((ch,i)=>{
    const color = CHAR_COLORS[i % CHAR_COLORS.length];
    const initial = (ch.name||'?').trim().charAt(0).toUpperCase() || '?';

    const card=document.createElement('div');
    card.className='char-card-v2';

    // Cerchio colorato con iniziale
    const avatar=document.createElement('div');
    avatar.className='char-avatar';
    avatar.style.background=color;
    avatar.textContent=initial;

    // Contenuto
    const content=document.createElement('div');
    content.className='char-content';

    // Nome (input invisibile finché non lo tocchi)
    const nameInput=document.createElement('input');
    nameInput.type='text';
    nameInput.value=ch.name||'';
    nameInput.placeholder='Nome personaggio';
    nameInput.className='char-name-v2';
    nameInput.addEventListener('input',function(){
      const p=getProject(currentId);if(!p||!p.story||!p.story.characters)return;
      p.story.characters[i].name=this.value;
      avatar.textContent=(this.value||'?').trim().charAt(0).toUpperCase()||'?';
      scheduleSave(p);
    });

    // Descrizione
    const descTa=document.createElement('textarea');
    descTa.className='char-desc-v2';
    descTa.value=ch.desc||'';
    descTa.placeholder='Descrizione — aspetto, personalità, background…';
    descTa.rows=2;
    descTa.addEventListener('input',function(){
      const p=getProject(currentId);if(!p||!p.story||!p.story.characters)return;
      p.story.characters[i].desc=this.value;
      this.style.height='auto';
      this.style.height=this.scrollHeight+'px';
      scheduleSave(p);
    });
    requestAnimationFrame(()=>{ descTa.style.height='auto'; descTa.style.height=descTa.scrollHeight+'px'; });

    content.appendChild(nameInput);
    content.appendChild(descTa);

    // Elimina
    const del=document.createElement('button');
    del.className='char-del-v2';
    del.textContent='×';
    del.onclick=()=>deleteCharacter(i);

    card.appendChild(avatar);
    card.appendChild(content);
    card.appendChild(del);
    list.appendChild(card);

    if(!ch.name&&!ch.desc) setTimeout(()=>nameInput.focus(),50);
  });
}

export function toggleCharCard(i){
  // Non più usato — schede sempre aperte
}

export function addCharacter(){
  const p=getProject(currentId);if(!p)return;
  if(!p.story)p.story={};
  if(!p.story.characters)p.story.characters=[];
  p.story.characters.push({name:'',desc:''});
  scheduleSave(p);
  renderCharacters(p);
}

export function deleteCharacter(i){
  const p=getProject(currentId);if(!p||!p.story||!p.story.characters)return;
  p.story.characters.splice(i,1);
  scheduleSave(p);
  renderCharacters(p);
}
