// ── UPLOAD CLOUDINARY (unsigned, senza backend) ──
// Cloud name e preset sono valori pubblici per design del prodotto: l'unsigned
// upload preset è pensato apposta per essere chiamato da codice client-side
// senza esporre nessuna chiave segreta.
const CLOUD_NAME = 'le3bzkm8';
const UPLOAD_PRESET = 'xre84ndp';
const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

// Carica un Blob/File su Cloudinary. Ritorna { url, publicId }.
// Nota: la cancellazione "vera" lato Cloudinary richiederebbe il parametro
// return_delete_token, che questo account/preset non permette per gli upload
// unsigned — quindi l'eliminazione da Inkflow rimuove sempre e solo il
// riferimento su Firestore (unica fonte di verità per l'app). Il file resta
// su Cloudinary come orfano, irrilevante con 25GB a disposizione.
export async function uploadToCloudinary(blob, filename='ref.jpg'){
  const fd = new FormData();
  fd.append('file', blob, filename);
  fd.append('upload_preset', UPLOAD_PRESET);
  fd.append('asset_folder', 'inkflow-refs');
  const res = await fetch(UPLOAD_URL, {method:'POST', body: fd});
  if(!res.ok){
    const txt = await res.text().catch(()=> '');
    let msg = txt;
    try{ const j = JSON.parse(txt); if(j && j.error && j.error.message) msg = j.error.message; }catch(e){}
    throw new Error('Cloudinary ('+res.status+'): '+msg);
  }
  const data = await res.json();
  return {
    url: data.secure_url,
    publicId: data.public_id,
  };
}

// ── TRASFORMAZIONI AL VOLO ──
// Cloudinary genera (e mette in cache CDN) una variante ridimensionata e
// ricompressa dello stesso file, senza toccare l'originale: basta inserire i
// parametri nell'URL. q_auto sceglie la qualità più bassa che resta
// indistinguibile, f_auto il formato più leggero che il browser richiedente
// supporta (WebP/AVIF invece di JPEG). Prima ogni miniatura scaricava e
// decodificava l'originale intero — misurato, una cartella di 40 ritagli
// mostrati a 90px scaricava 38 MB per un risultato che ne pesa ~1.
// Passa attraverso INVARIATO qualunque URL non riconosciuto (es. i data:
// non ancora migrati): sempre sicura da chiamare, anche su input inatteso.
export function cldResize(url, w){
  if(typeof url !== 'string') return url;
  const marker = '/upload/';
  const i = url.indexOf(marker);
  if(i === -1 || !url.includes('res.cloudinary.com')) return url;
  const t = w ? `c_limit,w_${w},q_auto,f_auto` : 'q_auto,f_auto';
  return url.slice(0, i + marker.length) + t + '/' + url.slice(i + marker.length);
}
