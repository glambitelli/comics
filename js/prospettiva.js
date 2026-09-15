// ── STUDIARE LA PROSPETTIVA DI UNA TAVOLA ──
//
// PERCHE' ESISTE. Guardando le tavole di Otomo una accanto all'altra si vede
// una cosa che il proprio disegno non fa: la linea dell'orizzonte non sta mai
// dove capita. E' altissima, o rasoterra, o proprio fuori dalla vignetta — ed
// e' da li' che vengono profondita' e credibilita' della scena. La tendenza di
// chi disegna, lasciato a se', e' di piazzarla sempre a meta'.
//
// Questo non e' uno strumento per DISEGNARE: e' un righello per LEGGERE. Si
// tracciano due linee lungo due bordi che vanno in profondita' (lo spigolo di
// un palazzo, il bordo di un marciapiede), e dove si incontrano c'e' il punto
// di fuga. L'orizzonte passa di li'. Il numero che conta e' uno solo — a che
// altezza della vignetta sta quell'orizzonte — e infatti e' scritto a
// caratteri grandi: e' la domanda con cui si e' aperto lo strumento.
//
// NIENTE SI SALVA. E' uno studio, non un documento: si guarda, si capisce, si
// chiude. Aggiungere il salvataggio vorrebbe dire una collezione di schemi da
// gestire, e non e' quello che serve.
//
// ── LE SCELTE DI DISEGNO, E PERCHE' ──
//
// I PUNTI STANNO IN COORDINATE 0..1 dell'immagine, non in pixel di schermo.
// Ruotando il telefono, o cambiando la finestra, l'immagine cambia posto e
// misura: con i pixel lo schema si staccherebbe dal disegno. Cosi' invece
// segue, e l'altezza dell'orizzonte in percentuale e' gia' li' senza conti.
//
// LA FUGA PUO' STARE FUORI DALL'IMMAGINE, ed e' il caso interessante: quando
// Otomo la mette fuori dalla vignetta il fascio diventa quasi parallelo e la
// scena si allunga. Quindi niente si limita ai bordi: il punto si calcola dove
// cade davvero, e se e' fuori lo si dice a parole (a quante larghezze di
// distanza), perche' a schermo non ci sarebbe modo di vederlo.
//
// OGNI TRATTO E' DISEGNATO DUE VOLTE, una scura piu' spessa sotto e una
// colorata sopra. Le tavole che si studiano sono manga in bianco e nero: una
// linea magenta su un cielo retinato di nero sparisce, e su una nuvola bianca
// sparirebbe quella scura. Con l'ombra sotto si vede sempre, su qualunque
// fondo, senza dover cambiare colore a mano.
const MAGENTA = '#ff2ea6';   // le linee tracciate e il fascio
const CIANO   = '#00e0ff';   // l'orizzonte: colore diverso perche' e' un'altra cosa
const RAGGI = 12;            // quante linee nel fascio: abbastanza da leggere la fuga, non tante da coprire il disegno
const MIN_TRATTO = 0.04;     // un tratto piu' corto di cosi' e' un tocco andato storto, non una linea

let _ov = null;              // il foglio con l'SVG, uno solo per tutta l'app
let _img = null;             // l'immagine che si sta studiando
let _linee = [];             // { a:{x,y}, b:{x,y} } in coordinate 0..1 dell'immagine
let _bozza = null;           // la linea che il dito sta tracciando in questo momento
let _alChiude = null;

export function prospettivaAperta(){ return !!_ov && !_ov.hidden; }

// Il rettangolo dell'immagine a schermo, adesso. Si richiede ad ogni disegno e
// non si tiene da parte: fra un tocco e l'altro puo' essere cambiato tutto
// (rotazione, tastiera che si apre, finestra ridimensionata).
function rett(){
  if(!_img) return null;
  const r = _img.getBoundingClientRect();
  return (r.width > 4 && r.height > 4) ? r : null;
}
function aSchermo(p, r){ return { x: r.left + p.x * r.width, y: r.top + p.y * r.height }; }
function aImmagine(cx, cy, r){ return { x: (cx - r.left) / r.width, y: (cy - r.top) / r.height }; }

// Dove si incontrano due rette (non due segmenti: le rette che li contengono,
// prolungate all'infinito — ed e' tutto il punto). Se sono parallele, o quasi,
// non si incontrano da nessuna parte: meglio dirlo che disegnare una fuga a
// mille schermi di distanza, che non significherebbe niente.
export function incrocio(l1, l2){
  const d1x = l1.b.x - l1.a.x, d1y = l1.b.y - l1.a.y;
  const d2x = l2.b.x - l2.a.x, d2y = l2.b.y - l2.a.y;
  const den = d1x * d2y - d1y * d2x;
  if(Math.abs(den) < 1e-6) return null;
  const t = ((l2.a.x - l1.a.x) * d2y - (l2.a.y - l1.a.y) * d2x) / den;
  const p = { x: l1.a.x + t * d1x, y: l1.a.y + t * d1y };
  // Oltre questa distanza le due linee sono parallele per qualunque uso umano.
  if(Math.abs(p.x) > 60 || Math.abs(p.y) > 60) return null;
  return p;
}

// Le linee si consumano A COPPIE: due linee, una fuga. E' la regola piu'
// semplice da tenere a mente mentre si lavora — si traccia, si traccia, e la
// fuga compare — e permette di studiare anche le tavole a due fughe senza
// aggiungere nessun comando.
export function fuochiDa(linee){
  const f = [];
  for(let i = 0; i + 1 < linee.length; i += 2){
    const p = incrocio(linee[i], linee[i+1]);
    if(p) f.push(p);
  }
  return f;
}

// L'orizzonte. Con una fuga sola e' la retta ORIZZONTALE che ci passa: una
// fuga sola vuol dire che si guarda dritti davanti, e allora l'altezza della
// fuga E' l'altezza dell'occhio. Con due fughe non si indovina piu' niente —
// la retta che le unisce e' l'orizzonte, inclinato quanto e' inclinata la
// macchina da presa.
export function orizzonteDa(fuochi){
  if(!fuochi.length) return null;
  if(fuochi.length === 1) return { a:{x:-10, y:fuochi[0].y}, b:{x:10, y:fuochi[0].y} };
  const [p, q] = fuochi;
  const dx = q.x - p.x, dy = q.y - p.y;
  const n = Math.hypot(dx, dy) || 1;
  return { a:{ x:p.x - dx/n*20, y:p.y - dy/n*20 }, b:{ x:q.x + dx/n*20, y:q.y + dy/n*20 } };
}

// Come si legge la posizione dell'orizzonte, a parole. E' l'informazione per
// cui lo strumento esiste, quindi va detta in italiano e non in coordinate.
export function letturaOrizzonte(orizzonte, fuochi){
  if(!orizzonte) return '';
  // L'altezza si misura al centro dell'immagine: con l'orizzonte inclinato
  // "l'altezza" da sola non vorrebbe dire niente, e il centro e' il punto di
  // cui si parla guardando una vignetta.
  const t = (0.5 - orizzonte.a.x) / ((orizzonte.b.x - orizzonte.a.x) || 1);
  const y = orizzonte.a.y + t * (orizzonte.b.y - orizzonte.a.y);
  const pct = Math.round(y * 100);
  if(pct < 0) return 'Orizzonte SOPRA la vignetta, fuori di ' + Math.abs(pct) + '%';
  if(pct > 100) return 'Orizzonte SOTTO la vignetta, fuori di ' + (pct - 100) + '%';
  let dove = 'a metà altezza';
  if(pct <= 12) dove = 'altissimo';
  else if(pct <= 35) dove = 'alto';
  else if(pct >= 88) dove = 'a terra';
  else if(pct >= 65) dove = 'basso';
  return 'Orizzonte al ' + pct + '% — ' + dove;
}

// E dove cade la fuga: dentro la vignetta o fuori, e di quanto. Fuori e' il
// caso che interessa — e' quello che allunga le scene — e a schermo non si
// vedrebbe.
export function letturaFuoco(p, n){
  const nome = 'Fuga ' + n;
  if(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) return nome + ': dentro la tavola';
  if(p.x < 0)  return nome + ': fuori a sinistra, ' + (Math.round(-p.x * 10) / 10) + ' larghezze';
  if(p.x > 1)  return nome + ': fuori a destra, ' + (Math.round((p.x - 1) * 10) / 10) + ' larghezze';
  if(p.y < 0)  return nome + ': fuori in alto';
  return nome + ': fuori in basso';
}

// ── IL FOGLIO ──
function costruisci(){
  const ov = document.createElement('div');
  ov.className = 'prosp';
  ov.id = 'prospettiva';
  ov.hidden = true;
  ov.innerHTML = `
    <svg class="prosp-svg" aria-hidden="true">
      <defs><clipPath id="prosp-clip"><rect class="prosp-clip-rect" x="0" y="0" width="0" height="0"/></clipPath></defs>
      <g class="prosp-fascio" clip-path="url(#prosp-clip)"></g>
      <!-- L'ORIZZONTE E' TAGLIATO SULL'IMMAGINE, il resto no. L'orizzonte e'
           una proprieta' della tavola: lasciandolo correre per tutto lo
           schermo, col mouse — dove la tavola sta al centro fra due fasce
           scure — diventava una riga di ciano da un bordo all'altro della
           finestra, che non appartiene a niente. Il pallino della fuga e il
           tratteggio che ci arriva invece devono poter uscire: quando Otomo
           mette la fuga fuori dalla vignetta, e' proprio li' fuori che si
           vuole vedere dov'e' andata a finire. -->
      <g class="prosp-orizzonte" clip-path="url(#prosp-clip)"></g>
      <g class="prosp-tratti"></g>
      <g class="prosp-punti"></g>
    </svg>
    <div class="prosp-barra">
      <div class="prosp-lettura">
        <b class="prosp-oriz">Traccia due linee lungo due bordi che vanno in profondità</b>
        <span class="prosp-fughe"></span>
      </div>
      <div class="prosp-comandi">
        <button class="prosp-btn" data-act="indietro" type="button">Togli l'ultima</button>
        <button class="prosp-btn" data-act="pulisci" type="button">Pulisci</button>
        <button class="prosp-btn prosp-esci" data-act="esci" type="button">Chiudi</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e=>{
    const b = e.target.closest('[data-act]');
    if(!b) return;
    if(b.dataset.act === 'indietro'){ _linee.pop(); disegna(); }
    else if(b.dataset.act === 'pulisci'){ _linee = []; disegna(); }
    else chiudiProspettiva();
  });
  agganciaTratto(ov.querySelector('.prosp-svg'));
  return ov;
}

// Il tratto si fa trascinando, con i Pointer Events: un solo codice per dito,
// mouse e pennino, che e' esattamente il pubblico di questo strumento.
function agganciaTratto(svg){
  let attivo = null;
  svg.addEventListener('pointerdown', e=>{
    const r = rett(); if(!r) return;
    attivo = e.pointerId;
    try{ svg.setPointerCapture(e.pointerId); }catch(err){}
    const p = aImmagine(e.clientX, e.clientY, r);
    _bozza = { a:p, b:p };
    e.preventDefault();
  });
  svg.addEventListener('pointermove', e=>{
    if(attivo !== e.pointerId || !_bozza) return;
    const r = rett(); if(!r) return;
    _bozza.b = aImmagine(e.clientX, e.clientY, r);
    disegna();
  });
  const finisci = e=>{
    if(attivo !== e.pointerId) return;
    attivo = null;
    if(_bozza){
      const lungo = Math.hypot(_bozza.b.x - _bozza.a.x, _bozza.b.y - _bozza.a.y);
      // Un tocco senza trascinamento non e' una linea: senza questo controllo
      // ogni tocco a vuoto sporcherebbe lo schema con un puntino inutile.
      if(lungo >= MIN_TRATTO) _linee.push(_bozza);
      _bozza = null;
    }
    disegna();
  };
  svg.addEventListener('pointerup', finisci);
  svg.addEventListener('pointercancel', finisci);
}

// Ogni tratto due volte: l'ombra scura sotto e il colore sopra (vedi la nota
// in cima). Senza l'ombra, su una retinatura nera il magenta sparisce.
function tratto(x1, y1, x2, y2, colore, spessore){
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(0,0,0,.6)" stroke-width="${spessore + 2}" stroke-linecap="round"/>`
       + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colore}" stroke-width="${spessore}" stroke-linecap="round"/>`;
}

export function disegna(){
  if(!_ov || _ov.hidden) return;
  const r = rett();
  const svg = _ov.querySelector('.prosp-svg');
  if(!r){ svg.innerHTML = svg.innerHTML; return; }
  svg.setAttribute('viewBox', '0 0 ' + window.innerWidth + ' ' + window.innerHeight);

  const clip = _ov.querySelector('.prosp-clip-rect');
  clip.setAttribute('x', r.left); clip.setAttribute('y', r.top);
  clip.setAttribute('width', r.width); clip.setAttribute('height', r.height);

  const linee = _bozza ? _linee.concat([_bozza]) : _linee;
  const fuochi = fuochiDa(linee);
  const orizzonte = orizzonteDa(fuochi);

  // IL FASCIO. Invece di scegliere degli angoli — che con la fuga fuori
  // schermo diventerebbero tutti uguali e il fascio un pennello solo — si
  // tirano le linee verso punti distribuiti sul BORDO dell'immagine: cosi' il
  // ventaglio copre sempre la vignetta, ovunque sia la fuga.
  let fascio = '';
  for(const f of fuochi){
    const c = aSchermo(f, r);
    for(let i = 0; i < RAGGI; i++){
      const t = i / RAGGI * 4;               // giro completo del perimetro, in quarti
      const lato = Math.floor(t), q = t - lato;
      const b = lato === 0 ? { x:q, y:0 } : lato === 1 ? { x:1, y:q }
              : lato === 2 ? { x:1-q, y:1 } : { x:0, y:1-q };
      const s = aSchermo(b, r);
      // Prolungato oltre il bordo: con la fuga dentro la vignetta un raggio
      // che si ferma sul bordo lascerebbe mezzo ventaglio vuoto.
      const dx = s.x - c.x, dy = s.y - c.y;
      fascio += `<line x1="${c.x}" y1="${c.y}" x2="${c.x + dx*3}" y2="${c.y + dy*3}" stroke="${MAGENTA}" stroke-width="1" opacity=".32"/>`;
    }
  }
  _ov.querySelector('.prosp-fascio').innerHTML = fascio;

  // LE LINEE TRACCIATE, E IL LORO PROLUNGAMENTO FINO ALLA FUGA.
  // Il tratto pieno e' quello che ha fatto il dito; da li' alla fuga si
  // prosegue tratteggiato. E' la parte che spiega il punto: senza, il pallino
  // della fuga sembra cascato li' per caso, mentre cosi' si VEDE che sono quei
  // due bordi, prolungati, a incontrarsi proprio in quel punto — che e' tutto
  // cio' che si voleva capire.
  let tratti = '';
  linee.forEach((l, i)=>{
    const a = aSchermo(l.a, r), b = aSchermo(l.b, r);
    const f = fuochi[Math.floor(i / 2)];
    if(f){
      const c = aSchermo(f, r);
      // Si parte dall'estremo PIU' VICINO alla fuga: prolungare dall'altro
      // ripasserebbe sopra il tratto pieno, raddoppiandolo.
      const da = Math.hypot(b.x - c.x, b.y - c.y) < Math.hypot(a.x - c.x, a.y - c.y) ? b : a;
      tratti += `<line x1="${da.x}" y1="${da.y}" x2="${c.x}" y2="${c.y}" stroke="rgba(0,0,0,.45)" stroke-width="2.6" stroke-dasharray="6 5"/>`
             +  `<line x1="${da.x}" y1="${da.y}" x2="${c.x}" y2="${c.y}" stroke="${MAGENTA}" stroke-width="1.3" stroke-dasharray="6 5"/>`;
    }
    tratti += tratto(a.x, a.y, b.x, b.y, MAGENTA, 2.2);
  });
  _ov.querySelector('.prosp-tratti').innerHTML = tratti;

  _ov.querySelector('.prosp-orizzonte').innerHTML = orizzonte
    ? (()=>{ const a = aSchermo(orizzonte.a, r), b = aSchermo(orizzonte.b, r);
             return tratto(a.x, a.y, b.x, b.y, CIANO, 2.6); })()
    : '';

  let punti = '';
  for(const f of fuochi){
    const c = aSchermo(f, r);
    punti += `<circle cx="${c.x}" cy="${c.y}" r="7" fill="rgba(0,0,0,.6)"/>`
          +  `<circle cx="${c.x}" cy="${c.y}" r="4.5" fill="${MAGENTA}"/>`;
  }
  _ov.querySelector('.prosp-punti').innerHTML = punti;

  const oriz = _ov.querySelector('.prosp-oriz');
  oriz.textContent = fuochi.length
    ? letturaOrizzonte(orizzonte, fuochi)
    : (linee.length === 1 ? 'Ancora una linea, e compare la fuga'
                          : 'Traccia due linee lungo due bordi che vanno in profondità');
  _ov.querySelector('.prosp-fughe').textContent =
    fuochi.map((f, i)=> letturaFuoco(f, i + 1)).join(' · ');
  // Due linee che non si incontrano sono un'informazione, non un errore: vuol
  // dire che quei due bordi in prospettiva non ci vanno (sono paralleli al
  // piano dell'immagine).
  if(linee.length >= 2 && !fuochi.length && !_bozza){
    oriz.textContent = 'Queste due linee sono parallele: nessuna fuga';
  }
}

export function apriProspettiva(img, alChiude){
  if(!img) return false;
  _ov = _ov || costruisci();
  _img = img;
  _linee = []; _bozza = null;
  _alChiude = alChiude || null;
  _ov.hidden = false;
  document.body.classList.add('prosp-aperta');
  window.addEventListener('resize', disegna);
  window.addEventListener('orientationchange', disegna);
  document.addEventListener('keydown', tasti);
  disegna();
  return true;
}

export function chiudiProspettiva(){
  if(!_ov || _ov.hidden) return;
  _ov.hidden = true;
  _img = null; _linee = []; _bozza = null;
  document.body.classList.remove('prosp-aperta');
  window.removeEventListener('resize', disegna);
  window.removeEventListener('orientationchange', disegna);
  document.removeEventListener('keydown', tasti);
  const f = _alChiude; _alChiude = null;
  if(f) try{ f(); }catch(e){}
}

function tasti(e){
  if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); chiudiProspettiva(); }
}

// LA CHIUSURA SI LASCIA SU WINDOW, ed e' il modo piu' pulito per un modulo che
// arriva pigro. Chi deve chiuderlo — il lettore quando si chiude, la galleria
// quando si chiude — non puo' importarlo apposta per scoprire che non c'era
// niente da chiudere: sarebbe scaricare un modulo per non usarlo. Il globale
// esiste solo DA QUANDO lo strumento e' stato aperto almeno una volta, che e'
// esattamente la condizione in cui serve.
window.chiudiProspettiva = chiudiProspettiva;

// Per le prove: leggere lo stato senza dover simulare venti gesti.
export function __perLeProve(){ return { linee: _linee.slice(), fuochi: fuochiDa(_linee) }; }
export function __perLeProveTraccia(l){ _linee.push(l); disegna(); }
