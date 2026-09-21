// ── LA SCRIVANIA — la home come piano di lavoro ──────────────────────────────
//
// PERCHE' ESISTE.
//
// La home era rimasta in due: la citazione e il cronometro. Pulita, e vuota —
// "bella ma povera", detto da Giovanni il 19 settembre 2026 davanti allo
// schermo grande, dove il quadrante era un francobollo in mezzo al nulla.
//
// La risposta non e' stata aggiungere riquadri, ma cambiare METAFORA: non un
// pannello di controllo, un tavolo. Il riferimento e' preciso ed e' suo — la
// mappa di Raccoon City annotata a pennarello da Jill Valentine in RE3, e la
// scrivania di Jill: foglietti, calendario coi giorni sbarrati, la lampada.
//
// LA REGOLA CHE TIENE IN PIEDI TUTTO: quello che si vede e' dato vero. Il
// percorso azzurro sono i giorni in cui ti sei seduto a disegnare, le croci
// rosse i giorni saltati, il riquadro giallo e' oggi. E' il registro delle ore
// (secondiPerGiorno in tempo.js) disegnato come una mappa invece che come un
// grafico a barre. Un grafico a barre lo guardi una volta; una mappa annotata
// la leggi.
//
// NIENTE SI INVENTA. Se il biglietto di stasera non c'e' scritto, il biglietto
// non compare: un foglietto che dice "non hai scritto niente" e' un rimprovero
// appeso al tavolo, e questa e' la prima cosa che si vede aprendo l'app.
import { projects } from './state.js';
import { esc } from './testo.js';

// Quanti giorni ha il mese, e che giorno e' oggi. Tutto in ora locale: il
// registro delle ore e' indicizzato per giorno locale (vedi giornoDi in
// tempo.js), e mischiare i due fusi sposterebbe le croci di un giorno.
function oggiLocale(){
  const d = new Date();
  return { anno:d.getFullYear(), mese:d.getMonth(), giorno:d.getDate() };
}
function giorniDelMese(anno, mese){ return new Date(anno, mese + 1, 0).getDate(); }
function chiave(anno, mese, giorno){
  const due = n => String(n).padStart(2, '0');
  return anno + '-' + due(mese + 1) + '-' + due(giorno);
}
const MESI = ['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO',
              'LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE'];

// ── DOVE CADE OGNI GIORNO SULLA MAPPA ──
// Sette colonne, e le righe si percorrono a SERPENTINA: la prima da sinistra a
// destra, la seconda da destra a sinistra. Non e' un vezzo — e' quello che fa
// diventare il mese un PERCORSO CONTINUO invece di cinque righe staccate, ed e'
// la ragione per cui la cosa somiglia a un itinerario tracciato su una mappa e
// non a un calendario.
const COLONNE = 7;
function posti(quanti, L, H){
  const px = L / (COLONNE + 1);
  const alto = 40;                       // sotto il nome del mese
  const righe = Math.ceil(quanti / COLONNE);
  const py = (H - alto - 16) / righe;
  const p = [];
  for(let g = 1; g <= quanti; g++){
    const r = Math.floor((g - 1) / COLONNE);
    const c = (g - 1) % COLONNE;
    const cc = (r % 2 === 0) ? c : (COLONNE - 1 - c);
    p.push({ g, x: px * (cc + 1), y: alto + py * r + py / 2 });
  }
  return p;
}

// Il tratto dell'evidenziatore cresce col foglio: sulla mappa larga di un
// computer 13 centesimi sono giusti, su un telefono sarebbero una macchia.
function grossezza(L){ return Math.max(7, Math.min(13, L / 52)); }

export function disegnaMappa(perGiorno, secondiMese, scriviBreve){
  const el = document.getElementById('scriv-mappa');
  if(!el) return;
  const r = el.getBoundingClientRect();
  const L = Math.round(r.width), H = Math.round(r.height);
  if(!L || !H) return;                   // non e' ancora a schermo

  const { anno, mese, giorno } = oggiLocale();
  const quanti = giorniDelMese(anno, mese);
  const p = posti(quanti, L, H);
  const fatto = g => (perGiorno.get(chiave(anno, mese, g)) || 0) > 0;

  // IL PERCORSO. Si spezza ad ogni giorno saltato: un tratto continuo sopra un
  // buco direbbe che quel giorno hai disegnato, che e' l'unica bugia che questo
  // disegno non puo' raccontare.
  let d = '', attaccato = false;
  for(const q of p){
    if(fatto(q.g)){ d += (attaccato ? 'L' : 'M') + q.x.toFixed(1) + ' ' + q.y.toFixed(1); attaccato = true; }
    else attaccato = false;
  }
  const w = grossezza(L);
  let svg = '';
  if(d) svg += `<path d="${d}" fill="none" stroke="#56a8dd" stroke-width="${w.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity=".6"/>`;
  // LE CROCI SOLO SUI GIORNI PASSATI. Sbarrare il 30 quando e' il 9 vorrebbe
  // dire segnare come mancato un giorno che deve ancora arrivare — e per uno
  // che tiene il conto delle ore quella non e' una svista, e' un'accusa.
  for(const q of p){
    if(q.g < giorno && !fatto(q.g)){
      const b = w * 0.45;
      svg += `<path d="M${(q.x-b).toFixed(1)} ${(q.y-b).toFixed(1)}L${(q.x+b).toFixed(1)} ${(q.y+b).toFixed(1)}`
           + `M${(q.x+b).toFixed(1)} ${(q.y-b).toFixed(1)}L${(q.x-b).toFixed(1)} ${(q.y+b).toFixed(1)}" `
           + `stroke="#a8352c" stroke-width="${Math.max(2, w*0.22).toFixed(1)}" stroke-linecap="round" opacity=".82"/>`;
    }
  }
  const q0 = p[giorno - 1] || p[p.length - 1];
  const bw = Math.max(34, w * 3.4), bh = Math.max(26, w * 2.7);
  const ore = scriviBreve ? scriviBreve(secondiMese) : '';

  el.innerHTML =
    `<span class="scriv-parco" style="left:3%;top:9%;width:19%;height:26%"></span>`
  + `<span class="scriv-parco" style="left:70%;top:52%;width:27%;height:40%"></span>`
  + `<span class="scriv-fiume" style="left:58%;top:0;width:${Math.max(6, L/74).toFixed(0)}px;height:100%;transform:rotate(2.5deg)"></span>`
  + `<div class="scriv-mese">${MESI[mese]}</div>`
  + `<svg viewBox="0 0 ${L} ${H}" aria-hidden="true">${svg}</svg>`
  + `<span class="scriv-oggi" style="left:${(q0.x-bw/2).toFixed(0)}px;top:${(q0.y-bh/2).toFixed(0)}px;width:${bw.toFixed(0)}px;height:${bh.toFixed(0)}px"></span>`
  + `<span class="scriv-nota" style="left:${(q0.x-bw/2-4).toFixed(0)}px;top:${(q0.y-bh/2-17).toFixed(0)}px;font-size:11px;color:#8d4a32">oggi</span>`
  + (ore ? `<span class="scriv-nota" style="left:${(L*0.28).toFixed(0)}px;top:${(H-26).toFixed(0)}px;font-size:12px">${esc(ore)} questo mese</span>` : '')
  + `<div class="scriv-legenda" id="scriv-legenda"></div>`;

  // La frase del giorno la scrive main.js dentro #home-quote: qui si porta il
  // suo contenuto nella legenda, cosi' resta una sola sorgente per la frase.
  travasaLaFrase();
  el.setAttribute('aria-label',
    'Mappa del mese: il percorso azzurro sono i giorni in cui hai disegnato');
}

// ── LA FRASE DEL GIORNO ──
// Vive in #home-quote, che resta nel markup come unica sorgente (lo riempiono
// due punti diversi di main.js, all'avvio dalla cache e all'arrivo dei dati).
// Qui si COPIA nella legenda della mappa. Copiare e non spostare: se la frase
// venisse riscritta dopo che la mappa e' gia' disegnata, spostando il nodo la
// riscrittura finirebbe nel vuoto.
export function travasaLaFrase(){
  const sorgente = document.getElementById('home-quote');
  const dove = document.getElementById('scriv-legenda');
  if(!sorgente || !dove) return;
  const righe = sorgente.querySelectorAll('div');
  if(righe.length < 2){ dove.hidden = true; return; }
  dove.hidden = false;
  dove.innerHTML = `<div class="cit">${esc(righe[0].textContent)}</div>`
                 + `<div class="aut">${esc(righe[1].textContent)}</div>`;
}

// ── IL BIGLIETTO DI STASERA ──
// E' il microtask del progetto: quello che ti sei scritto di fare. Se ce n'e'
// piu' d'uno si prende il primo, perche' un tavolo con tre foglietti uguali
// non aiuta a cominciare — e gli altri stanno nella scheda del progetto, dove
// li hai scritti. Toccandolo si apre quel progetto.
export function disegnaBiglietto(apriProgetto){
  const el = document.getElementById('scriv-biglietto');
  if(!el) return;
  const p = projects.find(x => x && x.microtask && x.microtask.trim());
  if(!p){ el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<span class="nastro"></span><i>STASERA</i>`
               + `<b>${esc(p.microtask.trim())}</b>`
               + `<em>${esc((p.title || '').toUpperCase())}</em>`;
  el.onclick = ()=> apriProgetto && apriProgetto(p.id);
}

// ── LA LUCE ──
// Accende e spegne la lampada sopra QUESTO tavolo, e basta: non e' la modalita'
// sera dell'app, che e' una schermata sua con le stelle e i task della serata.
// La scelta resta fra un'apertura e l'altra, perche' chi disegna di notte non
// vuole riaccendere la luce ogni volta che apre.
const CHIAVE_LUCE = 'inkflow_scrivania_luce';
export function montaLaLuce(){
  const b = document.getElementById('scriv-luce');
  if(!b || b.dataset.montato) return;
  b.dataset.montato = '1';
  let spenta = false;
  try{ spenta = localStorage.getItem(CHIAVE_LUCE) === 'spenta'; }catch(e){}
  const applica = ()=>{
    document.body.classList.toggle('luce-spenta', spenta);
    b.setAttribute('aria-pressed', spenta ? 'false' : 'true');
    const dice = spenta ? 'Accendi la lampada' : 'Spegni la lampada';
    b.setAttribute('aria-label', dice);
    b.title = dice;
  };
  applica();
  b.addEventListener('click', ()=>{
    spenta = !spenta;
    try{ localStorage.setItem(CHIAVE_LUCE, spenta ? 'spenta' : 'accesa'); }catch(e){}
    applica();
  });
}
