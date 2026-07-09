import { getProject, currentId, haptic, showUndoToast } from './state.js';
import { scheduleSave } from './firebase.js';
import { updateProgress } from './progress.js';
import { renderVelocity, renderVelocityHistory, recordTavola, removeTavola } from './velocity.js';

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

export function renderTavole(p){
  const grid=document.getElementById('tav-grid'); grid.innerHTML='';
  for(let i=1;i<=p.numTav;i++){
    const stage=p.tavole&&p.tavole[i]!=null?p.tavole[i]:0;
    const btn=document.createElement('div');
    btn.className='tav-btn'+(p.selectedTav===i?' sel':'')+(stage>=4?' done-t':'');
    // filo d'oro alla base: cresce con lo stadio (20% per stadio, pieno a Finita)
    const w = stage>=4 ? 100 : stage*20;
    const dot = stage>=4 ? '<span class="tav-dot">.</span>' : '';
    btn.innerHTML=`<div class="tav-n">${i}${dot}</div><div class="tav-s">${TAV_LABELS[stage]}</div><div class="tav-fill" style="width:${w}%"></div>`;
    btn.onclick=()=>selectTav(i); grid.appendChild(btn);
  }
  renderTavDetail(p);
}

export function selectTav(n){
  const p=getProject(currentId); if(!p) return;
  p.selectedTav=p.selectedTav===n?null:n;
  renderTavole(p);
}

export function renderTavDetail(p){
  const det=document.getElementById('tav-detail');
  if(!p.selectedTav){det.classList.remove('open');return;}
  det.classList.add('open');
  document.getElementById('tav-detail-title').textContent='Tavola '+p.selectedTav;
  const pills=document.getElementById('tav-pills'); pills.innerHTML='';
  const current=p.tavole&&p.tavole[p.selectedTav]!=null?p.tavole[p.selectedTav]:0;
  TAV_LABELS.forEach((lbl,i)=>{
    const pill=document.createElement('div');
    pill.className='tav-pill'+(i===current?' sel-p':'')+(i<current?' done-p':'');
    pill.textContent=lbl;
    pill.onclick=()=>{
      if(!p.tavole) p.tavole={};
      const prevStage = p.tavole[p.selectedTav] || 0;
      const newStage = i;
      p.tavole[p.selectedTav]=i;
      haptic(newStage>=4?'done':'tap');
      if(newStage >= 4 && prevStage < 4) recordTavola(p, p.selectedTav);
      if(newStage < 4 && prevStage >= 4) removeTavola(p, p.selectedTav);
      scheduleSave(p); renderTavole(p); updateProgress(p); renderVelocity(p); renderVelocityHistory(p);
    };
    pills.appendChild(pill);
  });
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
