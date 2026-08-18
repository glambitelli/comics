// Il caricamento vero non parte: si annota cosa sarebbe partito (il blob e il
// nome del file) e si restituisce un indirizzo riconoscibile. Serve alla
// rifilatura di un frammento, che deve poter dimostrare di aver scritto un
// indirizzo NUOVO sul documento vecchio — con un url vuoto non si distingueva
// niente da niente.
export function uploadToCloudinary(blob, nome){
  (window.__caricamenti || (window.__caricamenti = [])).push({ nome, tipo: blob && blob.type, peso: blob && blob.size });
  return Promise.resolve({ url: nome ? 'https://finto.cloudinary/' + nome : '' });
}
// Nel banco l'URL resta quello locale — un data: URL che il browser sa già
// caricare, mentre una vera trasformazione di Cloudinary non risponderebbe.
// La LARGHEZZA richiesta però si annota: è l'unico modo per verificare che una
// tavola chieda una sorgente più grande di un quadratino, senza rete.
export function cldResize(u, w){
  (window.__larghezze || (window.__larghezze = new Map())).set(u, w);
  return u;
}
