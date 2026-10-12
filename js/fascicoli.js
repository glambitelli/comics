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
import { cldResize } from './cloudinary.js';

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
  const n = projects.length;
  _c = Math.max(0, Math.min(_c, n));   // n = "nuovo fascicolo", in fondo
  // Solo la scrivania e i fascicoli. Sotto c'erano un contatore ("FASCICOLO 3
  // DI 9"), una fila di linguette numerate e il link all'elenco: tolti,
  // "disturbante" — su una scrivania vera non c'e' scritto niente.
  box.innerHTML = `
    <div class="fasc-palco" id="fasc-palco">
      ${projects.map((p, i)=> copertina(p, i)).join('')}
      <button type="button" class="fasc fasc-nuovo" data-i="${n}" aria-label="Nuovo progetto"><span>Nuovo<br>fascicolo</span></button>
    </div>`;
  monta(box, n);
  posa(box, 0, true);
  // Il ridisegno arriva anche da solo (un progetto cambiato su un altro
  // telefono, il salvataggio di un altro campo): un fascicolo aperto non deve
  // richiudersi sotto gli occhi per questo.
  if(_interno !== null && projects[_interno]) apriInterno(box, _interno);
  else _interno = null;
}

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
  let x0 = null, dx = 0, mosso = false;
  palco.addEventListener('pointerdown', e=>{ x0 = e.clientX; dx = 0; mosso = false; try{ palco.setPointerCapture(e.pointerId); }catch(err){} });
  palco.addEventListener('pointermove', e=>{
    if(x0 === null) return;
    dx = e.clientX - x0;
    if(Math.abs(dx) > 8) mosso = true;
    if(mosso) posa(box, dx);
  });
  const fine = e=>{
    if(x0 === null) return;
    const d = dx; x0 = null;
    if(mosso){ vai(d < -50 ? _c + 1 : d > 50 ? _c - 1 : _c); return; }
    // un tocco: sul fascicolo al centro lo apre, su uno accanto ci va
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const f = el && el.closest && el.closest('.fasc');
    if(!f) return;
    const i = +f.dataset.i;
    if(i !== _c){ vai(i); return; }
    if(i >= projects.length){ if(window.openNewModal) window.openNewModal(); return; }
    suonaRumore(RUMORI.apri, .85);
    apriInterno(box, i);
  };
  palco.addEventListener('pointerup', fine);
  palco.addEventListener('pointercancel', ()=>{ x0 = null; posa(box, 0); });
}

// ── IL FASCICOLO APERTO (12 ottobre 2026) ──
// Toccando il fascicolo al centro si apre sulla scrivania: la cartella aperta,
// e dentro la scheda del progetto battuta a macchina, con la graffetta; sopra,
// il post-it col prossimo passo, la Polaroid dell'ultima tavola e la tessera
// col colore del progetto. E' un riassunto da guardare: il progetto vero si
// apre toccando il foglio. Bozzetto scelto da Giovanni; i pezzi di carta sono
// foto fatte con Firefly e ritagliate (img/fascicoli/), graffetta e tessera
// invece sono disegnate qui — nei ritagli il metallo e la plastica trasparente
// si confondevano col grigio del fondo.
//
// IL CARATTERE E' CUTIVE MONO, piccolo: scelto fra tre macchine da scrivere
// messe a confronto sullo stesso foglio. Special Elite, la prima prova, "fa
// veramente schifo, troppo grande come al solito".
const GRAFFETTA = `<svg class="fi-graffetta" viewBox="0 0 30 80" aria-hidden="true">
  <path d="M9 70 V14 a6 6 0 0 1 12 0 V62 a9 9 0 0 1 -18 0 V22" fill="none" stroke="#9aa0a6" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M9 70 V14 a6 6 0 0 1 12 0 V62 a9 9 0 0 1 -18 0 V22" fill="none" stroke="#eef1f3" stroke-width="1" stroke-linecap="round" transform="translate(-.6 -.6)"/></svg>`;
const MESI = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
function data(iso){
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d) ? d.getDate() + ' ' + MESI[d.getMonth()] + ' ' + d.getFullYear() : '';
}

function apriInterno(box, i){
  const p = projects[i];
  if(!p) return;
  _interno = i;
  const fase = PHASE_NAMES[getPhaseIndex(p)] || '';
  const pct = calcPct(p);
  const finite = Object.values(p.tavole || {}).filter(v => v >= 4).length;
  const pieni = Math.round(pct / 10);
  const riga = (nome, valore) => valore ? `<div class="fi-riga"><i>${nome}</i><span class="fi-pt"></span>${esc(String(valore))}</div>` : '';
  const passi = STEPS.map(st => {
    const fatto = !!(p.steps && p.steps[st.id]);
    return `<div class="fi-passo${fatto ? ' fatto' : ''}"><b>[${fatto ? 'x' : '&nbsp;'}]</b>${esc(st.nome)}</div>`;
  }).join('') + `<div class="fi-passo${finite && finite >= (p.numTav || 0) ? ' fatto' : ''}"><b>[${finite && finite >= (p.numTav || 0) ? 'x' : '&nbsp;'}]</b>Tavole ${finite}/${p.numTav || 0}</div>`;
  let el = box.querySelector('.fasc-interno');
  if(!el){ el = document.createElement('div'); el.className = 'fasc-interno'; box.appendChild(el); }
  el.style.setProperty('--colore', p.color || '#c0503a');
  el.innerHTML = `
    <button type="button" class="fi-chiudi" id="fi-chiudi">&lsaquo; CHIUDI</button>
    <div class="fi-cartella">
      <img class="fi-fondo" src="img/fascicoli/interno.webp" alt="" draggable="false">
      <button type="button" class="fi-foglio" id="fi-foglio" aria-label="Apri il progetto ${esc(p.title || '')}">
        <img src="img/fascicoli/foglio.webp" alt="" draggable="false">
        <span class="fi-testo">
          <span class="fi-testa">SCHEDA DEL PROGETTO</span>
          <span class="fi-tit">&ldquo;${esc(p.title || 'Senza titolo')}&rdquo;</span>
          ${riga('Fase', fase)}${riga('Tavole', p.numTav || 0)}${riga('Scadenza', data(p.dateEnd))}
          <span class="fi-sez">PIPELINE</span>
          ${passi}
          <span class="fi-sez">AVANZAMENTO ${pct}%</span>
          <span class="fi-barra">${Array.from({ length: 10 }, (_, k) => `<span${k < pieni ? ' class="p"' : ''}></span>`).join('')}</span>
        </span>
      </button>
      ${GRAFFETTA}
      ${p.microtask ? `<div class="fi-postit"><img src="img/fascicoli/postit.webp" alt="" draggable="false"><p>${esc(p.microtask)}</p></div>` : ''}
      <div class="fi-polaroid" hidden><img class="fi-cornice" src="img/fascicoli/polaroid.webp" alt="" draggable="false"><img class="fi-tav" alt=""><span class="fi-scritta"></span></div>
      <div class="fi-tessera"><span class="fi-fascia"></span><span class="fi-buco"></span><span class="fi-n">P-${String(i + 1).padStart(4, '0')}</span><span class="fi-nome">${esc(p.title || '')}</span></div>
    </div>
    <div class="fi-invito">tocca il foglio per aprire il progetto</div>`;
  box.classList.add('aperto');
  el.querySelector('#fi-chiudi').addEventListener('click', ()=> chiudiInterno(box, true));
  el.querySelector('#fi-foglio').addEventListener('click', ()=>{
    _aperto = true;
    chiudiInterno(box, false);
    openProject(p.id);
  });
  polaroid(el, p);
}

function chiudiInterno(box, conRumore){
  _interno = null;
  box.classList.remove('aperto');
  const el = box.querySelector('.fasc-interno');
  if(el) el.remove();
  if(conRumore) suonaRumore(RUMORI.chiudi, .85);
}

// LA POLAROID: l'ultima tavola collegata al progetto (o, se tavole non ce
// ne sono, l'ultima immagine collegata). Se non c'e' niente non compare: una
// cornice vuota sembrerebbe una foto che non si e' caricata.
function polaroid(el, p){
  import('./refs.js').then(m => {
    const suoi = m.getRefs().filter(r => m.projectIdsOf(r).includes(p.id))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const r = suoi.find(m.isTavola) || suoi[0];
    const box = el.querySelector('.fi-polaroid');
    if(!r || !box) return;
    box.querySelector('.fi-tav').src = cldResize(r.url, 400);
    // sotto, a penna, il giorno: come si fa sul bordo bianco di una Polaroid
    const d = r.createdAt ? new Date(r.createdAt) : null;
    box.querySelector('.fi-scritta').textContent = d && !isNaN(d) ? d.getDate() + ' ' + MESI[d.getMonth()] : '';
    box.hidden = false;
  }).catch(()=>{});
}

window.__fascicoli = { disegna: disegnaFascicoli, aggiornaVista, scegliVista, vai: i=>{ _c = i; disegnaFascicoli(); } };
