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
import { haptic } from './state.js';

const CHIAVE_BRANO = 'inkflow_radio_brano';
let _brani = [];        // [{ id, name }]
let _i = 0;             // quale si sta suonando
let _audio = null;
let _url = null;        // l'indirizzo temporaneo del Blob in corso
let _montata = false;
let _stato = 'spenta';  // spenta | carico | suona | pausa | vuota | errore

function el(id){ return document.getElementById(id); }
function titoloDi(b){
  // Il nome del file senza estensione e senza i numeri d'ordine davanti:
  // "03 - Bla.mp3" su una radiolina si legge "Bla".
  return (b && b.name || '').replace(/\.[a-z0-9]+$/i, '').replace(/^\s*\d+[\s._-]+/, '');
}

function scrivi(){
  const n = el('radio-nome');
  const corpo = el('radio');
  if(!corpo) return;
  corpo.dataset.stato = _stato;
  if(!n) return;
  if(_stato === 'vuota'){ n.textContent = 'Nessun brano in Drive'; return; }
  if(_stato === 'spenta' && !_brani.length){ n.textContent = 'Radio'; return; }
  if(_stato === 'errore'){ n.textContent = 'Drive non risponde'; return; }
  if(_stato === 'carico'){ n.textContent = 'Carico…'; return; }
  n.textContent = titoloDi(_brani[_i]) || 'Radio';
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
  _audio.addEventListener('playing', ()=>{ _stato = 'suona'; scrivi(); });
  _audio.addEventListener('pause', ()=>{ if(_stato === 'suona'){ _stato = 'pausa'; scrivi(); } });
  _audio.addEventListener('error', ()=>{ _stato = 'errore'; scrivi(); });
  return _audio;
}

async function carica(i){
  const d = await import('./drive.js');
  if(!_brani.length) return;
  _i = ((i % _brani.length) + _brani.length) % _brani.length;
  try{ localStorage.setItem(CHIAVE_BRANO, String(_i)); }catch(e){}
  _stato = 'carico'; scrivi();
  try{
    const blob = await d.getDriveAudio(_brani[_i].id);
    const a = creaAudio();
    // L'indirizzo di prima si butta: ogni Blob tenuto aperto e' memoria che
    // non torna piu' indietro finche' la pagina non si chiude.
    if(_url) URL.revokeObjectURL(_url);
    _url = URL.createObjectURL(blob);
    a.src = _url;
    await a.play();
    dilloAlTelefono();
  }catch(e){
    console.warn('radio:', e && e.message);
    _stato = 'errore'; scrivi();
  }
}

export async function accendi(){
  if(_brani.length){ return suona(); }
  const d = await import('./drive.js');
  _stato = 'carico'; scrivi();
  const r = await d.listDriveAudio();
  if(r.stato !== 'ok' || !r.files.length){
    _stato = r.stato === 'ok' ? 'vuota' : 'errore';
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
export function avanti(passo){ if(_brani.length) carica(_i + (passo || 1)); }
export function statoRadio(){ return { stato:_stato, quanti:_brani.length, i:_i,
                                       titolo: titoloDi(_brani[_i]) }; }
// Per le prove: mette in tavola un elenco senza passare da Drive.
export function __seminaBrani(lista){ _brani = Array.isArray(lista) ? lista : []; _i = 0; scrivi(); }

export function montaRadio(){
  if(_montata) return;
  const corpo = el('radio');
  if(!corpo) return;
  _montata = true;
  el('radio-onoff').addEventListener('click', ()=>{
    haptic('tap');
    if(_stato === 'suona') pausa();
    else if(_stato === 'pausa') suona();
    else accendi();
  });
  el('radio-prec').addEventListener('click', ()=>{ haptic('tap'); avanti(-1); });
  el('radio-succ').addEventListener('click', ()=>{ haptic('tap'); avanti(1); });
  scrivi();
}
