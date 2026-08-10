import { getProject, currentId, haptic, showUndoToast } from './state.js';
import { scheduleSave } from './firebase.js';
import { updateProgress } from './progress.js';
import { renderVelocity, renderVelocityHistory, recordTavola, removeTavola } from './velocity.js';
import { promptModal, confirmModal } from './dialogs.js';

export function togglePhase(id){
  const body=document.getElementById(id+'-body');
  const chev=document.getElementById(id+'-chev');
  const open=body.classList.contains('open');
  body.classList.toggle('open',!open); chev.classList.toggle('open',!open);
}

export function toggleStep(el){
  const p=getProject(currentId); if(!p) return;
  const chk=el.querySelector('.step-chk');
  const nm=el.querySelector('.step-nm');
  const isDone=chk.classList.contains('done');
  chk.classList.toggle('done',!isDone); nm.classList.toggle('done',!isDone);
  haptic(!isDone?'done':'tap');
  const key=nm.textContent.trim().slice(0,30);
  if(!p.steps) p.steps={};
  p.steps[key]=!isDone;
  scheduleSave(p); updateProgress(p);
}

const TAV_LABELS=['Matite','Inchiostro','Retini','Balloon','Finita'];

// ── SELEZIONE MULTIPLA DELLE TAVOLE ─────────────────────────────────────────
// Una serata di lavoro non tocca mai una tavola sola: si inchiostrano le 3-8,
// non "la 3". Con la sola selezione singola servivano due tocchi per tavola
// (aprire il dettaglio, scegliere la fase) — dodici per registrare sei tavole.
// Tenendo premuto si entra in selezione multipla: si toccano le altre e la
// fase si applica a tutte in un colpo.
// Insieme vuoto = modalità normale, quindi non serve un flag a parte.
let _multiSel = new Set();

// Richiamata all'apertura di un progetto: la selezione è stato di lavoro del
// momento, non del progetto — trascinarsela dietro cambiando progetto farebbe
// applicare una fase a tavole che non si stanno guardando.
export function resetTavSelection(){ _multiSel.clear(); }

export function renderTavole(p){
  const grid=document.getElementById('tav-grid'); grid.innerHTML='';
  const multi=_multiSel.size>0;
  for(let i=1;i<=p.numTav;i++){
    const stage=p.tavole&&p.tavole[i]!=null?p.tavole[i]:0;
    const sel=multi?_multiSel.has(i):p.selectedTav===i;
    const btn=document.createElement('div');
    btn.className='tav-btn'+(sel?' sel':'')+(multi&&sel?' multi':'')+(stage>=4?' done-t':'');
    btn.dataset.n=i;
    // filo d'oro alla base: cresce con lo stadio (20% per stadio, pieno a Finita)
    const w = stage>=4 ? 100 : stage*20;
    const dot = stage>=4 ? '<span class="tav-dot">.</span>' : '';
    btn.innerHTML=`<div class="tav-n">${i}${dot}</div><div class="tav-s">${TAV_LABELS[stage]}</div><div class="tav-fill" style="width:${w}%"></div>`;
    wireTavButton(btn, i);
    grid.appendChild(btn);
  }
  renderTavDetail(p);
  updateTavHint();
}

// Tocco lungo = entra in selezione multipla. 450ms è la soglia consueta su
// mobile: sotto si confonde con un tocco normale, sopra sembra che l'app non
// risponda. Il dito che si sposta annulla — stavi scorrendo la pagina, non
// selezionando.
const LONGPRESS_MS=450, LONGPRESS_SLOP=10;
let _lpTimer=null, _lpX=0, _lpY=0, _lpFired=false;

function wireTavButton(btn, n){
  const clear=()=>{ if(_lpTimer){ clearTimeout(_lpTimer); _lpTimer=null; } };
  btn.addEventListener('pointerdown', e=>{
    if(e.button!=null && e.button!==0) return;   // solo tasto sinistro/dito
    _lpX=e.clientX; _lpY=e.clientY; _lpFired=false;
    clear();
    _lpTimer=setTimeout(()=>{ _lpTimer=null; _lpFired=true; startMultiSel(n); }, LONGPRESS_MS);
  });
  btn.addEventListener('pointermove', e=>{
    if(!_lpTimer) return;
    if(Math.abs(e.clientX-_lpX)>LONGPRESS_SLOP || Math.abs(e.clientY-_lpY)>LONGPRESS_SLOP) clear();
  });
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>btn.addEventListener(ev, clear));
  btn.addEventListener('click', e=>{
    // Il tocco lungo ha già selezionato: il click che arriva al rilascio del
    // dito non deve anche togliere subito la tavola dalla selezione.
    if(_lpFired){ _lpFired=false; e.preventDefault(); e.stopPropagation(); return; }
    selectTav(n);
  });
}

function startMultiSel(n){
  const p=getProject(currentId); if(!p) return;
  if(_multiSel.size) return;   // già in selezione multipla: non ripartire da capo
  p.selectedTav=null;          // la selezione singola lascia il posto
  _multiSel.add(n);
  haptic('done');
  paintTavSelection(p);
}

export function selectTav(n){
  const p=getProject(currentId); if(!p) return;
  if(_multiSel.size){
    if(_multiSel.has(n)) _multiSel.delete(n); else _multiSel.add(n);
    haptic('tap');
    paintTavSelection(p);
    return;
  }
  p.selectedTav=p.selectedTav===n?null:n;
  paintTavSelection(p);
}

// Cambiare selezione non cambia il CONTENUTO delle tavole, solo quali sono
// evidenziate: si aggiornano le classi al volo invece di ricostruire tutta la
// griglia. Con la selezione multipla la differenza si sente — sei tocchi di
// fila volevano dire sei ricostruzioni complete.
function paintTavSelection(p){
  const grid=document.getElementById('tav-grid'); if(!grid) return;
  const multi=_multiSel.size>0;
  grid.querySelectorAll('.tav-btn').forEach(btn=>{
    const n=+btn.dataset.n;
    const sel=multi?_multiSel.has(n):p.selectedTav===n;
    btn.classList.toggle('sel', sel);
    btn.classList.toggle('multi', multi&&sel);
  });
  renderTavDetail(p);
  updateTavHint();
}

function updateTavHint(){
  const hint=document.getElementById('tav-hint'); if(!hint) return;
  hint.textContent=_multiSel.size
    ? 'Tocca le altre tavole da aggiornare, poi scegli la fase'
    : 'Tocca una tavola per aggiornare la fase · tieni premuto per sceglierne più di una';
}

export function renderTavDetail(p){
  const det=document.getElementById('tav-detail');
  const multi=_multiSel.size>0;
  if(!multi && !p.selectedTav){ det.classList.remove('open'); return; }
  det.classList.add('open');
  const targets=multi ? [..._multiSel].sort((a,b)=>a-b) : [p.selectedTav];
  document.getElementById('tav-detail-title').textContent =
    multi ? `${targets.length} ${targets.length===1?'tavola selezionata':'tavole selezionate'}`
          : 'Tavola '+p.selectedTav;

  // "Tutte"/"Annulla": scorciatoie per i due casi limite — ho finito l'intero
  // volume, oppure ho toccato la tavola sbagliata e voglio uscire.
  const acts=document.getElementById('tav-detail-actions');
  if(acts){
    acts.hidden=!multi;
    const all=document.getElementById('tav-sel-all');
    const none=document.getElementById('tav-sel-none');
    if(all) all.onclick=()=>{ for(let i=1;i<=p.numTav;i++) _multiSel.add(i); haptic('tap'); paintTavSelection(p); };
    if(none) none.onclick=()=>{ _multiSel.clear(); haptic('tap'); paintTavSelection(p); };
  }

  const pills=document.getElementById('tav-pills'); pills.innerHTML='';
  const stages=targets.map(t=>(p.tavole&&p.tavole[t]!=null)?p.tavole[t]:0);
  // Con più tavole a stadi diversi nessuna pastiglia è "quella corrente":
  // segnarne una sarebbe una bugia su tutte le altre.
  const uniform=stages.every(s=>s===stages[0]) ? stages[0] : null;
  TAV_LABELS.forEach((lbl,i)=>{
    const pill=document.createElement('div');
    pill.className='tav-pill'+(uniform!=null&&i===uniform?' sel-p':'')+(uniform!=null&&i<uniform?' done-p':'');
    pill.textContent=lbl;
    pill.onclick=()=>{
      if(!p.tavole) p.tavole={};
      targets.forEach(t=>{
        const prevStage=p.tavole[t]||0;
        if(prevStage===i) return;
        p.tavole[t]=i;
        if(i>=4 && prevStage<4) recordTavola(p, t);
        if(i<4 && prevStage>=4) removeTavola(p, t);
      });
      haptic(i>=4?'done':'tap');
      // Applicata la fase il gruppo si scioglie: il gesto è "aggiorno queste",
      // non "tengo aperto un gruppo su cui continuare a lavorare".
      if(multi){ _multiSel.clear(); p.selectedTav=null; }
      scheduleSave(p); renderTavole(p); updateProgress(p); renderVelocity(p); renderVelocityHistory(p);
    };
    pills.appendChild(pill);
  });
}

// ── NUMERO DI TAVOLE, MODIFICABILE ──────────────────────────────────────────
// Era deciso alla creazione del progetto e non si toccava più, ma le pagine di
// un fumetto cambiano quasi sempre in corsa: si aggiunge una tavola per far
// respirare una scena, o se ne tolgono due in fase di montaggio.
export async function editNumTav(){
  const p=getProject(currentId); if(!p) return;
  const raw=await promptModal('Quante tavole ha il progetto?', String(p.numTav||10), '1–999');
  if(raw==null) return;
  const digits=String(raw).replace(/\D/g,'');
  if(!digits) return;                                   // niente di numerico: si lascia com'è
  const n=Math.min(999, Math.max(1, parseInt(digits,10)));
  if(n===p.numTav) return;

  // Riducendo, le tavole oltre il nuovo totale sparirebbero dalla griglia ma
  // resterebbero nei dati: continuerebbero a contare fra le "finite" nelle
  // statistiche e a rientrare nel registro della velocità. Si tolgono davvero,
  // chiedendo prima se portavano lavoro con sé.
  const orfane=Object.keys(p.tavole||{}).map(Number).filter(t=>t>n);
  const conLavoro=orfane.filter(t=>(p.tavole[t]||0)>0);
  if(conLavoro.length){
    const ok=await confirmModal(
      `${conLavoro.length===1?'Una tavola ha':`${conLavoro.length} tavole hanno`} un avanzamento segnato oltre la ${n}: verrà perso. L'operazione non è reversibile.`,
      { title:`Ridurre a ${n} tavole?`, confirmLabel:'Riduci' });
    if(!ok) return;
  }
  orfane.forEach(t=>{ delete p.tavole[t]; removeTavola(p, t); });
  if(p.selectedTav>n) p.selectedTav=null;
  [..._multiSel].forEach(t=>{ if(t>n) _multiSel.delete(t); });

  p.numTav=n;
  scheduleSave(p);
  const metaEl=document.getElementById('meta-tav');
  if(metaEl) metaEl.textContent=n;
  haptic('done');
  renderTavole(p); updateProgress(p); renderVelocity(p); renderVelocityHistory(p);
  if(window.updatePlanner) window.updatePlanner();
}

export function renderSfide(p){
  const list=document.getElementById('sfide-list'); list.innerHTML='';
  list.style.cssText='display:flex;flex-direction:column;gap:2px';
  (p.sfide||[]).forEach((s,i)=>{
    const item=document.createElement('div'); item.className='sfida-item';

    const bullet=document.createElement('span'); bullet.className='sfida-bullet'; bullet.textContent='•';

    const input=document.createElement('input');
    input.type='text';
    input.value=s.text;
    input.className='sfida-text-input';
    input.placeholder='Nuova sfida…';
    input.addEventListener('input',function(){
      const p=getProject(currentId);if(!p||!p.sfide)return;
      p.sfide[i].text=this.value;
      scheduleSave(p);
    });
    input.addEventListener('keydown',function(e){
      if(e.key==='Enter'){ e.preventDefault(); addSfida(); }
    });

    const rm=document.createElement('button');
    rm.className='sfida-rm';
    rm.textContent='×';
    rm.onclick=()=>{
      const p=getProject(currentId);if(!p||!p.sfide)return;
      const removed=p.sfide[i];
      p.sfide.splice(i,1);
      scheduleSave(p);renderSfide(p);
      showUndoToast('Sfida eliminata', ()=>{
        const p2=getProject(currentId); if(!p2) return;
        if(!p2.sfide) p2.sfide=[];
        p2.sfide.splice(Math.min(i,p2.sfide.length),0,removed);
        scheduleSave(p2); renderSfide(p2);
      });
    };

    item.appendChild(bullet);
    item.appendChild(input);
    item.appendChild(rm);
    list.appendChild(item);
  });
}

/* ===== TO DO ===== */
export function renderTodos(p){
  const list=document.getElementById('todo-list'); if(!list) return;
  list.innerHTML='';
  const todos=p.todos||[];
  if(!todos.length){
    const empty=document.createElement('div'); empty.className='todo-empty';
    empty.textContent='Nessuna attività. Aggiungine una qui sotto.';
    list.appendChild(empty);
    return;
  }
  todos.forEach((t,i)=>{
    const item=document.createElement('div'); item.className='todo-item'+(t.done?' done':'');

    const chk=document.createElement('button'); chk.className='todo-chk'; chk.textContent='✓';
    chk.onclick=()=>toggleTodo(i);

    const txt=document.createElement('span'); txt.className='todo-text'; txt.textContent=t.text;

    const rm=document.createElement('button'); rm.className='todo-rm'; rm.textContent='×';
    rm.onclick=()=>{
      const p=getProject(currentId);if(!p||!p.todos)return;
      p.todos.splice(i,1); scheduleSave(p); renderTodos(p);
    };

    item.appendChild(chk); item.appendChild(txt); item.appendChild(rm);
    list.appendChild(item);
  });
}

export function addTodo(){
  const p=getProject(currentId); if(!p) return;
  const input=document.getElementById('todo-input'); if(!input) return;
  const text=input.value.trim(); if(!text) return;
  if(!p.todos) p.todos=[];
  p.todos.push({text, done:false});
  input.value='';
  scheduleSave(p); renderTodos(p);
}

export function toggleTodo(i){
  haptic('tap');
  const p=getProject(currentId); if(!p||!p.todos||!p.todos[i]) return;
  p.todos[i].done=!p.todos[i].done;
  scheduleSave(p); renderTodos(p);
}

export function clearCompletedTodos(){
  const p=getProject(currentId); if(!p||!p.todos) return;
  const removed=p.todos.map((t,idx)=>({t,idx})).filter(x=>x.t.done);
  if(!removed.length) return;
  p.todos=p.todos.filter(t=>!t.done);
  scheduleSave(p); renderTodos(p);
  showUndoToast(removed.length===1?'1 attività eliminata':removed.length+' attività eliminate', ()=>{
    const p2=getProject(currentId); if(!p2) return;
    if(!p2.todos) p2.todos=[];
    removed.forEach(x=>p2.todos.splice(Math.min(x.idx,p2.todos.length),0,x.t));
    scheduleSave(p2); renderTodos(p2);
  });
}

export function addSfida(){
  const p=getProject(currentId); if(!p) return;
  if(!p.sfide) p.sfide=[];
  p.sfide.push({text:''});
  scheduleSave(p);
  renderSfide(p);
  const inputs=document.querySelectorAll('.sfida-text-input');
  if(inputs.length) inputs[inputs.length-1].focus();
}

export function toggleSupport(el){
  const body=document.getElementById('support-body');
  if(!body) return;
  const open = body.style.display==='none' || !body.style.display;
  body.style.display = open ? 'block' : 'none';
  el.classList.toggle('open', open);
  if(window.persistSupportState) window.persistSupportState();
  try{ const p=getProject(currentId); if(p) localStorage.setItem('inkflow_support_main_'+p.id, open?'1':'0'); }catch(e){}
  if(open){
    body.querySelectorAll('textarea').forEach(ta=>{
      if(ta.offsetParent!==null){ ta.style.height='auto'; ta.style.height=ta.scrollHeight+'px'; }
    });
  }
}
