export function haptic(){}
// L'annullamento e' la rete di sicurezza che ha preso il posto della finestra
// "sei sicuro?": la prova deve poterlo vedere offerto e poterlo usare.
export function showUndoToast(label, undoFn){
  window.__undo = { label, fn: undoFn };
}
export const projects = [];
export const currentId = null;
window.__projects = projects;   // per seminare i progetti dal banco

// Serve alle prove che caricano stats.js e evening.js: leggono un progetto per
// id e la memoria locale. Nel banco non c'e' nessun progetto, e va bene cosi'.
export function getProject(id){ return projects.find(p=> p.id === id); }
export function loadJSON(chiave, ripiego){
  try{ const v = localStorage.getItem(chiave); return v ? JSON.parse(v) : ripiego; }
  catch(e){ return ripiego; }
}
