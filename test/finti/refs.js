// Finto refs.js per il banco del LETTORE: albums.js ne importa una manciata di
// funzioni (cartella attiva, destinazioni del ritaglio, schede degli albi) che
// nel banco non devono parlare con Firestore. Quello che serve pilotarlo dalla
// prova si legge da window, così ogni suite decide il suo scenario.
// Il caricamento vero non c'è, ma l'AVANZAMENTO sì: window.__salita dice a
// quanti passi farlo salire, così la prova può guardare cosa scrive il lettore
// nel banner mentre spedisce. Ogni chiamata lascia traccia in window.__salvati.
export function addRefBlob(blob, opts = {}){
  window.__salvati = (window.__salvati || 0) + 1;
  window.__ultimoSalvato = { w: opts.w, h: opts.h, byte: blob && blob.size, quando: performance.now(),
                             tavola: !!opts.tavola };
  const passi = window.__salita || 0;
  if(!passi || !opts.onProgress) return Promise.resolve('id');
  const totale = 1000;
  return new Promise(risolvi=>{
    let i = 0;
    const t = setInterval(()=>{
      i++;
      opts.onProgress(Math.round(totale * i / passi), totale);
      if(i >= passi){ clearInterval(t); risolvi('id'); }
    }, 30);
  });
}
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
