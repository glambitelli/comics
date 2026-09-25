// ── LE MINIATURE CHE NON ARRIVANO ───────────────────────────────────────────
//
// IL DIFETTO, raccontato da Giovanni il 25 settembre 2026: scorrendo una
// galleria ogni tanto resta un buco — una tessera color sabbia senza disegno.
// Tornando indietro l'immagine c'e'. Toccando il buco la foto si apre a
// schermo intero regolarmente: il dato c'e' sempre stato, non e' arrivato il
// bitmap.
//
// PERCHE' SUCCEDE. Le miniature hanno loading="lazy": e' il browser a
// decidere quando scaricarle. Scorrendo in fretta capitano due cose che il
// caricamento pigro non sa gestire da solo:
//
//   · la richiesta viene ANNULLATA perche' la tessera e' gia' uscita dallo
//     schermo — e quando rientra il browser considera quell'immagine "gia'
//     tentata" e non riparte;
//   · la richiesta FALLISCE davvero (un buco di rete su mobile, un giro di
//     Cloudinary andato storto), e senza un gestore d'errore resta un vuoto
//     definitivo. Un ricaricamento lo sistema, ma nessuno ricarica.
//
// In entrambi i casi il browser non ritenta MAI da solo. Questo modulo e' il
// pezzo che mancava: guarda le tessere in vista e, se dopo un po' sono ancora
// senza bitmap, rimette il loro indirizzo — che e' il modo di dire a un <img>
// "riprova".
//
// PERCHE' NON SI CARICANO SUBITO TUTTE. Una cartella puo' averne centinaia:
// caricarle tutte insieme vorrebbe dire decine di megabyte su rete mobile per
// vedere le prime sei. Il caricamento pigro e' giusto, gli mancava solo la
// rete di sicurezza.

const MAX_TENTATIVI = 3;
// Quanto si aspetta prima di riprovare. Il primo tentativo e' quasi
// immediato — di solito e' stata solo una richiesta annullata di corsa —
// e i successivi si allontanano, per non martellare una rete che sta gia'
// faticando.
const ATTESA = [400, 1500, 4000];
// Quanto si concede a una tessera IN VISTA prima di considerarla piantata.
// Deve stare largo: su rete lenta una miniatura da 40 kB puo' metterci un
// paio di secondi, e ripartire mentre sta arrivando butterebbe via il lavoro
// gia' fatto.
const PAZIENZA = 3500;

function fallita(img){
  // "Finita di caricare ma senza bitmap" e' il modo di riconoscere un errore
  // anche quando l'evento 'error' non e' mai arrivato — il caso della
  // richiesta annullata.
  return img.complete && img.naturalWidth === 0;
}

function ritenta(img){
  const n = +(img.dataset.tentativi || 0);
  if(n >= MAX_TENTATIVI) return;          // dopo tre volte si smette: se non
  img.dataset.tentativi = String(n + 1);  // arriva, non e' un caso passeggero
  const via = img.dataset.via || img.getAttribute('src');
  if(!via) return;
  img.dataset.via = via;                  // l'indirizzo vero, senza le code
  setTimeout(()=>{
    if(!img.isConnected) return;          // tessera nel frattempo sparita
    if(img.naturalWidth > 0) return;      // nel frattempo e' arrivata
    // All'ultimo tentativo si aggiunge una coda all'indirizzo: se il browser
    // si e' segnato quella richiesta come fallita, ripetere la stessa non
    // esce mai dalla sua memoria. La coda cambia l'indirizzo quel tanto che
    // basta per farlo ripartire davvero.
    const nuovo = (n + 1 >= MAX_TENTATIVI)
      ? via + (via.includes('?') ? '&' : '?') + 'r=' + (n + 1)
      : via;
    img.removeAttribute('src');
    img.src = nuovo;
  }, ATTESA[n] || 4000);
}

// Un osservatore per contenitore: si accende quando una tessera entra in
// vista, ed e' li' che ha senso controllare — una tessera lontana dallo
// schermo ha il diritto di essere ancora vuota.
const _occhi = new WeakMap();

export function sorvegliaMiniature(root){
  if(!root || typeof IntersectionObserver !== 'function') return;
  for(const img of root.querySelectorAll('img')){
    if(img.dataset.sorvegliata) continue;
    img.dataset.sorvegliata = '1';
    img.dataset.via = img.getAttribute('src') || '';
    img.addEventListener('error', ()=> ritenta(img));
  }
  let occhio = _occhi.get(root);
  if(!occhio){
    occhio = new IntersectionObserver(viste=>{
      for(const v of viste){
        const img = v.target;
        if(!v.isIntersecting){ clearTimeout(img._attesa); continue; }
        if(img.naturalWidth > 0) continue;        // gia' a posto
        if(fallita(img)){ ritenta(img); continue; }
        // Sta ancora caricando: le si da' tempo, e si torna a guardarla.
        clearTimeout(img._attesa);
        img._attesa = setTimeout(()=>{
          if(img.isConnected && img.naturalWidth === 0) ritenta(img);
        }, PAZIENZA);
      }
    }, { root: null, rootMargin: '100px' });
    _occhi.set(root, occhio);
  }
  for(const img of root.querySelectorAll('img')) occhio.observe(img);
}
