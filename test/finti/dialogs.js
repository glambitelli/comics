// window.__risposta decide cosa scrive l'utente nel campo di testo.
export function promptModal(){ return Promise.resolve(window.__risposta || null); }
// window.__conferma decide la risposta: la prova sceglie se l'utente dice si'
// o no, invece di avere sempre lo stesso esito.
export function confirmModal(){ return Promise.resolve(!!window.__conferma); }
// Il menu non si disegna (qui non c'e' il CSS dei dialoghi) ma si REGISTRA:
// la prova puo' leggere le voci offerte e sceglierne una per nome, che e'
// tutto quello che le serve sapere. Prima era un no-op che restituiva null, e
// qualunque strada passasse da un menu contestuale — le categorie del
// ritaglio, i tag — risultava non verificabile dal banco del lettore.
export function actionMenu(anchor, actions){
  const voci = actions || [];
  window.__menu = voci.map(a=>a.label);
  window.__scegliVoce = (testo)=>{
    const a = voci.find(x=> new RegExp(testo, 'i').test(x.label));
    if(a) a.onSelect();
    return !!a;
  };
  return Promise.resolve(null);
}
export function closeActionMenu(){ window.__menu = null; }
