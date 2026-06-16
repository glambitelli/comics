import { db, COL, syncDot, loadUserData, collection, onSnapshot } from './firebase.js';
import { projects, setProjects, currentId, getProject } from './state.js';
import { saveDates } from './velocity.js';
import { exportPDF, exportStoryboard } from './pdf.js';
import { togglePhase, toggleStep, selectTav, addSfida } from './pipeline.js';
import { addScene, updateScene, deleteScene, autoResize, saveStoryField, updateCharCount, toggleSubsection, addCharacter, deleteCharacter, toggleCharCard, autoResizeAll, toggleScreenplay } from './story.js';
import { updatePlanner, applyPlanner, openPlannerModal, closePlannerModal } from './planner.js';
import { initNotifications, saveReminderSettings, testNotification } from './notifications.js';
import { openSettings, closeSettings, resetStarsConfirm, closeStarsConfirm, doResetStars, exportBackup, importBackup, resetStreakConfirm, closeStreakConfirm, doResetStreak } from './settings.js';
import { renderHome, openNewModal, closeModal, createProject, openCardMenu, exportProjectJSON, confirmDeleteProject, openColorPicker, closeColorPicker, selectProjectColor, toggleSearch, filterProjects, attachCardDrag, applyProjectOrder } from './home.js';
import { openProject, restoreProject, goHome, confirmDeleteCurrent, closeConfirm, confirmMicrotask } from './project.js';
import { renderStats, getTodayTip } from './stats.js';

function openStats(){
  renderStats();
  document.getElementById('screen-home').classList.remove('active');
  document.getElementById('screen-stats').classList.add('active');
}
function closeStats(){
  document.getElementById('screen-stats').classList.remove('active');
  document.getElementById('screen-home').classList.add('active');
}
window.openStats=openStats;
window.closeStats=closeStats;

function hideLoading(){
  const loading = document.getElementById('loading');
  if(loading && !loading.classList.contains('hidden')){
    loading.classList.add('hidden');
    document.getElementById('screen-home').classList.add('active');
    setTimeout(()=>{ if(loading.parentNode) loading.remove(); }, 400);
  }
}

hideLoading();

onSnapshot(collection(db, COL), snapshot => {
  setProjects(snapshot.docs.map(d => ({id: d.id, ...d.data()})));
  applyProjectOrder();
  projects.sort((a,b)=>{
    const order = JSON.parse(localStorage.getItem('inkflow_order')||'[]');
    if(order.length>0) return 0;
    return (a.createdAt||0) > (b.createdAt||0) ? 1 : -1;
  });
  syncDot('ok');
  renderHome();
  attachCardDrag();
  // Citazione del giorno nella home
  const hq=document.getElementById('home-quote');
  if(hq){
    const tip=getTodayTip();
    hq.innerHTML=`<div style="font-size:13px;line-height:1.65;color:var(--ink2);font-style:italic;max-width:520px;margin:0 auto">"${tip.text}"</div><div style="font-size:11px;color:var(--ink3);margin-top:8px;font-weight:700;letter-spacing:.03em">— ${tip.author}</div>`;
  }
  if(currentId){
    const p = getProject(currentId);
    const active = document.activeElement;
    const isTyping = active && (active.tagName==='INPUT'||active.tagName==='TEXTAREA');
    if(p && !isTyping) restoreProject(p);
  }
}, err => {
  console.error('Firebase error:', err);
  syncDot('error');
});

window.openNewModal=openNewModal; window.closeModal=closeModal; window.createProject=createProject;
window.goHome=goHome; window.openProject=openProject; window.togglePhase=togglePhase;
window.toggleStep=toggleStep; window.selectTav=selectTav; window.addSfida=addSfida;
window.saveDates=saveDates; window.confirmDeleteCurrent=confirmDeleteCurrent; window.closeConfirm=closeConfirm;
window.exportPDF=exportPDF; window.exportStoryboard=exportStoryboard; window.addScene=addScene; window.updateScene=updateScene;
window.deleteScene=deleteScene; window.autoResize=autoResize; window.saveStoryField=saveStoryField;
window.updateCharCount=updateCharCount; window.saveReminderSettings=saveReminderSettings;
window.testNotification=testNotification; window.updatePlanner=updatePlanner;
window.applyPlanner=applyPlanner; window.openPlannerModal=openPlannerModal;
window.closePlannerModal=closePlannerModal; window.toggleSubsection=toggleSubsection;
window.addCharacter=addCharacter; window.deleteCharacter=deleteCharacter;
window.toggleCharCard=toggleCharCard; window.toggleScreenplay=toggleScreenplay; window.confirmMicrotask=confirmMicrotask;
window.openSettings=openSettings; window.closeSettings=closeSettings;
window.resetStarsConfirm=resetStarsConfirm; window.closeStarsConfirm=closeStarsConfirm;
window.doResetStars=doResetStars; window.exportBackup=exportBackup; window.importBackup=importBackup;
window.resetStreakConfirm=resetStreakConfirm; window.closeStreakConfirm=closeStreakConfirm; window.doResetStreak=doResetStreak;
window.openCardMenu=openCardMenu; window.exportProjectJSON=exportProjectJSON; window.confirmDeleteProject=confirmDeleteProject;
window.openColorPicker=openColorPicker; window.closeColorPicker=closeColorPicker; window.selectProjectColor=selectProjectColor;
window.toggleSearch=toggleSearch; window.filterProjects=filterProjects; window.autoResizeAll=autoResizeAll;

(function(){
  let startX=0, startY=0;
  const proj = document.getElementById('screen-project');
  proj.addEventListener('touchstart', e=>{
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, {passive:true});
  proj.addEventListener('touchend', e=>{
    const dx = e.changedTouches[0].clientX - startX;
    const dy = Math.abs(e.changedTouches[0].clientY - startY);
    if(dx > 80 && dy < 60){
      const tag = e.target.tagName;
      if(tag==='TEXTAREA'||tag==='INPUT') return;
      goHome();
    }
  }, {passive:true});
})();

loadUserData();
initNotifications();

// ── MENU CONTESTUALE — tasto destro su textarea/input → Copia tutto ──
(function(){
  const menu = document.createElement('div');
  menu.style.cssText='position:fixed;z-index:9999;background:var(--white);border:1.5px solid var(--sand2);border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.15);display:none;overflow:hidden;min-width:130px';

  const btn = document.createElement('button');
  btn.textContent='📋 Copia tutto';
  btn.style.cssText='display:block;width:100%;padding:11px 16px;text-align:left;background:none;border:none;font-family:\'Nunito\',sans-serif;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer';
  btn.onmouseenter=()=>btn.style.background='var(--sand)';
  btn.onmouseleave=()=>btn.style.background='none';
  menu.appendChild(btn);
  document.body.appendChild(menu);

  let target = null;

  document.addEventListener('contextmenu', e=>{
    const el = e.target;
    if(el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT') return;
    if(!el.value) return;
    e.preventDefault();
    target = el;
    menu.style.display='block';
    // Posiziona vicino al cursore, evitando bordi
    const x = Math.min(e.clientX, window.innerWidth - 150);
    const y = Math.min(e.clientY, window.innerHeight - 60);
    menu.style.left=x+'px';
    menu.style.top=y+'px';
  });

  btn.onclick=()=>{
    if(!target) return;
    navigator.clipboard.writeText(target.value).then(()=>{
      btn.textContent='✓ Copiato!';
      setTimeout(()=>{ btn.textContent='📋 Copia tutto'; menu.style.display='none'; }, 1000);
    });
  };

  document.addEventListener('click', ()=>{ menu.style.display='none'; });
  document.addEventListener('scroll', ()=>{ menu.style.display='none'; }, true);
})();
