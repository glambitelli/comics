// Drive finto "inerte": non collegato, nessuna rete. Le suite che provano
// davvero lo scaricamento usano finti/drive-lento.js.
export function getDriveAlbumFile(){ return Promise.resolve(null); }
export function ensureDriveConnected(){ return Promise.resolve(false); }
export function driveRangeFetch(){ return Promise.reject(new Error('niente Drive nel banco')); }
export function isDownloadCancelled(e){ return !!(e && e.cancelled); }
export function isDriveConfigured(){ return false; }
export function isDriveConnected(){ return false; }
export function connectDrive(){ return Promise.resolve(); }
export function disconnectDrive(){}
export function driveAccountEmail(){ return null; }
export function onDriveAuthChange(){}
export function listDriveAlbumsForFolder(){ return Promise.resolve([]); }
export function initDriveAuth(){}
export function daRicollegare(){ return false; }
