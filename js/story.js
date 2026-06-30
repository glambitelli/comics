import { getProject, currentId } from './state.js';
import { scheduleSave } from './firebase.js';
import { parseScreenplay } from './scriptment.js';
import { getScriptment } from './home.js';

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
  renderScenes(p);
  if(window.wireCopyButtons) window.wireCopyButtons();
}

export function renderActBoard(p){
  const board=document.getElementById('act-board');
  if(!board)return;
  if(!p.story)p.story={};
  if(!p.story.acts) p.story.acts={setup:[],confrontation:[],resolution:[]};
  if(!p.story.pp) p.story.pp={pp1:'',pp2:'',inciting:''};

  if(window._screenplayMode){ renderScreenplay(p); return; }

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
  card.dataset.act=actId;
  card.dataset.idx=idx;

  const handle=document.createElement('span');
  handle.className='scene-handle';
  handle.textContent='⠿';
  handle.dataset.dragHandle='1';

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
  // Ridimensiona dopo che il DOM è visibile (funziona anche se lo step era collassato)
  requestAnimationFrame(()=>{ if(ta.offsetParent!==null) autoResize(ta); });
  setTimeout(()=>autoResize(ta), 120);

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
  // Drag delle scene tramite la maniglia ⠿ — funziona con mouse e touch.
  // Non usa draggable HTML5 (rotto su mobile): usa pointer events e parte solo dalla maniglia.
  const handles = document.querySelectorAll('.scene-card .scene-handle');
  handles.forEach(handle=>{
    handle.style.touchAction = 'none'; // impedisce lo scroll mentre trascini la maniglia
    handle.addEventListener('pointerdown', e=>{
      e.preventDefault();
      const card = handle.closest('.scene-card');
      if(!card) return;
      const dragAct = card.dataset.act;
      const dragIdx = parseInt(card.dataset.idx);

      card.classList.add('dragging');
      const ghostMoved = { v:false };

      function onMove(ev){
        ghostMoved.v = true;
        // Trova la card sotto il dito/cursore
        const y = ev.clientY;
        const x = ev.clientX;
        const elBelow = document.elementFromPoint(x, y);
        const overCard = elBelow && elBelow.closest && elBelow.closest('.scene-card');
        // Evidenzia la posizione di drop
        document.querySelectorAll('.scene-card').forEach(c=>c.classList.remove('drop-target'));
        if(overCard && overCard!==card) overCard.classList.add('drop-target');
      }

      function onUp(ev){
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        card.classList.remove('dragging');
        document.querySelectorAll('.scene-card').forEach(c=>c.classList.remove('drop-target'));

        if(!ghostMoved.v){ return; } // solo un tap, niente drag

        const elBelow = document.elementFromPoint(ev.clientX, ev.clientY);
        const targetBody = elBelow && elBelow.closest && elBelow.closest('.act-col-body');
        if(!targetBody || !p.story || !p.story.acts){ return; }
        const targetAct = targetBody.dataset.act;

        // Calcola l'indice di drop in base alla posizione verticale
        const cards = [...targetBody.querySelectorAll('.scene-card')];
        let dropIdx = cards.length;
        for(let i=0;i<cards.length;i++){
          const rect = cards[i].getBoundingClientRect();
          if(ev.clientY < rect.top + rect.height/2){ dropIdx = i; break; }
        }

        // Sposta la scena
        const scene = p.story.acts[dragAct].splice(dragIdx,1)[0];
        // Se sposto nello stesso atto e l'indice di partenza è prima del drop, aggiusta
        let insertIdx = dropIdx;
        if(dragAct===targetAct && dragIdx < dropIdx) insertIdx = dropIdx - 1;
        p.story.acts[targetAct].splice(insertIdx, 0, scene);
        scheduleSave(p);
        renderActBoard(p);
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
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
    card.draggable=true;
    card.dataset.idx=i;

    // Handle drag
    const handle=document.createElement('div');
    handle.className='char-drag-handle';
    handle.textContent='⠿';

    // Cerchio colorato con iniziale
    const avatar=document.createElement('div');
    avatar.className='char-avatar';
    avatar.style.background=color;
    avatar.textContent=initial;

    // Contenuto
    const content=document.createElement('div');
    content.className='char-content';

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

    // Divisore
    const divider=document.createElement('div');
    divider.className='char-divider';

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
    content.appendChild(divider);
    content.appendChild(descTa);

    const del=document.createElement('button');
    del.className='char-del-v2';
    del.textContent='×';
    del.onclick=()=>deleteCharacter(i);

    card.appendChild(handle);
    card.appendChild(avatar);
    card.appendChild(content);
    card.appendChild(del);
    list.appendChild(card);

    if(!ch.name&&!ch.desc) setTimeout(()=>nameInput.focus(),50);
  });

  attachCharDrag(p);
  if(window.wireCopyButtons) window.wireCopyButtons();
}

function attachCharDrag(p){
  const list=document.getElementById('chars-list');
  let dragEl=null, dragIdx=null;
  list.querySelectorAll('.char-card-v2').forEach(card=>{
    card.addEventListener('dragstart',e=>{
      // Non draggare se sto scrivendo
      if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'){ e.preventDefault(); return; }
      dragEl=card; dragIdx=parseInt(card.dataset.idx);
      setTimeout(()=>card.classList.add('char-dragging'),0);
    });
    card.addEventListener('dragend',()=>{ if(dragEl)dragEl.classList.remove('char-dragging'); dragEl=null; });
    card.addEventListener('dragover',e=>e.preventDefault());
    card.addEventListener('drop',e=>{
      e.preventDefault();
      if(dragEl===null||dragEl===card)return;
      const toIdx=parseInt(card.dataset.idx);
      if(!p.story||!p.story.characters)return;
      const [moved]=p.story.characters.splice(dragIdx,1);
      p.story.characters.splice(toIdx,0,moved);
      scheduleSave(p);
      renderCharacters(p);
    });
  });
}

export function toggleCharCard(i){}

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

// ── VISTA SCENEGGIATURA — script lineare leggibile ──
export function toggleScreenplay(){
  window._screenplayMode = !window._screenplayMode;
  const p = getProject(currentId);
  if(p) renderActBoard(p);
  // Aggiorna l'icona del pulsante nell'header
  const btn = document.getElementById('screenplay-toggle-btn');
  if(btn){
    btn.textContent = window._screenplayMode ? '▦' : '☰';
    btn.title = window._screenplayMode ? 'Vista board' : 'Vista sceneggiatura';
    btn.style.color = window._screenplayMode ? 'var(--sky-deep)' : 'var(--ink3)';
  }
}

function renderScreenplay(p){
  const board=document.getElementById('act-board');
  if(!board)return;
  board.innerHTML='';

  const acts=p.story.acts||{setup:[],confrontation:[],resolution:[]};
  const pp=p.story.pp||{pp1:'',pp2:'',inciting:''};

  const wrap=document.createElement('div');
  wrap.style.cssText='background:var(--white);border-radius:12px;border:1.5px solid var(--sand2);padding:20px 18px;box-shadow:var(--shadow)';

  let html='';
  const ACTS=[
    {id:'setup',label:'ATTO I · SETUP',color:'#4ab8d8'},
    {id:'confrontation',label:'ATTO II · CONFRONTATION',color:'#f0c020'},
    {id:'resolution',label:'ATTO III · RESOLUTION',color:'#48a848'},
  ];

  if(pp.inciting&&pp.inciting.trim()){
    html+=`<div style="margin-bottom:18px"><div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#4ab8d8;margin-bottom:5px">Inciting Incident</div><div style="font-size:14px;line-height:1.7;color:var(--ink);white-space:pre-wrap">${escHtml(pp.inciting)}</div></div>`;
  }

  ACTS.forEach((act,ai)=>{
    const scenes=(acts[act.id]||[]).filter(s=>s&&s.trim());
    html+=`<div style="font-size:13px;font-weight:700;letter-spacing:.06em;color:${act.color};margin:20px 0 10px;padding-bottom:5px;border-bottom:2px solid ${act.color}33">${act.label}</div>`;
    if(scenes.length===0){
      html+=`<div style="font-size:13px;color:var(--ink3);font-style:italic;margin-bottom:8px">Nessuna scena</div>`;
    }
    scenes.forEach((s,si)=>{
      html+=`<div style="display:flex;gap:10px;margin-bottom:12px"><div style="flex-shrink:0;font-size:12px;font-weight:700;color:${act.color};min-width:20px">${si+1}.</div><div style="flex:1;font-size:14px;line-height:1.7;color:var(--ink);white-space:pre-wrap">${escHtml(s)}</div></div>`;
    });
    if(ai===0&&pp.pp1&&pp.pp1.trim()){
      html+=`<div style="margin:14px 0;padding:10px 14px;background:#fff4f2;border-left:3px solid var(--coral);border-radius:0 8px 8px 0"><div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--coral);margin-bottom:4px">⬡ Plot Point 1</div><div style="font-size:14px;line-height:1.7;color:var(--ink);white-space:pre-wrap">${escHtml(pp.pp1)}</div></div>`;
    }
    if(ai===1&&pp.pp2&&pp.pp2.trim()){
      html+=`<div style="margin:14px 0;padding:10px 14px;background:#fff4f2;border-left:3px solid var(--coral);border-radius:0 8px 8px 0"><div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--coral);margin-bottom:4px">⬡ Plot Point 2</div><div style="font-size:14px;line-height:1.7;color:var(--ink);white-space:pre-wrap">${escHtml(pp.pp2)}</div></div>`;
    }
  });

  const content=document.createElement('div');
  content.innerHTML=html;
  wrap.appendChild(content);
  board.appendChild(wrap);
}

function escHtml(s){
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── SCENE — quaderno di scrittura libera con promozione alla board ──
export function renderScenes(p){
  const wrap = document.getElementById('scenes-wrap');
  if(!wrap) return;
  if(!p.story) p.story={};
  if(!p.story.scenes) p.story.scenes=[];
  wrap.innerHTML='';

  p.story.scenes.forEach((sc, i)=>{
    const card = document.createElement('div');
    card.className = 'scene-write-card';

    // Header: titolo editabile + azioni
    const head = document.createElement('div');
    head.className = 'scene-write-head';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'scene-write-title';
    titleInput.value = sc.title || '';
    titleInput.placeholder = `Scena ${i+1}`;
    titleInput.addEventListener('input', function(){
      const p=getProject(currentId); if(!p||!p.story||!p.story.scenes) return;
      p.story.scenes[i].title = this.value;
      scheduleSave(p);
    });

    const actions = document.createElement('div');
    actions.className = 'scene-write-actions';

    // Pulsante promozione alla board
    const promoteBtn = document.createElement('button');
    promoteBtn.className = 'scene-promote-btn';
    promoteBtn.innerHTML = sc.promoted ? '✓ in struttura' : '→ struttura';
    promoteBtn.title = sc.promoted ? 'Premi per togliere dalla struttura' : 'Aggiungi questa scena alla struttura a 3 atti';
    if(sc.promoted) promoteBtn.classList.add('promoted');
    promoteBtn.onclick = ()=> promoteSceneToBoard(i);

    const delBtn = document.createElement('button');
    delBtn.className = 'scene-write-del';
    delBtn.textContent = '×';
    delBtn.onclick = ()=> deleteSceneText(i);

    actions.appendChild(promoteBtn);
    actions.appendChild(delBtn);
    head.appendChild(titleInput);
    head.appendChild(actions);

    // Corpo: scrittura libera
    const body = document.createElement('textarea');
    body.className = 'scene-write-body';
    body.value = sc.text || '';
    body.placeholder = 'Scrivi la scena — prosa, dialoghi, regia, dettagli…';
    body.addEventListener('input', function(){
      const p=getProject(currentId); if(!p||!p.story||!p.story.scenes) return;
      p.story.scenes[i].text = this.value;
      this.style.height='auto';
      this.style.height=this.scrollHeight+'px';
      scheduleSave(p);
    });
    requestAnimationFrame(()=>{ body.style.height='auto'; body.style.height=body.scrollHeight+'px'; });

    card.appendChild(head);
    card.appendChild(body);
    wrap.appendChild(card);
  });
}

export function addSceneText(){
  const p=getProject(currentId); if(!p) return;
  if(!p.story) p.story={};
  if(!p.story.scenes) p.story.scenes=[];
  p.story.scenes.push({ title:'', text:'', promoted:false });
  scheduleSave(p);
  renderScenes(p);
  // focus sull'ultima
  const bodies = document.querySelectorAll('.scene-write-body');
  if(bodies.length) bodies[bodies.length-1].focus();
}

export function deleteSceneText(i){
  const p=getProject(currentId); if(!p||!p.story||!p.story.scenes) return;
  p.story.scenes.splice(i,1);
  scheduleSave(p);
  renderScenes(p);
}

function promoteSceneToBoard(i){
  const p=getProject(currentId); if(!p||!p.story||!p.story.scenes) return;
  const sc = p.story.scenes[i];
  if(!p.story.acts) p.story.acts={setup:[],confrontation:[],resolution:[]};

  if(sc.promoted){
    // ── DE-PROMUOVI — rimuove la scena dalla board ──
    const promotedLabel = sc.promotedLabel;
    let removed = false;
    if(promotedLabel){
      ['setup','confrontation','resolution'].forEach(act=>{
        const idx = (p.story.acts[act]||[]).indexOf(promotedLabel);
        if(idx !== -1){ p.story.acts[act].splice(idx, 1); removed = true; }
      });
    }
    // Fallback: se il testo nella board è stato modificato, cerca per titolo iniziale
    if(!removed){
      const title = (sc.title && sc.title.trim()) ? sc.title.trim() : `Scena ${i+1}`;
      ['setup','confrontation','resolution'].forEach(act=>{
        const arr = p.story.acts[act]||[];
        const idx = arr.findIndex(s => typeof s==='string' && (s===title || s.startsWith(title+'\n')));
        if(idx !== -1){ arr.splice(idx, 1); removed = true; }
      });
    }
    p.story.scenes[i].promoted = false;
    delete p.story.scenes[i].promotedLabel;
  } else {
    // ── PROMUOVI — aggiunge titolo + contenuto della scena al primo atto ──
    const title = (sc.title && sc.title.trim()) ? sc.title.trim() : `Scena ${i+1}`;
    const txt = (sc.text && sc.text.trim()) ? sc.text.trim() : '';
    const label = txt ? `${title}\n${txt}` : title;
    p.story.acts.setup.push(label);
    p.story.scenes[i].promoted = true;
    p.story.scenes[i].promotedLabel = label; // memorizza l'intera stringa per poterla rimuovere
  }

  scheduleSave(p);
  renderScenes(p);
  renderActBoard(p);

  // Se ho appena promosso, apro lo step "Struttura a 3 atti" così la scena è subito visibile
  if(p.story.scenes[i] && p.story.scenes[i].promoted){
    const wrap = document.getElementById('struttura-wrap');
    if(wrap && wrap.style.display === 'none'){
      wrap.style.display = 'block';
      // aggiorno la freccetta dello step se presente
      const step = document.getElementById('step-struttura');
      if(step){ const chev = step.querySelector('.support-chev'); if(chev) chev.textContent = '▴'; }
    }
  }
}

/* ===== ESTRAZIONE DALLO SCRIPTMENT (a senso unico, merge non distruttivo) ===== */
function _openSupportFor(which){
  const sb=document.getElementById('support-body');
  const tog=document.querySelector('.support-toggle');
  if(sb){ sb.style.display='block'; if(tog) tog.classList.add('open'); }
  const wrap=document.getElementById(which==='chars'?'chars-wrap':'struttura-wrap');
  if(wrap) wrap.style.display='block';
}
function _flashBtn(btn,n){
  if(!btn) return;
  if(!btn.dataset.orig) btn.dataset.orig=btn.textContent;
  btn.textContent = n>0 ? ('✓ '+n+(n===1?' aggiunto':' aggiunti')) : 'già aggiornato';
  btn.classList.add('extract-done');
  clearTimeout(btn._t);
  btn._t=setTimeout(()=>{ btn.textContent=btn.dataset.orig; btn.classList.remove('extract-done'); },1700);
}

export function extractCharsFromScript(btn){
  const p=getProject(currentId); if(!p) return;
  const sm=getScriptment(p);
  const items=parseScreenplay((sm&&sm.text)||'');
  if(!p.story)p.story={};
  if(!p.story.characters)p.story.characters=[];
  const existing=new Set(p.story.characters.map(c=>(c.name||'').trim().toUpperCase()).filter(Boolean));
  const seen=new Set();
  let added=0;
  for(const it of items){
    if(it.type!=='character') continue;
    const name=(it.text||'').trim();
    if(!name) continue;
    const key=name.toUpperCase();
    if(seen.has(key)) continue;
    seen.add(key);
    if(!existing.has(key)){
      p.story.characters.push({name, desc:''});
      existing.add(key);
      added++;
    }
  }
  if(added){ scheduleSave(p); renderCharacters(p); }
  _openSupportFor('chars');
  _flashBtn(btn,added);
  return added;
}

export function extractScenesFromScript(btn){
  const p=getProject(currentId); if(!p) return;
  const sm=getScriptment(p);
  const items=parseScreenplay((sm&&sm.text)||'');
  if(!p.story)p.story={};
  if(!p.story.acts)p.story.acts={setup:[],confrontation:[],resolution:[]};
  const existing=new Set();
  ['setup','confrontation','resolution'].forEach(a=>(p.story.acts[a]||[]).forEach(s=>existing.add((s||'').trim().toUpperCase())));

  // scorri in ordine: i marcatori d'atto impostano l'atto corrente
  const order=['setup','confrontation','resolution'];
  let markerCount=0, curAct=null, anyMarker=false;
  const sceneList=[]; // {head, act|null}
  for(const it of items){
    if(it.type==='act'){
      anyMarker=true;
      curAct = it.act || order[Math.min(markerCount,2)];
      markerCount++;
      continue;
    }
    if(it.type==='scene'){
      const head=(it.text||'').trim();
      if(head) sceneList.push({head, act:curAct});
    }
  }

  const newScenes=sceneList.filter(s=>!existing.has(s.head.toUpperCase()));
  if(!newScenes.length){ _openSupportFor('struttura'); _flashBtn(btn,0); return 0; }

  if(anyMarker){
    newScenes.forEach(s=>{
      const act=s.act || 'setup';
      p.story.acts[act].push(s.head);
      existing.add(s.head.toUpperCase());
    });
  } else {
    const n=newScenes.length;
    newScenes.forEach((s,i)=>{
      let act;
      if(n<=2){ act='setup'; }
      else {
        const frac=(i+0.5)/n;
        act = frac<0.25 ? 'setup' : (frac<0.75 ? 'confrontation' : 'resolution');
      }
      p.story.acts[act].push(s.head);
      existing.add(s.head.toUpperCase());
    });
  }
  scheduleSave(p); renderActBoard(p);
  _openSupportFor('struttura');
  _flashBtn(btn,newScenes.length);
  return newScenes.length;
}
