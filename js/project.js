import { getProject, currentId, setCurrentId, setDeleteId, deleteId , haptic } from './state.js';
import { db, COL, scheduleSave, deleteDoc, doc } from './firebase.js';
import { hexToRgb } from './canvas.js';
import { updateProgress } from './progress.js';
import { renderDeadline, renderVelocity, renderVelocityHistory, renderPhaseCalendar } from './velocity.js';
import { renderTavole, renderSfide, renderTodos } from './pipeline.js';
import { restoreStoryFields, autoResizeAll } from './story.js';
import { refreshScriptmentButton } from './scriptment.js';
import { restorePlanner } from './planner.js';

export function openProject(id){
  setCurrentId(id);
  const p = getProject(id);
  if(!p) return;
  // Chiude TUTTE le schermate eventualmente aperte (non solo la home), altrimenti
  // aprendo un progetto da Stats o dalla modalità sera quella resta attiva sotto.
  document.querySelectorAll('.screen.active').forEach(el=>el.classList.remove('active'));
  document.getElementById('screen-project').classList.add('active');
  if(window.__navSync) window.__navSync('project', id);
  document.title = (p.title||'Progetto') + ' — Inkflow';
  restoreProject(p);
  if(window.applySupportState) window.applySupportState();
}

export function restoreProject(p){
  const color = p.color || '#4ab8d8';
  const {r:cr, g:cg, b:cb} = hexToRgb(color);
  // Versione "deep" del colore progetto per la percentuale (leggibile su sabbia)
  const deepR = Math.round(cr*0.62);
  const deepG = Math.round(cg*0.62);
  const deepB = Math.round(cb*0.62);
  const colorDeep = `rgb(${deepR},${deepG},${deepB})`;

  const hdr = document.querySelector('.proj-header');
  if(hdr){
    // Sfondo sabbia fisso (via CSS): passiamo solo il colore progetto come accento
    hdr.style.background = '';
    hdr.style.borderBottomColor = '';
    hdr.style.setProperty('--proj-color', color);
    hdr.style.setProperty('--proj-color-deep', colorDeep);
  }

  const ptEl = document.getElementById('proj-title');
  ptEl.textContent = p.title||'';
  document.getElementById('meta-tav').textContent = p.numTav;
  const mtEl = document.getElementById('microtask');
  mtEl.value = p.microtask||'';
  mtEl.style.height = 'auto';
  mtEl.style.height = mtEl.scrollHeight + 'px';
  const mcBtn = document.getElementById('microtask-confirm-btn');
  if(mcBtn) mcBtn.style.opacity = (p.microtask&&p.microtask.trim()) ? '1' : '.4';
  document.getElementById('notes').value = p.notes||'';
  document.getElementById('date-start').value = p.dateStart||'';
  document.getElementById('date-end').value = p.dateEnd||'';
  document.querySelectorAll('.step-item, .step-collapse').forEach(el => {
    const chk = el.querySelector('.step-chk');
    const nm = el.querySelector('.step-nm');
    if(!chk || !nm) return; // salta i blocchi di supporto (Taccuino, Scene) che non hanno spunta
    const key = nm.textContent.trim().slice(0,30);
    const done = !!(p.steps && p.steps[key]);
    chk.classList.toggle('done', done);
    nm.classList.toggle('done', done);
  });
  renderTavole(p); renderSfide(p); renderTodos(p); updateProgress(p); renderDeadline(p); renderVelocity(p); restoreStoryFields(p); restorePlanner(p);
  refreshScriptmentButton();
  requestAnimationFrame(() => { renderVelocityHistory(p); renderPhaseCalendar(p); autoResizeAll(); });
}

export function goHome(){
  document.getElementById('screen-project').classList.remove('active');
  document.getElementById('screen-home').classList.add('active');
  document.title = 'Inkflow';
}

export function confirmDeleteCurrent(){
  const p = getProject(currentId); if(!p) return;
  setDeleteId(currentId);
  document.getElementById('confirm-text').textContent = `Eliminare "${p.title}"? L'operazione non è reversibile.`;
  document.getElementById('confirm-modal').classList.add('open');
}

export function closeConfirm(){
  document.getElementById('confirm-modal').classList.remove('open');
  setDeleteId(null);
}

export function confirmMicrotask(){
  haptic('done');
  const p = getProject(currentId); if(!p) return;
  const val = document.getElementById('microtask').value.trim();
  if(!val) return;
  p.microtask = val;
  scheduleSave(p);
  const btn = document.getElementById('microtask-confirm-btn');
  if(btn){
    btn.style.background = 'var(--gold)';
    btn.style.color = '#2a2420';
    btn.style.opacity = '1';
    btn.textContent = '✓';
    setTimeout(()=>{ btn.style.background = '#fdf6e4'; btn.style.color = '#a8925c'; }, 1200);
  }
}

document.getElementById('confirm-ok').onclick = async () => {
  if(!deleteId) return;
  const wasCurrentProject = deleteId === currentId;
  try{
    await deleteDoc(doc(db, COL, deleteId));
  } catch(e){ console.error(e); }
  closeConfirm();
  if(wasCurrentProject){ if(window.goHome) window.goHome(); else goHome(); }
};
document.getElementById('confirm-modal').addEventListener('click', e => { if(e.target===e.currentTarget) closeConfirm(); });
document.getElementById('microtask').addEventListener('input', e => {
  const p=getProject(currentId); if(!p)return;
  p.microtask=e.target.value;
  scheduleSave(p);
  const btn=document.getElementById('microtask-confirm-btn');
  if(btn) btn.style.opacity = e.target.value.trim() ? '1' : '.4';
});
document.getElementById('notes').addEventListener('input', e => { const p=getProject(currentId); if(!p)return; p.notes=e.target.value; scheduleSave(p); });

// (La rinomina del progetto vive nel menu ⋮ della card in home — js/home.js renameProject)
