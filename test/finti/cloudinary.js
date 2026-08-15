export function uploadToCloudinary(){ return Promise.resolve({ url:'' }); }
// Nel banco l'URL resta quello locale — un data: URL che il browser sa già
// caricare, mentre una vera trasformazione di Cloudinary non risponderebbe.
// La LARGHEZZA richiesta però si annota: è l'unico modo per verificare che una
// tavola chieda una sorgente più grande di un quadratino, senza rete.
export function cldResize(u, w){
  (window.__larghezze || (window.__larghezze = new Map())).set(u, w);
  return u;
}
