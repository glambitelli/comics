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
// I COLORI SONO QUELLI DI INKFLOW, e si dividono i ruoli come se li dividono
// in tutto il resto dell'app: l'oro e' la cosa che conta (le stelle,
// l'avanzamento, il contatore del lettore), l'azzurro e' il contorno.
// Qui l'oro e' l'ORIZZONTE — la risposta alla domanda per cui si e' aperto lo
// strumento — e l'azzurro sono le linee e il fascio, che sono il mezzo.
// Prima erano magenta e ciano fluo: si vedevano benissimo e sembravano di
// un'altra applicazione. Su una tavola in bianco e nero questi due reggono
// lo stesso, a patto di tenere l'ombra scura sotto ogni tratto (vedi sotto):
// l'oro pieno #f0c020 e' chiaro abbastanza per staccare sul nero, e l'ombra
// gli fa da bordo sul bianco.
const ORO      = '#f0c020';  // l'orizzonte, e il numero che lo accompagna
const AZZURRO  = '#4ab8d8';  // le linee tracciate, il fascio e il punto di fuga
const SABBIA   = '#f2e6cd';  // il bordo della vignetta riquadrata
const RAGGI = 12;            // quante linee nel fascio: abbastanza da leggere la fuga, non tante da coprire il disegno
const MIN_TRATTO = 0.04;     // un tratto piu' corto di cosi' e' un tocco andato storto, non una linea
const MIN_RIQUADRO = 0.06;   // e un riquadro piu' piccolo di cosi' non e' una vignetta

let _ov = null;              // il foglio con l'SVG, uno solo per tutta l'app
let _img = null;             // l'immagine che si sta studiando
let _linee = [];             // { a:{x,y}, b:{x,y} } in coordinate 0..1 dell'immagine
let _bozza = null;           // la linea che il dito sta tracciando in questo momento
let _alChiude = null;
// ── PRIMA LA VIGNETTA, POI LE LINEE ──
//
// La prima versione misurava l'orizzonte sull'INTERA tavola, e la percentuale
// non voleva dire niente: una pagina di manga sono sei vignette, e "orizzonte
// al 23% della pagina" non risponde alla domanda — che riguarda la singola
// inquadratura. Adesso si comincia riquadrando la vignetta, e da li' in poi
// tutto e' misurato su QUELLA: l'altezza dell'orizzonte, le larghezze di
// distanza della fuga, il taglio del fascio.
//
// Il riquadro sta anche lui in coordinate 0..1 dell'immagine, come le linee:
// ruotando il telefono si sposta tutto insieme.
let _riquadro = null;        // { x, y, w, h } — null finche' non e' stato scelto
let _bozzaRiq = null;        // il riquadro che il dito sta trascinando adesso

export function prospettivaAperta(){ return !!_ov && !_ov.hidden; }

// La cornice su cui si misura tutto. Senza riquadro e' l'immagine intera: e'
// il caso di un frammento, che una vignetta lo e' gia' di suo e riquadrarlo
// sarebbe un gesto a vuoto.
function cornice(){ return _riquadro || { x:0, y:0, w:1, h:1 }; }
export function corniceAttiva(){ return cornice(); }
export function faseRiquadro(){ return !_riquadro; }

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

// La posizione dell'orizzonte, misurata SULLA VIGNETTA. E' l'informazione per
// cui lo strumento esiste, ed e' un numero: la percentuale dell'altezza a cui
// cade, contata dall'alto.
//
// Prima al numero era appiccicato un aggettivo — "altissimo", "a terra", "a
// meta' altezza" — e quelle parole sono state tolte: davanti a una tavola di
// Otomo, "23%" e' un dato, "altissimo" e' un giudizio che uno si fa da solo, e
// scritto dallo strumento suona sciocco. Qui si misura e basta.
export function letturaOrizzonte(orizzonte, fuochi, riq){
  if(!orizzonte) return '';
  const r = riq || { x:0, y:0, w:1, h:1 };
  // Si misura al centro della vignetta: con l'orizzonte inclinato "l'altezza"
  // da sola non vorrebbe dire niente, e il centro e' il punto di cui si parla
  // guardando un'inquadratura.
  const cx = r.x + r.w / 2;
  const t = (cx - orizzonte.a.x) / ((orizzonte.b.x - orizzonte.a.x) || 1);
  const y = orizzonte.a.y + t * (orizzonte.b.y - orizzonte.a.y);
  const pct = Math.round((y - r.y) / (r.h || 1) * 100);
  if(pct < 0)   return 'Orizzonte ' + pct + '% — sopra la vignetta';
  if(pct > 100) return 'Orizzonte ' + pct + '% — sotto la vignetta';
  return 'Orizzonte ' + pct + '% dall\'alto';
}

// E dove cade la fuga rispetto alla vignetta: dentro o fuori, e di quante sue
// larghezze. Fuori e' il caso che interessa — e' quello che allunga le scene —
// e a schermo non si vedrebbe.
export function letturaFuoco(p, n, riq){
  const r = riq || { x:0, y:0, w:1, h:1 };
  const nome = 'Fuga ' + n;
  const u = (p.x - r.x) / (r.w || 1);
  const v = (p.y - r.y) / (r.h || 1);
  const q = x => Math.round(x * 10) / 10;
  if(u >= 0 && u <= 1 && v >= 0 && v <= 1) return nome + ' dentro';
  if(u < 0) return nome + ' fuori a sinistra, ' + q(-u) + ' larghezze';
  if(u > 1) return nome + ' fuori a destra, ' + q(u - 1) + ' larghezze';
  if(v < 0) return nome + ' fuori in alto';
  return nome + ' fuori in basso';
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
      <!-- Fuori dalla vignetta si scurisce: la tavola intorno resta visibile —
           serve a capire dove sta l'inquadratura nella pagina — ma smette di
           contendere l'attenzione a quella che si sta misurando. -->
      <path class="prosp-velo" fill="rgba(0,0,0,.5)" fill-rule="evenodd"></path>
      <rect class="prosp-cornice" fill="none" stroke="#f2e6cd" stroke-width="1.5" stroke-dasharray="7 5" opacity=".85"></rect>
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
        <b class="prosp-oriz"></b>
        <span class="prosp-fughe"></span>
      </div>
      <!-- DUE ICONE E UNA PAROLA. "Togli l'ultima" e "Chiudi" scritti per
           esteso occupavano mezza barra per dire due cose che una freccia e
           una croce dicono meglio: sono i due gesti piu' universali che
           esistano. Resta scritto solo quello che un simbolo non direbbe. -->
      <div class="prosp-comandi">
        <button class="prosp-btn prosp-tutta" data-act="tutta" type="button">Tutta l'immagine</button>
        <button class="prosp-btn prosp-ico" data-act="indietro" type="button" aria-label="Torna indietro" title="Torna indietro">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h11a4.5 4.5 0 0 1 0 9H9"/><path d="M8 5 4 9l4 4"/></svg>
        </button>
        <button class="prosp-btn" data-act="pulisci" type="button">Clean</button>
        <button class="prosp-btn prosp-salva" data-act="salva" type="button">Salva</button>
        <button class="prosp-btn prosp-ico prosp-esci" data-act="esci" type="button" aria-label="Chiudi" title="Chiudi">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" aria-hidden="true"><path d="M6.5 6.5 17.5 17.5 M17.5 6.5 6.5 17.5"/></svg>
        </button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e=>{
    const b = e.target.closest('[data-act]');
    if(!b) return;
    const a = b.dataset.act;
    // La freccia torna indietro di UN passo, qualunque sia: prima le linee,
    // una per volta, e finite quelle il riquadro — che e' l'ordine in cui sono
    // state fatte. Un solo tasto per disfare, che e' come funziona ovunque.
    if(a === 'indietro'){ if(_linee.length) _linee.pop(); else _riquadro = null; disegna(); }
    else if(a === 'pulisci'){ _linee = []; _riquadro = null; disegna(); }
    // "Tutta l'immagine" salta il riquadro: per un frammento gia' ritagliato su
    // una vignetta sola, riquadrarlo sarebbe un gesto a vuoto.
    else if(a === 'tutta'){ _riquadro = { x:0, y:0, w:1, h:1 }; disegna(); }
    else if(a === 'salva'){ salva(); }
    else chiudiProspettiva();
  });
  agganciaTratto(ov.querySelector('.prosp-svg'));
  return ov;
}

// Il tratto si fa trascinando, con i Pointer Events: un solo codice per dito,
// mouse e pennino, che e' esattamente il pubblico di questo strumento.
function agganciaTratto(svg){
  let attivo = null;
  // LO STESSO TRASCINAMENTO FA DUE COSE, a seconda di dove si e' arrivati:
  // finche' la vignetta non e' riquadrata tira un rettangolo, dopo tira una
  // linea. Un gesto solo da imparare, e l'ordine e' quello giusto — prima si
  // decide su cosa si misura, poi si misura.
  svg.addEventListener('pointerdown', e=>{
    const r = rett(); if(!r) return;
    attivo = e.pointerId;
    try{ svg.setPointerCapture(e.pointerId); }catch(err){}
    const p = aImmagine(e.clientX, e.clientY, r);
    if(faseRiquadro()) _bozzaRiq = { a:p, b:p };
    else _bozza = { a:p, b:p };
    e.preventDefault();
  });
  svg.addEventListener('pointermove', e=>{
    if(attivo !== e.pointerId) return;
    const r = rett(); if(!r) return;
    const p = aImmagine(e.clientX, e.clientY, r);
    if(_bozzaRiq) _bozzaRiq.b = p;
    else if(_bozza) _bozza.b = p;
    else return;
    disegna();
  });
  const finisci = e=>{
    if(attivo !== e.pointerId) return;
    attivo = null;
    if(_bozzaRiq){
      const w = Math.abs(_bozzaRiq.b.x - _bozzaRiq.a.x), h = Math.abs(_bozzaRiq.b.y - _bozzaRiq.a.y);
      // Un riquadro grande come un francobollo e' un tocco andato storto, non
      // una vignetta: misurarci sopra darebbe percentuali senza senso.
      if(w >= MIN_RIQUADRO && h >= MIN_RIQUADRO){
        _riquadro = {
          x: Math.min(_bozzaRiq.a.x, _bozzaRiq.b.x), y: Math.min(_bozzaRiq.a.y, _bozzaRiq.b.y), w, h,
        };
      }
      _bozzaRiq = null;
    } else if(_bozza){
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
  if(!r) return;
  svg.setAttribute('viewBox', '0 0 ' + window.innerWidth + ' ' + window.innerHeight);

  // La cornice a schermo: quella scelta, o quella che il dito sta trascinando
  // adesso — cosi' il velo e il bordo seguono il trascinamento invece di
  // comparire solo alla fine.
  const riq = _bozzaRiq
    ? { x: Math.min(_bozzaRiq.a.x, _bozzaRiq.b.x), y: Math.min(_bozzaRiq.a.y, _bozzaRiq.b.y),
        w: Math.abs(_bozzaRiq.b.x - _bozzaRiq.a.x), h: Math.abs(_bozzaRiq.b.y - _bozzaRiq.a.y) }
    : cornice();
  const q = { x: r.left + riq.x * r.width, y: r.top + riq.y * r.height,
              w: riq.w * r.width, h: riq.h * r.height };

  // Tutto si taglia sulla VIGNETTA, non piu' sull'immagine: il fascio che
  // sborda nelle vignette accanto non e' la prospettiva di questa.
  const clip = _ov.querySelector('.prosp-clip-rect');
  clip.setAttribute('x', q.x); clip.setAttribute('y', q.y);
  clip.setAttribute('width', q.w); clip.setAttribute('height', q.h);

  // Il velo: tutto lo schermo meno il buco della vignetta (regola evenodd).
  // Con la vignetta grande quanto l'immagine il velo non si vede — ed e'
  // giusto: non c'e' niente da mettere da parte.
  const W = window.innerWidth, H = window.innerHeight;
  const velo = _ov.querySelector('.prosp-velo');
  const tutta = riq.w >= 0.999 && riq.h >= 0.999 && riq.x <= 0.001 && riq.y <= 0.001;
  velo.setAttribute('d', (_riquadro || _bozzaRiq) && !tutta
    ? `M0 0 H${W} V${H} H0 Z M${q.x} ${q.y} H${q.x + q.w} V${q.y + q.h} H${q.x} Z` : '');
  const bordo = _ov.querySelector('.prosp-cornice');
  const mostraBordo = (_riquadro || _bozzaRiq) && !tutta;
  bordo.setAttribute('x', q.x); bordo.setAttribute('y', q.y);
  bordo.setAttribute('width', mostraBordo ? q.w : 0);
  bordo.setAttribute('height', mostraBordo ? q.h : 0);

  const linee = _bozza ? _linee.concat([_bozza]) : _linee;
  const fuochi = fuochiDa(linee);
  const orizzonte = orizzonteDa(fuochi);

  // IL FASCIO. Invece di scegliere degli angoli — che con la fuga fuori
  // schermo diventerebbero tutti uguali e il fascio un pennello solo — si
  // tirano le linee verso punti distribuiti sul BORDO DELLA VIGNETTA: cosi' il
  // ventaglio la copre sempre tutta, ovunque sia la fuga.
  let fascio = '';
  for(const f of fuochi){
    const c = aSchermo(f, r);
    for(let i = 0; i < RAGGI; i++){
      const t = i / RAGGI * 4;               // giro completo del perimetro, in quarti
      const lato = Math.floor(t), u = t - lato;
      const b = lato === 0 ? { x:q.x + u*q.w, y:q.y } : lato === 1 ? { x:q.x + q.w, y:q.y + u*q.h }
              : lato === 2 ? { x:q.x + (1-u)*q.w, y:q.y + q.h } : { x:q.x, y:q.y + (1-u)*q.h };
      // Prolungato oltre il bordo: con la fuga dentro la vignetta un raggio
      // che si ferma sul bordo lascerebbe mezzo ventaglio vuoto.
      const dx = b.x - c.x, dy = b.y - c.y;
      fascio += `<line x1="${c.x}" y1="${c.y}" x2="${c.x + dx*3}" y2="${c.y + dy*3}" stroke="${AZZURRO}" stroke-width="1" opacity=".38"/>`;
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
             +  `<line x1="${da.x}" y1="${da.y}" x2="${c.x}" y2="${c.y}" stroke="${AZZURRO}" stroke-width="1.3" stroke-dasharray="6 5"/>`;
    }
    tratti += tratto(a.x, a.y, b.x, b.y, AZZURRO, 2.2);
  });
  _ov.querySelector('.prosp-tratti').innerHTML = tratti;

  _ov.querySelector('.prosp-orizzonte').innerHTML = orizzonte
    ? (()=>{ const a = aSchermo(orizzonte.a, r), b = aSchermo(orizzonte.b, r);
             return tratto(a.x, a.y, b.x, b.y, ORO, 3); })()
    : '';

  let punti = '';
  for(const f of fuochi){
    const c = aSchermo(f, r);
    punti += `<circle cx="${c.x}" cy="${c.y}" r="7" fill="rgba(0,0,0,.6)"/>`
          +  `<circle cx="${c.x}" cy="${c.y}" r="4.5" fill="${AZZURRO}"/>`;
  }
  _ov.querySelector('.prosp-punti').innerHTML = punti;

  scriviBarra(linee, fuochi, orizzonte);
}

// Quello che c'e' scritto in basso, in tre stati: riquadra, traccia, leggi.
// Asciutto: e' uno strumento di misura, non un accompagnatore.
function scriviBarra(linee, fuochi, orizzonte){
  const oriz = _ov.querySelector('.prosp-oriz');
  const riq = faseRiquadro();
  _ov.querySelector('.prosp-tutta').hidden = !riq;
  _ov.querySelector('[data-act="indietro"]').hidden = riq && !_linee.length;
  _ov.querySelector('[data-act="pulisci"]').hidden = riq && !_linee.length;
  // "Salva" compare solo quando c'e' qualcosa da salvare: senza una fuga, lo
  // studio e' una vignetta con sopra due righe storte.
  _ov.querySelector('.prosp-salva').hidden = !fuochi.length || !_salvataggio;

  if(riq){
    oriz.textContent = 'Riquadra la vignetta';
    _ov.querySelector('.prosp-fughe').textContent = '';
    return;
  }
  if(fuochi.length) oriz.textContent = letturaOrizzonte(orizzonte, fuochi, cornice());
  else if(linee.length >= 2 && !_bozza) oriz.textContent = 'Linee parallele: nessuna fuga';
  else oriz.textContent = linee.length === 1 ? 'Ancora una linea' : 'Traccia due linee in profondità';
  _ov.querySelector('.prosp-fughe').textContent =
    fuochi.map((f, i)=> letturaFuoco(f, i + 1, cornice())).join(' · ');
}

// ── SALVARE LO STUDIO ──
//
// Non uno screenshot: la vignetta si RIDISEGNA su una tela alla sua
// risoluzione vera, e lo schema ci va sopra con la stessa geometria. Uno
// screenshot porterebbe dentro la barra dei comandi, la pagina intorno
// scurita e la risoluzione dello schermo — cioe' tre cose che non c'entrano
// con lo studio — e su un telefono darebbe un'immagine piu' piccola
// dell'originale.
//
// Quello che si salva e' la VIGNETTA sola, ritagliata sul riquadro: e' quello
// che si stava studiando, ed e' quello che si vuole poter mettere accanto a
// un'altra fra un mese.
const LATO_MAX = 1600;       // oltre, il file cresce senza che si veda di piu'

function disegnaSuTela(){
  if(!_img || !_img.naturalWidth) return null;
  const r = cornice();
  const NW = _img.naturalWidth, NH = _img.naturalHeight;
  const sx = r.x * NW, sy = r.y * NH, sw = r.w * NW, sh = r.h * NH;
  if(sw < 8 || sh < 8) return null;
  const k = Math.min(1, LATO_MAX / Math.max(sw, sh));
  const W = Math.round(sw * k), H = Math.round(sh * k);
  const tela = document.createElement('canvas');
  tela.width = W; tela.height = H;
  const c = tela.getContext('2d');
  c.drawImage(_img, sx, sy, sw, sh, 0, 0, W, H);

  // Dalle coordinate dell'IMMAGINE a quelle della tela (che e' la vignetta).
  const P = p => ({ x: (p.x * NW - sx) * k, y: (p.y * NH - sy) * k });
  // Le misure seguono la tela: su una vignetta grande le linee devono restare
  // proporzionate, non diventare capelli.
  const u = Math.max(1, Math.min(W, H) / 380);
  const riga = (a, b, colore, spessore, tratteggio)=>{
    c.setLineDash(tratteggio ? [6*u, 5*u] : []);
    c.lineCap = tratteggio ? 'butt' : 'round';
    c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = (spessore + 2) * u;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    c.strokeStyle = colore; c.lineWidth = spessore * u;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  };

  const fuochi = fuochiDa(_linee);
  const orizzonte = orizzonteDa(fuochi);

  // Il fascio sta dentro la vignetta, come a schermo.
  c.save(); c.beginPath(); c.rect(0, 0, W, H); c.clip();
  c.globalAlpha = .38; c.strokeStyle = AZZURRO; c.lineWidth = u; c.setLineDash([]);
  for(const f of fuochi){
    const cc = P(f);
    for(let i = 0; i < RAGGI; i++){
      const t = i / RAGGI * 4, lato = Math.floor(t), q = t - lato;
      const b = lato === 0 ? { x:q*W, y:0 } : lato === 1 ? { x:W, y:q*H }
              : lato === 2 ? { x:(1-q)*W, y:H } : { x:0, y:(1-q)*H };
      c.beginPath(); c.moveTo(cc.x, cc.y);
      c.lineTo(cc.x + (b.x - cc.x) * 3, cc.y + (b.y - cc.y) * 3); c.stroke();
    }
  }
  c.globalAlpha = 1;
  if(orizzonte) riga(P(orizzonte.a), P(orizzonte.b), ORO, 3);
  c.restore();

  _linee.forEach((l, i)=>{
    const a = P(l.a), b = P(l.b), f = fuochi[Math.floor(i / 2)];
    if(f){
      const cc = P(f);
      const da = Math.hypot(b.x - cc.x, b.y - cc.y) < Math.hypot(a.x - cc.x, a.y - cc.y) ? b : a;
      riga(da, cc, AZZURRO, 1.3, true);
    }
    riga(a, b, AZZURRO, 2.2);
  });
  c.setLineDash([]);
  for(const f of fuochi){
    const cc = P(f);
    c.fillStyle = 'rgba(0,0,0,.6)'; c.beginPath(); c.arc(cc.x, cc.y, 7*u, 0, 7); c.fill();
    c.fillStyle = AZZURRO; c.beginPath(); c.arc(cc.x, cc.y, 4.5*u, 0, 7); c.fill();
  }
  return { tela, W, H };
}

// I numeri dello studio, che vanno sul documento insieme all'immagine: sono
// loro a rendere confrontabili due studi fatti a un mese di distanza, e a
// permettere alla griglia di scrivere "23%" sotto ogni scheda senza riaprire
// niente.
export function misureStudio(){
  const r = cornice();
  const fuochi = fuochiDa(_linee);
  if(!fuochi.length) return null;
  const orizzonte = orizzonteDa(fuochi);
  const cx = r.x + r.w / 2;
  const t = (cx - orizzonte.a.x) / ((orizzonte.b.x - orizzonte.a.x) || 1);
  const y = orizzonte.a.y + t * (orizzonte.b.y - orizzonte.a.y);
  return {
    orizzonte: Math.round((y - r.y) / (r.h || 1) * 100),
    fughe: fuochi.map(f=> ({
      x: Math.round((f.x - r.x) / (r.w || 1) * 1000) / 1000,
      y: Math.round((f.y - r.y) / (r.h || 1) * 1000) / 1000,
    })),
  };
}

let _salvando = false;
async function salva(){
  if(_salvando || !_salvataggio) return;
  const misure = misureStudio();
  const fatto = disegnaSuTela();
  if(!misure || !fatto) return;
  _salvando = true;
  const btn = _ov.querySelector('.prosp-salva');
  btn.disabled = true; btn.textContent = 'Salvo…';
  try{
    const blob = await new Promise(res=> fatto.tela.toBlob(res, 'image/webp', 0.9));
    await _salvataggio({ blob, w: fatto.W, h: fatto.H, misure });
    btn.textContent = 'Salvato';
    // Chi salva ha finito di studiare QUESTA vignetta: si chiude da solo dopo
    // un attimo, se no resta un foglio di linee su una cosa gia' archiviata e
    // il gesto successivo e' sempre "chiudi".
    setTimeout(()=>{ if(prospettivaAperta()) chiudiProspettiva(); }, 700);
  }catch(e){
    btn.textContent = 'Non riuscito';
    setTimeout(()=>{ btn.textContent = 'Salva'; btn.disabled = false; }, 2200);
  }finally{ _salvando = false; }
}

// CHI SA SALVARE LO PASSA CHI APRE. Il lettore sa in che cartella sta l'albo
// che si sta leggendo, la galleria sa in che cartella sta il frammento aperto:
// nessuno dei due ha bisogno di chiedere dove mettere lo studio, e questo
// modulo non deve sapere niente ne' di cartelle ne' di Firestore.
// Senza chi salva, il pulsante non compare: e' quello che succede in un banco
// di prova, o se un domani lo si aprisse da un posto che non sa dove metterlo.
let _salvataggio = null;

export function apriProspettiva(img, opzioni){
  if(!img) return false;
  const o = typeof opzioni === 'function' ? { alChiude: opzioni } : (opzioni || {});
  _ov = _ov || costruisci();
  _img = img;
  _linee = []; _bozza = null; _riquadro = null; _bozzaRiq = null;
  _salvataggio = o.salva || null;
  _alChiude = o.alChiude || null;
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
  _img = null; _linee = []; _bozza = null; _riquadro = null; _bozzaRiq = null;
  _salvataggio = null; _salvando = false;
  const b = _ov.querySelector('.prosp-salva');
  if(b){ b.disabled = false; b.textContent = 'Salva'; }
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
export function __perLeProve(){ return { linee: _linee.slice(), fuochi: fuochiDa(_linee), riquadro: _riquadro }; }
export function __perLeProveRiquadro(r){ _riquadro = r; disegna(); }
export function __perLeProveTraccia(l){ _linee.push(l); disegna(); }
