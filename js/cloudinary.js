// ── UPLOAD CLOUDINARY (unsigned, senza backend) ──
// Cloud name e preset sono valori pubblici per design del prodotto: l'unsigned
// upload preset è pensato apposta per essere chiamato da codice client-side
// senza esporre nessuna chiave segreta.
const CLOUD_NAME = 'le3bzkm8';
const UPLOAD_PRESET = 'xre84ndp';
const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
const DESTROY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`;

// Carica un Blob/File su Cloudinary. Ritorna { url, publicId, deleteToken }.
// deleteToken è valido solo 10 minuti (limite di Cloudinary per le unsigned
// destroy) — serve per poter davvero cancellare il file se ci si pente subito.
export async function uploadToCloudinary(blob, filename='ref.jpg'){
  const fd = new FormData();
  fd.append('file', blob, filename);
  fd.append('upload_preset', UPLOAD_PRESET);
  fd.append('folder', 'inkflow-refs');
  fd.append('return_delete_token', 'true');
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
    deleteToken: data.delete_token || null,
    deleteTokenExpiresAt: data.delete_token ? Date.now() + 9*60*1000 : 0, // margine di sicurezza sotto i 10'
  };
}

// Cancellazione "best effort": funziona solo entro la finestra dei 10 minuti
// dal caricamento (limite di Cloudinary per le destroy non firmate). Fuori da
// quella finestra non fa nulla — l'immagine resta su Cloudinary ma sparisce
// comunque da Inkflow, dato che l'unica fonte di verità per l'app è Firestore.
export async function tryDestroyCloudinaryImage(deleteToken){
  if(!deleteToken) return false;
  try{
    const fd = new FormData();
    fd.append('token', deleteToken);
    const res = await fetch(DESTROY_URL, {method:'POST', body: fd});
    if(!res.ok) return false;
    const data = await res.json();
    return data.result === 'ok';
  }catch(e){
    return false;
  }
}
