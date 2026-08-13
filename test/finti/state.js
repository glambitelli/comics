export function haptic(){}
// L'annullamento e' la rete di sicurezza che ha preso il posto della finestra
// "sei sicuro?": la prova deve poterlo vedere offerto e poterlo usare.
export function showUndoToast(label, undoFn){
  window.__undo = { label, fn: undoFn };
}
export const projects = [];
export const currentId = null;
window.__projects = projects;   // per seminare i progetti dal banco
