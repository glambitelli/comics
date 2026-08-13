// SDK Firebase finto: espone i nomi che js/firebase.js importa dal CDN, con
// una Firestore che non fa niente. Serve alle MISURE di avvio, dove conta il
// costo del nostro codice e non quello della rete di Google.
export function initializeApp(){ return {}; }
export function getFirestore(){ return {}; }
export function initializeFirestore(){ return {}; }
export function persistentLocalCache(){ return {}; }
export function persistentMultipleTabManager(){ return {}; }
export function collection(){ return {}; }
export function doc(){ return {}; }
export function onSnapshot(){ return ()=>{}; }
export function setDoc(){ return Promise.resolve(); }
export function deleteDoc(){ return Promise.resolve(); }
export function serverTimestamp(){ return 0; }
export function getDoc(){ return Promise.resolve({exists:()=>false}); }
