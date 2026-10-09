// ── SUONI INTERFACCIA ──────────────────────────────────────────────────────
// Piccoli suoni di menu, nello stile survival horror della scrivania (vedi
// "UN SET SOLO" qui sotto), che scandiscono le azioni. Si agganciano al feedback già centralizzato
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

// ── I QUATTRO INTENTI, E QUANDO SI USANO ──
// E' la regola che tiene insieme tutto il set: ogni suono ha un mestiere, e
// chi aggiunge un haptic() da qualche parte sceglie fra questi quattro.
//
//   tap      ti sei mosso. Navigazione, cursori, aprire, scorrere. E' il
//            piu' frequente di tutti, quindi e' anche il piu' discreto.
//   done     hai chiuso qualcosa. Salvato, confermato, completato, avviato.
//   cancel   qualcosa si e' chiuso, e' tornato indietro, o si e' disfatto.
//            Chiudere una foto a schermo intero o il lettore, dire di no a
//            un foglio di conferma, premere Annulla su un'eliminazione,
//            buttare via una sessione del cronometro.
//   reward   il momento clou: la serata completata. Uno solo, raro apposta.
//
// 'cancel' E' STATO MUTO PER MESI: il file c'era e non lo chiamava nessuno
// (segnalato da Giovanni il 25 settembre 2026, "il suono per tornare
// indietro non l'ho mai sentito"). Adesso e' agganciato nei cinque punti qui
// sopra, e sono tutti posti dove prima non suonava proprio niente — quindi
// non ruba il turno a nessun altro suono.
const NOMI = {
  tap: 'nav.wav',
  done: 'done.wav',
  reward: 'reward.wav',
  cancel: 'cancel.wav',
};

// ── UN SET SOLO: SURVIVAL HORROR ──
// Dal 9 ottobre 2026 i suoni dell'app sono uno stile solo, quello survival
// horror della scrivania di Jill: il set Final Fantasy VII, il menu per
// sceglierlo e il caricamento dei propri file dalle Impostazioni sono stati
// tolti (Giovanni: "ormai e' deciso"). Nelle Impostazioni resta solo
// l'interruttore che li accende e li spegne.
// I file stanno in sfx/survival/ e li ha caricati Giovanni: sono suoni presi
// da un gioco, roba di chi il gioco l'ha fatto, in un repository pubblico.
// Per il premio (reward) un file suo non c'e': suona la conferma, che e' il
// suono piu' vicino. Un comando muto si leggerebbe come un tocco andato a
// vuoto.
const CARTELLA = './sfx/survival/';
const RIPIEGO = { reward: 'done' };

async function bytesDi(intento){
  try{
    const r = await fetch(CARTELLA + NOMI[intento]);
    if(r.ok) return await r.arrayBuffer();
  }catch(e){ /* rete assente o file assente: si ripiega */ }
  const altro = RIPIEGO[intento];
  if(!altro) throw new Error('manca ' + intento);
  return fetch(CARTELLA + NOMI[altro]).then(r=> r.ok ? r.arrayBuffer() : Promise.reject(r.status));
}

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
  _loading = Promise.all(Object.keys(NOMI).map(async key=>{
    try{
      const buf = await bytesDi(key);
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
  // I tasti del walkman hanno i loro rumori di meccanismo (vedi radio.js):
  // il tic del menu sopra il clac del tasto sarebbe un suono di troppo.
  if(el.closest('.radio-tasti')) return false;
  // E lo stesso i tasti della barra, che sono una macchina da scrivere e
  // suonano come tale (vedi colpoDiMacchina qui sotto).
  if(el.closest('.dune-nav-items, .home-fab-row')) return false;
  // E l'interruttore della lampada, che fa il clic di un interruttore vero
  // (vedi montaLaLuce in scrivania.js).
  if(el.closest('#scriv-luce')) return false;
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
let _padX = 0, _padY = 0, _padId = null, _padTarget = null, _padAt = 0;
// UNA PRESSIONE LUNGA NON E' UN TOCCO. Tenendo premuto il tasto giallo del
// timer (1,2 secondi) si elimina la sessione, col suo suono; ma al rilascio
// partiva ANCHE il tic del tocco, che e' lo stesso del tasto START — due
// suoni per un gesto (Giovanni, 9 ottobre 2026). Il rilascio dopo piu' di
// mezzo secondo di pressione non ticchetta: chi tiene premuto ha gia' il
// suono del suo comando.
const TAP_MAX_MS = 550;
document.addEventListener('pointerdown', e=>{
  _padX = e.clientX; _padY = e.clientY; _padId = e.pointerId; _padTarget = e.target; _padAt = Date.now();
  // Comincia un gesto nuovo: quello di prima non ha piu' voce in capitolo.
  _gesture++; _gestureAt = Date.now();
  if(_pendingNav){ clearTimeout(_pendingNav); _pendingNav = null; }
}, { passive:true });
document.addEventListener('pointerup', e=>{
  if(e.pointerId !== _padId || !_padTarget) return;
  const target = _padTarget; _padTarget = null;
  const moved = Math.hypot(e.clientX - _padX, e.clientY - _padY);
  if(moved > TAP_SLOP) return; // scroll/trascinamento, non un tocco
  if(Date.now() - _padAt > TAP_MAX_MS) return; // pressione lunga, non un tocco
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
  const key = NOMI[intent] ? intent : null;
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

// ── LA MACCHINA DA SCRIVERE ──
// Dal 9 ottobre 2026 la barra in fondo e' la tastiera di una macchina da
// scrivere (vedi layout.css), e i suoi tasti fanno il colpo di un tasto
// vero. Tre registrazioni, una a caso per tocco: lo stesso identico colpo
// ripetuto suona finto alla seconda volta.
// I file li carica Giovanni in sfx/macchina/ (vedi il LEGGIMI li'). Se
// mancano, il tasto fa il suono normale dei tocchi: e' il ripiego, non un
// errore. Suona al pointerdown, cioe' quando il dito scende: e' li' che un
// tasto di macchina da scrivere fa rumore, non quando lo lasci.
// tasto2 e' stato tolto: "troppo alto, non mi piace" (Giovanni, 9 ottobre
// 2026). Ne restano due, che con la variazione di tono qui sotto bastano.
const COLPI = ['./sfx/macchina/tasto1.mp3', './sfx/macchina/tasto3.mp3'];
// IL VOLUME DI OGNI COLPO, misurato: tasto1 ha un volume medio di -24 dB,
// tasto2 e tasto3 di -12,7 — quattro volte piu' forti. Al 70% per tutti,
// come all'inizio, due colpi su tre "stonavano l'orecchio" (Giovanni, 9
// ottobre 2026). Qui si pareggiano e si abbassano tutti: finiscono attorno ai
// -31 dB, sotto il tic del menu, perche' un tasto si preme spesso.
const VOLUMI = [0.45, 0.12];
// PASSANO DAL MOTORE AUDIO DEGLI ALTRI SUONI, non da un <audio> per conto
// loro. La prima versione usava new Audio(), e sul telefono di Giovanni non
// si sentivano mai: il primo tocco sulla barra poteva arrivare prima che il
// browser desse il permesso di suonare (sul tocco il permesso arriva quando
// il dito si ALZA, e il colpo parte quando scende), play() veniva rifiutato,
// e il codice segnava "i file mancano" per tutta la sessione — da li' in poi
// solo il tic del menu, cioe' i suoni di Resident Evil. Con i buffer
// decodificati nello stesso contesto dei suoni del menu, gia' sbloccato al
// primo tocco ovunque nell'app, il colpo parte sempre.
// "Mancano" si dice solo se il file risponde 404, non per un rifiuto a suonare.
const _colpi = COLPI.map(()=> null);
let _colpiMancano = false, _colpiInArrivo = null;
function caricaColpi(){
  if(_colpiInArrivo) return _colpiInArrivo;
  const ctx = getCtx();
  if(!ctx) return Promise.resolve();
  _colpiInArrivo = Promise.all(COLPI.map(async (url, i)=>{
    try{
      const r = await fetch(url);
      if(r.status === 404){ _colpiMancano = true; return; }
      if(!r.ok) return;
      _colpi[i] = await ctx.decodeAudioData(await r.arrayBuffer());
    }catch(e){}
  })).then(()=>{ if(!_colpi.some(Boolean)) _colpiInArrivo = null; });   // niente di caricato: si riprova la volta dopo
  return _colpiInArrivo;
}
function colpoDiMacchina(){
  if(!isSoundEnabled()) return;
  // Questo gesto ha gia' il suo suono: il tic che l'azione del tasto
  // chiederebbe dopo (un haptic('tap') nell'onclick) non deve sommarsi.
  _soundedGesture = _gesture;
  if(_colpiMancano){ emit('tap'); return; }
  const ctx = getCtx();
  if(!ctx){ return; }
  if(ctx.state === 'suspended') ctx.resume().catch(()=>{});
  const suona = ()=>{
    const pronti = _colpi.map((b, i)=> b ? i : -1).filter(i=> i >= 0);
    if(!pronti.length){ if(_colpiMancano) emit('tap'); return; }
    const i = pronti[Math.floor(Math.random() * pronti.length)];
    try{
      const src = ctx.createBufferSource();
      src.buffer = _colpi[i];
      // E OGNI COLPO UN FILO DIVERSO: una velocita' che varia del 6% in su o
      // in giu' cambia anche il tono, come due tasti veri che non suonano
      // mai uguali.
      src.playbackRate.value = 0.94 + Math.random() * 0.12;
      const g = ctx.createGain(); g.gain.value = VOLUMI[i];
      src.connect(g).connect(ctx.destination);
      src.start(0);
    }catch(e){}
  };
  if(_colpi.some(Boolean)) suona();
  else caricaColpi().then(suona);
}
// Si scaricano appena c'e' un tocco qualunque, come gli altri suoni: cosi' il
// primo colpo sulla barra e' gia' pronto.
['pointerdown','keydown'].forEach(ev=> window.addEventListener(ev, ()=> caricaColpi(), { once:true, passive:true }));
document.addEventListener('pointerdown', e=>{
  const t = e.target;
  if(t && t.closest && t.closest('.dune-nav-items > .dune-btn, .home-fab-row > .home-fab')) colpoDiMacchina();
}, { passive:true });

// ── RUMORI DI OGGETTI: IL WALKMAN, L'INTERRUTTORE ──
// Stessa strada dei colpi della macchina da scrivere: buffer decodificati
// nel contesto audio gia' sbloccato, non un new Audio() per conto suo.
// I rumori del walkman erano <audio> separati, e il 9 ottobre 2026 Giovanni,
// tornato sulla home da Visual Archive, ha messo in pausa la musica senza
// sentire il clac della pausa: sul telefono un <audio> nuovo che parte
// mentre l'altro (la musica) si ferma puo' essere zittito o rifiutato, e
// play() fallisce in silenzio. Il contesto WebAudio invece, ripreso a ogni
// tocco qui sotto, suona sopra qualunque cosa.
const _file = {};   // url -> AudioBuffer, o una Promise mentre arriva
function bufferDi(url){
  const ctx = getCtx();
  if(!ctx) return Promise.resolve(null);
  if(_file[url]) return Promise.resolve(_file[url]);
  return (_file[url] = fetch(url)
    .then(r=> r.ok ? r.arrayBuffer() : Promise.reject(r.status))
    .then(b=> ctx.decodeAudioData(b))
    .then(buf=> (_file[url] = buf))
    .catch(()=>{ delete _file[url]; return null; }));   // la prossima volta si riprova
}
// Scarica in anticipo, cosi' il primo tocco ha gia' il suono pronto.
export function preparaRumori(urls){ urls.forEach(u=> bufferDi(u)); }
// Per le prove: quali rumori sono stati chiesti, in ordine (vedi la suite
// navigazione, "i rumori del meccanismo").
export const __rumoriChiesti = [];
export function suonaRumore(url, volume = 1){
  if(!isSoundEnabled()) return;
  __rumoriChiesti.push(url.split('/').pop());
  const ctx = getCtx();
  if(!ctx) return;
  // Questo gesto ha il suo rumore: niente tic del menu in piu'.
  _soundedGesture = _gesture;
  if(ctx.state === 'suspended') ctx.resume().catch(()=>{});
  bufferDi(url).then(buf=>{
    if(!buf) return;
    try{
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain(); g.gain.value = volume;
      src.connect(g).connect(ctx.destination);
      src.start(0);
    }catch(e){}
  });
}
