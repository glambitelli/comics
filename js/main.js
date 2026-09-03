import { db, COL, syncDot, loadUserData, collection, onSnapshot, cacheProjects, getCachedProjects } from './firebase.js';
import { projects, setProjects, currentId, getProject, haptic , loadJSON } from './state.js';
import { saveDates } from './velocity.js';
import { togglePhase, toggleStep, selectTav, addSfida, addTodo, toggleTodo, clearCompletedTodos, toggleSupport, editNumTav } from './pipeline.js';
import { addScene, updateScene, deleteScene, autoResize, saveStoryField, updateCharCount, toggleSubsection, addCharacter, deleteCharacter, toggleCharCard, autoResizeAll, toggleScreenplay, addSceneText, deleteSceneText, extractAllFromScript } from './story.js';
import { updatePlanner, applyPlanner, openPlannerModal, closePlannerModal } from './planner.js';
import { initNotifications, saveReminderSettings, testNotification } from './notifications.js';
import { closeActionMenu } from './dialogs.js';
// Il quadernetto dei guasti si apre per primo: un errore che succede mentre
// l'app si monta e' proprio quello che nessuno riesce mai a raccontare.
import { ascoltaErrori } from './registro.js';
ascoltaErrori();
import { openSettings, closeSettings, closeSettingsUI, azzeraTempoConferma, apriAiuto, resetStarsConfirm, closeStarsConfirm, doResetStars, exportBackup, importBackup, resetStreakConfirm, closeStreakConfirm, doResetStreak, onSoundToggle, onSoundPackChange, accountTocca, driveTocca, copiaUid, copiaRegistro, svuotaRegistroUI } from './settings.js';
window.onSoundToggle=onSoundToggle; window.onSoundPackChange=onSoundPackChange;
import { renderHome, openNewModal, closeModal, createProject, openCardMenu, exportProjectJSON, confirmDeleteProject, openColorPicker, closeColorPicker, selectProjectColor, filterProjects, attachCardDrag, applyProjectOrder, startSandstorm, getScriptment } from './home.js';
import { openProject, restoreProject, goHome, confirmDeleteCurrent, closeConfirm, confirmMicrotask } from './project.js';
import { enterEveningMode as enterEveningImpl, exitEveningMode as exitEveningImpl } from './evening.js';
// ── CARICAMENTO PIGRO DEI MODULI PESANTI ──────────────────────────────────
// References, lettore CBR, Drive, statistiche, export PDF e scriptment pesano
// insieme ~200 KB e all'avvio venivano parsati e valutati tutti, anche solo per
// guardare la Home. Misurato su CPU rallentata 4× (telefono di fascia media):
// 162 ms di parse+eval contro 69 ms caricando solo il necessario.
//
// Il vincolo e' che l'HTML richiama queste funzioni con onclick inline
// (window.qualcosa()), quindi non possono sparire da window. La soluzione e'
// esporre stub con la stessa firma: al primo clic importano il modulo e poi
// inoltrano la chiamata. Nessun handler inline cambia, e l'import() successivo
// si risolve dalla cache dei moduli.
const _mods = {};
const loadMod = path => (_mods[path] ||= import(path));
// Modulo gia' caricato? Serve dove NON vogliamo provocarne il caricamento
// (es. il tasto Indietro deve chiudere il lettore solo se e' davvero aperto).
const loadedMod = path => (_mods[path] && _mods[path].__resolved) || null;
function trackResolved(path){
  const p = loadMod(path);
  if(!p.__tracking){ p.__tracking = true; p.then(m => { p.__resolved = m; }); }
  return p;
}
// Espone su window uno stub per ogni nome esportato dal modulo pigro.
function exposeLazy(path, names){
  for(const n of names){
    window[n] = (...args) => trackResolved(path).then(m => m[n](...args));
  }
}

exposeLazy('./refs.js', ['refsBackToFolders','openRefLightbox','closeRefLightbox',
  'nextRefImage','prevRefImage','refsImageMenu','deleteRefImageWithUndo',
  'openFolderBrowser','openAllGrid','openFolder','openTag','openTagList','setArchivio','promptNewFolder','promptTagImage',
  'promptRenameFolder','promptDeleteFolder','setFolderTab','albumShelfMenu',
  'toggleScelta','annullaScelta','rinominaScelto','eliminaScelti','menuScelto',
  'connectDriveAndSync',
  'refsFolderSearch','refsAlbumsSearch','refsGridSortMenu','refsAlbumsSortMenu',
  'promptLinkProjectFromLightbox','toggleProjectRefPanel','apriRitaglio']);
// L'onclick del pulsante nella barra della vista a schermo intero: senza id,
// e' il frammento aperto in quel momento (vedi apriRitaglio in refs.js).
window.rifilaDaLightbox = ()=> window.apriRitaglio();
exposeLazy('./albums.js', ['openAlbumPicker','openAlbumFromFile','openAlbumFromDrive',
  'createAlbumFromDriveFile']);
exposeLazy('./scriptment.js', ['openScriptment','closeScriptment','setScriptmentFont',
  'stepScriptmentSize','formatScriptment','openScriptmentRead','toggleScriptmentRead',
  'closeFormatPreview','applyFormatPreview','onScriptmentInput']);
exposeLazy('./pdf.js', ['exportPDF','exportScreenplay']);

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
import { getTodayTip } from './tips.js';

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
  // Un menu contestuale aperto NON deve sopravvivere a un cambio di schermata.
  // Si chiude da solo al tocco fuori, ma il tasto Indietro del telefono non e'
  // un tocco: premendolo con un menu aperto ci si ritrovava il "Rinomina /
  // Elimina" di una cartella di References appoggiato sopra le schede della
  // home, ancora funzionante e riferito a una cosa non piu' a schermo.
  closeActionMenu();
  ['screen-home','screen-project','screen-stats','screen-evening','screen-refs','screen-idee','screen-scene'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.classList.remove('active');
  });
  // Chiude anche settings se aperto
  const so = document.getElementById('settings-overlay');
  const sp = document.getElementById('settings-panel');
  if(so) so.classList.remove('open');
  if(sp) sp.classList.remove('open');
  // La classe sul body e' quella che NASCONDE LA BARRA IN FONDO (vedi
  // body.settings-open in layout.css): dimenticarla qui significava chiudere il
  // pannello e restare senza navigazione, ed e' esattamente quello che
  // succedeva arrivando qui dal tasto Indietro.
  document.body.classList.remove('settings-open');
  // Esce dalla modalità sera (barra torna chiara) se si naviga altrove
  document.body.classList.remove('evening-mode');
}

// Asincrone perche' il modulo della schermata si carica al primo ingresso.
// Lo schermo viene comunque attivato SUBITO (sincrono): si vede la schermata
// cambiare all'istante e il contenuto compare appena il modulo e' pronto,
// invece di restare fermi sulla schermata precedente aspettando.
async function openStats(){
  hideAllScreens();
  document.getElementById('screen-stats').classList.add('active');
  if(window.__navSync) window.__navSync('stats');
  const m = await trackResolved('./stats.js');
  m.renderStats();
}

// Il taccuino. Il modulo si carica al primo ingresso come stats/refs, ma la
// schermata compare subito: chi tocca "Idee" ha in testa un pensiero da
// scrivere, e mezzo secondo di schermo fermo basta a perderlo.
async function openIdee(){
  hideAllScreens();
  document.getElementById('screen-idee').classList.add('active');
  if(window.__navSync) window.__navSync('idee');
  const m = await trackResolved('./idee.js');
  m.initIdee();
}

// Le Scene. Stessa forma del taccuino: la schermata compare subito e il modulo
// arriva un istante dopo. Qui conta doppio — si entra con una scena in testa, e
// mezzo secondo di schermo fermo basta a perderla.
async function openScene(){
  hideAllScreens();
  document.getElementById('screen-scene').classList.add('active');
  if(window.__navSync) window.__navSync('scene');
  const m = await trackResolved('./scene.js');
  m.initScene();
}

// Preparazione comune della schermata References, condivisa da tutti i punti
// d'ingresso (elenco cartelle, una cartella specifica, "All"): apre lo schermo
// e avvia i listener, ma NON decide su quale vista atterrare — quello lo fa
// il chiamante, cosi' il tasto Indietro puo' far ripartire da una cartella
// precisa invece che sempre dall'elenco.
async function prepRefsScreen(){
  hideAllScreens();
  document.getElementById('screen-refs').classList.add('active');
  const [refs, albums] = await Promise.all([
    trackResolved('./refs.js'), trackResolved('./albums.js'),
  ]);
  refs.initRefsCapture();
  albums.initAlbums();
  refs.startRefsListener();
  return refs;
}
async function openRefsScreen(){
  const refs = await prepRefsScreen();
  if(window.__navSync) window.__navSync('refs');
  refs.openFolderBrowser();
}
// Punti d'ingresso "diretti" per il replay del tasto Indietro (vedi showScreen):
// aprono la schermata References già dentro una cartella o nella vista "All",
// senza passare dall'elenco cartelle.
async function openRefsScreenAtFolder(id){
  const refs = await prepRefsScreen();
  refs.openFolder(id);
}
async function openRefsScreenAtAll(){
  const refs = await prepRefsScreen();
  refs.openAllGrid();
}
// Un tag e' un posto come una cartella, e come una cartella deve poterlo
// riaprire il tasto Indietro: senza questa, tornando su un tag si finiva sulla
// home invece che dove si era.
async function openRefsScreenAtTag(tag){
  const refs = await prepRefsScreen();
  refs.openTag(tag);
}
function closeRefsScreen(){
  document.getElementById('screen-refs').classList.remove('active');
  document.getElementById('screen-home').classList.add('active');
  if(window._resumeSand) window._resumeSand();
}
window.openRefsScreen = openRefsScreen;
window.closeRefsScreen = closeRefsScreen;
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
// Toggle giorno/sera dal pulsante luna della barra-duna
function toggleEvening(){
  if(document.body.classList.contains('evening-mode')){
    if(window.exitEveningMode) window.exitEveningMode();
  } else {
    // hideAllScreens sta DENTRO la tenda insieme all'ingresso: fuori, per un
    // fotogramma non ci sarebbe nessuna schermata attiva e si vedrebbe il
    // fondo nudo del body prima che il buio arrivi.
    transizioneNotte(()=>{ hideAllScreens(); enterEveningImpl(); });
  }
}
window.openStats=openStats;
// Dalle Impostazioni alle Statistiche (le statistiche sono uscite dalla barra
// in fondo). Il pannello si chiude a mano con closeSettingsUI e NON con
// closeSettings: quella passa dalla cronologia (history.back), e il ritorno
// arriva dopo — cioe' a schermata Statistiche gia' aperta, che si porterebbe
// via. Il posto in cronologia del pannello viene RIUSATO dalle statistiche,
// cosi' Indietro da li' torna alla home invece di riaprire un pannello che
// non c'e' piu'.
window.vaiAStatistiche=()=>{
  closeSettingsUI();
  const s = history.state;
  if(s && s.view === 'settings'){
    try{ history.replaceState({ view:'stats', id:null, depth:s.depth }, ''); }catch(e){}
  }
  openStats();   // navPush vede che lo stato e' gia' 'stats' e non ne aggiunge
};
// Dalle Impostazioni al taccuino, con lo stesso identico giro delle
// Statistiche: il posto in cronologia del pannello viene RIUSATO, cosi'
// Indietro da li' torna alla home invece di riaprire un pannello che non c'e'
// piu'. Le Idee sono scese qui quando il loro tondo nella barra e' passato alle
// Scene.
window.vaiAIdee=()=>{
  closeSettingsUI();
  const s = history.state;
  if(s && s.view === 'settings'){
    try{ history.replaceState({ view:'idee', id:null, depth:s.depth }, ''); }catch(e){}
  }
  openIdee();
};
window.closeStats=closeStats;
window.toggleSettings=toggleSettings;

window.toggleEvening=toggleEvening;

// ── Barra-duna: nascondi scrollando giù, mostra scrollando su ──
(function(){
  if(!document.body.classList.contains('is-touch')) return;
  // LA BARRA TORNA SEMPRE QUANDO SI CAMBIA SCHERMATA.
  //
  // Il difetto: entrando in un progetto e scorrendo, la barra si nasconde —
  // giusto. Tornando indietro pero' restava nascosta, perche' a rimetterla non
  // ci pensava nessuno: la home non riceve nessun evento di scorrimento se non
  // la si scorre, quindi la barra spariva e basta.
  //
  // La cura non e' aggiungere una riga ai punti che riportano alla home: le
  // strade sono piu' d'una (il tasto Indietro passa da hideAllScreens, il
  // ritorno da dentro il progetto no) ed e' proprio da quella dimenticanza che
  // il difetto e' nato. Qui invece si guarda direttamente CHE COSA succede —
  // una schermata che si accende o si spegne — cosi' anche una strada che
  // domani non esiste ancora e' gia' coperta.
  (function riappariSuCambioSchermata(){
    const nav = document.getElementById('dune-nav');
    if(!nav || !window.MutationObserver) return;
    const occhio = new MutationObserver(()=> nav.classList.remove('dune-hidden'));
    document.querySelectorAll('.screen').forEach(sc=>
      occhio.observe(sc, { attributes:true, attributeFilter:['class'] }));
  })();

  function wireScrollHide(){
    const nav = document.getElementById('dune-nav');
    if(!nav) return;
    const containers = document.querySelectorAll('.home-scroll,.proj-scroll,.evening-scroll,.stats-scroll');
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
  // Disinnesca il messaggio "non riesco a partire" armato in index.html: se
  // siamo qui l'app è partita, e quel messaggio non deve comparire mai.
  if(window.__avvioRiuscito) window.__avvioRiuscito();
  const loading = document.getElementById('loading');
  if(loading && !loading.classList.contains('hidden')){
    loading.classList.add('hidden');
    document.getElementById('screen-home').classList.add('active');
    setTimeout(()=>{ if(loading.parentNode) loading.remove(); }, 400);
  }
}

hideLoading();

// Se torniamo dalla condivisione Android (share-target.html → index.html?refs=1),
// apri direttamente la schermata Riferimenti invece della home.
(function openRefsIfShared(){
  try{
    const params = new URLSearchParams(location.search);
    if(params.get('refs') === '1'){
      history.replaceState({}, '', location.pathname);
      setTimeout(()=>{ if(window.openRefsScreen) window.openRefsScreen(); }, 60);
    }
  }catch(e){}
})();

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

// ── I DATI PARTONO DOPO L'ACCESSO ──
// Prima questo listener partiva al caricamento del modulo. Con le regole di
// Firestore chiuse sul proprietario, chiedere i progetti PRIMA di sapere chi
// sei significa una raffica di "permission-denied" ad ogni avvio: rumore
// inutile, e per un istante la home si disegna vuota. Adesso si aspetta di
// sapere chi bussa (vedi portaPrincipale in fondo al file).
function avviaListenerProgetti(){
onSnapshot(collection(db, COL), snapshot => {
  setProjects(snapshot.docs.map(d => ({id: d.id, ...d.data()})));
  cacheProjects(projects);
  applyProjectOrder();
  projects.sort((a,b)=>{
    const order = loadJSON('inkflow_order', []);
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
}

window.openNewModal=openNewModal; window.closeModal=closeModal; window.createProject=createProject;

const goHomeImpl=()=>{
  hideAllScreens();
  document.getElementById('screen-home').classList.add('active');
  renderHome(); attachCardDrag();
  if(window._resumeSand) window._resumeSand();
};
window.togglePhase=togglePhase;
window.toggleStep=toggleStep; window.selectTav=selectTav; window.addSfida=addSfida;
window.editNumTav=editNumTav;
window.addTodo=addTodo; window.toggleTodo=toggleTodo; window.clearCompletedTodos=clearCompletedTodos;
window.toggleSupport=toggleSupport;
window.extractAllFromScript=extractAllFromScript;
window.saveDates=saveDates; window.confirmDeleteCurrent=confirmDeleteCurrent; window.closeConfirm=closeConfirm;
// Export principale: il PDF classico del progetto
window.exportMain=()=>window.exportPDF();
window.addScene=addScene; window.updateScene=updateScene;
window.deleteScene=deleteScene; window.autoResize=autoResize; window.saveStoryField=saveStoryField;
window.updateCharCount=updateCharCount; window.saveReminderSettings=saveReminderSettings;
window.testNotification=testNotification; window.updatePlanner=updatePlanner;
window.applyPlanner=applyPlanner; window.openPlannerModal=openPlannerModal;
window.closePlannerModal=closePlannerModal; window.toggleSubsection=toggleSubsection;
window.addCharacter=addCharacter; window.deleteCharacter=deleteCharacter;
window.toggleCharCard=toggleCharCard; window.toggleScreenplay=toggleScreenplay; window.addSceneText=addSceneText; window.deleteSceneText=deleteSceneText; window.confirmMicrotask=confirmMicrotask;
window.openSettings=openSettings; window.closeSettings=closeSettings;
window.azzeraTempoConferma=azzeraTempoConferma;
window.apriAiuto=apriAiuto;
window.resetStarsConfirm=resetStarsConfirm; window.closeStarsConfirm=closeStarsConfirm;
window.doResetStars=doResetStars; window.exportBackup=exportBackup; window.importBackup=importBackup;
window.accountTocca=accountTocca; window.driveTocca=driveTocca; window.copiaUid=copiaUid;
window.copiaRegistro=copiaRegistro; window.svuotaRegistroUI=svuotaRegistroUI;
window.resetStreakConfirm=resetStreakConfirm; window.closeStreakConfirm=closeStreakConfirm; window.doResetStreak=doResetStreak;
window.openCardMenu=openCardMenu; window.exportProjectJSON=exportProjectJSON; window.confirmDeleteProject=confirmDeleteProject;
window.openColorPicker=openColorPicker; window.closeColorPicker=closeColorPicker; window.selectProjectColor=selectProjectColor;
window.filterProjects=filterProjects; window.autoResizeAll=autoResizeAll;

// ─────────────────────────────────────────────────────────
// Navigazione con la cronologia del browser (tasto Indietro)
// Home è lo stato base; progetto / stats / sera stanno "sopra".
// Premendo Indietro nel browser si torna alla home (o alla schermata precedente).
// ─────────────────────────────────────────────────────────
let _navReplaying = false;
function navPush(view, id){
  if(_navReplaying) return;
  const s = history.state;
  if(s && s.view === view && (s.id||null) === (id||null)) return; // già qui
  // depth conta quanti pushState separano questo stato dalla Home: References
  // può essere annidata (refs → refs-folder), quindi "quanti passi indietro
  // servono per tornare alla Home" non è sempre 1. Il tasto/logo Home lo
  // legge per saltarci in un colpo solo, invece di un history.back() che
  // uscirebbe solo di un livello (vedi goHomeAlways sotto).
  const depth = (s && typeof s.depth === 'number' ? s.depth : 0) + 1;
  try{ history.pushState({ view, id: id||null, depth }, ''); }catch(e){}
}
// Esposta globalmente: le funzioni di apertura (anche chiamate come binding
// importato, es. dal click sulle card) registrano da sole lo stato.
window.__navSync = navPush;
// Mostra una schermata SENZA registrare un nuovo stato (guidato dal tasto Indietro)
// ASINCRONA: le schermate References/Stats caricano il modulo al primo
// ingresso. _navReplaying deve restare alzato per TUTTA la durata, altrimenti
// l'apertura (che chiama __navSync da sola) registrerebbe un nuovo stato
// mentre stiamo solo ripercorrendo la cronologia — e il tasto Indietro
// smetterebbe di tornare indietro.
async function showScreen(view, id){
  _navReplaying = true;
  try{
    if(view === 'project' && id && getProject(id)){ openProject(id); }
    else if(view === 'stats'){ await openStats(); }
    else if(view === 'idee'){ await openIdee(); }
    else if(view === 'scene'){ await openScene(); }
    else if(view === 'refs'){ await openRefsScreen(); }
    else if(view === 'refs-folder' && id){ await openRefsScreenAtFolder(id); }
    else if(view === 'refs-all'){ await openRefsScreenAtAll(); }
    else if(view === 'refs-tag' && id){ await openRefsScreenAtTag(id); }
    else if(view === 'refs-tags'){ const r = await prepRefsScreen(); r.openTagList(); }
    else if(view === 'evening'){ enterEveningImpl(); }   // la tenda la mette chi ha premuto
    else { // home (o stato sconosciuto)
      if(document.body.classList.contains('evening-mode')) exitEveningImpl();
      goHomeImpl();
    }
  }catch(e){ goHomeImpl(); }
  finally{ _navReplaying = false; }
}
window.addEventListener('popstate', e=>{
  // Le impostazioni stanno sopra a tutto: se il pannello e' aperto, Indietro
  // chiude quello. settings.js e' importato staticamente qui sopra, quindi non
  // serve la danza del modulo caricato pigramente.
  const sp = document.getElementById('settings-panel');
  if(sp && sp.classList.contains('open')){ closeSettingsUI(); return; }
  // Il foglio per rifilare un frammento sta sopra tutto il resto dell'archivio:
  // se e' aperto, Indietro chiude quello. Non serve loadedMod — il foglio puo'
  // essere aperto solo se il suo modulo e' gia' stato caricato, e caricandosi
  // lascia qui la sua funzione di chiusura.
  const rf = document.getElementById('rifila');
  if(rf && !rf.hidden && window.chiudiRifila){ window.chiudiRifila(); return; }
  // Se c'è un albo aperto a schermo intero, il tasto Indietro chiude il lettore
  // e riporta alle References, invece di uscire dall'app.
  // loadedMod e non loadMod: se il lettore e' aperto il modulo e' per forza
  // gia' caricato, e cosi' il tasto Indietro non provoca mai un import.
  const ar = document.getElementById('album-reader');
  if(ar && ar.classList.contains('open')){
    const m = loadedMod('./albums.js');
    if(m){ m.closeReaderUI(); return; }
  }
  // QUESTA CATENA E' ORDINATA PER STRATI, dal piu' alto al piu' basso, e non e'
  // un dettaglio: si chiude sempre e solo quello che sta davanti agli occhi.
  // La galleria a schermo intero (9500) puo' aprirsi anche da DENTRO la scelta
  // di un riferimento nelle Scene (225): con la scelta controllata per prima, un
  // Indietro con la galleria aperta risaliva un livello nella scelta — sotto —
  // lasciando la galleria a schermo.
  const lb = document.getElementById('refs-lightbox');
  if(lb && lb.classList.contains('open') && window.chiudiGalleriaUI){
    window.chiudiGalleriaUI(); return;
  }
  // Il foglio su cui si disegna sta sopra tutto il resto delle Scene: Indietro
  // chiude quello per primo — e chiudendolo SALVA, quindi si aspetta.
  // window e non loadedMod: schizzo.js lo carica scene.js per conto suo, e nel
  // registro di questo file non c'e' mai stato (vedi la nota in schizzo.js).
  const sz = document.getElementById('schizzo');
  if(sz && sz.classList.contains('open') && window.chiudiSchizzoUI){
    window.chiudiSchizzoUI(); return;
  }
  // La scelta di un riferimento per un beat sta sopra la scena e sotto il foglio
  // da disegno, che si apre proprio da li'.
  const sr = document.getElementById('sceltarif');
  if(sr && sr.classList.contains('open')){
    const m = loadedMod('./scene.js');
    // Il foglio ha tre livelli — i riferimenti del beat, l'archivio, una
    // cartella — e Indietro ne risale uno per volta. risaliScelta dice se c'era
    // qualcosa da risalire: quando non c'e' piu' niente, il passo chiude.
    if(m && m.risaliScelta()) return;
    if(m){ m.chiudiSceltaUI(); return; }
  }
  // E poi la scena aperta: Indietro la chiude salvando, e riporta all'elenco
  // invece di uscire dalla schermata.
  const sc = document.getElementById('scena');
  if(sc && sc.classList.contains('open')){
    const m = loadedMod('./scene.js');
    if(m){ m.chiudiScenaUI(); return; }
  }
  // Un'idea aperta a tutto schermo: Indietro la chiude (salvando) e riporta
  // all'elenco, invece di uscire dalla schermata.
  const ie = document.getElementById('idea-editor');
  if(ie && ie.classList.contains('open')){
    const m = loadedMod('./idee.js');
    if(m){ m.chiudiEditor(); return; }
  }
  const st = e.state || { view:'home' };
  showScreen(st.view, st.id);
});
try{ if(!history.state) history.replaceState({ view:'home', depth:0 }, ''); }catch(e){}

// Le impl registrano da sole lo stato (vedi window.__navSync), quindi qui basta
// esporle. Funziona qualunque sia il chiamante (window o binding importato).
window.openProject = openProject;
window.openStats = openStats;
window.openIdee = openIdee;
window.openScene = openScene;
window.enterEveningMode = entraInSera;
// Azioni "indietro" — passano dalla cronologia, così il back del browser resta coerente.
// Stats e sera si aprono sempre direttamente sopra la Home (un solo livello),
// quindi un passo indietro basta.
// ── IL PASSAGGIO GIORNO ↔ SERA ──
// Lo scambio vero e proprio avviene mentre la tenda e' opaca, quindi non si
// vede: si vede solo la luce che cala e risale (vedi .velo-notte in
// layout.css, dove stanno anche le due durate e il perche' sono diverse).
//
// Il doppio requestAnimationFrame prima di scoprire non e' scaramanzia: la
// schermata nuova viene attivata mentre e' nascosta, e se si togliesse la
// tenda nello stesso fotogramma il browser potrebbe non averla ancora
// disegnata — si scoprirebbe per un istante quella vecchia, cioe' proprio il
// lampo che si sta togliendo di mezzo.
const VELO_MS = 200;
let _veloInCorso = false;
// Dichiarata cosi' e non con const: viene assegnata a window piu' sopra nel
// file (window.enterEveningMode), e una const non esiste ancora a quel punto.
function entraInSera(){ transizioneNotte(enterEveningImpl); }
function transizioneNotte(azione){
  const velo = document.getElementById('velo-notte');
  const ridotto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Senza tenda, o a doppio tocco sulla luna, si fa la cosa semplice: meglio
  // una transizione saltata che due tende sovrapposte.
  if(!velo || ridotto || _veloInCorso){ azione(); return; }
  _veloInCorso = true;
  velo.classList.add('acceso');
  setTimeout(()=>{
    azione();
    requestAnimationFrame(()=> requestAnimationFrame(()=>{
      velo.classList.remove('acceso');
      _veloInCorso = false;
    }));
  }, VELO_MS);
}

const _backOrHome = ()=>{
  const inSera = document.body.classList.contains('evening-mode');
  const passo = ()=>{
    if(history.state && history.state.view && history.state.view !== 'home') history.back();
    else { if(document.body.classList.contains('evening-mode')) exitEveningImpl(); goHomeImpl(); }
  };
  // La tenda serve solo quando si sta davvero uscendo dalla sera: chiudendo le
  // statistiche (stesso pulsante, stessa funzione) non c'e' nessun colore da
  // invertire, e un buio di mezzo secondo li' sarebbe gratuito.
  if(inSera) transizioneNotte(passo); else passo();
};
window.closeStats = _backOrHome;
window.exitEveningMode = _backOrHome;

// Il logo/scritta "Inkflow" in ogni schermata e il pulsante Home della barra-duna
// significano sempre "portami alla Home", non "torna indietro di un passo".
// References però può essere annidata (refs → refs-folder di un artista): un
// solo history.back() da lì atterrava sull'elenco cartelle invece che a casa.
// depth (scritto da navPush sopra) dice quanti passi separano lo stato
// corrente dalla Home: history.go(-depth) ci salta in un colpo solo, con un
// unico evento popstate finale invece di N passaggi intermedi.
const goHomeAlways = ()=>{
  const depth = (history.state && typeof history.state.depth === 'number') ? history.state.depth : 0;
  if(depth > 0){ history.go(-depth); }
  else { if(document.body.classList.contains('evening-mode')) exitEveningImpl(); goHomeImpl(); }
};
window.goHome = goHomeAlways;
window.goHomeFromLogo = goHomeAlways;

// DAL FOGLIO DI UNA SCENA ALLA HOME, in un tocco. Il foglio non e' una
// schermata: e' un velo sopra le Scene, e goHomeAlways da solo se ne andrebbe a
// casa lasciandolo aperto a mezz'aria. Quindi prima lo si chiude passando dalla
// cronologia — che e' la strada di tutte le chiusure dell'app, e salva — e solo
// a foglio chiuso si parte. Si aspetta il popstate invece di contare i
// millisecondi: e' l'unico momento in cui si sa che la chiusura e' avvenuta.
// ── IL CRONOMETRO ──
// Il modulo si carica al primo tocco, come tutto il resto — ma se una sessione
// era rimasta accesa alla chiusura dell'app va ripresa SUBITO, se no il tempo
// continua a scorrere e nessuno lo vede. Si guarda in tasca senza caricare
// niente: basta sapere se c'e' qualcosa da riprendere.
function tempoDaRiprendere(){
  try{
    // Anche una sessione rimasta in coda basta a caricare il modulo: e' tempo
    // gia' fatto che il server non ha ancora preso, e va riprovato prima
    // possibile — non alla prossima volta che si apre il cronometro.
    return !!localStorage.getItem('inkflow_tempo_acceso')
        || !!localStorage.getItem('inkflow_tempo_coda');
  }catch(e){ return false; }
}
let _tempoMod = null;
async function tempo(){
  if(!_tempoMod) _tempoMod = await import('./tempo.js');
  return _tempoMod;
}
// Ridisegna il comando sulla home e la capsula. Un posto solo: sono la stessa
// informazione detta in due punti, e due funzioni che la scrivono si
// disallineano al primo cambiamento.
function disegnaTempo(){
  const m = _tempoMod;
  const avvia = document.getElementById('tempo-avvia');
  const testo = document.getElementById('tempo-avvia-testo');
  const caps = document.getElementById('tempo-capsula');
  if(!avvia || !caps) return;
  const corre = !!(m && m.acceso());
  avvia.classList.toggle('corre', corre);
  if(testo) testo.textContent = corre
    ? (m.inPausa() ? 'In pausa — riprendi' : 'Sto disegnando')
    : 'Comincio a disegnare';
  caps.hidden = !corre;
  caps.classList.toggle('ferma', !!(m && m.inPausa()));
  const corsa = document.getElementById('tempo-corsa');
  if(corsa && m) corsa.textContent = m.scriviCorsa(m.secondiCorrenti());
}
window.tempoTocca = async ()=>{
  const m = await tempo();
  m.alSecondo(disegnaTempo);
  if(!m.acceso()) m.avvia();
  else if(m.inPausa()) m.riprendi();
  else m.pausa();
  disegnaTempo();
};
window.tempoPausa = async ()=>{
  const m = await tempo();
  if(m.inPausa()) m.riprendi(); else m.pausa();
  disegnaTempo();
};
// PREMERE STOP DEVE SEMPRE DIRE QUALCOSA. Prima parlava solo sopra il minuto:
// sotto, il cronometro spariva e sulla home non cambiava niente — e la lettura
// giusta, dal divano, era che il timer non funzionasse. Adesso una sessione
// registrata dice quanto vale, e una scartata dice che e' stata scartata.
// BUTTARE VIA CHIEDE PRIMA. Fermare per sbaglio non costa niente — il tempo
// finisce comunque in archivio — ma buttare via si': quei minuti non tornano.
window.tempoScarta = async ()=>{
  const m = await tempo();
  if(!m.acceso()) return;
  const quanto = m.scriviBreve(m.secondiCorrenti());
  const { confirmModal } = await import('./dialogs.js');
  const si = await confirmModal(
    'Butto via ' + quanto + '? Non finiscono in archivio e non si recuperano.',
    { title: 'Buttare via la sessione', confirmLabel: 'Butta via' });
  if(!si) return;
  m.scarta();
  disegnaTempo();
  const s = document.getElementById('tempo-avvia-testo');
  if(s){ s.textContent = 'Buttata via'; setTimeout(disegnaTempo, 2500); }
};
window.tempoFerma = async ()=>{
  const m = await tempo();
  const secondi = await m.ferma();
  disegnaTempo();
  const s = document.getElementById('tempo-avvia-testo');
  if(!s) return;
  s.textContent = secondi
    ? m.scriviBreve(secondi) + ' — segnati'
    : 'Neanche un secondo — niente da segnare';
  setTimeout(disegnaTempo, 3000);
};
// Una sessione lasciata accesa riprende da sola all'avvio dell'app.
if(tempoDaRiprendere()){
  tempo().then(m=>{ m.alSecondo(disegnaTempo); m.riprendiSessione(); disegnaTempo(); });
}

window.dallaScenaAllaHome = ()=>{
  const foglio = document.getElementById('scena');
  if(foglio && foglio.classList.contains('open') && history.state && history.state.view === 'scena'){
    addEventListener('popstate', ()=> goHomeAlways(), { once:true });
    history.back();
    return;
  }
  goHomeAlways();
};

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
      window.goHome();
    }
  }, {passive:true});
})();

initNotifications();

// LA VERSIONE CHE STA GIRANDO DAVVERO, e dove si vede.
//
// A chiederla e' la pagina, ma a rispondere e' il SERVICE WORKER: e' lui che
// serve i file, quindi e' l'unico che sa quale copia si sta guardando. Serve a
// una cosa sola, e concreta: quando qualcosa "non e' cambiato" si guarda li' e
// si sa subito se e' arrivato l'aggiornamento o se il telefono sta ancora
// servendo la copia vecchia — invece di ricaricare a caso.
//
// STAVA IN FONDO ALLA HOME, accanto al marchio, e li' era solo un codice
// buttato addosso a chi voleva disegnare: "inkflow-static-v295" non e' una cosa
// da leggere tutti i giorni. Adesso il marchio tiene il suo v1.0.0 e la
// versione vera sta in Impostazioni, sotto Diagnostica — dove ci si va apposta,
// perche' e' una domanda che ci si fa apposta. Resta anche su body.dataset,
// cosi' il backup continua a portarsela dietro senza doverla leggere a schermo.
function mostraVersione(){
  const scrivi = v=>{
    document.body.dataset.vers = v;
    const el = document.getElementById('versione-viva');
    if(el) el.textContent = v;
  };
  if(!('serviceWorker' in navigator)) return;
  // reg.active e non navigator.serviceWorker.controller: al primissimo avvio
  // (o subito dopo un aggiornamento) il service worker e' gia' attivo ma non
  // ha ancora "preso in carico" questa pagina, e il controller e' nullo. Chi
  // risponde e' comunque lui.
  navigator.serviceWorker.ready.then(reg=>{
    const sw = reg.active || navigator.serviceWorker.controller;
    if(!sw) return;
    const canale = new MessageChannel();
    canale.port1.onmessage = e=>{ if(e.data) scrivi(e.data); };
    sw.postMessage({ type:'VERSIONE' }, [canale.port2]);
  }).catch(()=>{});
}
mostraVersione();

// ── "QUESTI DATI NON BUTTARLI VIA" ──
// Tutto quello che l'app tiene sul telefono — la copia offline di Firestore in
// IndexedDB, gli albi scaricati da Drive (centinaia di MB), i file dell'app
// nella cache del service worker — sta in una memoria che il browser considera
// SACRIFICABILE: quando lo spazio scarseggia, Android puo' cancellarla senza
// chiedere niente a nessuno. Si perde l'accesso offline, l'ultimo albo letto
// va riscaricato, e a chi usa l'app sembra semplicemente che l'app si sia
// dimenticata delle cose.
//
// persist() chiede di passare alla memoria "persistente", che non viene
// buttata via da sola. Su Chrome per Android non compare nessuna richiesta:
// viene concesso in silenzio alle app installate o usate spesso, e negato
// altrimenti — quindi si chiede una volta all'avvio e non si insiste. La
// promessa non viene mai rifiutata in modo rumoroso: se il browser non
// supporta l'API, non succede niente.
// ── LA PORTA D'INGRESSO ──
//
// L'archivio e' di una persona sola, e le regole di Firestore lo sanno: senza
// accesso, dal database non arriva niente. Quindi prima si sa chi bussa, poi
// partono i dati — non il contrario.
//
// COSA SUCCEDE SE L'ACCESSO NON SI PUO' NEMMENO CHIEDERE. Il modulo che parla
// con Google vive su un CDN: la primissima volta serve la rete. Se non c'e' —
// aereo, metropolitana, Google irraggiungibile — NON si mette una parete
// davanti all'app: si entra lo stesso e si lavora sulla copia locale. Le
// scritture falliranno finche' non si rientra, ma un'app che non si apre e'
// peggio di un'app che per ora non salva.
let _authApp = null;
// Aprire la porta due volte non deve voler dire ascoltare Firestore due volte:
// dal giorno in cui la porta si apre anche da sola (vedi piu' sotto) puo'
// succedere che ci si arrivi sia dalla promessa del login sia dal cambio di
// stato, a distanza di un istante.
let _portaGiaAperta = false;
function portaAperta(){
  const porta = document.getElementById('accesso');
  if(porta) porta.hidden = true;
  if(_portaGiaAperta) return;
  _portaGiaAperta = true;
  avviaListenerProgetti();
  loadUserData();
}
function mostraPorta(errore){
  const porta = document.getElementById('accesso');
  if(porta) porta.hidden = false;
  // Il pulsante si spegne quando si preme (vedi entraInInkflow): se si torna
  // qui, va riacceso — se no resta un pulsante che non si lascia premere e
  // l'unica via d'uscita e' ricaricare l'app.
  const btn = document.getElementById('accesso-btn');
  if(btn) btn.disabled = false;
  const err = document.getElementById('accesso-errore');
  if(err){
    err.hidden = !errore;
    if(errore) err.textContent = errore;
  }
}
window.entraInInkflow = function(){
  const btn = document.getElementById('accesso-btn');
  if(!_authApp) return;
  if(btn) btn.disabled = true;
  // Niente await prima della chiamata: la finestra di Google deve partire
  // dentro il tocco, se no il browser la blocca (stessa storia di Drive).
  _authApp.entraConGoogle()
    .then(()=> portaAperta())
    .catch(async e=>{
      if(btn) btn.disabled = false;
      if(e && /popup-closed|cancelled-popup/.test(e.code||'')) return;
      const m = await import('./settings.js');
      mostraPorta(m.__perLeProve_spiega(e));
    });
};
(async function portaPrincipale(){
  try{
    _authApp = await import('./auth.js');
  }catch(e){
    console.warn('accesso non disponibile, si entra con la copia locale', e);
    portaAperta();
    return;
  }
  const utente = await _authApp.attendiAccesso();
  if(utente) portaAperta(); else mostraPorta('');
  // LA PORTA SI APRE ANCHE DA SOLA, e questo era il difetto: qui si guardava
  // solo l'uscita — "se non c'e' piu' nessuno, richiudi" — mentre l'ingresso
  // dipendeva unicamente dalla promessa di signInWithPopup.
  //
  // Sul telefono quella promessa si perde spesso: la finestra di Google e' una
  // finestra a parte, e mentre e' aperta il sistema puo' congelare o ricaricare
  // la pagina sotto (in un browser dentro un'altra app succede quasi sempre).
  // L'accesso RIESCE — Firebase se lo scrive e lo sa — ma la risposta non
  // trova piu' nessuno ad aspettarla: si restava davanti a "Entra con Google"
  // per sempre, e ripremere non serviva a niente, perche' Google rispondeva
  // subito "sei gia' dentro" e quella risposta si perdeva allo stesso modo.
  //
  // Adesso a decidere e' lo STATO — c'e' un utente o no — che e' l'unica cosa
  // che sopravvive a una pagina ricaricata. E' la stessa correzione fatta per
  // il collegamento a Drive (vedi ascoltaRientroDrive in drive.js).
  _authApp.alCambioAccesso(u=>{ if(u) portaAperta(); else mostraPorta(''); });
})();

// IL RITORNO DA GOOGLE VA ASPETTATO DALL'APP, NON DA UNA SCHERMATA.
//
// Premendo "Collega Drive" si va sulla pagina di Google e si torna indietro —
// e sul telefono, tornando, spesso la pagina di Inkflow e' stata ricaricata da
// capo: la risposta di Google non trova piu' nessuno ad aspettarla e il
// collegamento resta a meta' (il token c'e', l'app non l'ha mai visto). Fin
// qui a raccogliere quel filo era References, l'unico posto da cui si poteva
// collegare Drive. Da quando lo si collega anche dalle impostazioni non
// bastava piu': chi non aveva aperto l'archivio in quella sessione tornava e
// leggeva "Non collegato" per sempre. Adesso il recupero e' acceso all'avvio,
// e vale da qualunque parte sia partito il tocco (vedi ascoltaRientroDrive).
(window.requestIdleCallback || (fn => setTimeout(fn, 1200)))(() => {
  import('./drive.js').then(d => d.ascoltaRientroDrive()).catch(()=>{});
});

if(navigator.storage && navigator.storage.persist){
  navigator.storage.persisted().then(gia=>{
    if(!gia) return navigator.storage.persist();
  }).catch(()=>{});
}

// Precarica stats.js in un momento di inattività: è un modulo pigro (si
// scarica al primo tap su "Stats"), ma è anche tra i più usati. Ogni fetch
// dei moduli passa dal service worker in modalità "network-first" (i deploy
// devono avere effetto subito), quindi la PRIMA apertura richiede sempre un
// giro di rete vero — su una connessione debole può sentirsi come un'attesa,
// a differenza del calcolo di renderStats() stesso (misurato: sempre sotto i
// 50ms anche con dati enormi, non è mai quello il collo di bottiglia).
// Prendendolo qui, mentre il thread è libero e non c'è fretta, il modulo è
// già pronto quando l'utente tocca davvero "Stats".
(window.requestIdleCallback || (fn => setTimeout(fn, 2000)))(() => trackResolved('./stats.js'));

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
  haptic('tap');
  const row = chkEl.closest('.step-collapse');
  if(row) toggleStep(row);
};
// ── MEMORIA SEZIONI SUPPORTO — per progetto, sopravvive tra le visite ──
function _supportKey(){ return 'inkflow_support_open:' + (currentId||''); }
function _supportRows(){ return Array.from(document.querySelectorAll('#support-body .step-collapse')); }
function persistSupportState(){
  if(!currentId) return;
  const mainOpen = (()=>{ const b=document.getElementById('support-body'); return !!(b && b.style.display!=='none' && b.style.display!==''); })();
  const rows = _supportRows().map((row,idx)=>{
    const body=row.nextElementSibling;
    return (body && body.classList.contains('step-body') && body.style.display!=='none' && body.style.display!=='') ? idx : -1;
  }).filter(i=>i>=0);
  try{ localStorage.setItem(_supportKey(), JSON.stringify({main:mainOpen, rows})); }catch(e){}
}
window.persistSupportState = persistSupportState;
window.applySupportState = function(){
  if(!currentId) return;
  let st=null;
  try{ st=JSON.parse(localStorage.getItem(_supportKey())||'null'); }catch(e){}
  if(!st) return;
  if(st.main){
    const body=document.getElementById('support-body');
    const tog=document.querySelector('.support-toggle');
    if(body && (body.style.display==='none'||!body.style.display) && tog && window.toggleSupport) window.toggleSupport(tog);
  }
  _supportRows().forEach((row,idx)=>{
    const body=row.nextElementSibling;
    if(!body || !body.classList.contains('step-body')) return;
    const shouldOpen = st.rows && st.rows.includes(idx);
    const isOpen = body.style.display!=='none' && body.style.display!=='';
    if(shouldOpen && !isOpen){
      const chev=row.querySelector('.support-chev');
      body.style.display='block';
      if(chev) chev.style.transform='rotate(90deg)';
      body.querySelectorAll('textarea').forEach(ta=>{ ta.style.height='auto'; ta.style.height=ta.scrollHeight+'px'; });
    }
  });
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
  if(chev) chev.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
  if(!isOpen){
    body.querySelectorAll('textarea').forEach(ta=>{
      ta.style.height='auto';
      ta.style.height=ta.scrollHeight+'px';
    });
  }
  persistSupportState();
};
