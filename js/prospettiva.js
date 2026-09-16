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
// Un gesto piu' corto di cosi' — in pixel di SCHERMO, non in frazioni
// d'immagine — e' un tocco andato storto, non una linea ne' una vignetta.
const MIN_PX = 18;

let _ov = null;              // il foglio con l'SVG, uno solo per tutta l'app
let _img = null;             // l'immagine che si sta studiando
let _linee = [];             // { a:{x,y}, b:{x,y} } in coordinate 0..1 dell'immagine
let _bozza = null;           // la linea che il dito sta tracciando in questo momento
let _alChiude = null;
// UNA LINEA STORTA, PRIMA, SI POTEVA SOLO DISFARE E RITRACCIARE DA CAPO.
// Giovanni l'ha segnalato il 16 settembre 2026: due tratti tirati bene tranne
// un pelo su un estremo obbligavano a buttare via anche l'altro, giusto, per
// rifare tutto. Ora il dito puo' anche solo CORREGGERE: appoggiandosi vicino
// a un capo gia' piazzato lo si trascina, invece di aggiungerne uno nuovo. Lo
// stato qui sotto ricorda quale capo, di quale linea, sta seguendo il dito in
// questo momento — null il resto del tempo, quando il dito sta disegnando.
let _trascinaEstremo = null; // { i, estremo:'a'|'b' }
// LO STESSO PER IL RIQUADRO: quale lato o angolo il dito sta trascinando
// adesso (vedi trovaManigliaRiq), null il resto del tempo. A differenza delle
// linee, qui il dito muta DIRETTAMENTE _riquadro a ogni movimento — non un
// duplicato temporaneo — cosi' il ritaglio si stringe in diretta sotto al
// dito: e' proprio quel riscontro immediato che serve per allineare il bordo
// a un lato di vignetta storto, invece di indovinare e ricontrollare dopo.
let _trascinaRiq = null;     // { fx, fy, mx, my } — vedi trovaManigliaRiq
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

// ── SI LAVORA SEMPRE SU UN TAVOLO PROPRIO, DALLA PRIMA INQUADRATURA ──
//
// Appena lo strumento si apre si prende un TAVOLO: una copia pannabile e
// zoomabile dell'immagine, indipendente da come il lettore la stava mostrando
// in quel momento. All'inizio il tavolo contiene l'immagine INTERA (non c'e'
// ancora una vignetta scelta); appena si riquadra, si stringe su quella sola.
//
// PRIMA NON ERA COSI': mentre si sceglieva la vignetta, lo strumento restava
// appoggiato all'elemento <img> del lettore, che poteva essere gia' zoomato e
// spostato da PRIMA di aprire la prospettiva. Il foglio di prospettiva cattura
// pero' tutti i tocchi (serve, altrimenti un dito trascinerebbe anche la
// pagina sotto) — quindi se una vignetta era finita fuori dallo schermo per lo
// zoom del lettore, una volta aperta la prospettiva non c'era PIU' modo di
// spostarsi per raggiungerla: ne' il lettore riceveva piu' i tocchi, ne' la
// prospettiva sapeva ancora pannare (lo sapeva fare solo DOPO aver scelto la
// vignetta). Segnalato da Giovanni il 16 settembre 2026. Ora si pan/zoom fin
// da subito, sulla copia propria: quello che succede al lettore sotto non
// conta piu'.
//
// Da qui in giu' esiste UNA sola trasformazione, { ox, oy, s }: dove sta a
// schermo il pixel (0,0) dell'immagine, e quanti pixel di schermo vale un
// pixel d'immagine.
let _vista = null;           // { ox, oy, s } — nullo solo a strumento chiuso

function trasforma(){
  if(!_img || !_img.naturalWidth) return null;
  if(_vista) return _vista;
  // Ripiego per il primissimo istante, prima che apriProspettiva abbia fatto
  // in tempo a chiamare prendiIlTavolo(): non dovrebbe quasi mai servire.
  const r = _img.getBoundingClientRect();
  if(!(r.width > 4 && r.height > 4)) return null;
  return { ox: r.left, oy: r.top, s: r.width / _img.naturalWidth };
}
function aSchermo(p, t){
  return { x: t.ox + p.x * _img.naturalWidth * t.s, y: t.oy + p.y * _img.naturalHeight * t.s };
}
function aImmagine(cx, cy, t){
  return { x: (cx - t.ox) / (_img.naturalWidth * t.s), y: (cy - t.oy) / (_img.naturalHeight * t.s) };
}

// Lo spazio in cui il tavolo puo' stendersi: il PALCO, non piu' "lo schermo
// meno un conto a occhio sull'altezza della barra". Prima si misurava
// window.innerHeight meno l'altezza della barra piu' un margine di scorta
// indovinato (+20px) — un'approssimazione che, sbagliando il margine,
// lasciava la barra tornare a sedersi sopra l'immagine: la sovrapposizione
// segnalata da Giovanni il 16 settembre 2026. Da quando .prosp e' una colonna
// flex con il palco e la barra come due righe DIVERSE (vedi costruisci e
// prospettiva.css), lo spazio libero e' semplicemente il rettangolo che il
// layout ha gia' assegnato al palco: non una stima, la misura vera.
function spazioLibero(){
  const palco = _ov && _ov.querySelector('.prosp-palco');
  if(!palco) return { x: 14, y: 14, w: window.innerWidth - 28, h: Math.max(80, window.innerHeight - 138) };
  const r = palco.getBoundingClientRect();
  return { x: 14, y: 14, w: Math.max(80, r.width - 28), h: Math.max(80, r.height - 28) };
}

// Porta dentro lo spazio libero un rettangolo dato in coordinate 0..1
// dell'immagine, centrandolo. Serve due volte: per la vignetta da sola, e per
// la vignetta piu' le fughe quando si vuole vedere dove vanno a finire.
function inquadra(r){
  if(!_img || !_img.naturalWidth) return;
  const NW = _img.naturalWidth, NH = _img.naturalHeight;
  const L = spazioLibero();
  const s = Math.min(L.w / (r.w * NW), L.h / (r.h * NH));
  _vista = {
    s,
    ox: L.x + (L.w - r.w * NW * s) / 2 - r.x * NW * s,
    oy: L.y + (L.h - r.h * NH * s) / 2 - r.y * NH * s,
  };
}

// Il rettangolo che contiene la vignetta E tutte le fughe. Con la fuga dentro
// la vignetta e' la vignetta; con la fuga a due larghezze di distanza diventa
// tre volte piu' largo, e allargando la veduta la si vede finalmente.
function abbraccioFughe(){
  const r = cornice();
  let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
  for(const f of fuochiDa(_linee)){
    x0 = Math.min(x0, f.x); y0 = Math.min(y0, f.y);
    x1 = Math.max(x1, f.x); y1 = Math.max(y1, f.y);
  }
  // Un filo d'aria intorno, se no il pallino della fuga finisce tagliato a
  // meta' dal bordo dello schermo proprio mentre lo si va a guardare.
  const m = 0.04 * Math.max(x1 - x0, y1 - y0);
  return { x: x0 - m, y: y0 - m, w: (x1 - x0) + 2*m, h: (y1 - y0) + 2*m };
}

let _vedutaLarga = false;
export function adattaVeduta(tutto){
  _vedutaLarga = !!tutto; _mossoAMano = false;
  inquadra(tutto ? abbraccioFughe() : cornice());
  disegna();
}

// Mette a fuoco il tavolo sulla cornice attuale (l'immagine intera, o la
// vignetta appena scelta) e lo accende se non lo era gia'. Si chiama
// all'apertura dello strumento, e ogni volta che la cornice cambia (una nuova
// vignetta scelta, o il riquadro disfatto).
function prendiIlTavolo(){
  _vedutaLarga = false; _mossoAMano = false;
  inquadra(cornice());
  document.body.classList.add('prosp-tavolo-aperto');
}
// Il vero spegnimento, solo alla chiusura dello strumento: da quel momento
// non c'e' piu' un'immagine di cui tenere la vista.
function lasciaIlTavolo(){
  _vista = null; _vedutaLarga = false; _mossoAMano = false;
  document.body.classList.remove('prosp-tavolo-aperto');
}

// Il ritaglio della vignetta a schermo: un contenitore grande quanto la
// vignetta, con dentro l'immagine intera spostata in modo che sia proprio quel
// pezzo a cadere nel buco. Tutto in CSS, quindi ingrandire non ridisegna
// niente.
function sistemaIlTavolo(t){
  const tav = _ov.querySelector('.prosp-tavolo');
  if(!_vista){ tav.hidden = true; return; }
  const r = cornice(), NW = _img.naturalWidth, NH = _img.naturalHeight;
  const q = aSchermo({ x:r.x, y:r.y }, t);
  tav.hidden = false;
  tav.style.left = q.x + 'px'; tav.style.top = q.y + 'px';
  tav.style.width = (r.w * NW * t.s) + 'px';
  tav.style.height = (r.h * NH * t.s) + 'px';
  const im = tav.querySelector('img');
  if(im.src !== _img.currentSrc && im.src !== _img.src) im.src = _img.currentSrc || _img.src;
  im.style.width = (NW * t.s) + 'px';
  im.style.height = (NH * t.s) + 'px';
  im.style.left = (-r.x * NW * t.s) + 'px';
  im.style.top = (-r.y * NH * t.s) + 'px';
}

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
// SI CHIAMA HL, come nel gergo del disegno (horizon line), e i punti di fuga
// VP (vanishing point) — vedi letturaFuoco. Prima erano "Orizzonte" e "Fuga
// N" per esteso, con frasi come "Fuga 1 fuori in alto": lette una accanto
// all'altra, dieci volte per confrontare dieci tavole, sono lunghe da leggere
// e non e' cosi' che si parla di prospettiva. Restano un dato, non un
// racconto — niente aggettivi ("altissimo", "a terra") appiccicati al numero:
// davanti a una tavola di Otomo "23%" e' un dato, "altissimo" e' un giudizio
// che uno si fa da solo.
function testoOrizzonte(pct){
  if(pct < 0)   return 'HL ' + pct + '% (sopra)';
  if(pct > 100) return 'HL ' + pct + '% (sotto)';
  return 'HL ' + pct + '%';
}
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
  return testoOrizzonte(pct);
}

// E dove cade il punto di fuga rispetto alla vignetta: dentro o fuori, e di
// quante sue larghezze (w). Fuori e' il caso che interessa — e' quello che
// allunga le scene — e a schermo non si vedrebbe. Prima il fuori-alto/basso
// non portava nessun numero, solo "fuori in alto": qui la stessa unita' vale
// in tutte e quattro le direzioni, cosi' si puo' confrontare anche quello.
export function letturaFuoco(p, n, riq){
  const r = riq || { x:0, y:0, w:1, h:1 };
  const nome = 'VP' + n;
  const u = (p.x - r.x) / (r.w || 1);
  const v = (p.y - r.y) / (r.h || 1);
  const q = x => Math.round(Math.abs(x) * 10) / 10;
  if(u >= 0 && u <= 1 && v >= 0 && v <= 1) return nome;
  if(u < 0) return nome + ' sinistra ' + q(u) + 'w';
  if(u > 1) return nome + ' destra ' + q(u - 1) + 'w';
  if(v < 0) return nome + ' sopra ' + q(v) + 'w';
  return nome + ' sotto ' + q(v - 1) + 'w';
}

// ── IL FOGLIO ──
function costruisci(){
  const ov = document.createElement('div');
  ov.className = 'prosp';
  ov.id = 'prospettiva';
  ov.hidden = true;
  ov.innerHTML = `
    <!-- IL PALCO: tutto quello su cui si lavora — il tavolo e l'SVG — vive
         qui dentro, e QUI DENTRO SOLTANTO. Prima il tavolo e l'SVG erano
         grandi quanto l'intero foglio, e la barra ci galleggiava sopra con
         position:absolute: "lasciarle spazio" voleva dire un conto in JS
         (spazioLibero) che indovinava quanto fosse alta la barra e sperava di
         azzeccare il margine. Sbagliando quel margine la barra tornava a
         sedersi sopra l'immagine — la sovrapposizione segnalata da Giovanni
         il 16 settembre 2026. Ora il palco e la barra sono due righe DIVERSE
         di una colonna flex (vedi prospettiva.css): quello che il tavolo puo'
         occupare finisce dove comincia la barra per costruzione del layout,
         non per un calcolo che puo' sbagliare. -->
    <div class="prosp-palco">
      <!-- IL TAVOLO. Un ritaglio dell'immagine vera, non una copia ridisegnata:
           e' lo stesso file gia' decodificato dal lettore, spostato e
           ingrandito con una trasformazione CSS — quindi ingrandire e
           restringere non costa niente, anche su una tavola da tremila pixel.
           Quello che sborda dalla vignetta lo taglia il contenitore. -->
      <div class="prosp-tavolo" hidden><img alt=""></div>
      <svg class="prosp-svg" aria-hidden="true">
        <defs><clipPath id="prosp-clip"><rect class="prosp-clip-rect" x="0" y="0" width="0" height="0"/></clipPath></defs>
        <!-- Fuori dalla vignetta si scurisce: la tavola intorno resta visibile —
             serve a capire dove sta l'inquadratura nella pagina — ma smette di
             contendere l'attenzione a quella che si sta misurando. -->
        <path class="prosp-velo" fill="rgba(0,0,0,.5)" fill-rule="evenodd"></path>
        <rect class="prosp-cornice" fill="none" stroke="#f2e6cd" stroke-width="1.5" stroke-dasharray="7 5" opacity=".85"></rect>
        <g class="prosp-fascio" clip-path="url(#prosp-clip)"></g>
        <!-- L'ORIZZONTE NON SI TAGLIA, il fascio si.
             Il fascio e' la struttura di QUESTA vignetta: sparso su tutto lo
             schermo sarebbe rumore. L'orizzonte no: e' l'altezza dell'occhio, e
             quando cade fuori dal riquadro — il caso di Otomo, e il motivo per
             cui esiste il tasto per allargare la veduta — e' proprio LI' FUORI
             che lo si vuole vedere. Tagliandolo sulla vignetta, allargare la
             veduta non mostrava niente di nuovo: difetto trovato il 15 settembre
             2026 su uno studio salvato, dove la riga d'oro non c'era proprio.
             (Tagliarlo aveva un senso quando lo strumento stava appoggiato alla
             pagina e la riga correva da un bordo all'altro della finestra. Da
             quando la vignetta ha un tavolo suo, intorno c'e' il fondo del
             tavolo, e una riga d'oro che lo attraversa dice una cosa vera.) -->
        <g class="prosp-orizzonte"></g>
        <g class="prosp-tratti"></g>
        <!-- LE MANIGLIE: un cerchietto vuoto su ogni estremo gia' tracciato, e
             un quadratino su ogni angolo del riquadro scelto. Non fanno niente
             da sole — l'aggancio e' un conto di distanza in agganciaTratto,
             non un elemento cliccabile — servono solo a FAR VEDERE che quei
             punti si possono riprendere in mano, invece di dover disfare tutto
             per correggere un tratto storto (Giovanni, 16 settembre 2026). -->
        <g class="prosp-maniglie"></g>
        <g class="prosp-punti"></g>
      </svg>
    </div>
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
        <!-- ALLARGA LA VEDUTA. Quando la fuga cade due larghezze fuori dalla
             vignetta — il caso interessante — a schermo non c'e' modo di
             vederla. Questo tasto rimpicciolisce quanto basta a farci stare
             dentro la vignetta E le fughe, e ripremendolo si torna alla
             vignetta sola. Compare solo quando c'e' una fuga da andare a
             cercare. -->
        <button class="prosp-btn prosp-ico prosp-veduta" data-act="veduta" type="button" aria-label="Allarga la veduta" title="Allarga la veduta">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3H4.5A1.5 1.5 0 0 0 3 4.5V9"/><path d="M15 3h4.5A1.5 1.5 0 0 1 21 4.5V9"/><path d="M21 15v4.5a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M3 15v4.5A1.5 1.5 0 0 0 4.5 21H9"/></svg>
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
    if(a === 'indietro'){
      if(_linee.length) _linee.pop();
      // Disfare il riquadro non chiude il tavolo, lo rimette a fuoco
      // sull'immagine intera (cornice() torna {0,0,1,1} senza riquadro): il
      // tavolo resta acceso dall'apertura alla chiusura dello strumento.
      else { _riquadro = null; prendiIlTavolo(); }
      disegna();
    }
    else if(a === 'pulisci'){ _linee = []; _riquadro = null; _bozzaRiq = null; _trascinaEstremo = null; _trascinaRiq = null; prendiIlTavolo(); disegna(); }
    // "Tutta l'immagine" salta il riquadro: per un frammento gia' ritagliato su
    // una vignetta sola, riquadrarlo sarebbe un gesto a vuoto.
    else if(a === 'tutta'){ _riquadro = { x:0, y:0, w:1, h:1 }; prendiIlTavolo(); disegna(); }
    else if(a === 'salva'){ salva(); }
    else if(a === 'veduta'){ _vedutaLarga = !_vedutaLarga; adattaVeduta(_vedutaLarga); }
    else chiudiProspettiva();
  });
  agganciaTratto(ov.querySelector('.prosp-svg'));
  return ov;
}

// Il dito e' arrivato vicino a un capo GIA' TRACCIATO, o vuole cominciarne
// uno nuovo? Si cerca l'estremo piu' vicino fra tutte le linee, e si accetta
// solo entro un raggio comodo per un polpastrello (26px, piu' largo del
// MIN_PX del trascinamento: qui non serve distinguere un tocco vero da uno
// storto, serve solo essere generosi nel centrare un punto piccolo). Oltre
// quel raggio si presume che il dito voglia tracciare una riga nuova.
const RAGGIO_MANIGLIA = 26;
function trovaEstremo(cx, cy, t){
  let migliore = null, meglioDist = RAGGIO_MANIGLIA;
  _linee.forEach((l, i)=>{
    for(const estremo of ['a', 'b']){
      const p = aSchermo(l[estremo], t);
      const d = Math.hypot(p.x - cx, p.y - cy);
      if(d < meglioDist){ meglioDist = d; migliore = { i, estremo }; }
    }
  });
  return migliore;
}
// Lo stesso, sugli otto punti del riquadro gia' scelto: i quattro angoli
// (che spostano due lati insieme) e i quattro punti di mezzo dei lati (che ne
// spostano uno solo). SOLO GLI ANGOLI NON BASTAVANO: Giovanni l'ha mostrato
// il 16 settembre 2026 con una vignetta dove a sinistra si vedeva ancora un
// filo della vignetta successiva — il riquadro era giusto ovunque tranne che
// su QUEL lato, e trascinare un angolo avrebbe spostato anche il lato sopra o
// sotto, gia' preciso, per raddrizzarne uno solo. Ogni voce dice quale
// coordinata resta FERMA (fx/fy, null se quel lato non e' vincolato su
// quell'asse) e quale si muove (mx/my): il conto vero e' in _trascinaRiq piu'
// sotto.
function trovaManigliaRiq(cx, cy, t){
  if(!_riquadro) return null;
  const r = _riquadro;
  const candidati = [
    { punto:{x:r.x,       y:r.y      }, fx:r.x+r.w, fy:r.y+r.h, mx:true,  my:true  },
    { punto:{x:r.x+r.w,   y:r.y      }, fx:r.x,     fy:r.y+r.h, mx:true,  my:true  },
    { punto:{x:r.x,       y:r.y+r.h  }, fx:r.x+r.w, fy:r.y,     mx:true,  my:true  },
    { punto:{x:r.x+r.w,   y:r.y+r.h  }, fx:r.x,     fy:r.y,     mx:true,  my:true  },
    { punto:{x:r.x,       y:r.y+r.h/2}, fx:r.x+r.w, fy:null,    mx:true,  my:false },
    { punto:{x:r.x+r.w,   y:r.y+r.h/2}, fx:r.x,     fy:null,    mx:true,  my:false },
    { punto:{x:r.x+r.w/2, y:r.y      }, fx:null,    fy:r.y+r.h, mx:false, my:true  },
    { punto:{x:r.x+r.w/2, y:r.y+r.h  }, fx:null,    fy:r.y,     mx:false, my:true  },
  ];
  let migliore = null, meglioDist = RAGGIO_MANIGLIA;
  for(const cand of candidati){
    const p = aSchermo(cand.punto, t);
    const d = Math.hypot(p.x - cx, p.y - cy);
    if(d < meglioDist){ meglioDist = d; migliore = cand; }
  }
  return migliore;
}
// Sotto quanto non si lascia stringere un lato: un riquadro a fetta di
// carta non misurerebbe piu' niente.
const RIQ_MIN = 0.02;
function versoIlFermo(v, fermo, min){
  return v < fermo ? Math.min(v, fermo - min) : Math.max(v, fermo + min);
}

// Il tratto si fa trascinando, con i Pointer Events: un solo codice per dito,
// mouse e pennino, che e' esattamente il pubblico di questo strumento.
function agganciaTratto(svg){
  let attivo = null;
  // Le dita appoggiate adesso. Con una si disegna, con due si guarda: stringere
  // e spostare la veduta e' un gesto a due dita, cosi' non ruba niente al
  // tratto — che e' il gesto principale e deve restare il piu' immediato.
  const dita = new Map();
  let pizzico = null;

  const centro = ()=>{
    const v = Array.from(dita.values());
    return { x:(v[0].x + v[1].x)/2, y:(v[0].y + v[1].y)/2,
             d: Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y) };
  };

  svg.addEventListener('pointerdown', e=>{
    const t = trasforma(); if(!t) return;
    dita.set(e.pointerId, { x:e.clientX, y:e.clientY });
    try{ svg.setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault();
    // Il secondo dito annulla il tratto appena cominciato: chi apre due dita
    // vuole guardare, non ha sbagliato a disegnare.
    if(dita.size === 2 && _vista){
      _bozza = null; _bozzaRiq = null; _trascinaEstremo = null; _trascinaRiq = null; attivo = null;
      const c = centro();
      pizzico = { d:c.d, x:c.x, y:c.y, s:_vista.s, ox:_vista.ox, oy:_vista.oy };
      disegna();
      return;
    }
    if(dita.size > 1) return;
    attivo = e.pointerId;
    // PRIMA SI CERCA UN CAPO GIA' PIAZZATO. Una volta tracciate le linee, il
    // dito serve piu' spesso a CORREGGERLE che ad aggiungerne di nuove — vedi
    // la nota sopra _trascinaEstremo. Si guarda prima un estremo di linea,
    // poi una maniglia del riquadro: solo se nessuno dei due e' vicino si
    // parte con un gesto nuovo, come prima.
    if(!faseRiquadro()){
      const est = trovaEstremo(e.clientX, e.clientY, t);
      if(est){ _trascinaEstremo = est; return; }
      const man = trovaManigliaRiq(e.clientX, e.clientY, t);
      if(man){ _trascinaRiq = man; return; }
    }
    const p = aImmagine(e.clientX, e.clientY, t);
    if(faseRiquadro()) _bozzaRiq = { a:p, b:p };
    else _bozza = { a:p, b:p };
  });

  svg.addEventListener('pointermove', e=>{
    if(dita.has(e.pointerId)) dita.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if(pizzico && dita.size === 2){
      const c = centro();
      const k = c.d > 8 ? c.d / (pizzico.d || 1) : 1;
      // Si stringe intorno al punto fra le due dita, e insieme si sposta di
      // quanto quel punto si e' spostato: e' la somma delle due cose, ed e'
      // quello che il dito si aspetta.
      _vista = {
        s: pizzico.s * k,
        ox: c.x - (pizzico.x - pizzico.ox) * k,
        oy: c.y - (pizzico.y - pizzico.oy) * k,
      };
      _vedutaLarga = false; _mossoAMano = true;
      disegna();
      return;
    }
    if(attivo !== e.pointerId) return;
    const t = trasforma(); if(!t) return;
    if(_trascinaEstremo){
      _linee[_trascinaEstremo.i][_trascinaEstremo.estremo] = aImmagine(e.clientX, e.clientY, t);
      disegna();
      return;
    }
    if(_trascinaRiq){
      // Si muta _riquadro SUBITO, non una bozza a parte: sistemaIlTavolo
      // legge cornice() a ogni disegna(), quindi il ritaglio si stringe in
      // diretta sotto al dito — e' quel riscontro immediato, non un
      // anteprima seguita da un salto, che serve per allineare il bordo a un
      // lato di vignetta storto.
      const p = aImmagine(e.clientX, e.clientY, t);
      if(_trascinaRiq.mx){
        const nx = versoIlFermo(p.x, _trascinaRiq.fx, RIQ_MIN);
        _riquadro.x = Math.min(nx, _trascinaRiq.fx);
        _riquadro.w = Math.abs(nx - _trascinaRiq.fx);
      }
      if(_trascinaRiq.my){
        const ny = versoIlFermo(p.y, _trascinaRiq.fy, RIQ_MIN);
        _riquadro.y = Math.min(ny, _trascinaRiq.fy);
        _riquadro.h = Math.abs(ny - _trascinaRiq.fy);
      }
      disegna();
      return;
    }
    const p = aImmagine(e.clientX, e.clientY, t);
    if(_bozzaRiq) _bozzaRiq.b = p;
    else if(_bozza) _bozza.b = p;
    else return;
    disegna();
  });

  const finisci = e=>{
    dita.delete(e.pointerId);
    if(dita.size < 2) pizzico = null;
    if(attivo !== e.pointerId) return;
    attivo = null;
    if(_trascinaEstremo){
      // Niente MIN_PX qui: e' manipolazione diretta di un punto gia' buono,
      // non un gesto che si distingue da un tocco a vuoto — qualunque
      // spostamento, anche minimo, e' intenzionale.
      _trascinaEstremo = null;
      disegna();
      return;
    }
    if(_trascinaRiq){
      // _riquadro e' gia' quello giusto (mutato a ogni pointermove): qui
      // resta solo da rimettere a fuoco il tavolo sulla misura nuova, come
      // dopo aver scelto un riquadro da zero.
      _trascinaRiq = null;
      prendiIlTavolo();
      disegna();
      return;
    }
    const t = trasforma();
    if(_bozzaRiq && t){
      const a = aSchermo(_bozzaRiq.a, t), b = aSchermo(_bozzaRiq.b, t);
      // Le misure minime si contano in PIXEL DI SCHERMO e non in frazioni
      // d'immagine: sul tavolo la vignetta e' ingrandita, e "un ventesimo
      // dell'immagine" sarebbe diventato mezzo schermo.
      if(Math.abs(b.x - a.x) >= MIN_PX && Math.abs(b.y - a.y) >= MIN_PX){
        _riquadro = {
          x: Math.min(_bozzaRiq.a.x, _bozzaRiq.b.x), y: Math.min(_bozzaRiq.a.y, _bozzaRiq.b.y),
          w: Math.abs(_bozzaRiq.b.x - _bozzaRiq.a.x), h: Math.abs(_bozzaRiq.b.y - _bozzaRiq.a.y),
        };
        prendiIlTavolo();
      }
      _bozzaRiq = null;
    } else if(_bozza && t){
      const a = aSchermo(_bozza.a, t), b = aSchermo(_bozza.b, t);
      // Un tocco senza trascinamento non e' una linea: senza questo controllo
      // ogni tocco a vuoto sporcherebbe lo schema con un puntino inutile.
      if(Math.hypot(b.x - a.x, b.y - a.y) >= MIN_PX) _linee.push(_bozza);
      _bozza = null;
    }
    disegna();
  };
  svg.addEventListener('pointerup', finisci);
  svg.addEventListener('pointercancel', finisci);

  // COL MOUSE LA ROTELLA. Due dita non ce le ha nessuno su un portatile, e
  // Giovanni lo strumento lo usa anche da browser: senza la rotella, allargare
  // la veduta resterebbe possibile solo col tasto.
  svg.addEventListener('wheel', e=>{
    if(!_vista) return;
    e.preventDefault();
    const k = Math.exp(-e.deltaY * 0.0016);
    _vista = {
      s: _vista.s * k,
      ox: e.clientX - (e.clientX - _vista.ox) * k,
      oy: e.clientY - (e.clientY - _vista.oy) * k,
    };
    _vedutaLarga = false; _mossoAMano = true;
    disegna();
  }, { passive:false });
}

// Ogni tratto due volte: l'ombra scura sotto e il colore sopra (vedi la nota
// in cima). Senza l'ombra, su una retinatura nera il magenta sparisce.
function tratto(x1, y1, x2, y2, colore, spessore){
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(0,0,0,.6)" stroke-width="${spessore + 2}" stroke-linecap="round"/>`
       + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colore}" stroke-width="${spessore}" stroke-linecap="round"/>`;
}

export function disegna(){
  if(!_ov || _ov.hidden) return;
  const t = trasforma();
  const svg = _ov.querySelector('.prosp-svg');
  if(!t) return;
  // Il viewBox segue la misura VERA del palco, non piu' quella dell'intera
  // finestra: da quando l'SVG vive dentro .prosp-palco (una riga della
  // colonna flex, non piu' tutto il foglio) il suo riquadro renderizzato e'
  // gia' piu' basso della finestra di quanto la barra occupa sotto. Usare
  // ancora window.innerHeight qui scalerebbe il contenuto (1 unita' di
  // viewBox non varrebbe piu' un pixel), mentre le coordinate che si
  // disegnano sopra (aSchermo, _vista) restano in pixel di pagina — il palco
  // parte da (0,0) come partiva .prosp prima, quindi l'origine coincide e
  // basta smettere di forzare l'altezza intera.
  const palco = _ov.querySelector('.prosp-palco');
  const pr = palco.getBoundingClientRect();
  svg.setAttribute('viewBox', '0 0 ' + pr.width + ' ' + pr.height);
  sistemaIlTavolo(t);

  // La cornice a schermo: quella scelta, o quella che il dito sta trascinando
  // adesso — cosi' il velo e il bordo seguono il trascinamento invece di
  // comparire solo alla fine.
  const riq = _bozzaRiq
    ? { x: Math.min(_bozzaRiq.a.x, _bozzaRiq.b.x), y: Math.min(_bozzaRiq.a.y, _bozzaRiq.b.y),
        w: Math.abs(_bozzaRiq.b.x - _bozzaRiq.a.x), h: Math.abs(_bozzaRiq.b.y - _bozzaRiq.a.y) }
    : cornice();
  const a0 = aSchermo({ x:riq.x, y:riq.y }, t), a1 = aSchermo({ x:riq.x+riq.w, y:riq.y+riq.h }, t);
  const q = { x: a0.x, y: a0.y, w: a1.x - a0.x, h: a1.y - a0.y };

  // Tutto si taglia sulla VIGNETTA, non sull'immagine: il fascio che sborda
  // nelle vignette accanto non e' la prospettiva di questa.
  const clip = _ov.querySelector('.prosp-clip-rect');
  clip.setAttribute('x', q.x); clip.setAttribute('y', q.y);
  clip.setAttribute('width', q.w); clip.setAttribute('height', q.h);

  // Il velo serve solo MENTRE si sceglie la vignetta (nessun riquadro ancora
  // scelto), per staccare il rettangolo in corso dal resto dell'immagine che
  // si sta pannando. Una volta scelta la vignetta il tavolo mostra solo lei:
  // non c'e' piu' niente da mettere da parte, e un grigio sopra sarebbe solo
  // grigio.
  const W = pr.width, H = pr.height;
  const velo = _ov.querySelector('.prosp-velo');
  const scegliendo = faseRiquadro();
  const tutta = riq.w >= 0.999 && riq.h >= 0.999 && riq.x <= 0.001 && riq.y <= 0.001;
  velo.setAttribute('d', scegliendo && _bozzaRiq && !tutta
    ? `M0 0 H${W} V${H} H0 Z M${q.x} ${q.y} H${q.x + q.w} V${q.y + q.h} H${q.x} Z` : '');
  const bordo = _ov.querySelector('.prosp-cornice');
  const mostraBordo = _riquadro || _bozzaRiq;
  bordo.setAttribute('x', q.x); bordo.setAttribute('y', q.y);
  bordo.setAttribute('width', mostraBordo ? Math.max(0, q.w) : 0);
  bordo.setAttribute('height', mostraBordo ? Math.max(0, q.h) : 0);

  const linee = _bozza ? _linee.concat([_bozza]) : _linee;
  const fuochi = fuochiDa(linee);
  const orizzonte = orizzonteDa(fuochi);

  // IL FASCIO. Invece di scegliere degli angoli — che con la fuga fuori
  // schermo diventerebbero tutti uguali e il fascio un pennello solo — si
  // tirano le linee verso punti distribuiti sul BORDO DELLA VIGNETTA: cosi' il
  // ventaglio la copre sempre tutta, ovunque sia la fuga.
  let fascio = '';
  for(const f of fuochi){
    const c = aSchermo(f, t);
    for(let i = 0; i < RAGGI; i++){
      const k = i / RAGGI * 4;               // giro completo del perimetro, in quarti
      const lato = Math.floor(k), u = k - lato;
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
    const a = aSchermo(l.a, t), b = aSchermo(l.b, t);
    const f = fuochi[Math.floor(i / 2)];
    if(f){
      const c = aSchermo(f, t);
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
    ? (()=>{ const a = aSchermo(orizzonte.a, t), b = aSchermo(orizzonte.b, t);
             return tratto(a.x, a.y, b.x, b.y, ORO, 3); })()
    : '';

  let punti = '';
  for(const f of fuochi){
    const c = aSchermo(f, t);
    punti += `<circle cx="${c.x}" cy="${c.y}" r="7" fill="rgba(0,0,0,.6)"/>`
          +  `<circle cx="${c.x}" cy="${c.y}" r="4.5" fill="${AZZURRO}"/>`;
  }
  _ov.querySelector('.prosp-punti').innerHTML = punti;

  // LE MANIGLIE. Un cerchietto vuoto su ogni capo di linea gia' tracciato —
  // vuoto, per non confondersi col pallino pieno della fuga — e un
  // quadratino sugli angoli del riquadro, se c'e' gia'. Non catturano tocchi
  // di loro (l'aggancio e' un conto di distanza in trovaEstremo/
  // trovaAngoloRiq, non un target DOM): servono solo a mostrare che quei
  // punti si possono riprendere in mano.
  let maniglie = '';
  for(const l of _linee){
    for(const estremo of ['a', 'b']){
      const c = aSchermo(l[estremo], t);
      maniglie += `<circle cx="${c.x}" cy="${c.y}" r="8" fill="rgba(0,0,0,.4)" stroke="${AZZURRO}" stroke-width="1.6" opacity=".85"/>`;
    }
  }
  if(_riquadro){
    // Angoli E meta' dei lati: un angolo sposta due bordi insieme, un punto
    // di mezzo lato ne stringe uno solo — serve proprio quando il riquadro e'
    // giusto ovunque tranne che su UN lato (vedi trovaManigliaRiq).
    const otto = [
      {x:q.x,       y:q.y      }, {x:q.x+q.w,   y:q.y      },
      {x:q.x,       y:q.y+q.h  }, {x:q.x+q.w,   y:q.y+q.h  },
      {x:q.x+q.w/2, y:q.y      }, {x:q.x+q.w/2, y:q.y+q.h  },
      {x:q.x,       y:q.y+q.h/2}, {x:q.x+q.w,   y:q.y+q.h/2},
    ];
    for(const p of otto){
      maniglie += `<rect x="${p.x-6}" y="${p.y-6}" width="12" height="12" fill="rgba(0,0,0,.4)" stroke="${SABBIA}" stroke-width="1.6" opacity=".85"/>`;
    }
  }
  _ov.querySelector('.prosp-maniglie').innerHTML = maniglie;

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
  // Il tasto della veduta compare solo quando c'e' una fuga da andare a
  // cercare, e dice in che stato si e': premuto vuol dire "sto guardando
  // largo".
  const ved = _ov.querySelector('.prosp-veduta');
  ved.hidden = !fuochi.length;
  ved.classList.toggle('acceso', _vedutaLarga);

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
const FONDO = '#16120c';     // il fondo del tavolo, dove la pagina non arriva

// CHE PEZZO DI MONDO FINISCE NELL'IMMAGINE SALVATA.
//
// Prima era sempre e solo la vignetta, e il 15 settembre 2026 si e' visto il
// limite: con l'orizzonte fuori dal riquadro, nello studio salvato la riga
// d'oro non c'era proprio — restava una vignetta con due linee azzurre e
// nessuna risposta. La cura di allora era "si salva quello che si vede a
// schermo in quel momento": bastava aver allargato la veduta (⤢, due dita, la
// rotella) prima di premere Salva, e la fuga finiva dentro.
//
// SBAGLIATA ANCHE QUELLA, e Giovanni l'ha trovato il 16 settembre 2026: per
// TRACCIARE con precisione si zooma stretti, e la mano che ha appena finito il
// secondo tratto e' la stessa che preme Salva — dimenticarsi di rizoomare
// indietro prima vuol dire salvare un ritaglio, non lo studio. "Quello che si
// vede mentre si lavora" e "quello che finisce salvato" sono due domande
// diverse, e legarle insieme era l'errore: la prima la decide il dito (serve
// precisione), la seconda la deve decidere lo strumento (serve completezza).
//
// Adesso NON dipende piu' da come si sta guardando lo schermo in quel momento:
// e' sempre la vignetta, allargata quel poco che serve a contenere ogni fuga —
// vedi abbraccioFughe — SOLO SE una fuga cade fuori dal riquadro. Con la fuga
// dentro (il caso normale) si salva la vignetta sola, pulita, esattamente
// com'era: non ha senso aggiungere margine e cornice tratteggiata a uno studio
// che gia' contiene tutto quello che serve.
//
// E per i casi che NESSUNA inquadratura potrebbe contenere — l'orizzonte a
// meno millecinquecento per cento, la fuga a undici larghezze — sotto
// l'immagine si scrivono comunque i numeri (vedi strisciaDati). Li' il dato E'
// il numero, non il disegno.
function areaDaSalvare(){
  const r = cornice();
  const dentro = f => f.x >= r.x && f.x <= r.x + r.w && f.y >= r.y && f.y <= r.y + r.h;
  return fuochiDa(_linee).every(dentro) ? r : abbraccioFughe();
}

// La striscia coi numeri sotto l'immagine. Non e' una didascalia carina: e'
// l'unica forma in cui uno studio con la fuga a undici larghezze puo' dire
// qualcosa, e fra un mese e' quello che si va a leggere.
function strisciaDati(c, W, y, h, misure){
  c.fillStyle = 'rgba(12,9,5,.96)';
  c.fillRect(0, y, W, h);
  const fs = Math.max(11, Math.round(h * 0.34));
  c.textBaseline = 'middle';
  c.font = '800 ' + fs + 'px system-ui, -apple-system, sans-serif';
  c.fillStyle = ORO;
  c.fillText(testoOrizzonte(misure.orizzonte), h * 0.34, y + h * 0.34);
  c.font = '600 ' + Math.round(fs * 0.82) + 'px system-ui, -apple-system, sans-serif';
  c.fillStyle = 'rgba(240,232,216,.72)';
  c.fillText(misure.fughe.map((f, i)=> letturaFuoco(
    { x: cornice().x + f.x * cornice().w, y: cornice().y + f.y * cornice().h },
    i + 1, cornice())).join('   ·   '), h * 0.34, y + h * 0.72);
}

function disegnaSuTela(){
  if(!_img || !_img.naturalWidth) return null;
  const A = areaDaSalvare();
  const riq = cornice();
  const NW = _img.naturalWidth, NH = _img.naturalHeight;
  const ax = A.x * NW, ay = A.y * NH, aw = A.w * NW, ah = A.h * NH;
  if(aw < 8 || ah < 8) return null;
  const k = Math.min(1, LATO_MAX / Math.max(aw, ah));
  const W = Math.round(aw * k), Hi = Math.round(ah * k);
  const striscia = Math.max(30, Math.round(Math.min(W, Hi) * 0.1));
  const tela = document.createElement('canvas');
  tela.width = W; tela.height = Hi + striscia;
  const c = tela.getContext('2d');

  // Il fondo del tavolo prima di tutto: dove la pagina non arriva resta lui,
  // non un rettangolo nero trasparente che in WebP diventa una macchia.
  c.fillStyle = FONDO; c.fillRect(0, 0, W, Hi + striscia);
  // SI DISEGNA SOLO LA VIGNETTA VERA — il riquadro, non tutta l'area
  // allargata. Il primo tentativo disegnava l'immagine sorgente su TUTTA
  // l'area di abbraccioFughe: sembrava giusto ("dove la pagina non arriva
  // resta il fondo"), ma la fuga cade quasi sempre ancora DENTRO l'immagine —
  // solo in un'ALTRA vignetta della stessa tavola, la stessa foto di pagina.
  // Il margine allargato finiva cosi' pieno del disegno della vignetta
  // accanto, invece che neutro. Giovanni l'ha trovato il 16 settembre 2026 su
  // una fuga molto alta: lo studio esportato mostrava un'intera altra
  // vignetta sopra, non uno sfondo pulito — esattamente il contrario di
  // quello per cui esiste il tavolo (vedi la nota in apertura del file). A
  // schermo il problema non si vedeva perche' sistemaIlTavolo ritaglia SEMPRE
  // al riquadro, mai all'area allargata: qui si fa la stessa cosa.
  const rx = riq.x * NW, ry = riq.y * NH, rw = riq.w * NW, rh = riq.h * NH;
  const sx0 = Math.max(0, rx), sy0 = Math.max(0, ry);
  const sx1 = Math.min(NW, rx + rw), sy1 = Math.min(NH, ry + rh);
  if(sx1 > sx0 && sy1 > sy0){
    c.drawImage(_img, sx0, sy0, sx1 - sx0, sy1 - sy0,
                (sx0 - ax) * k, (sy0 - ay) * k, (sx1 - sx0) * k, (sy1 - sy0) * k);
  }

  // Dalle coordinate dell'IMMAGINE a quelle della tela.
  const P = p => ({ x: (p.x * NW - ax) * k, y: (p.y * NH - ay) * k });
  // Le misure seguono la tela: su una vignetta grande le linee devono restare
  // proporzionate, non diventare capelli.
  const u = Math.max(1, Math.min(W, Hi) / 380);
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
  const q0 = P({ x:riq.x, y:riq.y }), q1 = P({ x:riq.x + riq.w, y:riq.y + riq.h });

  // Il fascio e l'orizzonte stanno dentro la VIGNETTA, come a schermo: sono la
  // prospettiva di lei, non di quello che le sta intorno.
  c.save(); c.beginPath(); c.rect(q0.x, q0.y, q1.x - q0.x, q1.y - q0.y); c.clip();
  c.globalAlpha = .38; c.strokeStyle = AZZURRO; c.lineWidth = u; c.setLineDash([]);
  for(const f of fuochi){
    const cc = P(f);
    for(let i = 0; i < RAGGI; i++){
      const t = i / RAGGI * 4, lato = Math.floor(t), g = t - lato;
      const b = lato === 0 ? { x:q0.x + g*(q1.x-q0.x), y:q0.y }
              : lato === 1 ? { x:q1.x, y:q0.y + g*(q1.y-q0.y) }
              : lato === 2 ? { x:q0.x + (1-g)*(q1.x-q0.x), y:q1.y }
              : { x:q0.x, y:q0.y + (1-g)*(q1.y-q0.y) };
      c.beginPath(); c.moveTo(cc.x, cc.y);
      c.lineTo(cc.x + (b.x - cc.x) * 3, cc.y + (b.y - cc.y) * 3); c.stroke();
    }
  }
  c.globalAlpha = 1;
  c.restore();
  // L'orizzonte FUORI dal ritaglio del fascio, per la ragione detta sopra:
  // quando cade fuori dalla vignetta e' li' fuori che lo si vuole vedere.
  if(orizzonte) riga(P(orizzonte.a), P(orizzonte.b), ORO, 3);

  // Il bordo della vignetta, ma solo se intorno c'e' altro: sulla vignetta sola
  // sarebbe una cornice disegnata sul bordo dell'immagine, cioe' niente.
  if(A.w > riq.w * 1.02 || A.h > riq.h * 1.02){
    c.setLineDash([7*u, 5*u]); c.lineWidth = 1.5 * u; c.strokeStyle = SABBIA;
    c.strokeRect(q0.x, q0.y, q1.x - q0.x, q1.y - q0.y);
    c.setLineDash([]);
  }

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

  const misure = misureStudio();
  if(misure) strisciaDati(c, W, Hi, striscia, misure);
  return { tela, W, H: Hi + striscia };
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
  _linee = []; _bozza = null; _riquadro = null; _bozzaRiq = null; _trascinaEstremo = null; _trascinaRiq = null;
  _salvataggio = o.salva || null;
  _alChiude = o.alChiude || null;
  _ov.hidden = false;
  document.body.classList.add('prosp-aperta');
  // Il tavolo si prende SUBITO, con l'immagine intera (cornice() torna
  // {0,0,1,1} finche' non c'e' un riquadro): da qui in poi si puo' pan/zoom
  // fin dal primo istante, invece di restare appesi a come il lettore la
  // stava mostrando (vedi la nota sopra trasforma()).
  prendiIlTavolo();
  window.addEventListener('resize', riadatta);
  window.addEventListener('orientationchange', riadatta);
  document.addEventListener('keydown', tasti);
  disegna();
  return true;
}

export function chiudiProspettiva(){
  if(!_ov || _ov.hidden) return;
  _ov.hidden = true;
  _img = null; _linee = []; _bozza = null; _riquadro = null; _bozzaRiq = null; _trascinaEstremo = null; _trascinaRiq = null;
  lasciaIlTavolo();
  _salvataggio = null; _salvando = false;
  const b = _ov.querySelector('.prosp-salva');
  if(b){ b.disabled = false; b.textContent = 'Salva'; }
  document.body.classList.remove('prosp-aperta');
  window.removeEventListener('resize', riadatta);
  window.removeEventListener('orientationchange', riadatta);
  document.removeEventListener('keydown', tasti);
  const f = _alChiude; _alChiude = null;
  if(f) try{ f(); }catch(e){}
}

// Girando il telefono lo spazio libero cambia forma: il tavolo si rimette a
// posto da solo invece di restare inquadrato per lo schermo di prima. Se pero'
// si era stretto o spostato a mano, quella scelta si rispetta.
let _mossoAMano = false;
function riadatta(){
  if(_vista && !_mossoAMano) inquadra(_vedutaLarga ? abbraccioFughe() : cornice());
  disegna();
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
// Scegliere la vignetta vuol dire anche prendersi il tavolo: il gancio per le
// prove fa le due cose insieme, come le fa il dito. Facendone una sola si
// proverebbe uno stato che nell'app non esiste.
export function __perLeProveRiquadro(r){ _riquadro = r; prendiIlTavolo(); disegna(); }
export function __perLeProveTraccia(l){ _linee.push(l); disegna(); }
