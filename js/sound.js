// ── SUONI INTERFACCIA ──────────────────────────────────────────────────────
// Piccoli suoni di menu (pack "FFVII Menu Sounds", in realtà l'UI dello Steam
// Deck) che scandiscono le azioni. Si agganciano al feedback già centralizzato
// dell'app: haptic(intento) in state.js chiama playSfx(intento), così gli
// stessi tre intenti che fanno vibrare il telefono fanno anche il suono, senza
// disseminare chiamate in giro.
//
// Web Audio invece di <audio>: latenza quasi nulla e nessun limite di
// riproduzioni sovrapposte. Il contesto audio parte "sospeso" per policy del
// browser e va sbloccato al primo gesto dell'utente — lo facciamo da soli.
//
// Filosofia: discreti (volume basso) e spegnibili (interruttore in
// Impostazioni). Accesi di default; la preferenza vive in localStorage.

const PREF_KEY = 'inkflow-sfx-enabled';
// Volume per intento: il tick di navigazione resta discreto, conferma e
// ricompensa un po' più presenti perché sono momenti, non accompagnamento.
const VOLUME = { tap: 0.38, done: 0.6, reward: 0.72, cancel: 0.5 };
// ms: distanza minima fra due tick fuori da un gesto puntatore (tastiera,
// azioni a catena). Dentro un gesto vale la regola migliore qui sotto — un
// suono per GESTO, non per finestra di tempo.
const NAV_MIN_GAP = 70;
// Quanto si aspetta prima di far partire il tick diffuso, per dare tempo al
// click di dichiarare un intento più significativo (vedi playSfx). 45ms sono
// sotto la soglia in cui un suono d'interfaccia si percepisce in ritardo.
const NAV_DEFER = 45;
// Oltre questo tempo dall'ultimo pointerdown non si e' piu' dentro un gesto:
// un tick che arriva dopo viene da tastiera o da una catena di azioni, e
// torna a valere la sola distanza minima.
const GESTURE_WINDOW = 1000;

// Un file per ciascun intento di haptic(): 'tap' navigazione, 'done' conferma,
// 'reward' il momento clou (serata completata). 'cancel' è pronto per un
// eventuale uso su annulla/elimina, ma non agganciato di default.
const FILES = {
  tap: './sfx/nav.wav',
  done: './sfx/done.wav',
  reward: './sfx/reward.wav',
  cancel: './sfx/cancel.wav',
};

let _ctx = null;
const _buffers = {};        // intento -> AudioBuffer decodificato
let _loading = null;
let _lastNavAt = 0;
// UN SUONO SOLO PER GESTO, e vince quello che porta il significato.
//
// Il tick diffuso scatta al pointerup; l'azione vera — haptic('done') di una
// conferma, o l'haptic('tap') scritto dentro un onclick — arriva col click,
// qualche millisecondo dopo. Con la sola soglia di 70ms i due finivano spesso
// per suonare entrambi, ed e' esattamente il "sembra che abbia cliccato piu'
// volte" segnalato: due nav.wav a distanza di un soffio suonano come un
// doppio clic, e un nav.wav sopra un done.wav suona come un pasticcio.
//
// Il conto dei gesti risolve alla radice: ogni pointerdown ne apre uno nuovo,
// e dentro un gesto passa un suono e uno solo. Il tick diffuso inoltre non
// parte subito ma dopo NAV_DEFER: se in quella finestra arriva un intento
// dichiarato lo si annulla e suona quello, che e' quello che significa
// qualcosa.
let _gesture = 0;          // gesto puntatore in corso
let _gestureAt = 0;        // quando e' cominciato
let _soundedGesture = -1;  // ultimo gesto che ha gia' emesso un suono
let _pendingNav = null;    // tick diffuso in attesa di partire

export function isSoundEnabled(){
  const v = localStorage.getItem(PREF_KEY);
  return v === null ? true : v === '1';   // default acceso
}
export function setSoundEnabled(on){
  try{ localStorage.setItem(PREF_KEY, on ? '1' : '0'); }catch(e){}
  if(on) unlockAudio();                    // pronto a suonare subito dopo l'accensione
}

function getCtx(){
  if(_ctx) return _ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return null;
  _ctx = new AC();
  return _ctx;
}

// Scarica e decodifica i file una volta sola. In parallelo, tollerante ai
// fallimenti: un suono che non si carica non deve rompere nulla.
function preload(){
  if(_loading) return _loading;
  const ctx = getCtx();
  if(!ctx) return Promise.resolve();
  _loading = Promise.all(Object.entries(FILES).map(async ([key, url])=>{
    try{
      const buf = await fetch(url).then(r=> r.ok ? r.arrayBuffer() : Promise.reject(r.status));
      _buffers[key] = await ctx.decodeAudioData(buf);
    }catch(e){ /* suono mancante: pazienza, gli altri funzionano */ }
  }));
  return _loading;
}

// I browser tengono il contesto "sospeso" finché non c'è un gesto utente.
// Lo riprendiamo al primo tocco/click/tasto, una volta, e intanto precarichiamo.
function unlockAudio(){
  const ctx = getCtx();
  if(!ctx) return;
  if(ctx.state === 'suspended') ctx.resume().catch(()=>{});
  preload();
}
(function armUnlock(){
  const once = ()=>{ unlockAudio(); ['pointerdown','touchstart','keydown'].forEach(ev=>window.removeEventListener(ev, once)); };
  ['pointerdown','touchstart','keydown'].forEach(ev=>window.addEventListener(ev, once, { passive:true }));
})();

// Tick di navigazione DIFFUSO: un tocco su un elemento interattivo fa il suono
// di menu, come nelle UI da console. Prima suonavano solo i ~16 punti che
// chiamano haptic(), cioè quasi nulla navigando. A non farlo raddoppiare con
// l'haptic dello stesso tocco ci pensa il conto dei gesti (vedi playSfx).
// Escludiamo i campi di testo (un tocco per scrivere non deve ticchettare).
function isInteractive(el){
  if(!el || el.nodeType !== 1) return false;
  if(el.closest('input, textarea, select, [contenteditable="true"]')) return false;
  return !!el.closest('button, a[href], [role="button"], [onclick], .refs-thumb, .album-card, .refs-folder-row, .step-item, .project-card');
}
// Suona al RILASCIO (non al tocco): appoggiare il dito su un elemento
// interattivo per iniziare a SCORRERE (es. l'elenco fasi/task di un
// progetto, pieno di .step-item con onclick) faceva scattare il suono anche
// quando l'intenzione era solo scorrere, perché al momento del pointerdown
// non si può ancora sapere se diventerà uno scroll. Al pointerup si può: se
// il dito si è spostato più di TAP_SLOP è stato un trascinamento, non un
// tocco, e non suona. La soglia è generosa abbastanza da non penalizzare il
// naturale tremore di un tocco vero.
const TAP_SLOP = 10;
let _padX = 0, _padY = 0, _padId = null, _padTarget = null;
document.addEventListener('pointerdown', e=>{
  _padX = e.clientX; _padY = e.clientY; _padId = e.pointerId; _padTarget = e.target;
  // Comincia un gesto nuovo: quello di prima non ha piu' voce in capitolo.
  _gesture++; _gestureAt = Date.now();
  if(_pendingNav){ clearTimeout(_pendingNav); _pendingNav = null; }
}, { passive:true });
document.addEventListener('pointerup', e=>{
  if(e.pointerId !== _padId || !_padTarget) return;
  const target = _padTarget; _padTarget = null;
  const moved = Math.hypot(e.clientX - _padX, e.clientY - _padY);
  if(moved > TAP_SLOP) return; // scroll/trascinamento, non un tocco
  if(!isInteractive(target)) return;
  if(_soundedGesture === _gesture) return;   // questo gesto ha gia' suonato
  const g = _gesture;
  _pendingNav = setTimeout(()=>{
    _pendingNav = null;
    if(_soundedGesture === g) return;        // nel frattempo ha parlato l'azione
    _soundedGesture = g;
    _lastNavAt = Date.now();
    emit('tap');
  }, NAV_DEFER);
}, { passive:true });

// Riproduce il suono di un intento, se i suoni sono accesi. Fire-and-forget:
// non attende nulla, non blocca l'azione che l'ha innescato.
export function playSfx(intent){
  if(!isSoundEnabled()) return;
  const key = FILES[intent] ? intent : null;
  if(!key) return;
  const now = Date.now();
  const dentroUnGesto = (now - _gestureAt) < GESTURE_WINDOW;
  if(key === 'tap'){
    if(dentroUnGesto){
      // Stesso tocco visto da un'altra parte del codice (il tick diffuso, o
      // l'haptic('tap') scritto nell'onclick): non e' un secondo tocco.
      if(_pendingNav || _soundedGesture === _gesture) return;
      _soundedGesture = _gesture;
    } else {
      // Fuori da un gesto (tastiera, azioni a catena) resta la vecchia rete
      // contro le raffiche.
      if(now - _lastNavAt < NAV_MIN_GAP) return;
    }
    _lastNavAt = now;
  } else if(dentroUnGesto){
    // Conferma, ricompensa, annullo: hanno la precedenza sul tick generico
    // dello stesso gesto. Se il tick e' ancora in attesa lo si annulla, cosi'
    // non si accavallano due suoni per un tocco solo.
    if(_pendingNav){ clearTimeout(_pendingNav); _pendingNav = null; }
    _soundedGesture = _gesture;
  }
  emit(key);
}

// Manda davvero il suono in uscita. Separata da playSfx perche' la decide
// anche il tick differito qui sopra, che le regole le ha gia' applicate.
//
// L'interruttore si controlla QUI, non solo in playSfx, ed e' il motivo per
// cui esiste questa riga: il tick diffuso dei tocchi (il pointerup qui sopra)
// arriva a emit senza passare da playSfx, quindi spegnere i suoni zittiva le
// conferme e le ricompense ma NON il ticchettio di ogni tocco — che e' il
// suono che si sente di piu'. Da fuori sembrava che l'interruttore non
// funzionasse affatto, e per giunta che il suono di fine operazione fosse
// sparito: era sparito davvero, perche' quello l'interruttore lo spegneva.
// Con il controllo nel punto in cui il suono esce non c'e' piu' modo di
// aggiungere una strada che se lo dimentichi.
function emit(key){
  if(!isSoundEnabled()) return;
  const ctx = getCtx();
  if(!ctx) return;
  const play = ()=>{
    const buf = _buffers[key];
    if(!buf) return;
    try{
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = VOLUME[key] != null ? VOLUME[key] : 0.6;
      src.connect(gain).connect(ctx.destination);
      src.start(0);
    }catch(e){}
  };
  if(_buffers[key]) play();
  else preload().then(play);   // primo suono prima del precarico: aspetta e poi parte
}
