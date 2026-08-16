// Drive finto "inerte": non collegato, nessuna rete. Le suite che provano
// davvero lo scaricamento usano finti/drive-lento.js.
export function getDriveAlbumFile(){ return Promise.resolve(null); }
export function ensureDriveConnected(){ return Promise.resolve(false); }
export function driveRangeFetch(){ return Promise.reject(new Error('niente Drive nel banco')); }
export function isDownloadCancelled(e){ return !!(e && e.cancelled); }
// Di norma "non configurato": la maggior parte delle prove non vuole vedere
// niente di Drive. Una prova che deve premere il pulsante lo accende con
// window.__driveConfigurato = true, e poi guarda __collegaChiesto per sapere
// se il tocco e' arrivato davvero fin qui.
export function isDriveConfigured(){ return window.__driveConfigurato === true; }
export function isDriveConnected(){ return false; }
export function connectDrive(){
  window.__collegaChiesto = (window.__collegaChiesto || 0) + 1;
  return Promise.resolve();
}
export function disconnectDrive(){}
export function driveAccountEmail(){ return null; }
export function onDriveAuthChange(){}
export function listDriveAlbumsForFolder(){ return Promise.resolve([]); }
export function initDriveAuth(){}
export function daRicollegare(){ return false; }
// Nell'app scarica la libreria di Google in anticipo (vedi prepareDriveAuth in
// js/drive.js). Qui non c'e' niente da scaricare, ma la funzione deve esistere:
// refs.js la chiama entrando nell'archivio.
export function prepareDriveAuth(){ return Promise.resolve(false); }
