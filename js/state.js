import { playSfx } from './sound.js';

export let projects = [];
export let currentId = null;
export let deleteId = null;

export const PHASE_NAMES = ['Sviluppo','Pre-produzione','Realizzazione'];

// ── GLI STEP DI UN PROGETTO, IN UN POSTO SOLO ────────────────────────────────
// Prima non esisteva questo elenco, e tre file lo indovinavano ciascuno a modo
// suo. La chiave con cui una spunta finiva nel progetto era IL TESTO VISIBILE
// troncato a trenta caratteri — tag compreso, quindi "Soggetto mattina" e non
// "Soggetto". Da li' tre difetti veri:
//
//   · il report PDF cercava p.steps['Soggetto'], ['Moodboard visiva'],
//     ['Layouts']… chiavi che non esistono mai. La sezione Pipeline del
//     documento che mandi fuori risultava SEMPRE tutta da fare.
//   · la percentuale del progetto divideva per 5 step quando erano sette,
//     quindi era gonfiata.
//   · il badge "Fase 1 completata" scattava a tre caselle su cinque, e alla
//     quarta tornava indietro a "in corso".
//
// Adesso l'elenco e' questo, l'id e' stabile e non dipende da cosa c'e'
// scritto a schermo: cambiare una parola nell'interfaccia non perde piu' le
// spunte di nessuno. `vecchiaChiave` serve solo a ritrovare le spunte gia'
// salvate col testo (vedi migraSteps) e non va usata per altro.
export const STEPS = [
  { id:'moodboard',  fase:1, nome:'Moodboard',          vecchiaChiave:'Moodboard sera' },
  { id:'soggetto',   fase:1, nome:'Soggetto',           vecchiaChiave:'Soggetto mattina' },
  { id:'personaggi', fase:1, nome:'Personaggi',         vecchiaChiave:'Personaggi mattina' },
  { id:'ambiente',   fase:1, nome:'Ambientazione',      vecchiaChiave:'Ambientazione mattina' },
  { id:'struttura',  fase:1, nome:'Struttura a 3 atti', vecchiaChiave:'Struttura a 3 atti mattina' },
  { id:'layouts',    fase:2, nome:'Layouts',            vecchiaChiave:'Layouts sera' },
  { id:'reference',  fase:2, nome:'Reference',          vecchiaChiave:'Reference mattina' },
];

export function stepDiFase(fase){ return STEPS.filter(s => s.fase === fase); }
// Quante spunte ha questo progetto, contate SULL'ELENCO e non su quello che
// c'e' a schermo: i conti devono venire uguali anche se la schermata del
// progetto non e' aperta (il report, per esempio, si genera dalla home).
export function stepFatti(p, fase){
  const quali = fase ? stepDiFase(fase) : STEPS;
  return quali.filter(s => !!(p.steps && p.steps[s.id])).length;
}

// LE SPUNTE GIA' SALVATE NON SI PERDONO. Chi usa Inkflow da mesi ha in archivio
// le chiavi vecchie: alla prima apertura del progetto si ricopiano sugli id.
// Le vecchie si lasciano dove sono — non danno fastidio, e toglierle vorrebbe
// dire che un ripristino da un backup di ieri le farebbe sparire davvero.
// Torna true se ha spostato qualcosa, cosi' chi chiama sa che deve salvare.
export function migraSteps(p){
  if(!p || !p.steps) return false;
  let cambiato = false;
  for(const s of STEPS){
    if(p.steps[s.id] === undefined && p.steps[s.vecchiaChiave] === true){
      p.steps[s.id] = true;
      cambiato = true;
    }
  }
  return cambiato;
}
export const PROJECT_PALETTE = [
  {emoji:'🌊',bg:'#4ab8d8',light:'#d0eefc'},
  {emoji:'🔥',bg:'#e84848',light:'#fde0dc'},
  {emoji:'⚡',bg:'#d4a800',light:'#fdf0b0'},
  {emoji:'🌿',bg:'#48a848',light:'#c8ecc8'},
  {emoji:'🌸',bg:'#f06858',light:'#fde8e4'},
  {emoji:'🎯',bg:'#2a88b8',light:'#d0e8f8'},
  {emoji:'🍊',bg:'#e89020',light:'#fdecc8'},
  {emoji:'🌙',bg:'#6888b8',light:'#d8e4f4'},
];

export function getProject(id){ return projects.find(p => p.id === id); }
export function setProjects(arr){ projects = arr; }
export function setCurrentId(id){ currentId = id; }
export function setDeleteId(id){ deleteId = id; }

// ── FEEDBACK APTICO — vibrazione breve sui gesti chiave (mobile) ──
// tap: conferma leggera · done: completamento step/tavola · reward: stella serale
// Feedback unico dell'app: vibrazione + suono d'interfaccia, guidati dallo
// stesso "intento". Agganciare qui il suono copre in un colpo tutti i punti
// che già chiamano haptic(), senza disseminare chiamate audio nel codice.
export function haptic(kind='tap'){
  try{ playSfx(kind); }catch(e){}
  if(!('vibrate' in navigator)) return;
  try{
    if(kind==='reward') navigator.vibrate([14,70,20]);
    else if(kind==='done') navigator.vibrate(18);
    else navigator.vibrate(9);
  }catch(e){}
}

// ── LETTURA SICURA DA LOCALSTORAGE — un dato corrotto non deve rompere una schermata ──
export function loadJSON(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    if(raw === null || raw === undefined) return fallback;
    const val = JSON.parse(raw);
    return val === null ? fallback : val;
  }catch(e){
    return fallback;
  }
}

// ── TOAST "ANNULLA" — rete di sicurezza per le eliminazioni ──
let _undoTimer=null;
export function showUndoToast(label, undoFn){
  let t=document.getElementById('undo-toast');
  if(!t){
    t=document.createElement('div');
    t.id='undo-toast';
    t.innerHTML='<span id="undo-toast-lbl"></span><button id="undo-toast-btn">Annulla</button>';
    document.body.appendChild(t);
  }
  t.querySelector('#undo-toast-lbl').textContent=label;
  t.querySelector('#undo-toast-btn').onclick=()=>{ clearTimeout(_undoTimer); t.classList.remove('show'); try{undoFn();}catch(e){} };
  t.classList.add('show');
  clearTimeout(_undoTimer);
  _undoTimer=setTimeout(()=>t.classList.remove('show'), 5000);
}
