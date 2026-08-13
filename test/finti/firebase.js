export const db = {};
export function collection(){ return {}; }
export function doc(){ return {}; }
export function onSnapshot(){ return ()=>{}; }
export function setDoc(){ return Promise.resolve(); }
export function deleteDoc(){ return Promise.resolve(); }
export function serverTimestamp(){ return 0; }

// I progetti salvati finiscono qui, cosi' la prova puo' guardare COSA e' stato
// creato promuovendo un'idea senza avere Firestore.
export function saveProject(p){
  window.__salvati = window.__salvati || [];
  window.__salvati.push(p);
  window.__projects && window.__projects.push(p);
  return Promise.resolve();
}
