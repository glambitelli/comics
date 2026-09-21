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

// ── IL PENNARELLO ────────────────────────────────────────────────────────────
//
// Gli appunti sulla mappa sono la cosa che Giovanni ha chiesto guardando la
// mappa vera di Raccoon City (21 settembre 2026): frecce nere, riquadri verdi
// sugli edifici, cerchi arancioni, scritte a mano. Il punto e' che quelle
// annotazioni sembrano FATTE DA QUALCUNO, e un tratto tirato col mouse no.
//
// PRIMO TENTATIVO, SCARTATO: un filtro SVG (feTurbulence + feDisplacementMap)
// che sbandava il tratto gia' disegnato. Il rumore del filtro ha un passo suo
// che non sa niente della figura sotto: sui cerchi veniva fuori un ottagono.
//
// SECONDO TENTATIVO, TROPPO: il tremolio sui punti, ma con tre sinusoidi veloci
// e un'ampiezza fino a 3px. "Indecenti, sembra che chi le ha disegnate stesse
// tremando" — ed era vero.
//
// QUELLO CHE C'E' ADESSO: il tremolio e' LENTO e piccolo. La sinusoide che
// conta fa poco piu' di un giro su tutto il segno, cioe' produce una curva che
// scarta da una parte e torna, non una vibrazione. Lo sporco vero viene da
// altre tre cose, che non sono tremolio:
//   - ogni segno e' passato DUE VOLTE, la seconda piu' sottile e scostata di un
//     pixel e mezzo: e' quello che fa "ci sono tornato sopra";
//   - le punte SBORDANO oltre il vertice invece di fermarsi li';
//   - i due baffi della punta hanno lunghezze diverse, come li fa la mano.
function rumore(t, seme){
  return Math.sin(t*1.7 + seme)*0.72 + Math.sin(t*3.3 + seme*2.1)*0.22
       + Math.sin(t*6.1 + seme*3.7)*0.06;
}
// Sposta ogni punto lungo la PERPENDICOLARE al tratto: spostarlo in diagonale
// accorcerebbe e allungherebbe il segno invece di piegarlo.
function sporca(pts, amp, seme){
  const out = [];
  for(let i=0;i<pts.length;i++){
    const a = pts[Math.max(0,i-1)], b = pts[Math.min(pts.length-1,i+1)];
    let dx = b[0]-a[0], dy = b[1]-a[1];
    const L = Math.hypot(dx,dy) || 1; dx/=L; dy/=L;
    const n = rumore(i/pts.length*2.6, seme) * amp;
    out.push([pts[i][0] - dy*n, pts[i][1] + dx*n]);
  }
  return out;
}
// Da spezzata a curva: ogni punto diventa il controllo di una quadratica fra i
// due punti medi. Senza questo i segni hanno angoli, e un angolo in un tratto a
// mano si vede subito.
function liscia(pts){
  let d = 'M'+pts[0][0].toFixed(1)+' '+pts[0][1].toFixed(1);
  for(let i=1;i<pts.length-1;i++){
    const mx=(pts[i][0]+pts[i+1][0])/2, my=(pts[i][1]+pts[i+1][1])/2;
    d += 'Q'+pts[i][0].toFixed(1)+' '+pts[i][1].toFixed(1)+' '+mx.toFixed(1)+' '+my.toFixed(1);
  }
  const u = pts[pts.length-1];
  return d + 'L'+u[0].toFixed(1)+' '+u[1].toFixed(1);
}
function dueMani(pts, colore, w, amp, seme){
  const a = liscia(sporca(pts, amp, seme));
  const b = liscia(sporca(pts.map(q=>[q[0]+1.5,q[1]+1.2]), amp*0.8, seme+4.2));
  return `<path d="${a}" fill="none" stroke="${colore}" stroke-width="${w.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>`
       + `<path d="${b}" fill="none" stroke="${colore}" stroke-width="${(w*0.62).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity=".4"/>`;
}
function freccia(x1,y1,x2,y2,curva,colore,w,seme){
  const mx=(x1+x2)/2 + (curva||0), my=(y1+y2)/2 - Math.abs(curva||0)*.45;
  const P = [];
  for(let i=0;i<=26;i++){
    const t=i/26, u=1-t;
    P.push([u*u*x1 + 2*u*t*mx + t*t*x2, u*u*y1 + 2*u*t*my + t*t*y2]);
  }
  // IL TREMOLIO VA A MISURA: la stessa ampiezza che su una freccia lunga e' un
  // segno a mano, su una corta e' uno scarabocchio illeggibile.
  const lung = Math.hypot(x2-x1, y2-y1) + Math.abs(curva||0);
  const amp = Math.max(0.5, Math.min(1.4, lung/130));
  const t1 = Math.max(9, Math.min(18, lung/9)), t2 = t1*0.74;
  const ang = Math.atan2(y2-my, x2-mx);
  const ox = x2 + Math.cos(ang)*3, oy = y2 + Math.sin(ang)*3;   // la punta sborda
  const baffo = (a,t)=>[[ox,oy],[ox+Math.cos(a)*t*.5,oy+Math.sin(a)*t*.5],[ox+Math.cos(a)*t,oy+Math.sin(a)*t]];
  return dueMani(P, colore, w, amp, seme)
       + dueMani(baffo(ang+Math.PI-.36, t1), colore, w, 0.5, seme+1.9)
       + dueMani(baffo(ang+Math.PI+.48, t2), colore, w, 0.5, seme+3.1);
}
// Il giro che fa la mano quando cerchia un edificio in fretta: parte da meta'
// del lato alto, gira, e chiude SBORDANDO oltre il punto di partenza.
function riquadro(x,y,L,H,colore,w,seme){
  const ang = [[x+L*.45,y],[x+L,y],[x+L,y+H],[x,y+H],[x,y],[x+L*.66,y-1]];
  const P = [];
  for(let i=0;i<ang.length-1;i++){
    const a=ang[i], b=ang[i+1], n=Math.max(4, Math.round(Math.hypot(b[0]-a[0],b[1]-a[1])/9));
    for(let k=0;k<n;k++) P.push([a[0]+(b[0]-a[0])*k/n, a[1]+(b[1]-a[1])*k/n]);
  }
  P.push(ang[ang.length-1]);
  return dueMani(P, colore, w, 1.1, seme);
}
function cerchio(cx,cy,rx,ry,colore,w,seme){
  const P = [];
  for(let i=0;i<=64;i++){
    const a = -0.55 + (i/64)*(Math.PI*2 + 0.9);      // un giro e un pezzo
    const k = 1 + Math.sin(i*0.29 + seme)*0.035;     // il raggio balla appena
    P.push([cx + Math.cos(a)*rx*k, cy + Math.sin(a)*ry*k]);
  }
  return dueMani(P, colore, w, 1.0, seme+5.5);
}
// Una scritta a pennarello, storta di suo: allineate sembravano etichette.
function scritta(testo, x, y, misura, colore, gradi){
  return `<span class="scriv-nota" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;`
       + `font-size:${misura.toFixed(1)}px;color:${colore};transform:rotate(${gradi}deg)">${esc(testo)}</span>`;
}

// ── LE DUE COSE CHE VALE LA PENA ANNOTARE ──
// La serie piu' lunga di giorni di fila e il buco piu' lungo, fra i giorni
// GIA' PASSATI. Sono le due cose che su un registro delle ore guardi davvero,
// e sono le uniche due che meritano una freccia: annotare ogni giorno sarebbe
// ricoprire la mappa e non dire piu' niente.
function serieEBuco(fatto, giorno){
  let serie = {n:0, g:[]}, cur = [], buco = {n:0, g:[]}, cb = [];
  for(let g=1; g<=giorno; g++){
    if(fatto(g)){ cur.push(g); if(cur.length>serie.n) serie={n:cur.length, g:cur.slice()}; cb=[]; }
    else { cur=[]; cb.push(g); if(cb.length>buco.n) buco={n:cb.length, g:cb.slice()}; }
  }
  return { serie, buco };
}

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
  const ore = scriviBreve ? scriviBreve(secondiMese) : '';

  // ── GLI APPUNTI A PENNARELLO ──
  // Le misure sono in pixel ma vanno a scala col foglio: erano fisse, e sul
  // telefono diventavano tre scritte grosse una sull'altra. Sotto i 560px di
  // mappa restano solo il cerchio di oggi e il riquadro della serie: non c'e'
  // spazio per le frecce, e appunti che si accavallano non sono appunti.
  const k = Math.max(.58, Math.min(1, L / 880)), stretto = L < 560;
  const { serie, buco } = serieEBuco(fatto, giorno);
  let note = '';
  // IL RIQUADRO VERDE sulla serie piu' lunga, come i verdi sugli edifici
  // della mappa vera. Da due giorni in su: cerchiare un giorno solo e
  // chiamarlo "serie" sarebbe una lusinga.
  if(serie.n >= 2){
    const a = p[serie.g[0]-1], b = p[serie.g[serie.n-1]-1];
    const rx = Math.min(a.x,b.x) - 26*k, ry = Math.min(a.y,b.y) - 20*k;
    const rw = Math.abs(b.x-a.x) + 52*k, rh = Math.abs(b.y-a.y) + 40*k;
    svg += riquadro(rx, ry, rw, rh, '#4fae3f', 5*k, 2.7);
    // LA SCRITTA VA SOPRA IL RIQUADRO quando c'e' posto. Sotto finiva addosso
    // alla riga di giorni successiva — copriva una croce, cioe' un dato — e un
    // appunto che nasconde quello che sta annotando non serve a niente.
    // Sopra la prima riga di isolati ci sono i 40px lasciati al nome del mese:
    // li' la scritta e' libera. Se non ci sta, torna sotto.
    const sopra = ry - 21*k, sotto = ry + rh + 4*k;
    const ny = (sopra > 4) ? sopra : sotto;
    note += scritta(serie.n + ' giorni di fila', Math.max(2, rx + 4), ny, 19*k, '#1f7d33', -3.5);
  }
  // IL CERCHIO GIALLO SU OGGI, al posto del riquadrino pulito che c'era prima.
  svg += cerchio(q0.x, q0.y, 34*k, 27*k, '#f2c400', 6*k, 0);
  if(stretto){
    note += scritta('oggi', q0.x - 34*k, q0.y - 44*k, 13*k, '#8d4a32', -2);
  } else {
    // DA LONTANO E IN NERO. La freccia di oggi arriva dall'angolo in basso a
    // destra, che e' da dove guarda chi sta seduto al tavolo.
    svg += freccia(L*.97, H-40*k, q0.x + 42*k, q0.y + 10*k, 40*k, '#16130f', 5.2*k, 1.3);
    // E DICE IL VERO: se oggi hai gia' segnato delle ore non e' piu' un
    // invito, e' un resoconto.
    const oggiFatto = perGiorno.get(chiave(anno, mese, giorno)) || 0;
    const dice = oggiFatto > 0 && scriviBreve ? 'oggi ' + scriviBreve(oggiFatto) : 'oggi tocca a te';
    note += scritta(dice, L*.72, H - 36*k, 20*k, '#16130f', -4);
    // IL CERCHIO ARANCIONE sul giorno saltato, come il "sewer" cerchiato sulla
    // mappa vera, con la freccia rossa che ci cade sopra da vicino.
    if(buco.n >= 1){
      const q = p[buco.g[Math.floor(buco.n/2)]-1];
      svg += cerchio(q.x, q.y, 28*k, 23*k, '#ef8a1f', 4.6*k, 3.4);
      svg += freccia(q.x-56*k, q.y-34*k, q.x-11*k, q.y-15*k, -9*k, '#c0392b', 4.6*k, 7.1);
      note += scritta('qui mi sono fermato', Math.max(2, q.x-112*k), Math.max(2, q.y-52*k),
                      16*k, '#c0392b', 2);
    }
  }

  el.innerHTML =
    `<span class="scriv-parco" style="left:3%;top:9%;width:19%;height:26%"></span>`
  + `<span class="scriv-parco" style="left:70%;top:52%;width:27%;height:40%"></span>`
  + `<span class="scriv-fiume" style="left:58%;top:0;width:${Math.max(6, L/74).toFixed(0)}px;height:100%;transform:rotate(2.5deg)"></span>`
  + `<div class="scriv-mese">${MESI[mese]}</div>`
  + `<svg viewBox="0 0 ${L} ${H}" aria-hidden="true">${svg}</svg>`
  + note
  // Le ore del mese vanno in basso a SINISTRA: stavano al centro, dove adesso
  // ci passa la scritta della serie.
  + (ore ? scritta(ore + ' questo mese', L*0.04, H-24, 13*k, '#1d1a17', -1.2) : '');

  // La frase del giorno la scrive main.js dentro #home-quote: qui si porta il
  // suo contenuto nella legenda, che sta sul MARGINE del foglio sotto la mappa
  // e non piu' dentro il disegno — li' copriva i giorni della prima riga.
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
export function disegnaBiglietto(apriProgetto, apriIProgetti){
  const el = document.getElementById('scriv-biglietto');
  if(!el) return;
  // SENZA NEMMENO UN PROGETTO non c'e' niente da scrivere stasera, e il foglio
  // sparisce: e' il caso di chi apre l'app la prima volta.
  if(!projects.length){ el.hidden = true; return; }
  el.hidden = false;
  const p = projects.find(x => x && x.microtask && x.microtask.trim());
  if(p){
    el.innerHTML = `<span class="nastro"></span><i>STASERA</i>`
                 + `<b>${esc(p.microtask.trim())}</b>`
                 + `<em>${esc((p.title || '').toUpperCase())}</em>`;
    el.onclick = ()=> apriProgetto && apriProgetto(p.id);
    return;
  }
  // IL FOGLIO RESTA ANCHE DA VUOTO, con la sua riga da riempire. Prima
  // spariva, e il tavolo perdeva l'oggetto piccolo: restavano la mappa e il
  // cronometro, cioe' due cose grandi e nient'altro — la gerarchia su cui la
  // scrivania e' stata disegnata (Giovanni, 21 settembre 2026).
  // E NON C'E' SCRITTO NIENTE DENTRO: una riga vuota si capisce da sola, e un
  // foglietto che dicesse "non hai ancora scritto il task di stasera" sarebbe
  // un rimprovero appeso al tavolo. Toccandolo si va ai progetti, che e' dove
  // il task si scrive.
  el.innerHTML = `<span class="nastro"></span><i>STASERA</i><span class="riga-vuota"></span>`;
  el.onclick = ()=> apriIProgetti && apriIProgetti();
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
