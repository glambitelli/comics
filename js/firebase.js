import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAF5S6pdwlMZ_Lezghu171EpwR2oWW6wbc",
  authDomain: "inkflow-95f2f.firebaseapp.com",
  projectId: "inkflow-95f2f",
  storageBucket: "inkflow-95f2f.firebasestorage.app",
  messagingSenderId: "323774526281",
  appId: "1:323774526281:web:a9365b3136435d69e66098"
};

const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
export const COL = 'projects';
const USER_DOC = 'inkflow_user_data';

// Re-export Firestore primitives per evitare importazioni CDN duplicate
export { collection, doc, onSnapshot, deleteDoc, setDoc };

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
    const history = JSON.parse(localStorage.getItem('inkflow_task_history')||'[]');
    const monthly = JSON.parse(localStorage.getItem('inkflow_monthly_stars')||'{}');
    const streak = parseInt(localStorage.getItem('inkflow_streak')||'0');
    const streakLast = localStorage.getItem('inkflow_streak_last')||'';
    await setDoc(doc(db, 'userdata', USER_DOC), { stars, history, monthly, streak, streakLast, updatedAt: serverTimestamp() });
  } catch(e){ console.warn('saveUserData error:', e); }
}

export function loadUserData(){
  try{
    onSnapshot(doc(db, 'userdata', USER_DOC), snap => {
      if(snap.exists()){
        const data = snap.data();
        const localStars = parseInt(localStorage.getItem('inkflow_stars')||'0');
        const remoteStars = data.stars||0;
        const stars = Math.max(localStars, remoteStars);
        localStorage.setItem('inkflow_stars', stars);
        if(data.history) localStorage.setItem('inkflow_task_history', JSON.stringify(data.history));
        if(data.monthly){
          const localMonthly = JSON.parse(localStorage.getItem('inkflow_monthly_stars')||'{}');
          const merged = {...data.monthly};
          Object.entries(localMonthly).forEach(([k,v])=>{ merged[k]=Math.max(merged[k]||0,v); });
          localStorage.setItem('inkflow_monthly_stars', JSON.stringify(merged));
        }
        const el = document.getElementById('stars-count');
        if(el) el.textContent = stars;
      }
    });
  } catch(e){ console.warn('loadUserData error:', e); }
}
