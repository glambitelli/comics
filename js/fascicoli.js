// ── I PROGETTI SONO FASCICOLI SULLA SCRIVANIA ──
// Dall'11 ottobre 2026 lo scaffale "Progetti" non e' piu' un elenco di schede
// bianche: e' una scrivania da ufficio di notte, col sottomano di pelle verde e
// la lampada, e sopra i fascicoli di cartone dei progetti, uno accanto
// all'altro. Il riferimento sono le cartelle dei casi di un ufficio federale e
// i menu di Resident Evil Village (i fogli vecchi, la luce di una lampada sola).
// Scelto da Giovanni fra tre bozzetti (il cassetto, la pila, la copertina): la
// copertina, con i fascicoli in fila sul piano.
//
// COME SI SCORRONO. Uno alla volta: quello che si guarda sta al centro, gli
// altri sono appoggiati in fila accanto e se ne vede solo il bordo. Col dito si
// fa scivolare la fila; sotto c'e' una fila di linguette numerate per saltare
// lontano. Una prima versione li teneva in due pile ai lati, sollevati e in
// ombra: "darebbe un senso di irrealisticita'" — devono sembrare POSATI sulla
// scrivania, quindi tutti uguali, stessa luce, ognuno col suo filo di storto.
//
// LE FOTO E LE SCRITTE. Le cartelle sono due foto fatte con Firefly, ritagliate
// dal fondo grigio (img/fascicoli/). Da due se ne fanno otto diverse —
// specchiate, un po' piu' scure o piu' calde — perche' "voglio che siano uno
// diverso dall'altro". Tutto quello che c'e' scritto sopra e' testo vero,
// stampato in codice con la fusione "multiply", cosi' prende la grana e le
// macchie del cartone sotto: l'ente, il titolo in rosso a macchina, il sigillo
// blu (inventato: "da' carattere, altrimenti sembrano le buste del pane"), la
// fase e il timbro dell'avanzamento.
//
// L'ELENCO DI PRIMA RESTA nel codice (scegliVista('elenco')): serve per
// cercare fra tanti progetti e per il menu di ogni scheda, ed e' quello che
// usano le prove della ricerca. Il link per tornarci stava sotto i fascicoli
// ed e' stato tolto con il resto: tornera' quando c'e' l'interno.
import { projects, PHASE_NAMES, STEPS } from './state.js';
import { calcPct, getPhaseIndex } from './progress.js';
import { openProject } from './project.js';
import { esc } from './testo.js';
import { suonaRumore, preparaRumori } from './sound.js';

// I RUMORI DEI FASCICOLI (11 ottobre 2026), scelti da Giovanni e tagliati qui
// (sfx/fascicoli/): la copertina che si alza e quella che ricade, dallo stesso
// file di effetti — il primo dei due rumori (piu' secco e acuto) e'
// l'apertura, il secondo (piu' sordo) la chiusura.
// NIENTE RUMORE MENTRE SCORRONO. C'e' stato per un giorno: un cartone
// trascinato sul tavolo, preso da una registrazione di carta. Com'era "da'
// fastidio all'orecchio"; abbassato e allungato "sembra un cadavere
// trascinato"; tre versioni corte e leggere non sono piaciute nemmeno quelle.
// Tolto: "poi ci ragioniamo".
const RUMORI = { apri:'./sfx/fascicoli/apri.mp3', chiudi:'./sfx/fascicoli/chiudi.mp3' };
let _aperto = false;   // un progetto aperto DA QUI: quando si chiude, chiude il fascicolo
let _interno = null;   // il fascicolo aperto sulla scrivania (indice), o null
// DUE SCRIVANIE IN UNA (12 ottobre 2026): i progetti e i lavori su
// commissione (Jobs) stanno sullo stesso tavolo, in due file di cartelle
// diverse. Si passa dall'una all'altra con uno swipe in verticale: dal basso
// verso l'alto ai Jobs, dall'alto verso il basso ai Progetti. Prima erano due
// linguette scritte in cima ("Progetti · Scene · Jobs"); le Scene sono state
// tolte, e le linguette con loro.
let _scaffale = (()=>{ try{ return localStorage.getItem('inkflow-scrivania') === 'jobs' ? 'jobs' : 'progetti'; }catch(e){ return 'progetti'; } })();
let _jobsMod = null;   // js/jobs.js, caricato da main.js all'apertura di Projects

// LE CARTELLE, dall'11 ottobre 2026 nuove e pulite come quella del
// riferimento. Le prime due erano invecchiate, macchiate e strappate — colpa
// del prompt, che chiedeva "aged and worn": "sembra un documento di cento
// anni fa, invece l'originale e' fresco". Queste tre vengono dal prompt
// rifatto (versioni A, B e C), ritagliate dal grigio tenendo i fogli bianchi
// che spuntano (scratchpad: taglia2.py).
// Per ognuna: le proporzioni, la finestrella dell'etichetta e quanto e' larga
// la copertina vera e propria — a destra ci sono la linguetta e i fogli, e le
// scritte vanno centrate sulla copertina, non sulla foto intera. Misurate
// sulle foto ritagliate, in frazioni della larghezza e dell'altezza.
const CARTELLE = [
  { src:'img/fascicoli/cartella-1.webp', r:570/739, fin:{ x:.311, y:.054, w:.286, h:.045 }, cop:.908 },
  { src:'img/fascicoli/cartella-2.webp', r:619/783, fin:{ x:.302, y:.056, w:.291, h:.045 }, cop:.895 },
  { src:'img/fascicoli/cartella-3.webp', r:648/848, fin:{ x:.310, y:.055, w:.292, h:.046 }, cop:.912 },
];
// Otto fascicoli diversi da tre foto: quale foto, specchiata o no (la
// linguetta passa a sinistra), e un filo di tono. Pochissimo: il cartone e'
// nuovo, e un filtro forte lo faceva sembrare sporco. Tutti un po' piu' caldi
// e piu' bassi della foto di studio, che e' illuminata a giorno, mentre la
// scrivania ha una lampada sola.
const LAMPADA = 'brightness(.9) sepia(.08)';
const VARIANTI = [
  { c:0, flip:false, f:LAMPADA,                              r:-1.1 },
  { c:1, flip:false, f:LAMPADA,                              r: .8 },
  { c:2, flip:false, f:LAMPADA,                              r:-.4 },
  { c:0, flip:true,  f:LAMPADA + ' brightness(.96)',         r:1.2 },
  { c:1, flip:true,  f:LAMPADA + ' saturate(1.06)',          r:-.8 },
  { c:2, flip:true,  f:LAMPADA + ' brightness(1.03)',        r: .5 },
  { c:1, flip:false, f:LAMPADA + ' brightness(.95)',         r:-1.3 },
  { c:0, flip:false, f:LAMPADA + ' saturate(.94)',           r: .9 },
];
const CHIAVE_VISTA = 'inkflow-progetti-vista';
let _c = 0;           // il fascicolo al centro

export function vistaFascicoli(){
  try{ return localStorage.getItem(CHIAVE_VISTA) !== 'elenco'; }catch(e){ return true; }
}
// Fascicoli o elenco: la scelta resta per la volta dopo.
export function scegliVista(v){
  try{ localStorage.setItem(CHIAVE_VISTA, v); }catch(e){}
  aggiornaVista();
}
// Chi decide se la scrivania si vede: lo scaffale Progetti attivo, e la vista
// a fascicoli scelta. Sulle Scene e sui Jobs resta la carta di sempre.
export function aggiornaVista(){
  const scr = document.getElementById('screen-projects');
  const pane = document.getElementById('projects-pane-progetti');
  if(!scr || !pane) return;
  const on = !pane.hidden && vistaFascicoli();
  scr.classList.toggle('vista-fascicoli', on);
  if(on) disegnaFascicoli();
}

function numero(i){
  // Il numero di fascicolo e' il posto nella fila: P-0001 e' il primo a
  // sinistra.
  return 'P-' + String(i + 1).padStart(4, '0');
}

function copertina(p, i){
  const v = VARIANTI[i % VARIANTI.length], c = CARTELLE[v.c];
  const titolo = esc(p.title || 'Senza titolo');
  // la finestrella, se la foto e' specchiata, sta dall'altra parte
  const fase = PHASE_NAMES[getPhaseIndex(p)] || '';
  // specchiata, la finestrella e la linguetta stanno dall'altra parte
  const fx = v.flip ? 1 - c.fin.x - c.fin.w : c.fin.x;
  const cx = v.flip ? 1 - c.cop : 0;
  // SULLA COPERTINA: il numero nella finestrella, il titolo tra virgolette
  // battuto a macchina, il sigillo blu, e sotto le righe del modulo con la
  // fase e le tavole. Tolta invece l'intestazione su tre righe ("INKFLOW
  // STUDIO DI NARRATIVA DISEGNATA"): copiata pari pari dal "FEDERAL BUREAU OF
  // INVESTIGATION" del riferimento, era un ente inventato e brutto. Anche la
  // parola "Titolo" davanti al titolo: le virgolette bastano.
  return `<div class="fasc" data-i="${i}" style="--storto:${v.r}deg;--asp:${c.r}">
    <img class="fasc-foto" src="${c.src}" alt="" draggable="false" style="transform:${v.flip ? 'scaleX(-1)' : 'none'};filter:${v.f}">
    <div class="fasc-stampa" aria-hidden="true">
      <span class="fasc-etich" style="left:${fx*100}%;top:${c.fin.y*100}%;width:${c.fin.w*100}%;height:${c.fin.h*100}%">${numero(i)}</span>
      <span class="fasc-cop" style="left:${cx*100}%;width:${c.cop*100}%">
        <span class="fasc-tit">&ldquo;${titolo}&rdquo;</span>
        ${SIGILLO}
        <span class="fasc-righe">
          <span><i>Fase</i>${esc(fase)}</span><span></span>
          <span><i>Tavole</i>${p.numTav || 0}</span><span></span>
          ${'<span></span>'.repeat(6)}
        </span>
      </span>
    </div>
    <span class="fasc-nome">${titolo}</span>
  </div>`;
}
// LE CARTELLE DEI JOBS: le stesse foto, ma COLORATE, perche' a colpo
// d'occhio si capisca che sono un'altra cosa (lavori su commissione, non
// progetti propri). Sono un segnaposto: quelle vere arriveranno da Gemini.
// Tre colori da cartelline d'ufficio — rosso, verde, blu scuro — ottenuti
// ruotando la tinta del cartone.
const COLORI_JOB = [
  'sepia(.4) hue-rotate(-38deg) saturate(2.6) brightness(.6)',
  'sepia(.3) hue-rotate(55deg) saturate(1.3) brightness(.7)',
  'sepia(.3) hue-rotate(165deg) saturate(1.5) brightness(.68)',
];
function copertinaJob(j, i){
  const v = VARIANTI[i % VARIANTI.length], c = CARTELLE[v.c];
  const titolo = esc(j.titolo || 'Senza titolo');
  const fx = v.flip ? 1 - c.fin.x - c.fin.w : c.fin.x;
  const cx = v.flip ? 1 - c.cop : 0;
  const fatte = _jobsMod ? _jobsMod.quanteTavolePreparate(j) : 0;
  return `<div class="fasc fasc-job" data-i="${i}" style="--storto:${v.r}deg;--asp:${c.r}">
    <img class="fasc-foto" src="${c.src}" alt="" draggable="false" style="transform:${v.flip ? 'scaleX(-1)' : 'none'};filter:${COLORI_JOB[i % COLORI_JOB.length]}">
    <div class="fasc-stampa" aria-hidden="true">
      <span class="fasc-etich" style="left:${fx*100}%;top:${c.fin.y*100}%;width:${c.fin.w*100}%;height:${c.fin.h*100}%">J-${String(i + 1).padStart(4, '0')}</span>
      <span class="fasc-cop" style="left:${cx*100}%;width:${c.cop*100}%">
        <span class="fasc-tit">&ldquo;${titolo}&rdquo;</span>
        ${SIGILLO}
        <span class="fasc-righe">
          <span><i>Tavole</i>${j.tavole || 0}</span><span></span>
          <span><i>Pronte</i>${fatte}</span><span></span>
          ${'<span></span>'.repeat(6)}
        </span>
      </span>
    </div>
    <span class="fasc-nome">${titolo}</span>
  </div>`;
}
// IL SIGILLO, inventato: niente stemmi veri. Un pennino al centro, il nome
// intorno, inchiostro blu un po' consumato.
// Il bordo a raggiera e' quello del sigillo del riferimento: un cerchio
// liscio, nella prima versione, sembrava un timbro da ufficio postale.
const SIGILLO = `<svg class="fasc-sigillo" viewBox="0 0 100 100" aria-hidden="true">
  <polygon points="50.0,1.0 53.6,4.6 57.7,1.6 60.6,5.8 65.1,3.4 67.4,8.0 72.2,6.3 73.8,11.2 78.8,10.4 79.5,15.4 84.6,15.4 84.6,20.5 89.6,21.2 88.8,26.2 93.7,27.8 92.0,32.6 96.6,34.9 94.2,39.4 98.4,42.3 95.4,46.4 99.0,50.0 95.4,53.6 98.4,57.7 94.2,60.6 96.6,65.1 92.0,67.4 93.7,72.2 88.8,73.8 89.6,78.8 84.6,79.5 84.6,84.6 79.5,84.6 78.8,89.6 73.8,88.8 72.2,93.7 67.4,92.0 65.1,96.6 60.6,94.2 57.7,98.4 53.6,95.4 50.0,99.0 46.4,95.4 42.3,98.4 39.4,94.2 34.9,96.6 32.6,92.0 27.8,93.7 26.2,88.8 21.2,89.6 20.5,84.6 15.4,84.6 15.4,79.5 10.4,78.8 11.2,73.8 6.3,72.2 8.0,67.4 3.4,65.1 5.8,60.6 1.6,57.7 4.6,53.6 1.0,50.0 4.6,46.4 1.6,42.3 5.8,39.4 3.4,34.9 8.0,32.6 6.3,27.8 11.2,26.2 10.4,21.2 15.4,20.5 15.4,15.4 20.5,15.4 21.2,10.4 26.2,11.2 27.8,6.3 32.6,8.0 34.9,3.4 39.4,5.8 42.3,1.6 46.4,4.6" fill="none" stroke="currentColor" stroke-width="2"/>
  <circle cx="50" cy="50" r="41" fill="none" stroke="currentColor" stroke-width="2.6"/>
  <circle cx="50" cy="50" r="29" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <path id="fasc-arco" d="M50 50 m-32.5 0 a32.5 32.5 0 1 1 65 0" fill="none"/>
  <path id="fasc-arco2" d="M50 50 m-38 0 a38 38 0 1 0 76 0" fill="none"/>
  <text font-size="7.6" letter-spacing=".8" fill="currentColor"><textPath href="#fasc-arco" startOffset="50%" text-anchor="middle">INKFLOW STUDIO</textPath></text>
  <text font-size="6.4" letter-spacing=".8" fill="currentColor"><textPath href="#fasc-arco2" startOffset="50%" text-anchor="middle">&#9733; EST. 2026 &#9733;</textPath></text>
  <path d="M50 30 L59 47 L54 57 L50 69 L46 57 L41 47 Z" fill="currentColor"/>
  <path d="M50 46 V62" stroke="#c9ab7e" stroke-width="1.6"/><circle cx="50" cy="46" r="2.5" fill="#c9ab7e"/>
</svg>`;

export function disegnaFascicoli(){
  const box = document.getElementById('fascicoli');
  if(!box) return;
  if(_scaffale === 'jobs' && !_jobsMod){
    import('./jobs.js').then(m=>{ _jobsMod = m; disegnaFascicoli(); }).catch(()=>{});
  }
  const lista = elementi();
  const n = lista.length;
  _c = Math.max(0, Math.min(_c, n));   // n = "nuovo fascicolo", in fondo
  // Solo la scrivania e i fascicoli. Sotto c'erano un contatore ("FASCICOLO 3
  // DI 9"), una fila di linguette numerate e il link all'elenco: tolti,
  // "disturbante" — su una scrivania vera non c'e' scritto niente.
  const jobs = _scaffale === 'jobs';
  box.dataset.scaffale = _scaffale;
  box.innerHTML = `
    <div class="fasc-palco" id="fasc-palco">
      ${lista.map((x, i)=> jobs ? copertinaJob(x, i) : copertina(x, i)).join('')}
      <button type="button" class="fasc fasc-nuovo" data-i="${n}" aria-label="${jobs ? 'Nuovo lavoro' : 'Nuovo progetto'}"><span>Nuovo<br>fascicolo</span></button>
    </div>`;
  monta(box, n);
  posa(box, 0, true);
  // Il ridisegno arriva anche da solo (un progetto cambiato su un altro
  // telefono, il salvataggio di un altro campo): un fascicolo aperto non deve
  // richiudersi sotto gli occhi per questo.
  if(!jobs && _interno !== null && projects[_interno]) apriInterno(box, _interno);
  else _interno = null;
}
function elementi(){
  return _scaffale === 'jobs' ? (_jobsMod ? _jobsMod.tuttiIJobs() : []) : projects;
}
// Passare dall'una all'altra scrivania: la fila esce dal lato dello swipe ed
// entra quella nuova dall'altro.
function cambiaScaffale(verso){
  if(verso === _scaffale) return;
  const box = document.getElementById('fascicoli');
  const palco = box && box.querySelector('.fasc-palco');
  const su = verso === 'jobs';
  const fatto = ()=>{
    _scaffale = verso; _c = 0; _interno = null;
    try{ localStorage.setItem('inkflow-scrivania', verso); }catch(e){}
    disegnaFascicoli();
    const nuovo = box && box.querySelector('.fasc-palco');
    if(nuovo && nuovo.animate) nuovo.animate([{ transform:`translateY(${su ? 40 : -40}%)`, opacity:0 }, { transform:'none', opacity:1 }], { duration:260, easing:'cubic-bezier(.2,.8,.2,1)' });
  };
  suonaRumore(RUMORI.apri, .4);
  if(palco && palco.animate){
    palco.animate([{ transform:'none', opacity:1 }, { transform:`translateY(${su ? -40 : 40}%)`, opacity:0 }], { duration:180, easing:'ease-in', fill:'forwards' }).onfinish = fatto;
  } else fatto();
}
export function scegliScaffale(v){ if(v === 'jobs' || v === 'progetti'){ _scaffale = v; _c = 0; try{ localStorage.setItem('inkflow-scrivania', v); }catch(e){} } }

function posa(box, trasc, subito){
  const palco = box.querySelector('.fasc-palco');
  if(!palco) return;
  // Il passo fra un fascicolo e l'altro e' la larghezza di uno piu' un filo di
  // piano: cosi' di quelli accanto si vede solo il bordo, e la fila e' una.
  const larg = (palco.querySelector('.fasc') || {}).offsetWidth || 260;
  const passo = larg + 22;
  palco.querySelectorAll('.fasc').forEach(el=>{
    const i = +el.dataset.i, d = i - _c;
    const y = Math.abs(d) % 2 ? 6 : 0;
    el.style.transform = `translate(calc(-50% + ${d * passo + trasc}px), ${y}px) rotate(var(--storto, 0deg))`;
    el.style.transition = (trasc || subito) ? 'none' : '';
    el.classList.toggle('al-centro', d === 0);
    el.setAttribute('aria-hidden', String(Math.abs(d) > 1));
  });
}

// La chiusura: quando la schermata del progetto aperto da qui si spegne —
// col tasto Indietro, dal menu, verso qualunque altra schermata — il
// fascicolo si richiude. Si guarda la schermata e non i pulsanti perche' le
// strade per uscire da un progetto sono tante, e il rumore deve esserci in
// tutte.
let _osservato = false;
function osservaChiusura(){
  if(_osservato) return;
  const scr = document.getElementById('screen-project');
  if(!scr || !window.MutationObserver) return;
  _osservato = true;
  new MutationObserver(()=>{
    if(_aperto && !scr.classList.contains('active')){ _aperto = false; suonaRumore(RUMORI.chiudi, .85); }
  }).observe(scr, { attributes:true, attributeFilter:['class'] });
}

function monta(box, n){
  osservaChiusura();
  if(!monta._pronti){ monta._pronti = true;
    window.addEventListener('pointerdown', ()=> preparaRumori(Object.values(RUMORI)), { once:true, passive:true }); }
  const vai = i=>{
    _c = Math.max(0, Math.min(n, i));
    posa(box, 0);
  };
  const palco = box.querySelector('.fasc-palco');
  // UN TOCCO SOLO PER APRIRE. Il tocco prima si riconosceva a mano dal
  // pointerup, e sul telefono un tocco veloce spesso non arrivava: il
  // browser lo prendeva per l'inizio di uno scorrimento e lo annullava, e il
  // fascicolo si apriva solo "tenendo premuto" (Giovanni, 12 ottobre 2026).
  // Ora i tocchi sono il click del browser, che sul telefono arriva sempre;
  // il dito qui sotto serve solo allo swipe, e un click subito dopo uno swipe
  // si ignora (e' il dito che si alza, non un tocco).
  // In orizzontale si scorre la fila; in VERTICALE si cambia scrivania (dal
  // basso verso l'alto ai Jobs, al contrario ai Progetti). Il primo movimento
  // deciso sceglie la direzione, e per quel gesto resta quella.
  let x0 = null, y0 = 0, dx = 0, dy = 0, mosso = false, verticale = false, finitoSwipe = 0;
  palco.addEventListener('pointerdown', e=>{ x0 = e.clientX; y0 = e.clientY; dx = dy = 0; mosso = verticale = false; });
  palco.addEventListener('pointermove', e=>{
    if(x0 === null) return;
    dx = e.clientX - x0; dy = e.clientY - y0;
    if(!mosso && !verticale){
      if(Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) verticale = true;
      else if(Math.abs(dx) > 8) mosso = true;
      if(mosso || verticale){ try{ palco.setPointerCapture(e.pointerId); }catch(err){} }
    }
    if(mosso) posa(box, dx);
  });
  const fine = ()=>{
    if(x0 === null) return;
    const d = dx; x0 = null;
    if(verticale){ finitoSwipe = Date.now(); if(Math.abs(dy) > 60) cambiaScaffale(dy < 0 ? 'jobs' : 'progetti'); return; }
    if(mosso){ finitoSwipe = Date.now(); vai(d < -50 ? _c + 1 : d > 50 ? _c - 1 : _c); }
  };
  palco.addEventListener('pointerup', fine);
  palco.addEventListener('pointercancel', ()=>{ if(mosso) finitoSwipe = Date.now(); x0 = null; posa(box, 0); });
  palco.addEventListener('click', e=>{
    if(Date.now() - finitoSwipe < 400) return;
    // un tocco: sul fascicolo al centro lo apre, su uno accanto ci va
    const f = e.target.closest && e.target.closest('.fasc');
    if(!f) return;
    const i = +f.dataset.i;
    if(i !== _c){ vai(i); return; }
    // sulla scrivania dei Jobs: il fascicolo apre il lavoro, il posto vuoto ne
    // crea uno nuovo
    if(_scaffale === 'jobs'){
      if(!_jobsMod) return;
      const lista = _jobsMod.tuttiIJobs();
      if(i >= lista.length){ _jobsMod.nuovoJob().then(j=>{ if(j) disegnaFascicoli(); }); return; }
      suonaRumore(RUMORI.apri, .85);
      _jobsMod.apriJob(lista[i].id);
      return;
    }
    if(i >= projects.length){ if(window.openNewModal) window.openNewModal(); return; }
    suonaRumore(RUMORI.apri, .85);
    apriInterno(box, i);
    // Indietro (telefono o browser) lo richiude: si segna un passo nella
    // cronologia, e il gestore di popstate in main.js chiama chiudi().
    try{ history.pushState({ view:'fascicolo', id:i }, ''); }catch(err){}
  });
}

// ── IL FASCICOLO APERTO (12 ottobre 2026) ──
// Toccando il fascicolo al centro la cartella si apre sulla scrivania, in due
// pagine affiancate come una cartella vera: a sinistra la SCHEDA (un modulo
// stampato, compilato a macchina e annotato a penna), a destra il RAPPORTO
// (un foglio battuto a macchina con due stampe fotografiche fermate dalle
// graffette e la tessera nella busta di plastica). Sul telefono si vede una
// pagina per volta e si passa all'altra col dito. Niente scritte intorno
// (ne' "Chiudi" ne' le istruzioni): si chiude con Indietro, come tutto.
// NIENTE IMMAGINI DEI RIFERIMENTI: nei riquadri e nelle stampe c'erano le
// immagini collegate al progetto in References, ma sono tavole di altri
// autori — "non le voglio vedere li', non sono immagini mie". Stampe e
// riquadri restano vuoti finche' non ci sara' un posto per le sue.
//
// PERCHE' COSI'. Il primo fascicolo aperto metteva su una cartella dei pezzi
// ritagliati uno per uno (foglio, post-it, Polaroid) e ci scriveva sopra con
// righe disegnate in codice: "sembra finto, non sembra reale; l'impaginazione
// sembra fatta male". Il riferimento (un fascicolo FBI di scena) ha i moduli
// a caselle stampati, i fogli impilati, le foto vere sopra il testo. Ora le
// due pagine sono due foto fatte con Gemini da Giovanni, gia' composte: il
// modulo stampato a righe sottili e SENZA SCRITTE, le stampe col riquadro
// grigio, la tessera con la fascia blu vuota. Luce, ombre, graffette e busta
// sono vere; qui si scrive soltanto, e si mettono le immagini al loro posto.
// Dalla pagina sinistra sono state cancellate due figure umane che Gemini
// aveva copiato dal riferimento (ricostruendo la carta).
//
// LE MISURE sono in pixel delle due foto (896x1200 ciascuna), prese con un
// programmino sulle righe del modulo e sui bordi del grigio delle stampe: se
// cambiano le foto, vanno rimisurate. Le stampe sono storte: l'immagine si
// deforma con una matrice (calcolata dai quattro angoli del grigio) e la si
// ritaglia con la maschera del grigio stesso, cosi' la graffetta e la stampa
// di sopra restano davanti. Sopra, la "luce" della foto originale riporta i
// riflessi della carta lucida.
//
// I CARATTERI: Lucky Typewriter per quello battuto a macchina (scelto da
// Giovanni fra quattro; licenza in font/lucky-typewriter-LICENZA.txt, uso
// non commerciale), Castoro per quello stampato, la penna di sempre per le
// note a mano.
const MESI = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
const MESI_LUNGHI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
function giorno(v){ const d = v ? new Date(v) : null; return d && !isNaN(d) ? d : null; }
function breve(v){ const d = giorno(v); return d ? String(d.getDate()).padStart(2,'0') + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getFullYear()).slice(2) : '—'; }
function lunga(v){ const d = giorno(v); return d ? d.getDate() + ' ' + MESI_LUNGHI[d.getMonth()] : ''; }
// i 16 quadratini delle tavole, colonne (x) e righe (y) del modulo
const QX = [161,195,231,267,304,340,376,412], QY = [664,714];

function apriInterno(box, i){
  const p = projects[i];
  if(!p) return;
  _interno = i;
  const num = 'P-' + String(i + 1).padStart(4, '0');
  const fase = PHASE_NAMES[getPhaseIndex(p)] || '';
  const pct = calcPct(p);
  const N = p.numTav || 0;
  const stato = k => (p.tavole && p.tavole[k] != null) ? p.tavole[k] : 0;
  const finite = Array.from({ length: N }, (_, k) => stato(k + 1)).filter(v => v >= 4).length;
  let inCorso = 0;
  for(let k = 1; k <= N; k++){ const v = stato(k); if(v > 0 && v < 4){ inCorso = k; break; } }
  const fatto = st => !!(p.steps && p.steps[st.id]);
  const prossimo = (STEPS.find(st => !fatto(st)) || {}).nome
    || (finite < N ? 'Tavola ' + (finite + 1) : 'Finito');
  const t = s => esc(String(s == null ? '' : s));
  const mac = (x, y, testo, extra = '') => `<span class="fi-mac" style="left:${x}px;top:${y}px;${extra}">${testo}</span>`;
  const et = (x, y, testo) => `<span class="fi-et" style="left:${x}px;top:${y}px">${testo}</span>`;

  // ── pagina sinistra: la scheda ──
  const passi = [...STEPS.map(st => ({ nome: st.nome === 'Struttura a 3 atti' ? 'Struttura' : st.nome, ok: fatto(st) })),
    { nome: `Tavole ${finite}/${N}`, ok: N > 0 && finite >= N }];
  const passiHtml = passi.map((ps, k) => {
    const x = k < 4 ? 166 : 305, y = 505 + (k % 4) * 26.6;
    return mac(x, y, '[&nbsp;] ' + t(ps.nome)) + (ps.ok ? `<span class="fi-mano fi-spunta" style="left:${x + 1}px;top:${y - 8}px">&#10003;</span>` : '');
  }).join('');
  const quadri = [];
  for(let k = 1; k <= Math.min(N, 16); k++){
    const x = QX[(k - 1) % 8], y = QY[k > 8 ? 1 : 0];
    quadri.push(`<span class="fi-sq${stato(k) >= 4 ? ' ok' : ''}" style="left:${x}px;top:${y}px">${String(k).padStart(2,'0')}</span>`);
  }
  let segno = '';
  if(inCorso && inCorso <= 16){
    const cx = QX[(inCorso - 1) % 8] + 13.5, cy = QY[inCorso > 8 ? 1 : 0] + 13.5;
    segno = `<svg class="fi-inchiostro" style="left:0;top:0;width:896px;height:1200px" viewBox="0 0 896 1200" aria-hidden="true">
      <ellipse cx="${cx}" cy="${cy}" rx="20" ry="18"/>
      <path d="M500 590 C 480 640, ${cx + 90} ${cy - 10}, ${cx + 24} ${cy - 4}"/>
      <path d="M${cx + 34} ${cy - 14} L${cx + 23} ${cy - 4} L${cx + 35} ${cy + 5}"/></svg>
      <span class="fi-mano" style="left:470px;top:530px;transform:rotate(-4deg)">la tav. ${inCorso}<br>e' in corso</span>`;
  }
  const oltre = N > 16 ? mac(162, 744, `+ ${N - 16} (17-${N})`, 'font-size:10px') : '';
  const barra = 'X'.repeat(Math.round(pct / 10)) + '&middot;'.repeat(10 - Math.round(pct / 10));
  const note = [p.microtask, ...(String(p.notes || '').split('\n'))].map(r => (r || '').trim()).filter(Boolean).slice(0, 2);
  const sinistra = `
    <img class="fi-fondo" src="img/fascicoli/pagina-sx.webp" alt="" draggable="false">
    ${mac(155, 250, 'SCHEDA DI PROGETTO', 'width:335px;text-align:center;font:15px/1 Castoro,serif;letter-spacing:.16em')}
    ${mac(155, 276, 'N. ' + num, 'width:335px;text-align:center')}
    ${et(159, 310, 'Titolo')}${mac(172, 322, t(p.title || 'Senza titolo'), 'max-width:148px;overflow:hidden;text-overflow:ellipsis')}
    ${et(329, 310, 'Tav.')}${mac(338, 322, N)}
    ${et(384, 310, 'Fase')}${mac(392, 322, t(fase), 'font-size:12px')}
    ${et(159, 345, 'Aperto il')}${mac(168, 356, breve(p.createdAt), 'font-size:12px')}
    ${et(261, 345, 'Consegna')}${mac(270, 356, breve(p.dateEnd), 'font-size:12px')}
    ${et(377, 345, 'Avanz.')}${mac(400, 356, pct + ' %')}
    ${et(159, 377, 'Prossimo passo')}${mac(176, 396, t(prossimo))}
    ${et(159, 447, 'Lavorazione')}${mac(236, 455, barra, 'letter-spacing:2px')}
    ${et(162, 487, 'Passi')}${passiHtml}
    ${N ? et(162, 652, 'Tavole') : ''}${quadri.join('')}${oltre}${segno}
    ${et(163, 856, 'Note')}
    ${note.map((r, k) => `<span class="fi-mano" style="left:172px;top:${870 + k * 44}px;max-width:480px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${t(r)}</span>`).join('')}`;

  // ── pagina destra: il rapporto ──
  const fatti = STEPS.filter(fatto).map(st => st.nome.toLowerCase());
  const riga1 = `Il progetto e' in fase di ${t(fase.toLowerCase())}.` +
    (fatti.length ? `<br>Completati: ${t(fatti.slice(0, 3).join(', '))}${fatti.length > 3 ? ' e altri ' + (fatti.length - 3) : ''}.` : '') +
    `<br>Prossimo passo: ${t(prossimo.toLowerCase())}.`;
  const riga2 = (N ? `${finite} tavole finite su ${N}${inCorso ? `, la ${inCorso} in lavorazione` : ''}.` : 'Tavole non ancora definite.') +
    (lunga(p.dateEnd) ? `<br>Consegna prevista il ${lunga(p.dateEnd)}.` : '');
  const destra = `
    <img class="fi-fondo" src="img/fascicoli/pagina-dx.webp" alt="" draggable="false">
    ${mac(262, 186, 'RAPPORTO DI LAVORAZIONE', 'width:516px;text-align:center;font:14px/1 Castoro,serif;letter-spacing:.16em')}
    ${et(315, 221, 'Progetto')}${mac(320, 243, t(p.title || ''), 'max-width:74px;overflow:hidden;text-overflow:ellipsis')}
    ${et(408, 221, 'Avanzamento')}${mac(425, 243, pct + ' %')}
    ${et(503, 221, 'Tavole')}${mac(512, 243, N ? finite + ' di ' + N : '—')}
    ${et(597, 221, 'Consegna')}${mac(604, 243, breve(p.dateEnd))}
    ${mac(298, 306, riga1, 'white-space:normal;width:440px;line-height:1.75')}
    ${mac(298, 380, riga2, 'white-space:normal;width:250px;line-height:1.75')}

    <span class="fi-fascia" style="left:178px;top:815px;width:176px;height:33px">${num}</span>
    <span class="fi-tessera" style="left:184px;top:851px;width:179px;height:204px">
      ${mac(14, 18, t((p.title || '').toUpperCase()), 'max-width:150px;overflow:hidden;text-overflow:ellipsis')}
      ${mac(14, 38, `${t(fase)}<br>${N} tavole<br>dal ${breve(p.createdAt)}`, 'font-size:10px;line-height:1.45')}
      <span class="fi-mano fi-firma" style="left:16px;top:118px;font-size:22px"></span>
      <span class="fi-et" style="left:16px;top:150px;opacity:.7">Firma</span>
    </span>`;

  let el = box.querySelector('.fasc-interno');
  if(!el){ el = document.createElement('div'); el.className = 'fasc-interno'; box.appendChild(el); }
  el.innerHTML = `
    <div class="fi-vista" id="fi-vista"><div class="fi-spazio"><div class="fi-spread">
      <div class="fi-pagina fi-sx" id="fi-foglio" role="button" tabindex="0" aria-label="Apri il progetto ${t(p.title || '')}">${sinistra}</div>
      <div class="fi-pagina fi-dx">${destra}</div>
    </div></div></div>`;
  box.classList.add('aperto');
  // la scala: ogni pagina larga quanto lo schermo, senza uscire in altezza
  const vista = el.querySelector('#fi-vista');
  const scala = ()=> el.style.setProperty('--s', Math.min(vista.clientWidth / 896, vista.clientHeight / 1200) || .4);
  scala();
  if(window.ResizeObserver){ const ro = new ResizeObserver(scala); ro.observe(vista); el._ro = ro; }
  // Dalla scheda al progetto: la cartella si chiude senza rumore, e Indietro
  // dal progetto riporta qui, alla cartella aperta (lo stato 'fascicolo'
  // della cronologia resta sotto quello del progetto).
  const apri = ()=>{ chiudiInterno(box, false); openProject(p.id); };
  el.querySelector('#fi-foglio').addEventListener('click', apri);
  el.querySelector('#fi-foglio').addEventListener('keydown', e=>{ if(e.key === 'Enter') apri(); });
  import('./auth.js').then(m=>{
    const u = m.utente && m.utente();
    const nome = u && (u.displayName || '').split(' ')[0];
    const f = el.querySelector('.fi-firma'); if(f && nome) f.textContent = nome;
  }).catch(()=>{});
}

function chiudiInterno(box, conRumore){
  _interno = null;
  box.classList.remove('aperto');
  const el = box.querySelector('.fasc-interno');
  if(el){ if(el._ro) el._ro.disconnect(); el.remove(); }
  if(conRumore) suonaRumore(RUMORI.chiudi, .85);
}

// Per main.js: Indietro chiude la cartella; tornando indietro dal progetto
// la si riapre.
function chiudiDaIndietro(){
  const box = document.getElementById('fascicoli');
  if(box && box.querySelector('.fasc-interno')) chiudiInterno(box, true);
}
function riapri(i){
  i = +i;
  if(!projects[i]) return;
  _c = i; _interno = i;
  disegnaFascicoli();
}

window.__fascicoli = { chiudi: chiudiDaIndietro, riapri, scegliScaffale, cambiaScaffale, scaffale: ()=> _scaffale, disegna: disegnaFascicoli, aggiornaVista, scegliVista, vai: i=>{ _c = i; disegnaFascicoli(); } };
