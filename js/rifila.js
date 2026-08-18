// ── RIFILARE UN FRAMMENTO — togliere il superfluo da un'immagine gia' salvata ──
//
// Il ritaglio dagli albi (vedi ritaglio.js) risolve meta' del problema: li' si
// taglia MENTRE si legge. Ma nei Frammenti finisce anche altro — uno screenshot
// preso da Instagram o da Twitter, un disegno salvato da Pinterest — e quella
// roba arriva con dentro l'interfaccia del social: il nome, i cuoricini, mezzo
// post sotto. Nel momento in cui la salvi non hai un ritaglio da fare, hai solo
// un'immagine che ti e' piaciuta; il superfluo lo vedi dopo, guardandola.
//
// Quindi: un foglio a schermo intero con l'immagine, un riquadro che si tira
// col dito, e via il resto. Niente scelta di destinazione, niente tag da
// rimettere: e' lo STESSO frammento, solo piu' stretto. Cartella, tag,
// progetti collegati e provenienza restano dov'erano.
//
// Perche' un foglio suo e non il riquadro dentro la vista a schermo intero:
// quella e' un nastro di tre celle che si sposta col dito e si ingrandisce col
// pizzico. Disegnarci sopra un rettangolo vorrebbe dire litigare con tutti e
// due i gesti; qui l'immagine sta ferma, e il dito ha un mestiere solo.
import { haptic, showUndoToast } from './state.js';
import { confirmModal, infoModal } from './dialogs.js';
import { renderedImageRect, preparaRitaglio } from './ritaglio.js';
import { sostituisciImmagine, ripristinaImmagine, refsCache } from './refs.js';

const MIN_LATO = 24;      // px a schermo: sotto, il riquadro non e' un gesto ma un tocco storto
let _id = null;           // il frammento in lavorazione
let _agganciato = false;

const el = (id)=> document.getElementById(id);

export function apriRifila(idFrammento){
  const r = refsCache().find(x=> x.id === idFrammento);
  if(!r) return;
  const ov = el('rifila');
  const img = el('rifila-img');
  if(!ov || !img) return;
  _id = idFrammento;

  // IL PERMESSO DI DISEGNARE SU UNA TELA. L'immagine viene da Cloudinary, cioe'
  // da un altro indirizzo: senza questo attributo il browser la mostra ma poi
  // si rifiuta di farne uscire i pixel, e il ritaglio fallirebbe solo ALLA
  // FINE, dopo che hai scelto il riquadro. Cloudinary lo concede; se un giorno
  // non lo facesse, l'errore si vede al momento del taglio e lo si dice.
  img.crossOrigin = 'anonymous';
  img.src = r.url;

  // Un posto nella cronologia: cosi' il tasto Indietro del telefono chiude il
  // foglio invece di riportare indietro la schermata che sta sotto — che
  // resterebbe con un ritaglio a meta' addosso.
  try{
    if(!history.state || history.state.view !== 'rifila') history.pushState({view:'rifila'}, '');
  }catch(e){}
  ov.hidden = false;
  document.body.classList.add('rifila-aperta');
  aggancia();
  // Si parte da un riquadro largo quasi quanto l'immagine: quasi sempre si
  // toglie una cornice, non si cerca un dettaglio, e cosi' bastano due angoli
  // da tirare invece di ridisegnare tutto da capo.
  const parti = ()=> riquadroIniziale();
  if(img.complete && img.naturalWidth) requestAnimationFrame(parti);
  else img.onload = ()=> requestAnimationFrame(parti);
}

// Chiude il foglio E TOGLIE il suo posto dalla cronologia: e' quello che fa il
// pulsante Annulla e quello che si fa a ritaglio finito. Senza, il primo
// Indietro dopo aver chiuso non farebbe niente di visibile.
export function annullaRifila(){
  const st = history.state;
  if(st && st.view === 'rifila'){ history.back(); return; }
  chiudiRifila();
}

// Chiude e basta: la chiama anche il tasto Indietro (vedi main.js), che il
// posto nella cronologia l'ha gia' tolto da solo.
export function chiudiRifila(){
  const ov = el('rifila');
  if(ov) ov.hidden = true;
  document.body.classList.remove('rifila-aperta');
  _id = null;
}

function riquadroIniziale(){
  const layer = el('rifila-layer'), img = el('rifila-img'), box = el('rifila-box');
  if(!layer || !img || !box) return;
  const r = renderedImageRect(img, layer);
  const m = Math.round(Math.min(r.w, r.h) * 0.06);
  posa(box, r.x + m, r.y + m, r.w - 2*m, r.h - 2*m);
}

function posa(box, x, y, w, h){
  box.style.left = x + 'px';
  box.style.top = y + 'px';
  box.style.width = w + 'px';
  box.style.height = h + 'px';
}
function leggi(box){
  return { left: parseFloat(box.style.left)||0, top: parseFloat(box.style.top)||0,
           width: parseFloat(box.style.width)||0, height: parseFloat(box.style.height)||0 };
}

// Il riquadro non puo' uscire dall'immagine: fuori non c'e' niente da
// ritagliare, e un rettangolo che sborda darebbe un frammento con una fascia
// vuota su un lato.
function dentro(sel, r){
  const w = Math.max(MIN_LATO, Math.min(sel.width, r.w));
  const h = Math.max(MIN_LATO, Math.min(sel.height, r.h));
  const x = Math.min(Math.max(sel.left, r.x), r.x + r.w - w);
  const y = Math.min(Math.max(sel.top, r.y), r.y + r.h - h);
  return { left:x, top:y, width:w, height:h };
}

function aggancia(){
  if(_agganciato) return;
  _agganciato = true;
  const layer = el('rifila-layer'), box = el('rifila-box'), img = el('rifila-img');
  if(!layer || !box) return;

  let modo = null;          // 'sposta' | angolo ('nw','ne','sw','se')
  let px = 0, py = 0, iniz = null, rImg = null;

  const punto = (e)=>{
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
    return { x: t.clientX, y: t.clientY };
  };

  const giu = (e)=>{
    const bersaglio = e.target;
    const angolo = bersaglio && bersaglio.dataset ? bersaglio.dataset.angolo : null;
    const dentroIlBox = bersaglio === box || (box.contains && box.contains(bersaglio));
    if(!angolo && !dentroIlBox) return;      // fuori dal riquadro non si fa niente
    modo = angolo || 'sposta';
    const p = punto(e);
    px = p.x; py = p.y;
    iniz = leggi(box);
    rImg = renderedImageRect(img, layer);
    box.classList.add('attivo');
    if(e.cancelable) e.preventDefault();
  };

  const muovi = (e)=>{
    if(!modo || !iniz) return;
    const p = punto(e);
    const dx = p.x - px, dy = p.y - py;
    let sel;
    if(modo === 'sposta'){
      sel = { left: iniz.left + dx, top: iniz.top + dy, width: iniz.width, height: iniz.height };
    } else {
      // Ogni angolo muove i suoi due lati e lascia fermo quello opposto: e' il
      // motivo per cui si tira un angolo invece di ridisegnare il rettangolo.
      let { left, top, width, height } = iniz;
      if(modo.includes('n')){ top += dy; height -= dy; }
      if(modo.includes('s')){ height += dy; }
      if(modo.includes('w')){ left += dx; width -= dx; }
      if(modo.includes('e')){ width += dx; }
      if(width < MIN_LATO){ if(modo.includes('w')) left = iniz.left + iniz.width - MIN_LATO; width = MIN_LATO; }
      if(height < MIN_LATO){ if(modo.includes('n')) top = iniz.top + iniz.height - MIN_LATO; height = MIN_LATO; }
      sel = { left, top, width, height };
    }
    const c = dentro(sel, rImg);
    posa(box, c.left, c.top, c.width, c.height);
    if(e.cancelable) e.preventDefault();
  };

  const su = ()=>{ modo = null; iniz = null; box.classList.remove('attivo'); };

  layer.addEventListener('pointerdown', giu);
  window.addEventListener('pointermove', muovi, { passive:false });
  window.addEventListener('pointerup', su);
  window.addEventListener('pointercancel', su);
}

// ── IL TAGLIO ──
export async function confermaRifila(){
  const layer = el('rifila-layer'), img = el('rifila-img'), box = el('rifila-box');
  if(!layer || !img || !box || !_id) return;
  const id = _id;
  const sel = leggi(box);
  const r = renderedImageRect(img, layer);
  // Dalle coordinate a schermo a quelle dell'originale: e' lo stesso conto del
  // ritaglio dagli albi, e infatti la funzione e' la stessa.
  const cx = Math.max(0, (sel.left - r.x) / r.scale);
  const cy = Math.max(0, (sel.top  - r.y) / r.scale);
  const cw = Math.min(img.naturalWidth  - cx, sel.width  / r.scale);
  const ch = Math.min(img.naturalHeight - cy, sel.height / r.scale);
  if(cw < 4 || ch < 4){
    await infoModal('Il riquadro e\' troppo piccolo: tiralo un po\' piu\' largo.', { title:'Ritaglio' });
    return;
  }
  // Tagliare quasi tutto non e' un errore, ma quasi sempre e' un dito storto:
  // meglio chiederlo adesso che scoprirlo dopo (si torna indietro, ma intanto
  // la miniatura nell'archivio e' gia' cambiata).
  const restaPoco = (cw * ch) < (img.naturalWidth * img.naturalHeight) * 0.04;
  if(restaPoco){
    const ok = await confirmModal('Del frammento resterebbe meno di un ventesimo. Vado avanti?',
      { title:'Ritaglio molto stretto', confirmLabel:'Ritaglia', safe:true });
    if(!ok) return;
  }

  const btn = el('rifila-ok');
  if(btn){ btn.disabled = true; btn.textContent = 'Ritaglio…'; }
  try{
    const pronto = await preparaRitaglio(img, cx, cy, cw, ch);
    if(!pronto) throw new Error('non sono riuscito a preparare il ritaglio');
    const prima = await sostituisciImmagine(id, pronto.blob, pronto.w, pronto.h);
    haptic('done');
    annullaRifila();
    // L'immagine di prima e' ancora al suo posto su Cloudinary: annullare vuol
    // dire riscriverne l'indirizzo, non recuperare niente.
    showUndoToast('Frammento ritagliato', ()=> ripristinaImmagine(id, prima));
  }catch(e){
    // Il caso che vale la pena spiegare: i pixel non escono dall'immagine
    // perche' arriva da un altro indirizzo e quel permesso manca. Chi legge
    // non deve indovinarlo da un messaggio del browser.
    const bloccata = /tainted|SecurityError|insecure/i.test((e && (e.name + ' ' + e.message)) || '');
    await infoModal(bloccata
      ? 'Questa immagine non si lascia ritagliare: e\' stata salvata prima che l\'app chiedesse il permesso di leggerne i pixel. Risalvala e riprova.'
      : 'Non sono riuscito a ritagliare: ' + ((e && e.message) ? e.message : e),
      { title:'Ritaglio non riuscito' });
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = 'Ritaglia'; }
  }
}

// I due pulsanti del foglio chiamano da qui. Il modulo si carica al primo
// "Ritaglia" (vedi il menu in refs.js), e da quel momento le due voci esistono:
// non c'e' motivo di scaricarlo all'avvio per una cosa che si usa di rado.
window.confermaRifila = confermaRifila;
window.chiudiRifila = chiudiRifila;
window.annullaRifila = annullaRifila;

// Le prove hanno bisogno di sapere qual e' il frammento aperto.
export function __perLeProve_id(){ return _id; }
