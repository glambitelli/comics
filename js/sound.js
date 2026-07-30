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
const VOLUME = 0.32;               // basso: devono accompagnare, non dominare
const NAV_MIN_GAP = 60;            // ms: evita raffiche di tick se l'intento 'tap' parte in rapida sequenza

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
      gain.gain.value = VOLUME;
      src.connect(gain).connect(ctx.destination);
      src.start(0);
    }catch(e){}
  };
  if(_buffers[key]) play();
  else preload().then(play);   // primo suono prima del precarico: aspetta e poi parte
}
