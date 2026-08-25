// SDK Firebase finto: espone i nomi che js/firebase.js importa dal CDN, con
// una Firestore che non fa niente. Serve alle MISURE di avvio, dove conta il
// costo del nostro codice e non quello della rete di Google.
export function initializeApp(){ return {}; }
export function getFirestore(){ return {}; }
export function initializeFirestore(){ return {}; }
export function persistentLocalCache(){ return {}; }
export function persistentMultipleTabManager(){ return {}; }
// Collezione e documento si portano dietro il nome: cosi' una prova puo'
// verificare da dove si legge e dove si scrive (serve al backup, che tocca
// sei collezioni diverse).
export function collection(_db, nome){ return { nome }; }
export function doc(_db, col, id){ return { col, id }; }
// Si annota CHI si mette in ascolto: serve a verificare che i dati non
// partano prima dell'accesso (vedi la suite accesso.js).
export function onSnapshot(ref){
  (window.__ascolti || (window.__ascolti = [])).push((ref && (ref.nome || ref.col)) || '?');
  return ()=>{};
}
export function setDoc(ref, data){
  (window.__scritture || (window.__scritture = [])).push({ col: ref && ref.col, id: ref && ref.id, data });
  return Promise.resolve();
}
export function deleteDoc(){ return Promise.resolve(); }
// L'archivio finto: window.__archivio = { collezione: { id: dati } }. Lo legge
// getDocs, cioe' il backup — l'unica parte dell'app che invece di restare in
// ascolto si prende tutto in una volta.
export function getDocs(ref){
  const arch = (window.__archivio || {})[ref && ref.nome] || {};
  return Promise.resolve({ docs: Object.keys(arch).map(id=> ({ id, data: ()=> arch[id] })) });
}
export function serverTimestamp(){ return 0; }
// La somma lato server: qui si annota e basta, cosi' una prova puo' verificare
// CHE COSA si e' chiesto di sommare (vedi il contatore delle ore in tempo.js).
export function increment(n){ return { __somma: n }; }
export function getDoc(){ return Promise.resolve({exists:()=>false}); }

// ── ACCESSO (js/auth.js) ──
// Un utente finto che si accende e si spegne: window.__utente = {uid, email…}
// prima dell'avvio, oppure entraConGoogle() dalla prova.
const _ascoltatori = [];
export function getAuth(){ return { currentUser: window.__utente || null }; }
export function GoogleAuthProvider(){}
export function setPersistence(){ return Promise.resolve(); }
export const browserLocalPersistence = {};
export function onAuthStateChanged(_a, cb){
  _ascoltatori.push(cb);
  setTimeout(()=> cb(window.__utente || null), 0);
  return ()=>{};
}
export function signInWithPopup(){
  window.__utente = window.__utenteDaEntrare ||
    { uid:'UID-DI-PROVA', email:'giovanni@example.com', displayName:'Giovanni' };
  _ascoltatori.forEach(cb=> cb(window.__utente));
  // LA RISPOSTA CHE SI PERDE. Sul telefono la finestra di Google e' una
  // finestra a parte, e mentre e' aperta il sistema puo' congelare o
  // ricaricare la pagina sotto: l'accesso riesce (Firebase se lo scrive, e i
  // suoi ascoltatori lo sanno) ma QUESTA promessa non si risolve mai, perche'
  // non c'e' piu' nessuno ad aspettarla. E' il caso in cui si restava
  // bloccati davanti a "Entra con Google", ed e' l'unico modo di provarlo.
  if(window.__popupSiPerde) return new Promise(()=>{});
  return Promise.resolve({ user: window.__utente });
}
export function signOut(){
  window.__utente = null;
  _ascoltatori.forEach(cb=> cb(null));
  return Promise.resolve();
}
