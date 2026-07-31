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
const NAV_MIN_GAP = 70;            // ms: fonde il tick diffuso con l'eventuale haptic('tap') dello stesso gesto ed evita raffiche

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
// chiamano haptic(), cioè quasi nulla navigando. La soglia NAV_MIN_GAP fonde
// questo tick con l'eventuale haptic('tap') dello stesso gesto: niente doppio.
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
}, { passive:true });
document.addEventListener('pointerup', e=>{
  if(e.pointerId !== _padId || !_padTarget) return;
  const target = _padTarget; _padTarget = null;
  const moved = Math.hypot(e.clientX - _padX, e.clientY - _padY);
  if(moved > TAP_SLOP) return; // scroll/trascinamento, non un tocco
  if(isInteractive(target)) playSfx('tap');
}, { passive:true });

// Riproduce il suono di un intento, se i suoni sono accesi. Fire-and-forget:
// non attende nulla, non blocca l'azione che l'ha innescato.
export function playSfx(intent){
  if(!isSoundEnabled()) return;
  const key = FILES[intent] ? intent : null;
  if(!key) return;
  // Il tick di navigazione può partire a raffica (liste, scorrimenti): lo
  // limitiamo, altrimenti diventa un ronzio invece che un accento.
  if(key === 'tap'){
    const now = Date.now();
    if(now - _lastNavAt < NAV_MIN_GAP) return;
    _lastNavAt = now;
  }
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
