// ── IL PROGETTO VIVE DENTRO LA CARTELLA (18 ottobre 2026) ──
// Toccando il fascicolo chiuso sulla scrivania non si apre piu' un riassunto
// e poi, da li', la pagina del progetto: si apre direttamente la cartella a
// tutto schermo, con la scrivania intorno, e dentro ci sono i fogli che SONO
// il progetto. "La vecchia interfaccia di Inkflow dovra' ricostruirsi
// all'interno di questi fogli" (Giovanni). Prima c'erano due passaggi — il
// fascicolo aperto con la scheda finta (le due pagine fatte con Gemini) e poi
// la pagina bianca del progetto — e il secondo non aveva niente del primo.
//
// COME E' FATTA. Due pagine, come una cartella aperta: col dito si passa
// dall'una all'altra (lo scorrimento si ferma su una pagina intera), e due
// pallini in basso dicono dove sei. In ogni pagina una pila di fogli con le
// linguette di carta in cima per scegliere quale foglio sta sopra:
//   sinistra — SCHEDA (titolo, fase, tavole, date, task di stasera, note),
//              TO DO, CALENDARIO (fasi e grafici dell'avanzamento);
//   destra   — SVILUPPO, PRE-PROD., TAVOLE, SCRIPT, RIFERIMENTI (le immagini
//              collegate, fermate sul foglio come foto: scelta "A").
// Il titolo, il numero e la fase sono scritti sul legno, in cima.
// Scelte da Giovanni sul bozzetto del 17 ottobre: linguette si', calendario e
// grafici sotto la loro linguetta, riferimenti come foto sul foglio.
//
// PERCHE' SI SPOSTANO I PEZZI E NON SI RISCRIVONO. Ogni blocco della pagina
// progetto (le tavole, gli step, la task, il to do, i grafici) ha dietro il
// suo codice in pipeline.js, velocity.js, story.js, che lo cerca per id. Qui
// li si prende dal DOM e li si rimette nei fogli: gli id restano quelli, e
// tutto continua a funzionare senza toccare una riga di chi li disegna. Il
// vestito di carta e macchina da scrivere lo da' css/cartella.css.
// La pagina vecchia resta in index.html com'era: i banchi di prova che la
// caricano da soli (test/banco/progetto.html...) la trovano intatta.
import { projects, PHASE_NAMES } from './state.js';
import { getPhaseIndex } from './progress.js';

const SINISTRA = [['scheda','Scheda'], ['todo','To do'], ['calendario','Calendario']];
const DESTRA = [['sviluppo','Sviluppo'], ['preprod','Pre-prod.'], ['tavole','Tavole'], ['script','Script'], ['rif','Riferimenti']];
const CHIAVE = 'inkflow-cartella-fogli';
let _montata = false;

function pagina(lato, fogli){
  return `<section class="pc-pagina pc-${lato}" data-lato="${lato}">
    <div class="pc-cartone" aria-hidden="true"></div>
    <div class="pc-pila">
      <div class="pc-sotto pc-sotto1" aria-hidden="true"></div><div class="pc-sotto pc-sotto2" aria-hidden="true"></div>
      <div class="pc-linguette" role="tablist">
        ${fogli.map(([id, nome])=>`<button type="button" role="tab" class="pc-ling" data-f="${id}">${nome}</button>`).join('')}
      </div>
      <div class="pc-foglio">
        ${fogli.map(([id])=>`<div class="pc-sheet" data-f="${id}" role="tabpanel" hidden></div>`).join('')}
      </div>
    </div>
  </section>`;
}

// Un pezzo della pagina vecchia: l'elemento, o il blocco che lo contiene
// (molti sono avvolti in un <div> con l'etichetta di sezione sopra).
const blocco = (sel, risali)=>{
  const el = document.querySelector('#screen-project ' + sel);
  return el && risali ? el.closest('.proj-scroll > div') || el : el;
};

export function montaCartella(){
  const scr = document.getElementById('screen-project');
  if(!scr) return;
  scr.classList.add('cartella');
  if(_montata) return;
  _montata = true;
  const pc = document.createElement('div');
  pc.className = 'pc';
  pc.innerHTML = `
    <div class="pc-testa">
      <div class="pc-titolo" id="pc-titolo"></div>
      <div class="pc-sotto-titolo"><span id="pc-numero"></span> &middot; <span id="pc-fase"></span></div>
    </div>
    <div class="pc-vista" id="pc-vista">
      ${pagina('sx', SINISTRA)}
      ${pagina('dx', DESTRA)}
    </div>
    <div class="pc-punti" aria-hidden="true"><i class="on"></i><i></i></div>`;
  scr.appendChild(pc);
  const foglio = id => pc.querySelector(`.pc-sheet[data-f="${id}"]`);
  const metti = (id, ...els)=> els.forEach(el=>{ if(el) foglio(id).appendChild(el); });
  const nuovo = (cls, html)=>{ const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };

  // ── SCHEDA ── il modulo a caselle: dentro le caselle ci vanno gli stessi
  // elementi che aggiorna progress.js (meta-fase, meta-pct...) e i campi delle
  // date, spostati, cosi' restano vivi.
  const modulo = nuovo('pc-modulo', `
    <div class="pc-testata">Scheda di progetto</div>
    <div class="pc-griglia">
      <div class="pc-cella"><span class="pc-et">Titolo</span><span class="pc-mac" data-qui="titolo"></span></div>
      <div class="pc-cella"><span class="pc-et">Fase</span><span class="pc-mac" data-qui="fase"></span></div>
      <div class="pc-cella pc-tocca" role="button" tabindex="0" onclick="editNumTav()" title="Cambia il numero di tavole"><span class="pc-et">Tavole &#9998;</span><span class="pc-mac" data-qui="tav"></span></div>
      <div class="pc-cella"><span class="pc-et">Avanzamento</span><span class="pc-mac"><span data-qui="pct"></span> %</span></div>
      <div class="pc-cella"><span class="pc-et">Iniziato il</span><span class="pc-mac" data-qui="inizio"></span></div>
      <div class="pc-cella"><span class="pc-et">Consegna</span><span class="pc-mac" data-qui="fine"></span></div>
    </div>
    <div class="pc-barra"><span data-qui="barra"></span><span class="pc-mac pc-piccolo" data-qui="passi"></span></div>
    <div data-qui="conto"></div>`);
  const qui = k => modulo.querySelector(`[data-qui="${k}"]`);
  qui('titolo').appendChild(document.getElementById('proj-title'));
  qui('fase').appendChild(document.getElementById('meta-fase'));
  qui('tav').appendChild(document.getElementById('meta-tav'));
  qui('pct').appendChild(document.getElementById('meta-pct'));
  qui('inizio').appendChild(document.getElementById('date-start'));
  qui('fine').append(document.getElementById('date-end-btn'), document.getElementById('date-end'));
  qui('barra').appendChild(document.querySelector('#screen-project .prog-bar'));
  qui('passi').appendChild(document.getElementById('prog-lbl'));
  qui('conto').appendChild(document.getElementById('countdown-box'));
  const deadline = blocco('.deadline-block', true);
  const task = blocco('.microtask-box', true);
  const note = blocco('#notes', true);
  const fondo = blocco('.export-row', true);
  metti('scheda', modulo, task, note, fondo);

  // ── TO DO ── e CALENDARIO
  metti('todo', blocco('.todo-box', true));
  metti('calendario', nuovo('pc-testata', 'Calendario'),
    document.getElementById('phase-calendar-block'),
    document.getElementById('velocity-block'),
    document.querySelector('#screen-project .velocity-history-block'));
  if(deadline) deadline.hidden = true;   // svuotato: le date stanno nella scheda

  // ── LA PAGINA DESTRA ── le tre fasi, una per foglio, senza la fisarmonica
  // (il foglio E' la fase: aprire e chiudere non serve piu').
  const script = document.querySelector('#screen-project .script-block');
  metti('sviluppo', nuovo('pc-testata', 'Fase 1 &middot; Sviluppo'), document.getElementById('ph1'));
  metti('preprod', nuovo('pc-testata', 'Fase 2 &middot; Pre-produzione'), document.getElementById('ph2'));
  metti('tavole', nuovo('pc-testata', 'Fase 3 &middot; Tavole'), document.getElementById('ph3'), blocco('.sfide-box', true));
  metti('script', nuovo('pc-testata', 'Scriptment'),
    nuovo('pc-nota', 'La storia scritta di getto, tutta di fila: si apre a tutto schermo. La freccia la smonta in scene e personaggi.'),
    script);
  // l'esportazione dello scriptment sta col suo foglio, non piu' in fondo
  // alla scheda accanto al report
  const espScript = document.querySelector('#screen-project .export-row button[onclick="exportScreenplay()"]');
  if(espScript){ const r = nuovo('pc-esporta', ''); r.appendChild(espScript); metti('script', r); }
  metti('rif', nuovo('pc-testata', 'Riferimenti visivi'), document.getElementById('ref-panel'),
    nuovo('pc-vuoto', 'Nessuna immagine collegata.<br>Si collegano da References, col segnalibro sull&rsquo;immagine.'));

  // Le linguette: un tocco porta il foglio in cima alla pila. Si ricorda
  // l'ultimo foglio di ogni pagina, per la volta dopo.
  let scelti = {};
  try{ scelti = JSON.parse(localStorage.getItem(CHIAVE) || '{}') || {}; }catch(e){}
  pc.querySelectorAll('.pc-pagina').forEach(pg=>{
    const lato = pg.dataset.lato;
    const primo = pg.querySelector('.pc-ling').dataset.f;
    pg.querySelector('.pc-linguette').addEventListener('click', e=>{
      const b = e.target.closest('.pc-ling'); if(!b) return;
      scegliFoglio(pg, b.dataset.f, true);
    });
    scegliFoglio(pg, pg.querySelector(`.pc-ling[data-f="${scelti[lato]}"]`) ? scelti[lato] : primo, false);
  });

  // I due pallini seguono lo scorrimento fra le pagine.
  const vista = pc.querySelector('#pc-vista');
  const punti = pc.querySelectorAll('.pc-punti i');
  vista.addEventListener('scroll', ()=>{
    const dx = vista.scrollLeft > vista.scrollWidth / 4;
    punti[0].classList.toggle('on', !dx); punti[1].classList.toggle('on', dx);
  }, { passive:true });
}

function scegliFoglio(pg, id, aMano){
  pg.querySelectorAll('.pc-ling').forEach(b=>{
    const on = b.dataset.f === id;
    b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
  });
  pg.querySelectorAll('.pc-sheet').forEach(s=>{ s.hidden = s.dataset.f !== id; });
  const sheet = pg.querySelector(`.pc-sheet[data-f="${id}"]`);
  if(aMano){
    sheet.scrollTop = 0;
    try{
      const s = JSON.parse(localStorage.getItem(CHIAVE) || '{}') || {};
      s[pg.dataset.lato] = id; localStorage.setItem(CHIAVE, JSON.stringify(s));
    }catch(e){}
    if(window.playSfx) window.playSfx('tap');
  }
  // I grafici si disegnano sulla larghezza del loro riquadro: dentro un foglio
  // nascosto quella larghezza e' zero, e restavano vuoti. Si ridisegnano
  // quando il foglio viene in cima.
  if(id === 'calendario' && window.__ridisegnaGrafici) requestAnimationFrame(window.__ridisegnaGrafici);
  if(id === 'sviluppo' && window.autoResizeAll) requestAnimationFrame(window.autoResizeAll);
}

// Il titolo sul legno, il numero di fascicolo (il posto nella fila della
// scrivania, come sulla copertina) e la fase. Si torna sempre alla pagina
// sinistra: aprendo una cartella si guarda prima la scheda.
export function aggiornaCartella(p, inizio){
  const t = document.getElementById('pc-titolo');
  if(!t || !p) return;
  t.textContent = p.title || 'Senza titolo';
  const i = projects.indexOf(p);
  document.getElementById('pc-numero').textContent = 'P-' + String((i < 0 ? 0 : i) + 1).padStart(4, '0');
  document.getElementById('pc-fase').textContent = PHASE_NAMES[getPhaseIndex(p)] || '';
  if(inizio){
    const v = document.getElementById('pc-vista');
    if(v) v.scrollLeft = 0;
    document.querySelectorAll('#screen-project .pc-sheet').forEach(s=>{ s.scrollTop = 0; });
  }
}
