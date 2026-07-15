// ── COMPRESSIONE IMMAGINI LATO BROWSER ──
// Le reference vivono come data-URI dentro Firestore (niente Storage/Blaze):
// ridimensiona al lato lungo massimo e comprime in JPEG finché il risultato
// sta comodamente sotto il limite di 1MiB per documento di Firestore.
const MAX_DIM = 1600;      // lato lungo massimo in px
const MAX_BYTES = 650000;  // ~650KB binari → ~870KB in base64, con margine
const MIN_QUALITY = 0.35;

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

      let quality = 0.85;
      const tryEncode = ()=>{
        canvas.toBlob(blob=>{
          if(!blob){ reject(new Error('encode failed')); return; }
          if(blob.size <= MAX_BYTES || quality <= MIN_QUALITY){
            const reader = new FileReader();
            reader.onload = ()=> resolve({ dataUrl: reader.result, w: width, h: height, bytes: blob.size });
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          } else {
            quality = Math.max(MIN_QUALITY, quality - 0.12);
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
