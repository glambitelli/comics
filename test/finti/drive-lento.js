// Drive finto che scarica DAVVERO, a pezzi e lentamente, rispettando il
// segnale di annullamento: serve alle prove sul pulsante "Annulla".
// Di norma collegato. Le prove sull'apertura senza rete lo spengono con
// window.__senzaRete: da li' in poi il collegamento risponde di no, come
// succede quando la linea non c'e'.
export function ensureDriveConnected(){
  window.__collegamentiChiesti = (window.__collegamentiChiesti || 0) + 1;
  return Promise.resolve(!window.__senzaRete);
}
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

// C'e' gia' in casa? Nel banco no, se non lo dice la prova: window.__inCasa e'
// il file gia' scaricato che si trova senza passare da Google.
export function albumGiaScaricato(){ return Promise.resolve(window.__inCasa || null); }
