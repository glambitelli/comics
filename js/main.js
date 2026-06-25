import { db, COL, syncDot, loadUserData, collection, onSnapshot, cacheProjects, getCachedProjects } from './firebase.js';
import { projects, setProjects, currentId, getProject } from './state.js';
import { saveDates } from './velocity.js';
import { exportPDF, exportStoryboard, exportScreenplay } from './pdf.js';
import { togglePhase, toggleStep, selectTav, addSfida } from './pipeline.js';
import { addScene, updateScene, deleteScene, autoResize, saveStoryField, updateCharCount, toggleSubsection, addCharacter, deleteCharacter, toggleCharCard, autoResizeAll, toggleScreenplay, addSceneText, deleteSceneText } from './story.js';
import { updatePlanner, applyPlanner, openPlannerModal, closePlannerModal } from './planner.js';
import { initNotifications, saveReminderSettings, testNotification } from './notifications.js';
import { openSettings, closeSettings, resetStarsConfirm, closeStarsConfirm, doResetStars, exportBackup, importBackup, resetStreakConfirm, closeStreakConfirm, doResetStreak } from './settings.js';
import { renderHome, openNewModal, closeModal, createProject, openCardMenu, exportProjectJSON, confirmDeleteProject, openColorPicker, closeColorPicker, selectProjectColor, toggleSearch, filterProjects, attachCardDrag, applyProjectOrder, startSandstorm, getScriptment } from './home.js';
import { openProject, restoreProject, goHome, confirmDeleteCurrent, closeConfirm, confirmMicrotask } from './project.js';
import { openScriptment, closeScriptment, onScriptmentInput, setScriptmentFont, stepScriptmentSize, formatScriptment, openScriptmentRead, toggleScriptmentRead, refreshScriptmentButton, closeFormatPreview, applyFormatPreview } from './scriptment.js';
window.openScriptment=openScriptment; window.closeScriptment=closeScriptment;
window.setScriptmentFont=setScriptmentFont; window.stepScriptmentSize=stepScriptmentSize;
window.formatScriptment=formatScriptment; window.openScriptmentRead=openScriptmentRead;
window.toggleScriptmentRead=toggleScriptmentRead;
window.closeFormatPreview=closeFormatPreview; window.applyFormatPreview=applyFormatPreview;

// Aggancia l'autosave dell'editor scriptment (contenteditable)
(function(){
  function wire(){
    const ta = document.getElementById('scriptment-text');
    if(ta && !ta.dataset.wired){
      ta.dataset.wired = '1';
      ta.addEventListener('input', (e)=>{ if(window.onScriptmentInput) window.onScriptmentInput(e); });
      ta.addEventListener('paste', (e)=>{
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
      });
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
window.onScriptmentInput = onScriptmentInput;
import { renderStats, getTodayTip } from './stats.js';

// ── Rilevamento mobile: barra-duna solo quando l'input PRINCIPALE è il tocco.
// '(pointer: coarse)' è true sui telefoni (input primario = dito), false su
// desktop e laptop touchscreen (input primario = mouse/trackpad). Più affidabile
// di any-pointer, che includeva i telefoni con stylus tra i "desktop".
(function(){
  const coarsePrimary = ()=> window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const compute = ()=> (coarsePrimary() || (touch && window.innerWidth <= 560)) && (window.innerWidth <= 820);
  document.body.classList.toggle('is-touch', compute());
  let _t;
  window.addEventListener('resize', ()=>{
    clearTimeout(_t);
    _t = setTimeout(()=>{ document.body.classList.toggle('is-touch', compute()); }, 200);
  });
})();

// ── Navigazione centralizzata: chiude tutte le schermate prima di aprirne una ──
function hideAllScreens(){
  ['screen-home','screen-project','screen-stats','screen-evening','screen-read'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.classList.remove('active');
  });
  // Chiude anche settings se aperto
  const so = document.getElementById('settings-overlay');
  const sp = document.getElementById('settings-panel');
  if(so) so.classList.remove('open');
  if(sp) sp.classList.remove('open');
  // Esce dalla modalità sera (barra torna chiara) se si naviga altrove
  document.body.classList.remove('evening-mode');
}

function openStats(){
  hideAllScreens();
  renderStats();
  document.getElementById('screen-stats').classList.add('active');
}
function closeStats(){
  document.getElementById('screen-stats').classList.remove('active');
  document.getElementById('screen-home').classList.add('active');
  if(window._resumeSand) window._resumeSand();
}
// Toggle settings (punto 2: ripremi e si chiude)
function toggleSettings(){
  const overlay = document.getElementById('settings-overlay');
  if(overlay && overlay.classList.contains('open')){
    closeSettings();
  } else {
    openSettings();
  }
}
// Cerca: torna alla home e apre la ricerca (punto 4)
function duneSearch(){
  hideAllScreens();
  document.getElementById('screen-home').classList.add('active');
  if(window._resumeSand) window._resumeSand();
  renderHome(); attachCardDrag();
  setTimeout(()=>{ if(window.toggleSearch) window.toggleSearch(); }, 80);
}
// Toggle giorno/sera dal pulsante luna della barra-duna
function toggleEvening(){
  if(document.body.classList.contains('evening-mode')){
    if(window.exitEveningMode) window.exitEveningMode();
  } else {
    hideAllScreens();
    if(window.enterEveningMode) window.enterEveningMode();
  }
}
window.openStats=openStats;
window.closeStats=closeStats;
window.toggleSettings=toggleSettings;
window.duneSearch=duneSearch;
window.toggleEvening=toggleEvening;

// ── Barra-duna: nascondi scrollando giù, mostra scrollando su ──
(function(){
  if(!document.body.classList.contains('is-touch')) return;
  function wireScrollHide(){
    const nav = document.getElementById('dune-nav');
    if(!nav) return;
    const containers = document.querySelectorAll('.home-scroll,.proj-scroll,.evening-scroll,.stats-scroll,.read-scroll');
    containers.forEach(el=>{
      if(el.dataset.duneWired) return;
      el.dataset.duneWired = '1';
      let lastY = 0;
      el.addEventListener('scroll', ()=>{
        const y = el.scrollTop;
        // vicino al fondo o in cima: mostra sempre
        if(y < 40 || (el.scrollHeight - y - el.clientHeight) < 60){
          nav.classList.remove('dune-hidden');
          lastY = y; return;
        }
        if(y > lastY + 8){ nav.classList.add('dune-hidden'); lastY = y; }      // giù
        else if(y < lastY - 8){ nav.classList.remove('dune-hidden'); lastY = y; } // su
      }, {passive:true});
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireScrollHide);
  else wireScrollHide();
  // ri-agganciare dopo un attimo (alcuni contenitori si popolano dopo)
  setTimeout(wireScrollHide, 1500);
})();

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
  hideAllScreens();
  document.getElementById('screen-home').classList.add('active');
  renderHome(); attachCardDrag();
  if(window._resumeSand) window._resumeSand();
};
// Click sul logo "Inkflow": torna sempre alla home giorno (esce dalla notte se attiva)
window.goHomeFromLogo=()=>{
  if(document.body.classList.contains('evening-mode') && window.exitEveningMode){
    window.exitEveningMode();
  }
  window.goHome();
}; window.openProject=openProject; window.togglePhase=togglePhase;
window.toggleStep=toggleStep; window.selectTav=selectTav; window.addSfida=addSfida;
window.saveDates=saveDates; window.confirmDeleteCurrent=confirmDeleteCurrent; window.closeConfirm=closeConfirm;
window.exportPDF=exportPDF; window.exportStoryboard=exportStoryboard; window.exportScreenplay=exportScreenplay;
// Export principale: il PDF classico del progetto
window.exportMain=()=>{ exportPDF(); };
window.addScene=addScene; window.updateScene=updateScene;
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
