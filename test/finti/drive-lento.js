// Drive finto che scarica DAVVERO, a pezzi e lentamente, rispettando il
// segnale di annullamento: serve alle prove sul pulsante "Annulla".
export function ensureDriveConnected(){ return Promise.resolve(true); }
export function driveRangeFetch(){ return Promise.reject(new Error('niente Range nel banco')); }
export function isDownloadCancelled(e){ return !!(e && e.cancelled); }
export function getDriveAlbumFile(meta, onProgress, signal){
  window.__dl = { avviato: true, annullato: false, signal };
  return new Promise((res, rej)=>{
    let loaded = 0;
    const total = 50 * 1048576;
    const t = setInterval(()=>{
      loaded += 2 * 1048576;
      if(onProgress) onProgress(loaded, total);
      if(loaded >= total){ clearInterval(t); res({ file: window.__fakeFile, fromCache:false }); }
    }, 60);
    if(signal) signal.addEventListener('abort', ()=>{
      clearInterval(t);
      window.__dl.annullato = true;
      const e = new Error('Scaricamento annullato.'); e.cancelled = true;
      rej(e);
    }, { once:true });
  });
}
