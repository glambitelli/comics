export let projects = [];
export let currentId = null;
export let deleteId = null;

export const PHASE_NAMES = ['Sviluppo','Pre-produzione','Realizzazione'];
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
export function haptic(kind='tap'){
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
