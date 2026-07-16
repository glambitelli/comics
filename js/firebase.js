import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { loadJSON } from './state.js';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
         collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAF5S6pdwlMZ_Lezghu171EpwR2oWW6wbc",
  authDomain: "inkflow-95f2f.firebaseapp.com",
  storageBucket: "inkflow-95f2f.firebasestorage.app",
  projectId: "inkflow-95f2f",
  messagingSenderId: "323774526281",
  appId: "1:323774526281:web:a9365b3136435d69e66098"
};

const firebaseApp = initializeApp(firebaseConfig);
// Persistenza offline: i dati vivono in IndexedDB, l'app funziona senza rete
// e sincronizza da sola al ritorno della connessione. Multi-tab safe.
let _db;
try{
  _db = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
}catch(e){
  // Fallback (browser senza IndexedDB o init già avvenuta): cache in memoria
  _db = getFirestore(firebaseApp);
}
export const db = _db;
export const COL = 'projects';
const USER_DOC = 'inkflow_user_data';

// Re-export Firestore primitives per evitare importazioni CDN duplicate
export { collection, doc, onSnapshot, deleteDoc, setDoc, serverTimestamp };

// ── CACHE LOCALE PROGETTI — per avvio istantaneo ──
export function cacheProjects(projs){
  try{ localStorage.setItem('inkflow_projects_cache', JSON.stringify(projs)); }catch(e){}
}
export function getCachedProjects(){
  try{ return loadJSON('inkflow_projects_cache', []); }catch(e){ return []; }
}

export function syncDot(state){
  ['sync-dot','sync-dot-evening'].forEach(id=>{
    const d=document.getElementById(id); if(!d) return;
    d.className='sync-dot '+state;
  });
}

export function saveHint(msg){
  const h = document.getElementById('save-hint');
  if(h) h.textContent = msg;
}

let saveTimer = null;

export async function saveProject(p){
  syncDot('saving');
  saveHint('Salvataggio…');
  try{
    const {id, ...data} = p;
    await setDoc(doc(db, COL, id), {...data, updatedAt: serverTimestamp()});
    syncDot('ok');
    saveHint('Sincronizzato ☁️');
  } catch(e){
    syncDot('error');
    saveHint('Errore salvataggio');
    console.error(e);
  }
}

export function scheduleSave(p){
  clearTimeout(saveTimer);
  syncDot('saving');
  saveTimer = setTimeout(() => saveProject(p), 800);
}

export async function saveUserData(){
  try{
    const stars = parseInt(localStorage.getItem('inkflow_stars')||'0');
    const history = loadJSON('inkflow_task_history', []);
    const monthly = loadJSON('inkflow_monthly_stars', {});
    const streak = parseInt(localStorage.getItem('inkflow_streak')||'0');
    const streakLast = localStorage.getItem('inkflow_streak_last')||'';
    const localRev = parseInt(localStorage.getItem('inkflow_data_rev')||'0');
    await setDoc(doc(db, 'userdata', USER_DOC), { stars, history, monthly, streak, streakLast, dataRev: localRev, updatedAt: serverTimestamp() });
  } catch(e){ console.warn('saveUserData error:', e); }
}

export function loadUserData(){
  try{
    onSnapshot(doc(db, 'userdata', USER_DOC), snap => {
      if(snap.exists()){
        const data = snap.data();
        const localRev = parseInt(localStorage.getItem('inkflow_data_rev')||'0');
        const remoteRev = data.dataRev||0;

        // Se la revisione locale è più recente o uguale, NON sovrascrivere coi dati remoti.
        // Questo permette ai reset (che incrementano la revisione) di avere la precedenza.
        if(localRev > remoteRev) return;

        // Dati remoti più recenti (o prima sincronizzazione) → adotta i valori remoti as-is
        localStorage.setItem('inkflow_stars', data.stars||0);
        if(data.history) localStorage.setItem('inkflow_task_history', JSON.stringify(data.history));
        if(data.monthly) localStorage.setItem('inkflow_monthly_stars', JSON.stringify(data.monthly));
        if(data.streak!=null) localStorage.setItem('inkflow_streak', data.streak);
        if(data.streakLast) localStorage.setItem('inkflow_streak_last', data.streakLast);
        localStorage.setItem('inkflow_data_rev', remoteRev);

        const el = document.getElementById('stars-count');
        if(el) el.textContent = data.stars||0;
      }
    });
  } catch(e){ console.warn('loadUserData error:', e); }
}

// Incrementa la revisione dati — usa timestamp così cresce sempre, anche dopo reset
export function bumpDataRev(){
  const rev = Date.now();
  localStorage.setItem('inkflow_data_rev', String(rev));
  return rev;
}
