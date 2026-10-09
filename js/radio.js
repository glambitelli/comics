// ── LA RADIOLINA ────────────────────────────────────────────────────────────
//
// PERCHE' ESISTE. Giovanni disegna con la musica in cuffia, e per averla usa
// un altro browser perche' quello gli lascia suonare YouTube a telefono
// bloccato. Vuole la radio sul tavolo, dentro l'app (7 ottobre 2026).
//
// COSA NON SI PUO' FARE, e perche' questa e' la soluzione e non un ripiego:
// tenere in riproduzione un player di YouTube a schermo bloccato e' una
// funzione DEL BROWSER, che disattiva apposta la sospensione che tutti gli
// altri applicano. Una pagina non se la puo' dare da sola. E separare
// l'audio dal video e' vietato dai termini di YouTube.
//
// Un elemento <audio> normale invece suona a schermo bloccato e si fa
// comandare dalla schermata di blocco: e' la cosa che serviva davvero.
//
// DA DOVE ARRIVANO I BRANI: da una cartella su Drive, cioe' dalla nuvola di
// Giovanni. Nel repository non ci vanno — e' un sito pubblico, e metterci
// musica vorrebbe dire pubblicarla. L'app li legge, non li ospita.
//
// LA REGOLA DEL VOLUME DI LAVORO: la radio non e' il centro di questa
// schermata, e' una cosa accesa in sottofondo mentre si lavora. Quindi niente
// copertine, niente onde che ballano, niente elenco a tutto schermo: un
// mobiletto, cosa sta suonando, e i tre tasti che si premono senza guardare.
import { isSoundEnabled } from './sound.js';

// ── I RUMORI DEL MECCANISMO ──
// Tagliati da una registrazione di un lettore a cassette che Giovanni ha
// portato il 9 ottobre 2026 (sette secondi: la cassetta che entra, il tasto,
// il nastro che parte, lo stop). Quattro pezzi, uno per gesto:
//   cassetta — la prima accensione, quando la radio va a prendere i brani:
//              e' il momento in cui si "mette dentro la cassetta";
//   play     — il tasto che scende e il motore che si avvia;
//   stop     — il tasto della pausa, il clac del meccanismo che si ferma;
//   tasto    — il solo scatto del tasto, per avanti e indietro.
// Sono rumori del walkman e NON del menu dell'app: per questo non passano
// dal set di suoni scelto nelle impostazioni (non avrebbe senso un walkman
// che fa il suono di Final Fantasy). Ubbidiscono pero' all'interruttore dei
// suoni: spenti i suoni, il walkman suona la musica e basta.
// Volume a meta': sono stati normalizzati quasi a piena scala, e sopra la
// musica un clac a tutto volume fa sobbalzare.
const RUMORI = {
  cassetta: './sfx/walkman/cassetta.mp3',
  play:     './sfx/walkman/play.mp3',
  stop:     './sfx/walkman/stop.mp3',
  tasto:    './sfx/walkman/tasto.mp3',
};
const _rumori = {};
function meccanica(nome){
  if(!isSoundEnabled() || !RUMORI[nome]) return;
  try{
    let a = _rumori[nome];
    if(!a){ a = _rumori[nome] = new Audio(RUMORI[nome]); a.preload = 'auto'; a.volume = .5; }
    a.currentTime = 0;
    const p = a.play(); if(p && p.catch) p.catch(()=>{});
  }catch(e){}
}
// Il tasto del walkman vibra come gli altri tocchi, ma senza il "tic" del
// menu: il suono lo fa gia' il meccanismo (vedi anche isInteractive in
// sound.js, che esclude questi tre tasti dal tic diffuso).
function vibra(){ try{ if('vibrate' in navigator) navigator.vibrate(9); }catch(e){} }
// La prima volta che la musica parte dopo l'accensione, il motore si avvia:
// il rumore di "play" si aspetta lui, non il tocco, perche' fra il tocco e la
// musica c'e' Drive che scarica il brano.
let _motoreDaAvviare = false;
// ── MENTRE CARICA ──
// Avanti e indietro scaricano il brano nuovo da Drive, e per qualche secondo
// la radio sta in "carico". In quello stato il tasto arancione non aveva un
// posto suo e ripartiva dall'accensione: rumore della cassetta, il brano
// VECCHIO rimesso in play, e poi il nuovo che partiva sopra (Giovanni, 9
// ottobre 2026: "dopo avanti il tasto non funziona, comunque funziona male").
// Adesso:
//   - premendo avanti/indietro il nastro si ferma subito, come su un walkman
//     vero quando si manda avanti; si sente di nuovo solo col brano nuovo;
//   - il tasto arancione durante il caricamento dice "quando arriva, non
//     partire" (o, ripremuto, "parti"): _vuoleSuonare;
//   - _giro numera i caricamenti, e se ne arriva uno vecchio dopo uno nuovo
//     (due "avanti" di fila) quello vecchio si butta.
let _vuoleSuonare = true;
let _giro = 0;

const CHIAVE_BRANO = 'inkflow_radio_brano';
let _brani = [];        // [{ id, name }]
let _i = 0;             // quale si sta suonando
let _audio = null;
let _url = null;        // l'indirizzo temporaneo del Blob in corso
let _montata = false;
// spenta | carico | suona | pausa | scollegata | senzaCartella | vuota | errore
// QUATTRO MODI DI NON SUONARE, e vanno detti tutti e quattro. La prima
// versione li chiamava tutti "Drive non risponde": e Giovanni si e' trovato
// quella scritta con la cartella appena creata (7 ottobre 2026). Era vero
// solo in uno dei quattro casi, e negli altri tre diceva la cosa sbagliata
// da fare.
let _stato = 'spenta';

function el(id){ return document.getElementById(id); }
function titoloDi(b){
  // Il nome del file senza estensione e senza i numeri d'ordine davanti:
  // "03 - Bla.mp3" su una radiolina si legge "Bla".
  return (b && b.name || '').replace(/\.[a-z0-9]+$/i, '').replace(/^\s*\d+[\s._-]+/, '');
}

// IL TASTO DI MEZZO CAMBIA FACCIA: play quando e' ferma, pausa quando
// suona. Prima restava sempre un triangolo, e a radio accesa non c'era modo
// di capire dal tasto cosa avrebbe fatto premendolo (Giovanni, 7 ottobre).
const ICONA_PLAY  = '<svg viewBox="0 0 24 12" aria-hidden="true"><path d="M8 1v10l9-5z" fill="currentColor"/></svg>';
const ICONA_PAUSA = '<svg viewBox="0 0 24 12" aria-hidden="true"><path d="M7 1h3.5v10H7zM13.5 1H17v10h-3.5z" fill="currentColor"/></svg>';
function scrivi(){
  scriviTesto();
  const n = el('radio-nome');
  if(n) n.style.setProperty('--dur', Math.max(5, n.textContent.length * 0.42).toFixed(1) + 's');
}
function scriviTesto(){
  const n = el('radio-nome');
  const corpo = el('radio');
  if(!corpo) return;
  corpo.dataset.stato = _stato;
  const tasto = el('radio-onoff');
  if(tasto){
    const suona = _stato === 'suona';
    if(tasto.dataset.faccia !== (suona ? 'pausa' : 'play')){
      tasto.dataset.faccia = suona ? 'pausa' : 'play';
      tasto.innerHTML = suona ? ICONA_PAUSA : ICONA_PLAY;
    }
    tasto.setAttribute('aria-label', suona ? 'Pausa' : 'Play');
  }
  if(!n) return;
  if(_stato === 'scollegata'){ n.textContent = 'Tocca \u25B6 per collegare Drive'; return; }
  if(_stato === 'senzaCartella'){ n.textContent = 'Manca la cartella Inkflow Radio'; return; }
  if(_stato === 'vuota'){ n.textContent = 'Inkflow Radio e\u0300 vuota'; return; }
  // SENZA BRANI LA FESSURA E' VUOTA. C'era scritto "Radio", che su un walkman
  // spento e' un'etichetta in piu': tolta su richiesta di Giovanni (9
  // ottobre 2026). La fessura nera dice gia' che li' comparira' un titolo.
  if(_stato === 'spenta' && !_brani.length){ n.textContent = ''; return; }
  if(_stato === 'errore'){ n.textContent = 'Drive non risponde'; return; }
  if(_stato === 'carico'){ n.textContent = 'Carico…'; return; }
  n.textContent = titoloDi(_brani[_i]) || '';
}

// ── I COMANDI DELLA SCHERMATA DI BLOCCO ──
// Senza questi la musica suona ma a telefono bloccato non la si puo' fermare
// senza riaprire l'app — che e' esattamente il gesto che la radio doveva
// risparmiare.
function dilloAlTelefono(){
  if(!('mediaSession' in navigator)) return;
  const b = _brani[_i];
  try{
    navigator.mediaSession.metadata = new MediaMetadata({
      title: titoloDi(b) || 'Radio', artist: 'Inkflow', album: 'Dalla tua cartella Drive',
    });
    navigator.mediaSession.setActionHandler('play', ()=> suona());
    navigator.mediaSession.setActionHandler('pause', ()=> pausa());
    navigator.mediaSession.setActionHandler('nexttrack', ()=> avanti(1));
    navigator.mediaSession.setActionHandler('previoustrack', ()=> avanti(-1));
  }catch(e){ /* non supportato: la musica suona lo stesso */ }
}

function creaAudio(){
  if(_audio) return _audio;
  _audio = new Audio();
  _audio.preload = 'auto';
  // Finito un brano si passa al prossimo: una radio che si ferma dopo tre
  // minuti e' una radio che ti fa alzare dal tavolo.
  _audio.addEventListener('ended', ()=> avanti(1));
  _audio.addEventListener('playing', ()=>{
    if(_motoreDaAvviare){ _motoreDaAvviare = false; meccanica('play'); }
    _stato = 'suona'; scrivi();
  });
  _audio.addEventListener('pause', ()=>{ if(_stato === 'suona'){ _stato = 'pausa'; scrivi(); } });
  _audio.addEventListener('error', ()=>{ _stato = 'errore'; scrivi(); });
  return _audio;
}

async function carica(i){
  const d = await import('./drive.js');
  if(!_brani.length) return;
  _i = ((i % _brani.length) + _brani.length) % _brani.length;
  try{ localStorage.setItem(CHIAVE_BRANO, String(_i)); }catch(e){}
  const giro = ++_giro;
  if(_audio && !_audio.paused) _audio.pause();
  _stato = 'carico'; scrivi();
  try{
    const blob = await d.getDriveAudio(_brani[_i].id);
    if(giro !== _giro) return;            // nel frattempo e' partito un altro brano
    const a = creaAudio();
    // L'indirizzo di prima si butta: ogni Blob tenuto aperto e' memoria che
    // non torna piu' indietro finche' la pagina non si chiude.
    if(_url) URL.revokeObjectURL(_url);
    _url = URL.createObjectURL(blob);
    a.src = _url;
    dilloAlTelefono();
    if(!_vuoleSuonare){ _stato = 'pausa'; scrivi(); return; }
    await a.play();
  }catch(e){
    if(giro !== _giro) return;
    console.warn('radio:', e && e.message);
    _stato = 'errore'; scrivi();
  }
}

export async function accendi(){
  if(_brani.length){ return suona(); }
  const d = await import('./drive.js');
  _stato = 'carico'; scrivi();
  // PREMERE PLAY E' UNA RICHIESTA ESPLICITA, quindi qui si puo' chiedere il
  // gettone a Google — col rinnovo silenzioso, e se serve con la sua pagina.
  // E' la regola di ensureDriveConnected: niente parte da solo, ma un tasto
  // premuto apposta e' il permesso. Senza questo passaggio la radio guardava
  // solo il gettone gia' in tasca, e se era scaduto si fermava li'.
  const collegato = await d.ensureDriveConnected(true);
  if(!collegato){ _stato = 'scollegata'; scrivi(); return; }
  const r = await d.listDriveAudio();
  if(r.stato !== 'ok' || !r.files.length){
    _stato = r.stato === 'ok' ? 'vuota'
           : r.stato === 'senzaCartella' ? 'senzaCartella'
           : r.stato === 'spento' ? 'scollegata'
           : 'errore';
    scrivi();
    return;
  }
  _brani = r.files;
  let i = 0;
  try{ i = parseInt(localStorage.getItem(CHIAVE_BRANO) || '0', 10) || 0; }catch(e){}
  await carica(i);
}
export function suona(){
  if(!_brani.length) return accendi();
  const a = creaAudio();
  if(!a.src) return carica(_i);
  a.play().catch(()=>{});
}
export function pausa(){ if(_audio) _audio.pause(); }
export function spegni(){
  if(_audio){ _audio.pause(); _audio.removeAttribute('src'); _audio.load(); }
  if(_url){ URL.revokeObjectURL(_url); _url = null; }
  _stato = 'spenta'; scrivi();
}
export function avanti(passo){ if(_brani.length){ _vuoleSuonare = true; carica(_i + (passo || 1)); } }
export function statoRadio(){ return { stato:_stato, quanti:_brani.length, i:_i,
                                       titolo: titoloDi(_brani[_i]) }; }
// Per le prove: mette in tavola un elenco senza passare da Drive.
export function __seminaBrani(lista){ _brani = Array.isArray(lista) ? lista : []; _i = 0; scrivi(); }

export function montaRadio(){
  if(_montata) return;
  const corpo = el('radio');
  if(!corpo) return;
  _montata = true;
  el('radio-onoff').addEventListener('click', async ()=>{
    vibra();
    if(_stato === 'suona'){ meccanica('stop'); return pausa(); }
    if(_stato === 'pausa'){ meccanica('play'); _vuoleSuonare = true; return suona(); }
    // STA CARICANDO: il tasto dice solo se, quando il brano arriva, deve
    // partire o restare fermo. Niente cassetta, niente ripartenza.
    if(_stato === 'carico'){
      _vuoleSuonare = !_vuoleSuonare;
      meccanica(_vuoleSuonare ? 'play' : 'stop');
      return;
    }
    _vuoleSuonare = true;
    // Dalla prima accensione: la cassetta entra adesso, il motore partira'
    // quando arriva la musica.
    meccanica('cassetta');
    _motoreDaAvviare = true;
    // SCOLLEGATA: il rinnovo silenzioso non e' bastato, quindi si apre la
    // pagina di Google. Solo qui e solo su tocco: e' il gesto con cui si e'
    // detto "si', collegalo".
    if(_stato === 'scollegata'){
      try{ const d = await import('./drive.js'); await d.connectDrive(); }
      catch(e){ scrivi(); return; }
    }
    // Riprovando da zero: la cartella potrebbe essere stata creata adesso.
    if(_stato === 'senzaCartella' || _stato === 'vuota' || _stato === 'errore'
       || _stato === 'scollegata') _brani = [];
    accendi();
  });
  el('radio-prec').addEventListener('click', ()=>{ vibra(); meccanica('tasto'); avanti(-1); });
  el('radio-succ').addEventListener('click', ()=>{ vibra(); meccanica('tasto'); avanti(1); });
  scrivi();
}
// Per le prove: forza uno stato e ridisegna il vetrino, per controllare che
// ognuno dei modi di non suonare dica la cosa giusta.
export function __metti(stato){ _stato = stato; scrivi(); }
