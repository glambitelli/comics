export const db = {};
// La collezione porta con se' il proprio nome, per lo stesso motivo per cui il
// documento porta il suo: senza, una prova non potrebbe verificare da DOVE si
// sta leggendo (vedi il backup, che legge sei collezioni una per una).
export function collection(_db, nome){ return { nome }; }
// Il riferimento porta con sé collezione e id: senza, una prova non può
// verificare COSA si sta scrivendo e SU QUALE documento — e restava scoperto
// tutto il lato "scrittura" della galleria.
export function doc(_db, col, id){ return { col, id }; }
// Chi si mette in ascolto, e su quale collezione. Serve a una prova precisa:
// le Scene leggevano le immagini senza leggere le CARTELLE, e ogni cartella
// finiva col ripiego "Senza cartella" — un'immagine sa dove sta, ma il nome
// della cartella e' nell'altra collezione.
export function onSnapshot(ref){
  (window.__ascolti || (window.__ascolti = [])).push(ref && ref.nome);
  return ()=>{};
}
// Nell'app vera la modifica torna indietro dal listener onSnapshot, che
// aggiorna la cache locale e ridisegna. Qui il listener non c'è: le scritture
// si accumulano in window.__scritture, e chi vuole l'eco se la applica a mano
// (vedi la suite tavole.js).
// Con window.__rifiuta impostato al nome di una collezione, la scrittura viene
// RIFIUTATA come farebbe una regola di sicurezza di Firestore. Serve a provare
// che il tempo gia' contato non sparisca quando il server dice di no: e' il
// caso in cui il difetto non si vede — nessun errore a schermo, solo un numero
// che torna indietro da solo.
export function setDoc(ref, data){
  const col = ref && ref.col;
  if(window.__rifiuta && window.__rifiuta === col){
    return Promise.reject(new Error('permission-denied'));
  }
  (window.__scritture || (window.__scritture = [])).push({ col, id: ref && ref.id, data });
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

// I moduli dei progetti (pipeline, velocity, story, home) non scrivono
// direttamente: chiedono un salvataggio differito. Qui si annota chi l'ha
// chiesto e per quale progetto — cosi' una prova puo' verificare che una
// modifica venga davvero messa in salvo, senza toccare la rete.
export const COL = 'projects';
export function scheduleSave(p){
  (window.__salvataggi || (window.__salvataggi = [])).push(p && p.id);
  return Promise.resolve();
}
export function saveProject(p){
  (window.__salvataggi || (window.__salvataggi = [])).push(p && p.id);
  return Promise.resolve();
}
export function syncDot(){}
export function saveHint(){}
export function cacheProjects(){}
export function getCachedProjects(){ return []; }
export function loadUserData(){}
export function saveUserData(){ return Promise.resolve(); }
export function bumpDataRev(){}

// La somma lato server: nel banco si annota e basta, cosi' una prova puo'
// verificare CHE COSA si e' chiesto di sommare (vedi il contatore delle ore).
export function increment(n){ return { __somma: n }; }
// Come increment, ma per un elenco: AGGIUNGE una voce invece di riscrivere
// l'array. Serve alle sedute del cronometro dentro la riga del giorno.
export function arrayUnion(...v){ return { __aggiungi: v }; }
