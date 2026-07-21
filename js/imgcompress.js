// ── COMPRESSIONE IMMAGINI LATO BROWSER ──
// Le immagini vanno su Cloudinary (25GB), non più dentro i documenti Firestore:
// niente più tetto rigido a 650KB. Ridimensiono comunque per velocità di
// caricamento da mobile e per non sprecare spazio con originali enormi,
// ma con margini molto più larghi — qualità decisamente migliore di prima.
const MAX_DIM = 2000;       // lato lungo massimo in px
const MAX_BYTES = 1400000;  // ~1.4MB, ben sotto il limite Cloudinary di 10MB/immagine
const MIN_QUALITY = 0.5;

export function compressImageFile(file){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = ()=>{
      URL.revokeObjectURL(objUrl);
      let { width, height } = img;
      if(width > MAX_DIM || height > MAX_DIM){
        if(width >= height){ height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
        else { width = Math.round(width * MAX_DIM / height); height = MAX_DIM; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      let quality = 0.9;
      const tryEncode = ()=>{
        canvas.toBlob(blob=>{
          if(!blob){ reject(new Error('encode failed')); return; }
          if(blob.size <= MAX_BYTES || quality <= MIN_QUALITY){
            resolve({ blob, w: width, h: height, bytes: blob.size });
          } else {
            quality = Math.max(MIN_QUALITY, quality - 0.1);
            tryEncode();
          }
        }, 'image/jpeg', quality);
      };
      tryEncode();
    };
    img.onerror = ()=>{ URL.revokeObjectURL(objUrl); reject(new Error('immagine non valida')); };
    img.src = objUrl;
  });
}

// Converte un data-URI (vecchio formato, salvato dentro Firestore) in Blob,
// serve solo per la migrazione una tantum verso Cloudinary.
export function dataUrlToBlob(dataUrl){
  const [head, b64] = dataUrl.split(',');
  const mime = /data:(.*?);base64/.exec(head)[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], {type: mime});
}
