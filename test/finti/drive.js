// Drive finto "inerte": non collegato, nessuna rete. Le suite che provano
// davvero lo scaricamento usano finti/drive-lento.js.
export function getDriveAlbumFile(){ return Promise.resolve(null); }
// Come quella vera: torna se alla fine si e' collegati. Rispondeva sempre "no"
// a prescindere, e la sincronizzazione dello scaffale usciva subito — quindi
// nessuna prova poteva arrivare a vedere cosa succede QUANDO Drive c'e'.
export function ensureDriveConnected(){ return Promise.resolve(window.__driveCollegato === true); }
export function driveRangeFetch(){ return Promise.reject(new Error('niente Drive nel banco')); }
export function isDownloadCancelled(e){ return !!(e && e.cancelled); }
// Di norma "non configurato": la maggior parte delle prove non vuole vedere
// niente di Drive. Una prova che deve premere il pulsante lo accende con
// window.__driveConfigurato = true, e poi guarda __collegaChiesto per sapere
// se il tocco e' arrivato davvero fin qui.
export function isDriveConfigured(){ return window.__driveConfigurato === true; }
// Di norma NON collegato: e' lo stato in cui lo scaffale deve dire qualcosa.
// La prova che verifica il contrario — collegato, e quindi riga muta — lo
// accende con window.__driveCollegato = true.
export function isDriveConnected(){ return window.__driveCollegato === true; }
export function connectDrive(){
  window.__collegaChiesto = (window.__collegaChiesto || 0) + 1;
  return Promise.resolve();
}
export function disconnectDrive(){}
export function driveAccountEmail(){ return null; }
export function onDriveAuthChange(){}
// Torna { stato, files } come quella vera: 'ok' con l'elenco, 'senzaCartella'
// quando su Drive non esiste una cartella con quel nome. Le prove lo pilotano
// con window.__driveCartelle = { 'KON Satoshi': [ ...file ] }.
export function listDriveAlbumsForFolder(nome){
  const mappa = (typeof window !== 'undefined' && window.__driveCartelle) || null;
  if(!mappa) return Promise.resolve({ stato:'ok', files:[] });
  const chiave = Object.keys(mappa).find(k => k.trim().toLowerCase() === String(nome||'').trim().toLowerCase());
  if(!chiave) return Promise.resolve({ stato:'senzaCartella', files:[] });
  return Promise.resolve({ stato:'ok', files: mappa[chiave] || [] });
}
export function initDriveAuth(){}
// "Ricollega" invece di "Collega" a chi l'aveva gia' fatto una volta.
export function daRicollegare(){ return window.__driveGiaCollegato === true; }
// Nell'app scarica la libreria di Google in anticipo (vedi prepareDriveAuth in
// js/drive.js). Qui non c'e' niente da scaricare, ma la funzione deve esistere:
// refs.js la chiama entrando nell'archivio.
export function prepareDriveAuth(){ return Promise.resolve(false); }
export function resumeDriveConnect(){ return Promise.resolve(false); }
export function ascoltaRientroDrive(){}

// C'e' gia' in casa? Nel banco no, se non lo dice la prova: window.__inCasa e'
// il file gia' scaricato che si trova senza passare da Google.
export function albumGiaScaricato(){ return Promise.resolve(window.__inCasa || null); }
