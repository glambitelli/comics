// Finto refs.js per il banco del LETTORE: albums.js ne importa una manciata di
// funzioni (cartella attiva, destinazioni del ritaglio, schede degli albi) che
// nel banco non devono parlare con Firestore. Quello che serve pilotarlo dalla
// prova si legge da window, così ogni suite decide il suo scenario.
export function addRefBlob(){ return Promise.resolve('id'); }
export function getActiveFolderId(){ return window.__folderId || null; }
export function findExactAlbumMatch(){ return null; }
export function createAlbumDoc(){ return Promise.resolve(null); }
export function updateAlbumLastPage(){}
export function updateAlbumSourceName(){}
export function getAlbumById(){ return window.__album || null; }
export function findAlbumByDriveId(){ return null; }
export function clipDestinations(){ return window.__dests || []; }
export function clipCategories(){ return window.__cats || []; }
export function getFolderName(){ return ''; }
export function rememberClipDest(){}
