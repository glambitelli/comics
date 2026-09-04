// ── SCHIZZO — un foglio su cui disegnare col dito ────────────────────────────
//
// Va detto chiaro, perche' e' stato chiesto due volte come se ci fosse gia':
// prima di questo file Inkflow NON aveva nessuno strumento di disegno.
// ritaglio.js e rifila.js tirano rettangoli di ritaglio, canvas.js disegna le
// gemme dei trofei; un pennello non c'era da nessuna parte. Quindi qui non si
// riusa niente — si scrive il minimo indispensabile perche' disegnare dentro un
// beat sia una strada d'ingresso di pari dignita' rispetto alla tastiera, e non
// un extra sepolto in un menu.
//
// MINIMO INDISPENSABILE, alla lettera. Un tratto nero, uno spessore solo,
// niente colori, niente gomma. Ogni strumento in piu' e' una decisione in piu'
// da prendere prima di cominciare a disegnare, e questa sezione esiste proprio
// per non farne prendere nessuna. Gli sbagli si tolgono con "annulla", che non
// e' una scelta: e' tornare indietro.
//
// E NON C'E' UN "ANNULLA TUTTO E CHIUDI". La freccia in alto a sinistra salva e
// chiude, punto: una via sola d'uscita. Chi vuole buttare via il disegno tocca
// "Pulisci" e poi esce — cioe' fa una cosa che si vede, invece di rispondere a
// una domanda ("vuoi davvero uscire senza salvare?") mentre sta gia' pensando
// ad altro.
import { haptic } from './state.js';

// Il foglio e' un rettangolo 4:3 come una vignetta larga, non tutto lo schermo:
// disegnare "ovunque" non da' nessun senso della composizione, e un beat e' una
// inquadratura. La risoluzione e' fissa e indipendente dallo schermo, cosi' lo
// stesso schizzo fatto sul telefono e sul computer pesa e appare uguale.
const LARGO = 900, ALTO = 675;
const TRATTO = 4.2;          // spessore in unita' del foglio, non dello schermo

let _tratti = [];            // [[{x,y}, …], …] in coordinate del foglio
let _sfondo = null;          // il disegno gia' fatto, se si sta riaprendo
let _alSalva = null;
let _salvando = false;
let _agganciato = false;

function tela(){ return document.getElementById('schizzo-tela'); }

// Dal dito alle coordinate del foglio. Si passa sempre per il rettangolo
// disegnato a schermo: il foglio e' centrato e ridimensionato dal CSS, e senza
// questa conversione il tratto uscirebbe spostato di quanto vale il margine.
function punto(e){
  const c = tela();
  const r = c.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) / r.width * LARGO,
    y: (e.clientY - r.top) / r.height * ALTO,
  };
}

// Ridisegna tutto: sfondo (se si sta riaprendo un disegno) e poi i tratti.
// Il tratto passa per i PUNTI MEDI con delle curve invece che per i punti
// stessi con dei segmenti: a dito veloce i punti arrivano radi, e unendoli
// dritti si vedono gli angoli — un tratto spezzato somiglia a un errore, non a
// un segno.
function dipingi(ctx, w, h){
  const sx = w / LARGO, sy = h / ALTO;
  ctx.save();
  ctx.fillStyle = '#fffdf7';
  ctx.fillRect(0, 0, w, h);
  if(_sfondo) ctx.drawImage(_sfondo, 0, 0, w, h);
  ctx.scale(sx, sy);
  ctx.strokeStyle = '#1a1410';
  ctx.lineWidth = TRATTO;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for(const t of _tratti){
    if(t.length === 1){
      // Un punto solo e' un punto: senza questo, toccare e alzare il dito non
      // lascerebbe niente sul foglio.
      ctx.beginPath();
      ctx.arc(t[0].x, t[0].y, TRATTO/2, 0, Math.PI*2);
      ctx.fillStyle = '#1a1410'; ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(t[0].x, t[0].y);
    for(let i=1; i<t.length-1; i++){
      const mx = (t[i].x + t[i+1].x)/2, my = (t[i].y + t[i+1].y)/2;
      ctx.quadraticCurveTo(t[i].x, t[i].y, mx, my);
    }
    ctx.lineTo(t[t.length-1].x, t[t.length-1].y);
    ctx.stroke();
  }
  ctx.restore();
}

function ridisegna(){
  const c = tela();
  if(!c) return;
  // La tela a schermo lavora alla risoluzione vera del display: alla risoluzione
  // CSS il tratto su un telefono moderno esce sfocato, e uno schizzo sfocato
  // sembra sbagliato anche quando e' giusto.
  const r = c.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if(c.width !== w || c.height !== h){ c.width = w; c.height = h; }
  dipingi(c.getContext('2d'), w, h);
  aggiornaBottoni();
}

function aggiornaBottoni(){
  const annulla = document.getElementById('schizzo-annulla');
  const pulisci = document.getElementById('schizzo-pulisci');
  // Spenti quando non c'e' niente da annullare o da pulire: un pulsante acceso
  // che non fa niente si prova, non funziona, e da quel momento non ci si fida
  // piu' nemmeno degli altri.
  if(annulla) annulla.disabled = !_tratti.length;
  if(pulisci) pulisci.disabled = !_tratti.length && !_sfondo;
}

export function vuoto(){ return !_tratti.length && !_sfondo; }

// Il PNG da salvare, alla risoluzione fissa del foglio. Sfondo bianco pieno e
// non trasparente: la miniatura finisce dentro una scheda chiara e su una board
// scura, e un tratto nero su trasparente sparirebbe sulla seconda.
function esporta(){
  const c = document.createElement('canvas');
  c.width = LARGO; c.height = ALTO;
  dipingi(c.getContext('2d'), LARGO, ALTO);
  return new Promise(r=> c.toBlob(r, 'image/png'));
}

function messaggio(testo){
  const el = document.getElementById('schizzo-esito');
  if(!el) return;
  el.textContent = testo || '';
  el.hidden = !testo;
}

// opzioni.url      — il disegno gia' fatto, se si sta riaprendo
// opzioni.onSalva  — riceve il blob PNG; se va male deve lanciare
export async function apriSchizzo(opzioni = {}){
  aggancia();
  _tratti = [];
  _sfondo = null;
  _alSalva = opzioni.onSalva || null;
  _salvando = false;
  messaggio('');
  const foglio = document.getElementById('schizzo');
  foglio.classList.add('open');
  try{ if(!history.state || history.state.view !== 'schizzo') history.pushState({view:'schizzo'}, ''); }catch(e){}
  // La tela va misurata a foglio APERTO: mentre sale e' ancora fuori dallo
  // schermo e il rettangolo sarebbe quello sbagliato.
  requestAnimationFrame(()=> requestAnimationFrame(ridisegna));
  if(opzioni.url){
    // crossOrigin perche' il disegno arriva da Cloudinary e finira' dentro un
    // canvas da esportare: senza, la tela si "sporca" e toBlob smette di
    // funzionare (stessa storia gia' vista in rifila.js).
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = ()=>{ _sfondo = img; ridisegna(); };
    img.src = opzioni.url;
  }
}

export function schizzoAperto(){
  const f = document.getElementById('schizzo');
  return !!(f && f.classList.contains('open'));
}

// Chiusura vera: salva e chiude. La chiama il gestore del tasto Indietro, cosi'
// la freccia a schermo e il tasto del telefono fanno la stessa identica cosa.
export async function chiudiSchizzoUI(){
  const foglio = document.getElementById('schizzo');
  if(!foglio || !foglio.classList.contains('open')) return;
  if(_salvando) return;
  if(_alSalva && (_tratti.length || _sfondo)){
    _salvando = true;
    messaggio('Salvo…');
    try{
      await _alSalva(await esporta());
    }catch(e){
      // Il foglio NON si chiude: chiudersi perdendo il disegno e' il modo piu'
      // rapido di non fidarsi piu' di questa schermata. Si resta qui, si dice
      // cos'e' andato storto, e la freccia riprova.
      _salvando = false;
      messaggio('Non sono riuscito a salvare il disegno. Riprova.');
      return;
    }
    _salvando = false;
  }
  foglio.classList.remove('open');
  _tratti = []; _sfondo = null; _alSalva = null;
  messaggio('');
}

export function chiudiSchizzo(){
  const foglio = document.getElementById('schizzo');
  if(foglio && foglio.classList.contains('open') && history.state && history.state.view === 'schizzo'){
    history.back();
    return;
  }
  chiudiSchizzoUI();
}

function aggancia(){
  if(_agganciato) return;
  _agganciato = true;
  const c = tela();

  let attivo = null;   // un dito per volta: il secondo appoggiato sul foglio
                       // e' un palmo, non un secondo tratto
  c.addEventListener('pointerdown', e=>{
    if(attivo !== null) return;
    attivo = e.pointerId;
    c.setPointerCapture(e.pointerId);
    _tratti.push([punto(e)]);
    ridisegna();
  });
  c.addEventListener('pointermove', e=>{
    if(e.pointerId !== attivo) return;
    e.preventDefault();
    const t = _tratti[_tratti.length-1];
    const p = punto(e);
    const u = t[t.length-1];
    // Punti troppo vicini fra loro non aggiungono niente al segno e fanno
    // crescere il disegno per niente: mezzo millimetro di foglio basta.
    if(Math.hypot(p.x-u.x, p.y-u.y) < 2) return;
    t.push(p);
    ridisegna();
  });
  const fine = e=>{
    if(e.pointerId !== attivo) return;
    attivo = null;
    ridisegna();
  };
  c.addEventListener('pointerup', fine);
  c.addEventListener('pointercancel', fine);

  document.getElementById('schizzo-annulla').addEventListener('click', ()=>{
    if(!_tratti.length) return;
    _tratti.pop();
    haptic('tap');
    ridisegna();
  });
  document.getElementById('schizzo-pulisci').addEventListener('click', ()=>{
    _tratti = []; _sfondo = null;
    haptic('done');
    ridisegna();
  });
  document.getElementById('schizzo-chiudi').addEventListener('click', ()=> chiudiSchizzo());
  window.addEventListener('resize', ()=>{ if(schizzoAperto()) ridisegna(); });
}

// Stessa ragione della galleria (vedi lightbox.js): il foglio da disegno si
// carica dalle Scene, non dal registro dei moduli di main.js, e il tasto
// Indietro deve poterlo chiudere lo stesso. Chiudendolo SALVA, quindi qui si
// lascia la funzione che aspetta.
window.chiudiSchizzoUI = chiudiSchizzoUI;
// E la chiusura che passa dalla cronologia, per Esc: il tasto deve fare la
// stessa strada della freccia e del tasto Indietro, se no il foglio sparisce
// dallo schermo ma resta nella storia della navigazione, e il primo Indietro
// dopo non tornerebbe indietro di niente.
window.chiudiSchizzo = chiudiSchizzo;
