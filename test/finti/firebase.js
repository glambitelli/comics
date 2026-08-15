export const db = {};
export function collection(){ return {}; }
// Il riferimento porta con sé collezione e id: senza, una prova non può
// verificare COSA si sta scrivendo e SU QUALE documento — e restava scoperto
// tutto il lato "scrittura" della galleria.
export function doc(_db, col, id){ return { col, id }; }
export function onSnapshot(){ return ()=>{}; }
// Nell'app vera la modifica torna indietro dal listener onSnapshot, che
// aggiorna la cache locale e ridisegna. Qui il listener non c'è: le scritture
// si accumulano in window.__scritture, e chi vuole l'eco se la applica a mano
// (vedi la suite tavole.js).
export function setDoc(ref, data){
  (window.__scritture || (window.__scritture = [])).push({ col: ref && ref.col, id: ref && ref.id, data });
  return Promise.resolve();
}
export function deleteDoc(){ return Promise.resolve(); }
export function serverTimestamp(){ return 0; }
