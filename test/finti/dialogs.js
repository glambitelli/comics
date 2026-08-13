export function promptModal(){ return Promise.resolve(null); }
// window.__conferma decide la risposta: la prova sceglie se l'utente dice si'
// o no, invece di avere sempre lo stesso esito.
export function confirmModal(){ return Promise.resolve(!!window.__conferma); }
export function actionMenu(){ return Promise.resolve(null); }
