// ── LA VISTA A SCHERMO INTERO — sfogliare i ritagli come una galleria ──
//
// Staccata da refs.js quando quel file ha passato le tremila righe: e' un
// pezzo con confini netti (un overlay, tre celle, un nastro, lo zoom) e con
// una superficie di contatto piccolissima verso il resto dell'archivio —
// legge la cache dei ritagli e sa chiedere il nome di una cartella, nient'altro.
// Tenerlo dentro voleva dire che ogni modifica alla galleria si faceva
// scorrendo in mezzo alla sincronizzazione con Drive e al render delle
// cartelle.
//
// La regola che tiene in piedi tutto il file: le tre celle sono elementi DOM
// FISSI che non si ricreano mai, e le due trasformazioni (nastro che sfoglia,
// zoom sull'immagine) restano indipendenti. I perche' sono raccontati sul
// posto, dove servono.
import { projects } from './state.js';
import {
  ZOOM_IN, ZOOM_MAX, panGain, edgeSpring, EDGE_COMMIT, EDGE_HANDOFF,
  panLimits as limitiPan, clampTo, ZOOM_TRANSITION, EDGE_COMMIT_ZOOM,
} from './gesti.js';
// Dall'archivio arrivano solo dati: la cache dei ritagli, l'elenco della
// griglia da cui si e' aperta la vista, il nome di una cartella, i progetti
// collegati a un ritaglio. Le AZIONI sulle immagini (menu, tag, elimina)
// restano di la' e ci arrivano da window, come le chiama l'HTML.
import { refsCache, currentGridList, getFolderName, projectIdsOf } from './refs.js';

// La lightbox usa l'URL ORIGINALE, senza trasformazioni. Ci avevo messo
// q_auto/f_auto per risparmiare byte, ma ogni immagine così diventava una
// variante nuova da generare al primo sguardo: swipando in galleria si
// aspettava quella generazione ad ogni foto mai vista, e lo swipe sembrava
// non funzionare. L'originale invece esiste da sempre ed è servito subito.
// Il risparmio non valeva il prezzo: gli originali sono già limitati a 2000px
// e ~1.4MB dalla compressione fatta al salvataggio.
const lightboxUrl = url => url;

// ── LIGHTBOX ──
let _lightboxList = [];
let _lightboxIndex = -1;

// Nastro di TRE celle affiancate (precedente/corrente/successiva, vedi
// css/refs.css .refs-lightbox-track/-cell): a riposo il nastro sta spostato
// esattamente di una cella (translateX(-100%), percentuale = sulla propria
// larghezza, quindi non serve mai misurarla in px), così la cella centrale
// riempie lo schermo. Durante il trascinamento si somma solo un delta in px
// alla stessa formula: il dito muove il nastro, non ricostruisce nulla.
//
// Le tre celle sono elementi DOM FISSI: non si ricreano mai. A ogni pagina
// completata (swipe confermato o freccia/tastiera) la cella ormai fuori
// schermo viene RIUSATA per il prossimo vicino — spostata nel DOM con
// insertBefore/appendChild, che non tocca src né decodifica, esattamente
// come già succedeva nel lettore album per lo stesso motivo (vedi commento
// storico più sotto): il browser non garantisce di riusare la decodifica se
// si riassegna la stessa src a un ELEMENTO diverso, ma la riusa sempre se è
// lo stesso elemento che si sposta.
let _lbCells = null;   // [{el,img}, {el,img}, {el,img}] — indici 0/1/2 = prev/cur/next, SEMPRE (ordine DOM = ordine visivo)
let _lbAnimating = false;

function ensureLbCells(){
  if(_lbCells) return;
  const track = document.getElementById('refs-lightbox-track');
  if(!track) return;
  _lbCells = Array.from(track.children).map(el => ({ el, img: el.querySelector('.refs-lightbox-img') }));
}

function curImg(){ return _lbCells && _lbCells[1] && _lbCells[1].img; }

// Carica UNA cella con l'immagine dell'indice dato. `hideUntilReady` nasconde
// la cella (visibility, il layout a fisarmonica resta invariato) finché
// decode() non è risolta — usato solo per la cella CENTRALE in apertura, dove
// altrimenti si vedrebbe un frame vuoto/rotto; le celle vicine si caricano
// invece già fuori schermo, quindi non serve nascondere nulla.
async function preloadCell(cell, index, hideUntilReady){
  if(!cell) return;
  // Ogni chiamata prende un numero. Serve a riconoscere, dopo l'attesa, se
  // nel frattempo QUESTA STESSA cella è stata mandata su un'altra immagine:
  // sfogliando in fretta subito dopo l'apertura, la decode() della prima si
  // rompe (src cambiata), finisce nel catch e proseguiva a rimettere visibile
  // la cella — mentre dentro c'era già l'immagine dopo, ancora a metà. Un
  // lampo dell'immagine sbagliata, raro e inspiegabile. Il lettore la stessa
  // difesa ce l'ha da sempre (vedi cellHas e il token in albums.js).
  const mio = (cell.gen = (cell.gen || 0) + 1);
  const item = _lightboxList[index];
  if(!item){ cell.img.removeAttribute('src'); return; }
  const url = lightboxUrl(item.url);
  if(cell.img.src !== url){
    if(hideUntilReady) cell.el.style.visibility = 'hidden';
    cell.img.src = url;
  } else if(!hideUntilReady){
    return; // già quella giusta e nessuno sta aspettando: niente da fare
  }
  try{ await cell.img.decode(); }
  catch(e){ /* src cambiata a metà o file rotto: si prosegue comunque */ }
  if(cell.gen !== mio) return;            // sorpassata: non tocca più niente
  if(hideUntilReady) cell.el.style.visibility = '';
}

// `elenco` serve a chi la galleria la apre da FUORI dall'archivio: le Scene
// mostrano i riferimenti di un beat, e scorrendo devono comparire quelli — non
// tutta la cartella da cui erano stati presi. Senza, si finiva a sfogliare
// l'archivio partendo da una miniatura che si era aperta per guardarla e basta.
export function openRefLightbox(id, elenco){
  const item = refsCache().find(r=>r.id===id);
  if(!item) return;
  _lightboxList = Array.isArray(elenco) && elenco.length ? elenco : currentGridList();
  _lightboxIndex = _lightboxList.findIndex(r=>r.id===id);
  // Registra uno stato nella cronologia: così il tasto Indietro (browser o
  // gesto Android) chiude l'immagine e torna alla griglia, invece di uscire.
  try{
    if(!history.state || history.state.view !== 'lightbox') history.pushState({view:'lightbox'}, '');
  }catch(e){}
  // Nasconde la barra-duna sotto (vedi body.refs-lightbox-open in
  // layout.css): senza, restava visibile dietro la capsula della galleria.
  document.body.classList.add('refs-lightbox-open');
  renderLightboxAt(_lightboxIndex);
}

// Pulsante "collega a un progetto" nel lightbox: pieno e colorato come il
// progetto agganciato, altrimenti solo il contorno — stesso linguaggio del
// puntino in griglia, così riconosci lo stato senza dover leggere niente.
// Funzione a parte (non solo inline in updateLightboxChrome) perché va
// rifatta anche subito dopo aver collegato un ritaglio dal menu, senza
// aspettare il giro di andata e ritorno da Firestore.
export function refreshLightboxLinkBtn(item){
  const linkBtn = document.getElementById('refs-lightbox-link');
  if(!linkBtn || !item) return;
  const suoi = projectIdsOf(item).map(pid => projects.find(p=>p.id===pid)).filter(Boolean);
  const proj = suoi[0] || null;
  // Il colore va sul PULSANTE, non riempiendo un tracciato: la catena è
  // disegnata a linea, riempirla la impasterebbe in una macchia.
  linkBtn.style.setProperty('--proj', proj ? (proj.color||'#4ab8d8') : '');
  linkBtn.classList.toggle('linked', !!proj);
  linkBtn.setAttribute('aria-label', suoi.length
    ? `Collegato a ${suoi.map(p=>'"'+(p.title||'')+'"').join(', ')} — cambia`
    : 'Collega a un progetto');
}

// Interfaccia intorno alla foto (contatore, frecce, provenienza, segnalibro):
// non dipende dal bitmap, si aggiorna subito — sia in apertura sia a ogni
// pagina completata.
function updateLightboxChrome(item, index){
  const ov = document.getElementById('refs-lightbox');
  if(!ov) return;
  const counter = document.getElementById('refs-lightbox-counter');
  const prevBtn = document.getElementById('refs-lightbox-prev');
  const nextBtn = document.getElementById('refs-lightbox-next');
  ov.dataset.id = item.id;
  ov.classList.remove('chrome-hidden');
  if(counter) counter.textContent = (index+1)+' / '+_lightboxList.length;
  // Provenienza: da che albo/pagina viene il ritaglio, e — se è archiviato in
  // una cartella di studio — di quale artista è. Il dato veniva già salvato da
  // sempre ma non era mostrato da nessuna parte: senza, guardando una mano
  // dentro "Hands" non c'è modo di sapere chi l'ha disegnata.
  const prov = document.getElementById('refs-lightbox-prov');
  const provWrap = document.getElementById('refs-lightbox-prov-wrap');
  if(prov){
    const p = item.provenance;
    if(p && (p.opera || p.folderId)){
      const artista = p.folderId ? getFolderName(p.folderId) : null;
      // L'artista si mostra solo se il ritaglio NON è già nella sua cartella:
      // dentro la cartella di Otomo, ripetere "Otomo" su ogni immagine è
      // rumore. Nello studio invece è l'informazione che serve.
      const showArtist = artista && item.folderId !== p.folderId;
      const bits = [];
      if(showArtist) bits.push(artista);
      if(p.opera) bits.push(p.opera);
      if(p.pagina) bits.push('p. ' + p.pagina);
      prov.textContent = bits.join(' · ');
      if(provWrap) provWrap.classList.toggle('is-empty', bits.length === 0);
    } else {
      prov.textContent = '';
      if(provWrap) provWrap.classList.add('is-empty');
    }
  }
  if(prevBtn) prevBtn.style.visibility = index>0 ? 'visible' : 'hidden';
  if(nextBtn) nextBtn.style.visibility = index<_lightboxList.length-1 ? 'visible' : 'hidden';
  refreshLightboxLinkBtn(item);
  ov.classList.add('open');
}

// Apertura "a freddo": popola le tre celle da zero e riporta il nastro a
// riposo senza animazione. La navigazione dentro la galleria (swipe, frecce,
// tastiera) NON passa più di qui: usa commitSwipe, che anima e ricicla le
// celle già pronte invece di ricaricare tutto — vedi sotto.
async function renderLightboxAt(index){
  if(index < 0 || index >= _lightboxList.length) return;
  _lightboxIndex = index;
  ensureLbCells();
  const track = document.getElementById('refs-lightbox-track');
  _lbOffsetPx = 0;
  if(track){ track.style.transition='none'; track.style.willChange=''; track.style.transform='translate3d(-100%,0,0)'; }
  updateLightboxChrome(_lightboxList[index], index);
  resetImageZoom();
  // decode() e non 'load': 'load' scatta quando i BYTE sono arrivati, ma la
  // decodifica del bitmap avviene dopo, al primo paint. Su una foto grande
  // quella decodifica dura parecchio, e mostrare la cella su 'load' si
  // tradurrebbe in un frame vuoto/a scatti, tanto più lungo quanto è grande
  // il file. decode() si risolve solo quando è pronta a essere dipinta.
  await preloadCell(_lbCells[1], index, true);
  if(_lightboxIndex !== index) return; // si è già passati oltre nel frattempo: scarta
  // I vicini si preparano DENTRO le celle che li mostreranno già a riposo,
  // fuori schermo: quando lo swipe li porta al centro, decode() trova il
  // lavoro già fatto, in ENTRAMBE le direzioni — trascinare da una parte o
  // dall'altra deve essere fluido allo stesso modo.
  preloadCell(_lbCells[0], index-1, false);
  preloadCell(_lbCells[2], index+1, false);
}

// Le celle riciclate si spostano nel DOM (mai ricreate): appendChild/
// insertBefore su un nodo già presente lo SPOSTA soltanto, senza toccare src
// né decodifica — la cella che PRIMA era "successiva", già decodificata
// mentre si trascinava, diventa "corrente" senza ridecodificare nulla.
function rotateCellsForward(){   // si è confermato "avanti"
  const track = document.getElementById('refs-lightbox-track');
  const [a,b,c] = _lbCells;
  track.appendChild(a.el);
  _lbCells = [b, c, a];
}
function rotateCellsBackward(){  // si è confermato "indietro"
  const track = document.getElementById('refs-lightbox-track');
  const [a,b,c] = _lbCells;
  track.insertBefore(c.el, a.el);
  _lbCells = [c, a, b];
}

// Rete di sicurezza sotto transitionend: se il nastro è già esattamente al
// valore di arrivo (es. un trascinamento uscito e rientrato allo stesso punto
// prima del rilascio) la proprietà non cambia e transitionend non scatta mai
// — senza questa rete _lbAnimating resterebbe bloccato a true per sempre.
let _lbFinish = null;   // conclusione dell'animazione in corso, per poterla anticipare
function afterLbTransition(track, ms, cb){
  let done = false;
  const finish = () => {
    if(done) return;
    done = true;
    track.removeEventListener('transitionend', onEnd);
    clearTimeout(timer);
    if(_lbFinish === finish) _lbFinish = null;
    cb();
  };
  const onEnd = e => { if(e.target === track && e.propertyName === 'transform') finish(); };
  track.addEventListener('transitionend', onEnd);
  const timer = setTimeout(finish, ms + 40);
  _lbFinish = finish;
}

// Chiude SUBITO l'animazione in corso, invece di ignorare il gesto che arriva
// mentre il nastro sta ancora scorrendo.
//
// È il motivo per cui a volte serviva un doppio swipe: fra una foto e l'altra
// passano ~220ms di scorrimento, e in quella finestra il tocco successivo non
// veniva rallentato ma buttato via del tutto — il trascinamento nemmeno si
// armava. Sfogliando di lena ci si finisce dentro di continuo, e la sensazione
// è "il primo swipe non l'ha preso".
function flushLbTransition(){
  if(_lbFinish) _lbFinish();
}

// La durata si commisura a quanto resta DAVVERO da percorrere, non è più fissa.
// Con una durata fissa gli ultimi centimetri dopo un trascinamento lungo si
// prendevano gli stessi 220ms di una foto girata da ferma: il dito aveva già
// fatto quasi tutto il lavoro e il nastro sembrava frenare sul più bello. Il
// minimo esiste perché sotto una certa soglia un movimento non si legge più
// come movimento, ma come uno scatto.
const LB_DUR_MAX = 220, LB_DUR_MIN = 90;
const LB_EASE = 'cubic-bezier(.22,.61,.36,1)';
function lbDuration(distanza, larghezza){
  if(!larghezza) return LB_DUR_MAX;
  const quota = Math.min(1, Math.max(0, distanza / larghezza));
  return Math.round(Math.max(LB_DUR_MIN, LB_DUR_MAX * quota));
}
// Quanto il nastro è spostato, in px, rispetto alla posizione di riposo.
let _lbOffsetPx = 0;
let _lbPendingDir = 0;

// Anima il nastro di una cella intera nella direzione data (+1 avanti,
// -1 indietro) e, a fine corsa, ricicla le celle e sposta l'indice. Unico
// punto d'ingresso sia per lo swipe confermato sia per frecce/tastiera:
// quando parte da un trascinamento già in corso continua da dove il dito
// l'ha lasciato (la transizione interpola dal valore ATTUALE), quando parte
// "a freddo" (freccia, tastiera) il nastro è già a riposo e scorre uguale.
function commitSwipe(dir){
  // Comando arrivato mentre il nastro scorre ancora (frecce o tastiera in
  // rapida successione, swipe incalzanti): si chiude subito quello in corso e
  // si riparte da lì, invece di lasciar cadere il comando.
  if(_lbAnimating) flushLbTransition();
  if(_lbAnimating) return;   // non si è chiusa: meglio perdere un passo che accavallarne due
  const target = _lightboxIndex + dir;
  if(target < 0 || target >= _lightboxList.length) return;
  const track = document.getElementById('refs-lightbox-track');
  if(!track) return;
  _lbAnimating = true;
  _lbPendingDir = dir;
  // Quanta strada resta: una cella intera partendo da fermo (freccia,
  // tastiera), molto meno se il dito ha già trascinato quasi tutto.
  const w = track.clientWidth || 0;
  const ms = lbDuration(w - Math.min(w, Math.abs(_lbOffsetPx)), w);
  track.style.willChange = 'transform';
  track.style.transition = `transform ${ms}ms ${LB_EASE}`;
  track.style.transform = dir > 0 ? 'translate3d(-200%,0,0)' : 'translate3d(0%,0,0)';
  afterLbTransition(track, ms, onSwipeSettled);
}

function onSwipeSettled(){
  const dir = _lbPendingDir;
  const track = document.getElementById('refs-lightbox-track');
  if(dir > 0) rotateCellsForward(); else rotateCellsBackward();
  _lbOffsetPx = 0;
  if(track){
    track.style.transition = 'none';
    track.style.transform = 'translate3d(-100%,0,0)';
    track.style.willChange = '';
  }
  _lightboxIndex += dir;
  _lbAnimating = false;
  resetImageZoom();
  updateLightboxChrome(_lightboxList[_lightboxIndex], _lightboxIndex);
  // Il nuovo vicino lontano, appena rivelato dalla rotazione, si prepara
  // subito — è la cella riciclata, ancora vuota o con la foto di due passi fa.
  const farIndex = dir > 0 ? _lightboxIndex + 1 : _lightboxIndex - 1;
  const farCell = dir > 0 ? _lbCells[2] : _lbCells[0];
  preloadCell(farCell, farIndex, false);
}

// Rilascio senza conferma: il nastro torna a riposo con la stessa molla
// dell'animazione di conferma, così cambiare idea a metà gesto si sente
// naturale quanto completarlo.
function cancelSwipe(){
  const track = document.getElementById('refs-lightbox-track');
  if(!track) return;
  _lbAnimating = true;
  // Anche il rientro dura quanto la strada da rifare: se il dito si era mosso
  // di poco, il nastro torna a posto subito invece di prendersi tutto il tempo
  // di una foto intera.
  const w = track.clientWidth || 0;
  const ms = lbDuration(Math.abs(_lbOffsetPx), w);
  track.style.willChange = 'transform';
  track.style.transition = `transform ${ms}ms ${LB_EASE}`;
  track.style.transform = 'translate3d(-100%,0,0)';
  afterLbTransition(track, ms, ()=>{
    _lbOffsetPx = 0;
    track.style.transition = '';
    track.style.willChange = '';
    _lbAnimating = false;
  });
}

// Chiusura "morbida": passa dalla cronologia, così lo stato del browser resta
// allineato a quello che vedi (niente voci fantasma nel tasto Indietro).
export function closeRefLightbox(){
  const ov = document.getElementById('refs-lightbox');
  const isOpen = ov && ov.classList.contains('open');
  if(isOpen && history.state && history.state.view === 'lightbox'){
    history.back();   // sarà il gestore popstate a chiudere davvero la vista
    return;
  }
  closeLightboxUI();
}

// Chiusura immediata della sola interfaccia, senza toccare la cronologia.
export function closeLightboxUI(){
  const ov = document.getElementById('refs-lightbox');
  if(ov) ov.classList.remove('open');
  document.body.classList.remove('refs-lightbox-open');
  resetImageZoom();
}

export function nextRefImage(){ commitSwipe(1); }
export function prevRefImage(){ commitSwipe(-1); }

// Tastiera (desktop): ← → per scorrere, Esc per chiudere
document.addEventListener('keydown', e=>{
  const ov = document.getElementById('refs-lightbox');
  if(!ov || !ov.classList.contains('open')) return;
  if(e.key === 'ArrowRight') nextRefImage();
  else if(e.key === 'ArrowLeft') prevRefImage();
  else if(e.key === 'Escape') closeRefLightbox();
});

// ── ZOOM/PAN/SWIPE — tocca due volte o pizzica per ingrandire, come una vera
// galleria: a 1x lo swipe orizzontale cambia immagine, da zoomato trascini
// per spostarti dentro la foto invece di cambiarla. Lo zoom lavora SEMPRE
// sulla sola cella centrale (curImg()) e non tocca mai il nastro: le due
// trasformazioni (pagina/nastro, zoom/immagine) restano indipendenti apposta,
// altrimenti trascinare per zoomare e trascinare per sfogliare si
// confonderebbero. ──
let _zoomScale = 1, _zoomX = 0, _zoomY = 0;

export function resetImageZoom(){
  _zoomScale = 1; _zoomX = 0; _zoomY = 0;
  const img = curImg();
  if(img){ img.style.transition = 'none'; applyZoomTransform(img); }
}

// Fin dove si può spostare la foto prima di "perderla" fuori dallo schermo.
function panLimits(scale){
  const img = curImg();
  if(!img) return null;
  const r = img.getBoundingClientRect();
  return limitiPan(r.width / scale, r.height / scale, scale);
}
function clampPan(scale, x, y){
  const lim = panLimits(scale);
  if(!lim) return {x, y};
  return clampTo(lim, x, y);
}

function applyZoomTransform(img){
  img.style.transform = `translate(${_zoomX}px, ${_zoomY}px) scale(${_zoomScale})`;
  // il cursore "manina" appare solo quando c'è davvero qualcosa da spostare
  const body = document.getElementById('refs-lightbox-body');
  if(body) body.classList.toggle('zoomed', _zoomScale > 1.02);
}

// Alterna zoom 1x ↔ ZOOM_IN centrando sul punto indicato, con animazione.
function toggleZoomAt(clientX, clientY){
  const img = curImg();
  if(!img) return;
  img.style.transition = ZOOM_TRANSITION;
  if(_zoomScale > 1.02){
    _zoomScale = 1; _zoomX = 0; _zoomY = 0;
    applyZoomTransform(img);
  } else {
    const r = img.getBoundingClientRect();
    const relX = clientX - (r.left + r.width/2);
    const relY = clientY - (r.top + r.height/2);
    _zoomScale = ZOOM_IN;
    const c = clampPan(_zoomScale, -relX*(ZOOM_IN-1), -relY*(ZOOM_IN-1));
    _zoomX = c.x; _zoomY = c.y;
    applyZoomTransform(img);
  }
}

// Resistenza elastica ai bordi della galleria: se non c'è un vicino in quella
// direzione, il trascinamento rallenta invece di seguire il dito 1:1 (curva
// standard "rubber band", converge a poco più di metà schermo e non oltre —
// così si SENTE che sei all'estremo, invece di uno scatto nel vuoto).
function applyLbResistance(dx, w){
  if(!w) return dx;
  const goingNext = dx < 0;
  const blocked = goingNext ? (_lightboxIndex+1 >= _lightboxList.length) : (_lightboxIndex-1 < 0);
  if(!blocked) return dx;
  const c = 0.55;
  const rb = (1 - 1/((Math.abs(dx)*c/w)+1)) * w;
  return goingNext ? -rb : rb;
}

(function initLightboxGestures(){
  document.addEventListener('DOMContentLoaded', bind);
  if(document.readyState !== 'loading') bind();

  function bind(){
    const body = document.getElementById('refs-lightbox-body');
    if(!body || body._gestureInit) return;
    body._gestureInit = true;

    let touches = [];
    let startDist = 0, startScale = 1;
    let panStartX = 0, panStartY = 0, panOrigX = 0, panOrigY = 0;
    let swipeStartX = 0, swipeStartY = 0;
    let isPinching = false, isPanning = false;
    let lastTapTime = 0, lastTapX = 0, lastTapY = 0, singleTapTimer = null;
    // Il tocco in corso ha gia' zoomato appoggiandosi: al rilascio non va
    // riconteggiato ne' deve far comparire/sparire l'interfaccia.
    let doppioConsumato = false;

    // Trascinamento del NASTRO (cambio immagine a 1x): "candidato" appena
    // parte un tocco singolo a zoom 1x, "armato" solo quando il movimento
    // indica chiaramente un gesto orizzontale — prima di allora il nastro
    // resta fermo, così un tap con un lieve tremore del dito non lo smuove
    // di un pixel e la logica di tap/doppio-tap sotto funziona invariata.
    let lbDragCandidate = false, lbArmed = false, lbBodyW = 0;
    let lbLastX = 0, lbLastT = 0, lbPrevX = 0, lbPrevT = 0;
    const LB_ARM_PX = 8;
    // Da dove si conta lo spostamento del nastro: di solito il punto in cui il
    // dito si è appoggiato, ma passando dallo spostare la foto al cambiarla
    // diventa il punto in cui la foto è finita — altrimenti il nastro
    // partirebbe già spostato di tutto il tragitto fatto sull'immagine.
    let lbDragOriginX = 0;
    // Il trascinamento arriva dal bordo di una foto ingrandita? Da ingranditi
    // il cambio immagine non deve MAI capitare per sbaglio: il nastro si
    // comporta come una molla e non accetta scorciatoie (vedi il rilascio).
    let lbFromEdge = false;
    // Questo gesto ha il permesso di cambiare foto? Lo prende al touchstart.
    let lbEdgeReady = false;
    // Dove stava il dito quando la foto ha finito di scorrere. L'insistenza si
    // conta da lì in pixel di DITO: contarla sullo spostamento della foto
    // sarebbe falsata dal guadagno di panGain.
    let lbPinnedAtX = null;

    function dist(t0, t1){ return Math.hypot(t1.clientX-t0.clientX, t1.clientY-t0.clientY); }

    let lastTouchAt = 0;
    body.addEventListener('touchstart', e=>{
      lastTouchAt = Date.now();
      touches = Array.from(e.touches);
      const img = curImg();
      if(img) img.style.transition = 'none';
      if(touches.length === 2){
        isPinching = true; isPanning = false; lbDragCandidate = false; lbArmed = false;
        startDist = dist(touches[0], touches[1]);
        startScale = _zoomScale;
      } else if(touches.length === 1){
        isPinching = false;
        swipeStartX = touches[0].clientX; swipeStartY = touches[0].clientY;
        // ── IL DOPPIO TOCCO SI DECIDE QUI, NON AL RILASCIO ──
        // Stessa ragione del lettore (vedi albums.js): aspettare il touchend
        // del secondo tocco significa aspettare tutto il suo tempo di
        // contatto, un decimo di secondo che si sente. Quando il dito si
        // appoggia non c'e' piu' niente da sapere.
        if(Date.now() - lastTapTime < 400
           && Math.hypot(swipeStartX - lastTapX, swipeStartY - lastTapY) < 50){
          lastTapTime = 0;
          doppioConsumato = true;
          clearTimeout(singleTapTimer);
          isPanning = false; lbDragCandidate = false; lbArmed = false;
          lbFromEdge = false; lbPinnedAtX = null;
          toggleZoomAt(swipeStartX, swipeStartY);
          return;
        }
        if(_zoomScale > 1.02){
          isPanning = true; lbDragCandidate = false; lbArmed = false;
          lbFromEdge = false; lbPinnedAtX = null;
          // SI CAMBIA FOTO SOLO SE IL DITO SI APPOGGIA QUANDO L'IMMAGINE È GIÀ
          // A FINE CORSA. Su una foto ingrandita il bordo orizzontale è
          // vicinissimo: muovendosi dentro ci si sbatte contro di continuo, e
          // ogni volta il gesto rischiava di diventare un cambio immagine.
          // Esplorare e sfogliare restano così due gesti distinti: si stacca
          // il dito, lo si riappoggia a fine corsa, e da lì si sfoglia.
          {
            const lim = panLimits(_zoomScale);
            lbEdgeReady = !lim || Math.abs(_zoomX) >= lim.maxX - 1;
          }
          panStartX = touches[0].clientX; panStartY = touches[0].clientY;
          panOrigX = _zoomX; panOrigY = _zoomY;
        } else {
          isPanning = false;
          // Il dito è arrivato mentre il nastro scorreva ancora: si chiude
          // subito l'animazione e questo gesto parte da foto ferma, invece di
          // essere scartato (vedi flushLbTransition — è il "doppio swipe").
          if(_lbAnimating) flushLbTransition();
          lbDragCandidate = true;
          lbArmed = false;
          lbFromEdge = false; lbPinnedAtX = null; lbEdgeReady = true;
          lbBodyW = body.clientWidth;
          lbDragOriginX = touches[0].clientX;
          lbLastX = lbPrevX = touches[0].clientX;
          lbLastT = lbPrevT = performance.now();
          // Il livello di composizione si prepara già ORA, non alla prima
          // frazione di movimento: pagare la promozione dentro il primo
          // fotogramma del trascinamento si sente come partenza impastata.
          const track = document.getElementById('refs-lightbox-track');
          if(track) track.style.willChange = 'transform';
        }
      }
    }, {passive:true});

    body.addEventListener('touchmove', e=>{
      touches = Array.from(e.touches);
      if(isPinching && touches.length === 2){
        const img = curImg(); if(!img) return;
        const nd = dist(touches[0], touches[1]);
        _zoomScale = Math.min(ZOOM_MAX, Math.max(1, startScale * (nd/startDist)));
        const c = clampPan(_zoomScale, _zoomX, _zoomY);
        _zoomX = c.x; _zoomY = c.y;
        applyZoomTransform(img);
      } else if(isPanning && touches.length === 1){
        const img = curImg(); if(!img) return;
        const x = touches[0].clientX, y = touches[0].clientY;
        const g = panGain(_zoomScale);
        const vogliaX = panOrigX + (x - panStartX) * g;
        const vogliaY = panOrigY + (y - panStartY) * g;
        const c = clampPan(_zoomScale, vogliaX, vogliaY);
        const oltre = vogliaX - c.x;   // quanto si è chiesto OLTRE il bordo
        _zoomX = c.x; _zoomY = c.y;
        applyZoomTransform(img);
        // PASSAGGIO DI CONSEGNE: la foto è finita e il dito continua a spingere
        // da quella parte. Non c'è più niente da mostrare lì, quindi da qui in
        // poi il gesto muove il NASTRO e cambia immagine, senza dover prima
        // uscire dall'ingrandimento e ripartire da capo.
        // L'insistenza si misura in pixel di DITO da quando la foto si e'
        // fermata, non sullo scarto della foto: quello e' moltiplicato da
        // panGain, e faceva scattare il passaggio molto prima di quanto la
        // mano si aspettasse.
        if(Math.abs(oltre) < 0.5) lbPinnedAtX = null;
        else if(lbPinnedAtX === null) lbPinnedAtX = x;
        if(lbEdgeReady && lbPinnedAtX !== null && Math.abs(x - lbPinnedAtX) > EDGE_HANDOFF
           && Math.abs(x - panStartX) > Math.abs(y - panStartY)){
          isPanning = false;
          lbDragCandidate = true; lbArmed = true; lbFromEdge = true;
          lbDragOriginX = x; lbBodyW = body.clientWidth;
          lbLastX = lbPrevX = x; lbLastT = lbPrevT = performance.now();
          const track = document.getElementById('refs-lightbox-track');
          if(track){ track.style.transition = 'none'; track.style.willChange = 'transform'; }
        }
      } else if(lbDragCandidate && touches.length === 1){
        const x = touches[0].clientX, y = touches[0].clientY;
        const ddx = x - lbDragOriginX, ddy = y - swipeStartY;
        if(!lbArmed){
          if(Math.abs(ddx) > LB_ARM_PX && Math.abs(ddx) > Math.abs(ddy)){
            lbArmed = true;
            const track = document.getElementById('refs-lightbox-track');
            if(track){ track.style.transition = 'none'; track.style.willChange = 'transform'; }
          } else if(Math.abs(ddy) > LB_ARM_PX * 3 && Math.abs(ddy) > Math.abs(ddx) * 2){
            // Si rinuncia solo davanti a un gesto LUNGO e chiaramente
            // verticale. Prima bastavano 8px in verticale per spegnere il
            // candidato PER SEMPRE: un pollice non si muove mai in orizzontale
            // puro, quindi i primi campioni di uno swipe normale sono spesso
            // più verticali che orizzontali (6px di lato, 12 in giù) — roba da
            // rumore, non da intenzione. Quello swipe restava morto anche
            // quando il dito proseguiva dritto di traverso allo schermo, e
            // bisognava rifare il gesto da capo. Qui sotto quella soglia non si
            // decide: si aspetta il campione dopo.
            // Nella galleria non esiste nessun gesto verticale da proteggere
            // (il corpo ha touch-action:none), quindi rinunciare tardi non
            // toglie niente a nessuno.
            lbDragCandidate = false;
            return;
          } else {
            return;   // ancora ambiguo: si aspetta il campione successivo
          }
        }
        lbPrevX = lbLastX; lbPrevT = lbLastT;
        lbLastX = x; lbLastT = performance.now();
        // Dal bordo di una foto ingrandita il nastro non segue il dito: cede
        // come una molla, sempre meno man mano che si insiste.
        _lbOffsetPx = lbFromEdge ? edgeSpring(ddx, lbBodyW) : applyLbResistance(ddx, lbBodyW);
        const track = document.getElementById('refs-lightbox-track');
        if(track) track.style.transform = `translate3d(calc(-100% + ${_lbOffsetPx}px),0,0)`;
      }
    }, {passive:true});

    body.addEventListener('touchend', e=>{
      if(isPinching){
        isPinching = false;
        if(_zoomScale < 1.05){
          resetImageZoom();
          const img = curImg();
          if(img) img.style.transition = ZOOM_TRANSITION;
        }
        return;
      }
      // Un tocco senza spostamento non è un trascinamento: lasciamo che venga
      // valutato sotto come possibile doppio tap (anche da immagine ingrandita).
      if(isPanning){
        isPanning = false;
        const tp = e.changedTouches[0];
        const movedPan = Math.hypot(tp.clientX - panStartX, tp.clientY - panStartY);
        if(movedPan > 14) return;
      }
      // ── RILASCIO DI UN TRASCINAMENTO ARMATO: conferma o molla indietro ──
      // Si conferma per DISTANZA (oltre il 30% dello schermo) o per VELOCITÀ,
      // misurata sugli ultimi due campioni e non sull'intero gesto — così un
      // trascinamento lento che finisce con uno scatto conta come scatto. Il
      // secondo controllo (durata totale breve + distanza minima) resta come
      // rete di sicurezza per i gesti troppo rapidi da campionare bene.
      if(lbArmed){
        lbArmed = false; lbDragCandidate = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - lbDragOriginX;
        const adx = Math.abs(dx);
        const vx = lbLastT > lbPrevT ? (lbLastX - lbPrevX) / (lbLastT - lbPrevT) : 0;
        const elapsed = Date.now() - lastTouchAt;
        const dir = dx < 0 ? 1 : -1;   // trascino a sinistra → avanti
        const blocked = dir > 0 ? (_lightboxIndex+1 >= _lightboxList.length) : (_lightboxIndex-1 < 0);
        let vaiAvanti;
        if(lbFromEdge){
          // Da ingranditi conta solo quanto la molla e' stata TIRATA — quello
          // che si vede — e non vale nessuna scorciatoia di velocita': era il
          // flick a rendere il cambio troppo facile, bastava un colpetto al
          // bordo per cambiare foto senza volerlo.
          vaiAvanti = Math.abs(edgeSpring(dx, lbBodyW)) > lbBodyW * EDGE_COMMIT_ZOOM;
        } else {
          const distOk = adx > lbBodyW * 0.3;
          const flickOk = (Math.abs(vx) > 0.5 && Math.sign(vx) === Math.sign(dx)) || (elapsed < 300 && adx > 24);
          vaiAvanti = distOk || flickOk;
        }
        lbFromEdge = false;
        if(!blocked && vaiAvanti) commitSwipe(dir);
        else cancelSwipe();
        return;
      }
      // Gesto finito senza mai armarsi (un tap, o un movimento verticale): il
      // livello di composizione preparato al touchstart non serve più.
      lbDragCandidate = false;
      if(!_lbAnimating){
        const tk = document.getElementById('refs-lightbox-track');
        if(tk) tk.style.willChange = '';
      }
      // tap / doppio tap (solo se non si è mai armato un trascinamento)
      const t = e.changedTouches[0];
      const dx = t.clientX - swipeStartX, dy = t.clientY - swipeStartY;
      const moved = Math.hypot(dx, dy);
      if(doppioConsumato){
        doppioConsumato = false;
      } else if(moved < 20){
        // Primo tocco di un'eventuale coppia: si segna dov'era e quando. Lo
        // zoom, se arriva il secondo, scatta al suo touchstart (vedi sopra).
        lastTapTime = Date.now(); lastTapX = t.clientX; lastTapY = t.clientY;
        // tap singolo: mostra/nasconde l'interfaccia (solo se non zoomato),
        // ritardato per non rubare il gesto al doppio tap
        clearTimeout(singleTapTimer);
        singleTapTimer = setTimeout(()=>{
          const ov = document.getElementById('refs-lightbox');
          if(ov && _zoomScale <= 1.02) ov.classList.toggle('chrome-hidden');
        }, 340);
      }
    }, {passive:true});

    // Un tocco annullato dal sistema (una notifica, un gesto di bordo) non
    // emette touchend: senza questo il nastro resterebbe fermo dov'era il dito,
    // a metà fra due foto, e da lì non si sbloccherebbe più.
    // Con l'interfaccia nascosta (un tocco sulla foto la fa sparire) le due
    // fasce sopra e sotto diventano pointer-events:none, quindi un tocco lì
    // non arrivava a NESSUNO: né al pulsante invisibile, né al gestore del tap
    // sulla foto, che copre solo il corpo centrale. Il risultato era una
    // striscia di schermo morta — si toccava il pulsante "collega", non
    // succedeva niente, e non si capiva perché.
    // Ora un tocco ovunque nella galleria richiama l'interfaccia, e da lì il
    // pulsante è di nuovo lì dov'era.
    const ov = document.getElementById('refs-lightbox');
    if(ov && !ov._chromeWake){
      ov._chromeWake = true;
      ov.addEventListener('pointerdown', e=>{
        if(!ov.classList.contains('chrome-hidden')) return;
        if(e.target.closest('.refs-lightbox-body')) return;   // lì ci pensa già il tap sulla foto
        ov.classList.remove('chrome-hidden');
      }, true);
    }

    body.addEventListener('touchcancel', ()=>{
      isPinching = false; isPanning = false;
      if(lbArmed) cancelSwipe();
      else if(!_lbAnimating){
        const tk = document.getElementById('refs-lightbox-track');
        if(tk) tk.style.willChange = '';
      }
      lbArmed = false; lbDragCandidate = false; lbFromEdge = false; lbPinnedAtX = null;
    }, {passive:true});

    // Desktop: doppio clic per zoomare/dezoomare. I browser mobile generano
    // anche un "dblclick" sintetico dopo un doppio tap reale: se lo lasciassimo
    // passare, zoomerebbe una seconda volta annullando quello già fatto dal
    // gestore touch sopra. Lo ignoriamo se c'è stato un tocco nell'ultimo secondo.
    // Delegati sul contenitore (non sulla singola <img>): la cella "centrale"
    // cambia a ogni pagina col riciclo del nastro, quindi un listener legato
    // una volta sola all'elemento originale smetterebbe di funzionare dopo il
    // primo giro. Le celle laterali hanno pointer-events:none (vedi CSS),
    // quindi i click/drag arrivano comunque solo a quella davvero centrale.
    body.addEventListener('dblclick', e=>{
      if(Date.now() - lastTouchAt < 1000) return;
      if(!e.target.classList.contains('refs-lightbox-img')) return;
      toggleZoomAt(e.clientX, e.clientY);
    });

    // Desktop: rotella per zoomare, con lo zoom centrato sul puntatore
    body.addEventListener('wheel', e=>{
      const ov = document.getElementById('refs-lightbox');
      if(!ov || !ov.classList.contains('open')) return;
      const img = curImg();
      if(!img) return;
      e.preventDefault();
      const prev = _zoomScale;
      const factor = e.deltaY < 0 ? 1.16 : 1/1.16;
      _zoomScale = Math.min(ZOOM_MAX, Math.max(1, prev * factor));
      img.style.transition = 'none';
      if(_zoomScale <= 1.02){
        _zoomScale = 1; _zoomX = 0; _zoomY = 0;
      } else {
        // mantiene fermo il punto sotto il puntatore mentre la scala cambia
        const r = img.getBoundingClientRect();
        const relX = e.clientX - (r.left + r.width/2);
        const relY = e.clientY - (r.top + r.height/2);
        const k = _zoomScale/prev;
        const c = clampPan(_zoomScale, (_zoomX - relX)*k + relX, (_zoomY - relY)*k + relY);
        _zoomX = c.x; _zoomY = c.y;
      }
      applyZoomTransform(img);
    }, {passive:false});

    // Desktop: trascinamento con la "manina" quando l'immagine è ingrandita
    let mDown = false, mStartX = 0, mStartY = 0, mOrigX = 0, mOrigY = 0;
    body.addEventListener('mousedown', e=>{
      if(_zoomScale <= 1.02) return;
      if(Date.now() - lastTouchAt < 1000) return;
      if(!e.target.classList.contains('refs-lightbox-img')) return;
      const img = curImg();
      if(!img) return;
      e.preventDefault();
      mDown = true;
      mStartX = e.clientX; mStartY = e.clientY;
      mOrigX = _zoomX; mOrigY = _zoomY;
      body.classList.add('grabbing');
      img.style.transition = 'none';
    });
    window.addEventListener('mousemove', e=>{
      if(!mDown) return;
      const img = curImg();
      if(!img) return;
      const c = clampPan(_zoomScale, mOrigX + (e.clientX-mStartX), mOrigY + (e.clientY-mStartY));
      _zoomX = c.x; _zoomY = c.y;
      applyZoomTransform(img);
    });
    window.addEventListener('mouseup', ()=>{
      if(!mDown) return;
      mDown = false;
      body.classList.remove('grabbing');
    });
  }
})();






// Apre la vista su un elenco gia' pronto (la galleria di un progetto): stesso
// overlay, stesse celle, solo con un elenco diverso da quello della griglia.
export function apriElenco(list, startIndex = 0){
  if(!list || !list.length) return;
  _lightboxList = list;
  _lightboxIndex = Math.min(Math.max(0, startIndex), list.length - 1);
  try{
    if(!history.state || history.state.view !== 'lightbox') history.pushState({view:'lightbox'}, '');
  }catch(e){}
  document.body.classList.add('refs-lightbox-open');
  renderLightboxAt(_lightboxIndex);
}
