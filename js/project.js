import { getProject, currentId, setCurrentId, setDeleteId, deleteId } from './state.js';
import { db, COL, scheduleSave, deleteDoc, doc } from './firebase.js';
import { hexToRgb } from './canvas.js';
import { updateProgress } from './progress.js';
import { renderDeadline, renderVelocity, renderVelocityHistory, renderPhaseCalendar } from './velocity.js';
import { renderTavole, renderSfide } from './pipeline.js';
import { restoreStoryFields, autoResizeAll } from './story.js';
import { refreshScriptmentButton } from './scriptment.js';
import { restorePlanner } from './planner.js';

export function openProject(id){
  setCurrentId(id);
  const p = getProject(id);
  if(!p) return;
  document.getElementById('screen-home').classList.remove('active');
  document.getElementById('screen-project').classList.add('active');
  if(window.__navSync) window.__navSync('project', id);
  restoreProject(p);
}

export function restoreProject(p){
  const color = p.color || '#4ab8d8';
  const {r:cr, g:cg, b:cb} = hexToRgb(color);
  const pasteR = Math.round(cr*0.15 + 255*0.85);
  const pasteG = Math.round(cg*0.15 + 255*0.85);
  const pasteB = Math.round(cb*0.15 + 255*0.85);
  const pastello = `rgb(${pasteR},${pasteG},${pasteB})`;

  const hdr = document.querySelector('.proj-header');
  if(hdr){
    hdr.style.background = pastello;
    hdr.style.borderBottomColor = color;
  }

  const ptEl = document.getElementById('proj-title');
  ptEl.value = p.title||'';
  // auto-dimensiona l'input: con la spaziatura larga del titolo serve un margine
  ptEl.size = Math.max(4, (p.title||'Titolo progetto').length);
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
  renderTavole(p); renderSfide(p); updateProgress(p); renderDeadline(p); renderVelocity(p); restoreStoryFields(p); restorePlanner(p);
  refreshScriptmentButton();
  requestAnimationFrame(() => { renderVelocityHistory(p); renderPhaseCalendar(p); autoResizeAll(); });
}

export function goHome(){
  document.getElementById('screen-project').classList.remove('active');
  document.getElementById('screen-home').classList.add('active');
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
  const p = getProject(currentId); if(!p) return;
  const val = document.getElementById('microtask').value.trim();
  if(!val) return;
  p.microtask = val;
  scheduleSave(p);
  const btn = document.getElementById('microtask-confirm-btn');
  if(btn){
    btn.style.background = '#48a848';
    btn.style.opacity = '1';
    btn.textContent = '✓';
    setTimeout(()=>{ btn.style.background = 'var(--coral)'; }, 1200);
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

document.getElementById('proj-title').addEventListener('input', e => { const p=getProject(currentId); if(!p)return; p.title=e.target.value; e.target.size=Math.max(4,(e.target.value||'Titolo progetto').length); scheduleSave(p); });
document.getElementById('microtask').addEventListener('input', e => {
  const p=getProject(currentId); if(!p)return;
  p.microtask=e.target.value;
  scheduleSave(p);
  const btn=document.getElementById('microtask-confirm-btn');
  if(btn) btn.style.opacity = e.target.value.trim() ? '1' : '.4';
});
document.getElementById('notes').addEventListener('input', e => { const p=getProject(currentId); if(!p)return; p.notes=e.target.value; scheduleSave(p); });
