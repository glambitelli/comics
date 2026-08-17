export const db = {};
// La collezione porta con se' il proprio nome, per lo stesso motivo per cui il
// documento porta il suo: senza, una prova non potrebbe verificare da DOVE si
// sta leggendo (vedi il backup, che legge sei collezioni una per una).
export function collection(_db, nome){ return { nome }; }
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
// Le cancellazioni si annotano come le scritture: senza, una prova poteva solo
// verificare che l'app NON esplodesse cancellando, non che cancellasse davvero
// la cosa giusta (vedi la scelta multipla degli artisti in cartelle.js).
export function deleteDoc(ref){
  (window.__cancellati || (window.__cancellati = [])).push({ col: ref && ref.col, id: ref && ref.id });
  return Promise.resolve();
}
// L'archivio finto da cui legge getDocs: window.__archivio = { collezione: {id: dati} }.
// Serve al backup, che e' l'unica parte dell'app che LEGGE tutto in una volta
// invece di restare in ascolto.
export function getDocs(ref){
  const arch = (window.__archivio || {})[ref && ref.nome] || {};
  return Promise.resolve({
    docs: Object.keys(arch).map(id=> ({ id, data: ()=> arch[id] })),
  });
}
export function serverTimestamp(){ return 0; }
