// ── LE FRECCE ACCANTO ALL'IMMAGINE ──────────────────────────────────────────
//
// Le frecce per passare da un'immagine all'altra stavano inchiodate ai bordi
// della finestra (left:2px / right:4px). Su un telefono non si vedono nemmeno
// — li' si sfoglia col dito — ma col mouse, su uno schermo largo, una tavola
// verticale occupa una striscia in mezzo e le frecce restavano a venti
// centimetri da li': per cambiare pagina si attraversava mezzo schermo.
// Segnalato da Giovanni il 21 settembre 2026.
//
// Adesso si accostano al bordo dell'immagine. Un posto solo per tutti e due i
// lettori — la galleria dei riferimenti e il lettore degli albi — perche' e'
// la stessa regola, e due copie della stessa regola si disallineano al primo
// ritocco.
//
// QUANDO NON C'E' POSTO FUORI, la freccia resta dov'era: su un'immagine
// orizzontale che riempie la finestra il bordo dell'immagine E' il bordo
// dello schermo, e spingere la freccia piu' in la' la manderebbe fuori
// vista. In quel caso si appoggia sopra l'immagine, che e' quello che
// faceva da sempre.
const LARGO = 44;   // il tondo della freccia, vedi .refs-lightbox-nav / .ar-nav
const ARIA  = 12;   // quanto sta staccata dal bordo dell'immagine

export function accostaFrecce(img, prev, next){
  if(!img || !prev || !next) return;
  // Il contenitore rispetto a cui sono posizionate (position:absolute):
  // misurare rispetto alla finestra darebbe numeri giusti solo finche' il
  // lettore e' a schermo intero, e il giorno che non lo fosse piu' le frecce
  // scivolerebbero via senza che nessuno capisca perche'.
  const padre = prev.offsetParent;
  if(!padre) return;
  const r = img.getBoundingClientRect(), p = padre.getBoundingClientRect();
  // Immagine non ancora misurabile (non caricata, o lettore chiuso): si
  // lascia stare quello che c'e'. Rimetterle a zero qui vorrebbe dire
  // vederle saltare al bordo e tornare indietro ad ogni cambio pagina.
  if(!r.width || !r.height || !p.width) return;
  prev.style.left  = Math.max(2, Math.round(r.left - p.left - LARGO - ARIA)) + 'px';
  next.style.right = Math.max(2, Math.round(p.right - r.right - LARGO - ARIA)) + 'px';
}

// Le frecce vanno rimesse a posto anche quando l'immagine cambia misura senza
// che nessuno cambi pagina: la finestra che si ridimensiona, una foto
// verticale dopo una orizzontale, il bitmap che finisce di caricare e passa
// dal riquadro vuoto alla sua forma vera. Un osservatore sull'immagine copre
// tutti e tre i casi senza doverli rincorrere uno per uno.
export function seguiLImmagine(img, prev, next){
  accostaFrecce(img, prev, next);
  if(typeof ResizeObserver !== 'function') return null;
  const o = new ResizeObserver(()=> accostaFrecce(img, prev, next));
  o.observe(img);
  return o;
}
