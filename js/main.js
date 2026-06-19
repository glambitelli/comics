import { db, COL, syncDot, loadUserData, collection, onSnapshot, cacheProjects, getCachedProjects } from './firebase.js';
import { projects, setProjects, currentId, getProject } from './state.js';
import { saveDates } from './velocity.js';
import { exportPDF, exportStoryboard } from './pdf.js';
import { togglePhase, toggleStep, selectTav, addSfida } from './pipeline.js';
import { addScene, updateScene, deleteScene, autoResize, saveStoryField, updateCharCount, toggleSubsection, addCharacter, deleteCharacter, toggleCharCard, autoResizeAll, toggleScreenplay, addSceneText, deleteSceneText } from './story.js';
import { updatePlanner, applyPlanner, openPlannerModal, closePlannerModal } from './planner.js';
import { initNotifications, saveReminderSettings, testNotification } from './notifications.js';
import { openSettings, closeSettings, resetStarsConfirm, closeStarsConfirm, doResetStars, exportBackup, importBackup, resetStreakConfirm, closeStreakConfirm, doResetStreak } from './settings.js';
import { renderHome, openNewModal, closeModal, createProject, openCardMenu, exportProjectJSON, confirmDeleteProject, openColorPicker, closeColorPicker, selectProjectColor, toggleSearch, filterProjects, attachCardDrag, applyProjectOrder, startSandstorm } from './home.js';
import { openProject, restoreProject, goHome, confirmDeleteCurrent, closeConfirm, confirmMicrotask } from './project.js';
import { renderStats, getTodayTip } from './stats.js';

// ── Rilevamento touch: mostra la barra-duna solo su dispositivi touch ──
(function(){
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if(isTouch) document.body.classList.add('is-touch');
})();

function openStats(){
  renderStats();
  document.getElementById('screen-home').classList.remove('active');
  document.getElementById('screen-stats').classList.add('active');
}
function closeStats(){
  document.getElementById('screen-stats').classList.remove('active');
  document.getElementById('screen-home').classList.add('active');
  if(window._resumeSand) window._resumeSand();
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

// ── AVVIO ISTANTANEO — mostra subito i progetti dalla cache locale ──
(function showCachedImmediately(){
  const cached = getCachedProjects();
  if(cached.length > 0){
    setProjects(cached);
    applyProjectOrder();
    renderHome();
    attachCardDrag();
    startSandstorm();
    const hq=document.getElementById('home-quote');
    if(hq){
      const tip=getTodayTip();
      hq.innerHTML=`<div style="font-size:13px;line-height:1.65;color:var(--ink2);font-style:italic">"${tip.text}"</div><div style="font-size:11px;color:var(--ink3);margin-top:8px;font-weight:700;letter-spacing:.03em">— ${tip.author}</div>`;
    }
  }
})();

onSnapshot(collection(db, COL), snapshot => {
  setProjects(snapshot.docs.map(d => ({id: d.id, ...d.data()})));
  cacheProjects(projects);
  applyProjectOrder();
  projects.sort((a,b)=>{
    const order = JSON.parse(localStorage.getItem('inkflow_order')||'[]');
    if(order.length>0) return 0;
    return (a.createdAt||0) > (b.createdAt||0) ? 1 : -1;
  });
  syncDot('ok');
  // Ridisegna la home solo se è effettivamente visibile (evita lavoro sprecato mentre scrivi in un progetto)
  const homeVisible = document.getElementById('screen-home').classList.contains('active');
  if(homeVisible){
    renderHome();
    attachCardDrag();
    startSandstorm();
    const hq=document.getElementById('home-quote');
    if(hq){
      const tip=getTodayTip();
      hq.innerHTML=`<div style="font-size:13px;line-height:1.65;color:var(--ink2);font-style:italic">"${tip.text}"</div><div style="font-size:11px;color:var(--ink3);margin-top:8px;font-weight:700;letter-spacing:.03em">— ${tip.author}</div>`;
    }
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
window.goHome=()=>{
  document.getElementById('screen-project').classList.remove('active');
  document.getElementById('screen-stats').classList.remove('active');
  document.getElementById('screen-evening').classList.remove('active');
  document.getElementById('screen-home').classList.add('active');
  renderHome(); attachCardDrag();
  if(window._resumeSand) window._resumeSand();
}; window.openProject=openProject; window.togglePhase=togglePhase;
window.toggleStep=toggleStep; window.selectTav=selectTav; window.addSfida=addSfida;
window.saveDates=saveDates; window.confirmDeleteCurrent=confirmDeleteCurrent; window.closeConfirm=closeConfirm;
window.exportPDF=exportPDF; window.exportStoryboard=exportStoryboard; window.addScene=addScene; window.updateScene=updateScene;
window.deleteScene=deleteScene; window.autoResize=autoResize; window.saveStoryField=saveStoryField;
window.updateCharCount=updateCharCount; window.saveReminderSettings=saveReminderSettings;
window.testNotification=testNotification; window.updatePlanner=updatePlanner;
window.applyPlanner=applyPlanner; window.openPlannerModal=openPlannerModal;
window.closePlannerModal=closePlannerModal; window.toggleSubsection=toggleSubsection;
window.addCharacter=addCharacter; window.deleteCharacter=deleteCharacter;
window.toggleCharCard=toggleCharCard; window.toggleScreenplay=toggleScreenplay; window.addSceneText=addSceneText; window.deleteSceneText=deleteSceneText; window.confirmMicrotask=confirmMicrotask;
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

// ── PULSANTE COPIA — piccolo tasto sotto i campi di testo lunghi ──
function wireCopyButtons(){
  const areas = document.querySelectorAll('textarea.story-textarea, textarea.char-desc-v2');
  areas.forEach(ta=>{
    if(ta.dataset.copyWired) return;
    ta.dataset.copyWired = '1';
    const host = ta.parentElement;
    if(host && host.style.position !== 'relative'){
      host.style.position = 'relative';
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'field-copy-btn';
    btn.textContent = 'copia';
    btn.title = 'Copia tutto il testo';
    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      if(!ta.value.trim()) return;
      navigator.clipboard.writeText(ta.value).then(()=>{
        btn.textContent = '✓ copiato';
        setTimeout(()=>{ btn.textContent='copia'; }, 1200);
      });
    });
    host.appendChild(btn);
  });
}
window.wireCopyButtons = wireCopyButtons;

// ── Espandi/comprimi blocchi di supporto (Taccuino, Scene) ──
window.toggleSupport = function(headerEl){
  const block = headerEl.closest('.support-block');
  if(!block) return;
  const content = block.querySelector('.support-content');
  const chev = headerEl.querySelector('.support-chev');
  if(!content) return;
  const isOpen = content.style.display !== 'none';
  content.style.display = isOpen ? 'none' : 'block';
  if(chev) chev.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
  // Ricalcola l'altezza delle textarea appena diventano visibili
  if(!isOpen){
    content.querySelectorAll('textarea').forEach(ta=>{
      ta.style.height='auto';
      ta.style.height=ta.scrollHeight+'px';
    });
  }
};

// ── Sezioni con divisore comprimibili (Sfide visive, ecc.) ──
window.toggleSection = function(labelEl){
  const content = labelEl.nextElementSibling;
  if(!content || !content.classList.contains('sec-content')) return;
  const isOpen = content.style.display !== 'none';
  content.style.display = isOpen ? 'none' : 'block';
  labelEl.classList.toggle('open', !isOpen);
};

// ── Step comprimibili (Soggetto, Personaggi, Ambientazione, Struttura) ──
// Spunta: riusa la logica esistente di toggleStep passando la riga
window.toggleStepCheck = function(chkEl){
  const row = chkEl.closest('.step-collapse');
  if(row) toggleStep(row);
};
// Corpo: espande/comprime il contenuto sotto lo step
window.toggleStepBody = function(el){
  const row = el.closest('.step-collapse');
  if(!row) return;
  const body = row.nextElementSibling;
  const chev = row.querySelector('.support-chev');
  if(!body || !body.classList.contains('step-body')) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if(chev) chev.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
  if(!isOpen){
    body.querySelectorAll('textarea').forEach(ta=>{
      ta.style.height='auto';
      ta.style.height=ta.scrollHeight+'px';
    });
  }
};
