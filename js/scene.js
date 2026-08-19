// ── SCENE — la struttura visiva di una scena breve ───────────────────────────
//
// PERCHE' ESISTE.
//
// Giovanni disegna, non scrive, e ha una resistenza fortissima a mettersi
// davanti a un foglio di testo. Story e Scriptment, che vivono dentro un
// progetto, chiedono esattamente quello: un soggetto, dei personaggi, tre atti.
// Sono gli strumenti giusti per un lavoro gia' cominciato, e sono la porta
// sbagliata per un'idea che deve ancora prendere forma.
//
// Qui l'obiettivo di design e' UNO SOLO: abbassare l'asticella d'ingresso il
// piu' possibile. Tutto il resto — quante scene, quanto sono lunghe, se sono
// "finite" — non e' affare di questa schermata. Da cui le regole che seguono,
// che sono scelte e non mancanze:
//
//   · Una scena nuova mostra UN SOLO riquadro vuoto, mai una griglia vuota.
//     Compilato il primo appare il secondo. Il vuoto in blocco — dodici caselle
//     che aspettano — e' esattamente l'immagine che fa chiudere l'app.
//   · Cento caratteri per beat, e il limite E' la funzione: obbliga a dire cosa
//     si vede, non a raccontarlo. Il contatore compare solo quando si sta per
//     finire lo spazio, perche' prima non serve a niente.
//   · Nessun dialogo. I dialoghi arrivano dopo, quando le tavole esistono.
//   · Nessun conteggio, nessuna barra, nessuna soglia. Una scena da quattro
//     beat e' una scena finita.
//
// E niente parole da ufficio: qui non ci sono progetti, obiettivi, task o
// progressi. C'e' una scena e cosa si vede.
import { db, collection, doc, onSnapshot, setDoc, deleteDoc } from './firebase.js';
import { haptic, showUndoToast } from './state.js';
import { actionMenu } from './dialogs.js';
import { esc } from './testo.js';
import { cldResize, uploadToCloudinary } from './cloudinary.js';
import { montaRiordino } from './riordino.js';

const SCENE_COL = 'scene';

// Il limite dei cento caratteri, e la soglia oltre la quale si comincia a
// contare. Il limite E' la funzione, non il vincolo: cento caratteri non bastano
// per fare prosa, e obbligano a dire cosa si VEDE. Sotto i settanta il contatore
// direbbe solo "hai ancora spazio", che mentre si scrive non serve a niente.
export const MAX_BEAT = 100;
const CONTA_DA = 70;

// Le due sagome appena accennate dopo la card tratteggiata, e quanti beat
// bastano perche' le card tornino della loro altezza normale. Vedi renderBeat.
const SAGOME = 2;
const POCHI = 3;

// Ogni quanto si passa a buttare le scene abbandonate, e da quanto devono
// esserlo. Vedi spazzaScarti.
const SCARTO_MS = 24 * 60 * 60 * 1000;

// Ogni quanto si scrive su Firestore mentre le dita si muovono. Salvare ad
// ogni carattere vorrebbe dire una scrittura per lettera; salvare solo alla
// chiusura vorrebbe dire perdere tutto se il telefono decide di chiudere l'app
// mentre si guarda altro. Un secondo scarso e' il punto in mezzo.
const RESPIRO = 800;

const cmpOrdine = (a,b)=> (a.ordine||0) - (b.ordine||0);

let _scene = [];
let _unsub = null;
let _apertaId = null;       // scena aperta nel foglio, o null
let _gestoElenco = null;
let _gestoBeat = null;
let _timerSalva = null;
let _spazzato = false;      // la pulizia degli scarti gira una volta per sessione

function genId(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

// Il titolo e' facoltativo per davvero: chiederlo prima di lasciar buttare giu'
// il primo beat sarebbe la prima domanda a cui rispondere, cioe' il primo
// motivo per rimandare.
// UN BEAT CON SOLO UNO SCARABOCCHIO E' UN BEAT. Disegnare qui e' una strada
// d'ingresso di pari dignita' rispetto alla tastiera — anzi, per chi disegna e'
// la piu' naturale — quindi il testo non e' mai obbligatorio. Questa funzione e'
// l'unico posto in cui si decide se un beat esiste: la usano la potatura dei
// vuoti, la promozione della card fantasma e la pulizia degli scarti.
export function beatPieno(b){
  return !!(b && ((b.testo||'').trim().length || b.img));
}

export function titoloDi(scena){
  const t = (scena && scena.titolo || '').trim();
  return t || 'Scena senza titolo';
}

function quando(ms){
  if(!ms) return '';
  const d = new Date(ms);
  const giorni = Math.floor((new Date().setHours(0,0,0,0) - new Date(ms).setHours(0,0,0,0)) / 86400000);
  if(giorni === 0) return 'oggi';
  if(giorni === 1) return 'ieri';
  if(giorni < 7) return giorni + ' giorni fa';
  return d.toLocaleDateString('it-IT', { day:'numeric', month:'short' });
}

// ── DATI ────────────────────────────────────────────────────────────────────
// I beat stanno DENTRO il documento della scena, non in una sottocollezione.
// Sono al massimo una quindicina, si leggono in un colpo solo, e riordinarli e'
// una scrittura sola invece di quindici.
export function startSceneListener(){
  if(_unsub) return;
  _unsub = onSnapshot(collection(db, SCENE_COL), snap=>{
    _scene = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .map(s=>({ ...s, beat: Array.isArray(s.beat) ? s.beat : [] }));
    renderScene();
    // Una volta per sessione, appena l'elenco arriva: le scene abbandonate se ne
    // vanno prima ancora che si veda l'elenco pieno di scarti.
    if(!_spazzato){ _spazzato = true; spazzaScarti(); }
    // La scena aperta va rinfrescata solo se e' cambiata da fuori: ridisegnare
    // i riquadri mentre ci si scrive dentro vorrebbe dire perdere il cursore ad
    // ogni salvataggio.
    if(_apertaId && !document.activeElement?.closest?.('#scena-beat')) renderBeat();
  }, err=>console.warn('listener scene:', err));
}

export function tutteLeScene(){ return _scene; }
export function scenaAperta(){ return _apertaId ? _scene.find(s=>s.id===_apertaId) : null; }

async function scrivi(scena){
  try{ await setDoc(doc(db, SCENE_COL, scena.id), scena); }
  catch(e){ console.warn('salvataggio scena fallito:', e); }
}

// Salvataggio col respiro: le battute si accumulano e partono insieme.
function salvaFraPoco(id){
  clearTimeout(_timerSalva);
  _timerSalva = setTimeout(()=>{
    const s = _scene.find(x=>x.id===id);
    if(s) scrivi(s);
  }, RESPIRO);
}
// Quando si chiude qualcosa non si aspetta il respiro: si scrive subito.
// L'id si passa da fuori e non si legge da _apertaId: chiudendo la scena quella
// variabile e' gia' stata azzerata, e il salvataggio finale — proprio quello
// che non si puo' perdere — non partiva.
export async function salvaSubito(id){
  clearTimeout(_timerSalva);
  const s = _scene.find(x=> x.id === (id || _apertaId));
  if(s) await scrivi(s);
}

export async function nuovaScena(){
  const ora = Date.now();
  // In cima: una scena appena aperta e' quella su cui si sta lavorando.
  const cima = _scene.length ? Math.min(..._scene.map(s=> s.ordine||0)) - 1 : 0;
  const scena = { id: genId(), titolo:'', beat: [], createdAt: ora, updatedAt: ora, ordine: cima };
  // Ottimistico: la scena c'e' subito, senza aspettare la rete. Toccare
  // "Nuova scena" e restare mezzo secondo davanti a niente e' il modo piu'
  // veloce di perdere quello che si aveva in testa.
  _scene = [scena, ..._scene];
  renderScene();
  haptic('done');
  scrivi(scena);
  apriScena(scena.id);
  return scena.id;
}

export async function eliminaScena(id){
  const scena = _scene.find(s=>s.id===id);
  if(!scena) return false;
  _scene = _scene.filter(s=>s.id!==id);
  renderScene();
  try{ await deleteDoc(doc(db, SCENE_COL, id)); }
  catch(e){ console.warn('eliminazione scena fallita:', e); }
  showUndoToast('Scena eliminata', async ()=>{
    _scene = [scena, ..._scene];
    renderScene();
    await scrivi(scena);
  });
  return true;
}

// ── L'ELENCO ────────────────────────────────────────────────────────────────
// Sotto il titolo non c'e' un conteggio ("6 beat") ma il PRIMO BEAT: un numero
// dice quanto si e' fatto, e quanto si e' fatto qui non interessa a nessuno.
// La prima immagine invece dice di che scena si tratta, che e' l'unica cosa che
// serve per riconoscerla nell'elenco.
export function renderScene(){
  const lista = document.getElementById('scene-lista');
  if(!lista) return;

  if(!_scene.length){
    lista.innerHTML = `<div class="scene-vuoto">
      <div class="scene-vuoto-glifo">◳</div>
      <p>Nessuna scena, per ora.</p>
    </div>`;
    return;
  }

  lista.innerHTML = _scene.slice().sort(cmpOrdine).map(scena=>{
    const b0 = scena.beat[0];
    const primo = (b0 && b0.testo || '').trim();
    // Il testo del primo beat, come sempre. Se il primo beat e' un disegno e
    // basta — che e' un beat a tutti gli effetti — si mostra quello: la scena si
    // presenta comunque col suo contenuto, che e' la regola, e non con un
    // "1 beat" che non dice niente di cosa c'e' dentro.
    const anteprima = primo
      ? `<span>${esc(primo)}</span>`
      : (b0 && b0.img ? `<img class="scene-card-img" src="${esc(cldResize(b0.img, 160))}" alt=""/>` : '');
    return `<article class="scene-card" data-id="${esc(scena.id)}">
      <div class="scene-card-riga">
        <div class="scene-card-testo">
          <b>${esc(titoloDi(scena))}</b>
          ${anteprima}
        </div>
        <button class="scene-menu" data-menu="${esc(scena.id)}" aria-label="Cosa fare con questa scena">⋯</button>
      </div>
      <div class="scene-card-piede">
        <span class="scene-data">${esc(quando(scena.updatedAt||scena.createdAt))}</span>
      </div>
    </article>`;
  }).join('');
}

function menuScena(ancora, id){
  const scena = _scene.find(s=>s.id===id);
  if(!scena) return;
  actionMenu(ancora, [
    { label: 'Apri', icon: 'rinomina', onSelect: ()=> apriScena(id) },
    { label: 'Elimina', icon: 'elimina', danger: true, onSelect: ()=> eliminaScena(id) },
  ]);
}

// ── LA SCENA APERTA ─────────────────────────────────────────────────────────
export function apriScena(id){
  const scena = _scene.find(s=>s.id===id);
  if(!scena) return;
  _apertaId = id;
  const foglio = document.getElementById('scena');
  const tit = document.getElementById('scena-titolo');
  if(tit) tit.value = scena.titolo || '';
  renderBeat();
  foglio.classList.add('open');
  document.body.classList.add('scena-open');
  // Come il lettore degli albi: il foglio si registra nella cronologia, cosi'
  // il tasto Indietro lo chiude invece di uscire dalla schermata.
  try{ if(!history.state || history.state.view !== 'scena') history.pushState({view:'scena', id}, ''); }catch(e){}
  // Il cursore va da solo nel primo riquadro vuoto: aperta la scena si scrive,
  // non si cerca dove scrivere. Dopo l'animazione, se no la tastiera si alza
  // mentre il foglio sta ancora salendo e il salto si vede tutto.
  setTimeout(()=>{
    const vuoto = document.querySelector('#scena-beat .beat-nuovo textarea');
    if(vuoto) vuoto.focus();
  }, 320);
}

export function chiudiScenaUI(){
  const foglio = document.getElementById('scena');
  if(!foglio || !foglio.classList.contains('open')) return;
  chiudiBoardUI();
  foglio.classList.remove('open');
  document.body.classList.remove('scena-open');
  const id = _apertaId;
  _apertaId = null;
  potaVuotiDi(id);
  salvaSubito(id);
  renderScene();
}
// Il pulsante indietro non chiude a mano: torna indietro nella cronologia e
// lascia che sia il gestore di popstate a chiudere davvero. Cosi' c'e' una
// strada sola, e il tasto del telefono e quello a schermo fanno la stessa cosa.
export function chiudiScena(){
  const foglio = document.getElementById('scena');
  if(foglio && foglio.classList.contains('open') && history.state && history.state.view === 'scena'){
    history.back();
    return;
  }
  chiudiScenaUI();
}

// ── I RIQUADRI ──────────────────────────────────────────────────────────────
// LA REGOLA CHE TIENE IN PIEDI TUTTO IL RESTO: si disegnano i beat che
// esistono, piu' UNO vuoto in coda. Mai due, mai una griglia. Il riquadro vuoto
// non e' un beat: diventa un beat nel momento in cui ci si scrive dentro, e
// solo allora ne nasce un altro sotto di lui.
const MATITA = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16Z"/><path d="M13.5 6.5 17.5 10.5"/></svg>`;

function riquadroHTML(n, id, testo, nuovo, img){
  const l = (testo||'').length;
  return `<div class="beat ${nuovo ? 'beat-nuovo' : ''}" ${id ? `data-id="${esc(id)}"` : ''}>
    <span class="beat-n">${n}</span>
    <textarea rows="1" maxlength="${MAX_BEAT}" placeholder="Cosa si vede?"
      aria-label="Beat ${n}">${esc(testo||'')}</textarea>
    <span class="beat-conta" ${l < CONTA_DA ? 'hidden' : ''}>${l}/${MAX_BEAT}</span>
    <button class="beat-schizzo ${img ? 'pieno' : ''}" data-schizzo type="button"
      aria-label="${img ? 'Modifica il disegno' : 'Disegna questo beat'}">${
      img ? `<img src="${esc(cldResize(img, 160))}" alt=""/>` : MATITA }</button>
  </div>`;
}

// LE SAGOME: due card appena accennate dopo quella tratteggiata. Non sono un
// traguardo ne' una quota — non contano niente e non si toccano — servono a non
// lasciare mezzo schermo deserto sotto due beat, che e' la pagina bianca vista
// da un'altra parte. Sono fuori dal riordino perche' non hanno la classe .beat.
const SAGOME_HTML = Array.from({length:SAGOME}, ()=>
  '<div class="beat-sagoma" aria-hidden="true"></div>').join('');

export function renderBeat(){
  const cont = document.getElementById('scena-beat');
  const scena = scenaAperta();
  if(!cont || !scena) return;
  cont.innerHTML = scena.beat.map((b,i)=> riquadroHTML(i+1, b.id, b.testo, false, b.img)).join('')
    + riquadroHTML(scena.beat.length + 1, null, '', true, null)
    + SAGOME_HTML;
  // Con pochi beat le card sono piu' alte: due riquadri bassi in cima a uno
  // schermo vuoto sembrano l'inizio di un modulo da compilare, gli stessi due
  // larghi sembrano due inquadrature.
  cont.classList.toggle('pochi', scena.beat.length <= POCHI);
  cont.querySelectorAll('textarea').forEach(cresci);
}

// I riquadri crescono col testo invece di far scorrere dentro due righe: cento
// caratteri stanno in tre righe scarse, e vederli tutti e' il punto.
function cresci(ta){
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

// Rinumera le etichette a sinistra dopo un cambiamento di struttura. Si tocca
// solo il numero: rifare tutto l'HTML porterebbe via il cursore da sotto le
// dita di chi sta scrivendo.
function rinumera(){
  const cont = document.getElementById('scena-beat');
  if(!cont) return;
  cont.querySelectorAll('.beat').forEach((el,i)=>{
    const n = el.querySelector('.beat-n');
    if(n) n.textContent = i + 1;
    const ta = el.querySelector('textarea');
    if(ta) ta.setAttribute('aria-label', 'Beat ' + (i+1));
  });
}

function aggiornaConta(box){
  const ta = box.querySelector('textarea');
  const conta = box.querySelector('.beat-conta');
  if(!ta || !conta) return;
  const l = ta.value.length;
  conta.textContent = l + '/' + MAX_BEAT;
  conta.hidden = l < CONTA_DA;
}

// Il riquadro vuoto in coda diventa un beat vero. Non si ridisegna niente di
// quello che c'e' gia': si aggiunge il fratello sotto e si lascia il cursore
// esattamente dov'era, in mezzo alla parola che si sta scrivendo.
function promuovi(box, dati){
  const scena = scenaAperta();
  if(!scena) return null;
  const beat = { id: genId(), testo: dati.testo || '', ...(dati.img ? { img: dati.img } : {}) };
  scena.beat = scena.beat.concat([beat]);
  scena.updatedAt = Date.now();
  box.classList.remove('beat-nuovo');
  box.dataset.id = beat.id;
  // La card fantasma nuova si INFILA dopo questa, e il resto della pagina non
  // si tocca: ridisegnare tutto sarebbe la scrittura piu' corta e porterebbe via
  // il cursore a meta' della parola che si sta battendo.
  box.insertAdjacentHTML('afterend', riquadroHTML(scena.beat.length + 1, null, '', true, null));
  const nuovo = box.nextElementSibling;
  if(nuovo) cresci(nuovo.querySelector('textarea'));
  // Le sagome devono restare in fondo, dopo la card fantasma appena nata.
  const cont = document.getElementById('scena-beat');
  cont.querySelectorAll('.beat-sagoma').forEach(el=> cont.appendChild(el));
  cont.classList.toggle('pochi', scena.beat.length <= POCHI);
  haptic('tap');
  salvaFraPoco(scena.id);
  return beat;
}

// Svuotare un beat equivale a buttarlo — e' lo stesso patto delle Idee. Succede
// all'uscita dal riquadro e non mentre si cancella: sparire sotto le dita a
// meta' di una riscrittura sarebbe insopportabile.
function potaVuoti(){ potaVuotiDi(_apertaId); }
function potaVuotiDi(id){
  const scena = _scene.find(x=>x.id===id);
  const cont = document.getElementById('scena-beat');
  if(!scena || !cont) return;
  const prima = scena.beat.length;
  scena.beat = scena.beat.filter(beatPieno);
  if(scena.beat.length === prima) return;
  scena.updatedAt = Date.now();
  cont.querySelectorAll('.beat[data-id]').forEach(el=>{
    if(!scena.beat.some(b=> b.id === el.dataset.id)) el.remove();
  });
  rinumera();
  salvaFraPoco(scena.id);
}

// ── DISEGNARE UN BEAT ───────────────────────────────────────────────────────
// Il foglio vive in schizzo.js e si carica al primo tocco sulla matita: chi non
// disegna mai non se lo porta dietro. Il PNG finisce su Cloudinary come tutte le
// altre immagini dell'app, e nel beat resta l'indirizzo — dentro il documento
// starebbero stretti, quindici disegni sfiorerebbero il limite di Firestore.
async function disegnaBeat(box){
  const scena = scenaAperta();
  if(!scena) return;
  const nuovo = box.classList.contains('beat-nuovo');
  const beat = nuovo ? null : scena.beat.find(b=> b.id === box.dataset.id);
  const m = await import('./schizzo.js');
  m.apriSchizzo({
    url: beat && beat.img,
    onSalva: async (blob)=>{
      const { url } = await uploadToCloudinary(blob, 'schizzo.png');
      const s2 = _scene.find(x=>x.id===scena.id);
      if(!s2) return;
      if(nuovo){
        // Disegnare dentro la card fantasma la promuove esattamente come
        // scriverci: e' il punto di tutta questa funzione.
        promuovi(box, { img: url });
      } else {
        const b = s2.beat.find(x=> x.id === box.dataset.id);
        if(b) b.img = url;
      }
      s2.updatedAt = Date.now();
      // Solo il quadratino: ridisegnare tutto porterebbe via il cursore a chi
      // stava scrivendo nel riquadro accanto.
      const q = box.querySelector('[data-schizzo]');
      if(q){
        q.classList.add('pieno');
        q.innerHTML = `<img src="${esc(cldResize(url, 160))}" alt=""/>`;
        q.setAttribute('aria-label', 'Modifica il disegno');
      }
      await salvaSubito(s2.id);
    },
  });
}

// ── LA PULIZIA DEGLI SCARTI ─────────────────────────────────────────────────
// Le scene rimaste a zero o un beat da piu' di un giorno se ne vanno da sole, in
// silenzio: niente conferma, niente avviso, niente cestino. Una scena si apre in
// un tocco e spesso si apre per sbaglio, o per provare; se restassero tutte,
// l'elenco diventerebbe un cimitero di cose non fatte — ed e' esattamente
// l'immagine che fa rimandare l'apertura dell'app.
//
// Il conto parte da updatedAt, cioe' dall'ultima volta che la scena e' stata
// toccata: e' l'unico segnale onesto di "abbandonata". E la scena aperta in
// questo momento non si tocca mai, per ovvi motivi.
export async function spazzaScarti(adesso = Date.now()){
  const scarti = _scene.filter(s=>
    s.id !== _apertaId &&
    (s.beat || []).filter(beatPieno).length <= 1 &&
    (s.updatedAt || s.createdAt || adesso) < adesso - SCARTO_MS
  );
  if(!scarti.length) return 0;
  const via = new Set(scarti.map(s=>s.id));
  _scene = _scene.filter(s=> !via.has(s.id));
  renderScene();
  for(const s of scarti){
    try{ await deleteDoc(doc(db, SCENE_COL, s.id)); }
    catch(e){ console.warn('pulizia scene fallita:', e); }
  }
  return scarti.length;
}

// ── LA BOARD ────────────────────────────────────────────────────────────────
// Tutti i beat affiancati, in sola lettura, da tenere aperta accanto al tavolo
// mentre si disegnano le tavole vere. Sola lettura per davvero: qui non si
// scrive, e non c'e' nessun campo in cui il dito possa finire per sbaglio.
export function apriBoard(){
  const scena = scenaAperta();
  const board = document.getElementById('board');
  if(!scena || !board) return;
  const griglia = document.getElementById('board-griglia');
  const tit = document.getElementById('board-titolo');
  if(tit) tit.textContent = titoloDi(scena);
  if(griglia){
    griglia.innerHTML = scena.beat.length
      ? scena.beat.map((b,i)=> `<div class="board-tessera">
          <span class="board-n">${i+1}</span>
          ${b.img ? `<img class="board-img" src="${esc(cldResize(b.img, 400))}" alt=""/>` : ''}
          ${(b.testo||'').trim() ? `<p>${esc(b.testo)}</p>` : ''}
        </div>`).join('')
      : `<div class="scene-vuoto"><p>Questa scena non ha ancora beat.</p></div>`;
  }
  board.classList.add('open');
  try{ if(!history.state || history.state.view !== 'board') history.pushState({view:'board'}, ''); }catch(e){}
}
export function chiudiBoardUI(){
  const board = document.getElementById('board');
  if(board) board.classList.remove('open');
}
export function chiudiBoard(){
  const board = document.getElementById('board');
  if(board && board.classList.contains('open') && history.state && history.state.view === 'board'){
    history.back();
    return;
  }
  chiudiBoardUI();
}
export function boardAperta(){
  const b = document.getElementById('board');
  return !!(b && b.classList.contains('open'));
}
export function scenaApertaUI(){
  const s = document.getElementById('scena');
  return !!(s && s.classList.contains('open'));
}

// ── AGGANCI ─────────────────────────────────────────────────────────────────
let _agganciato = false;
export function initScene(){
  startSceneListener();
  if(_agganciato) return;
  _agganciato = true;

  document.getElementById('scene-nuova').addEventListener('click', ()=> nuovaScena());

  const lista = document.getElementById('scene-lista');
  lista.addEventListener('click', e=>{
    const menu = e.target.closest('[data-menu]');
    if(menu){ e.stopPropagation(); menuScena(menu, menu.dataset.menu); return; }
    if(_gestoElenco && _gestoElenco.strisciaRecente()) return;
    const card = e.target.closest('.scene-card');
    if(card) apriScena(card.dataset.id);
  });
  _gestoElenco = montaRiordino(lista, {
    selettore: '.scene-card',
    alStriscia: card=> menuScena(card, card.dataset.id),
    alPosa: (da, a)=>{
      const fila = _scene.slice().sort(cmpOrdine);
      const [presa] = fila.splice(da, 1);
      fila.splice(a, 0, presa);
      fila.forEach((s,k)=>{ s.ordine = k; });
      _scene = fila;
      renderScene();
      fila.forEach(s=> scrivi(s));
    },
  });

  const tit = document.getElementById('scena-titolo');
  tit.addEventListener('input', ()=>{
    const scena = scenaAperta();
    if(!scena) return;
    scena.titolo = tit.value;
    scena.updatedAt = Date.now();
    salvaFraPoco(scena.id);
  });

  const beat = document.getElementById('scena-beat');
  beat.addEventListener('click', e=>{
    const q = e.target.closest('[data-schizzo]');
    if(q) disegnaBeat(q.closest('.beat'));
  });
  beat.addEventListener('input', e=>{
    const ta = e.target.closest('textarea');
    if(!ta) return;
    const box = ta.closest('.beat');
    cresci(ta);
    aggiornaConta(box);
    if(box.classList.contains('beat-nuovo')){
      if(ta.value.trim()) promuovi(box, { testo: ta.value });
      return;
    }
    const scena = scenaAperta();
    const b = scena && scena.beat.find(x=> x.id === box.dataset.id);
    if(!b) return;
    b.testo = ta.value;
    scena.updatedAt = Date.now();
    salvaFraPoco(scena.id);
  });
  // Uscendo da un riquadro rimasto vuoto lo si butta, e la scena si ricompatta.
  beat.addEventListener('focusout', ()=> setTimeout(potaVuoti, 0));

  _gestoBeat = montaRiordino(beat, {
    selettore: '.beat',
    spazio: 10,
    alPosa: (da, a)=>{
      const scena = scenaAperta();
      if(!scena) return;
      // Il riquadro vuoto in coda non e' un beat: se il dito lo trascina, o
      // trascina qualcosa oltre di lui, non c'e' niente da riordinare.
      if(da >= scena.beat.length || a >= scena.beat.length){ renderBeat(); return; }
      const fila = scena.beat.slice();
      const [preso] = fila.splice(da, 1);
      fila.splice(a, 0, preso);
      scena.beat = fila;
      scena.updatedAt = Date.now();
      renderBeat();
      salvaFraPoco(scena.id);
    },
  });

  document.getElementById('scena-chiudi').addEventListener('click', ()=> chiudiScena());
  document.getElementById('scena-board').addEventListener('click', ()=> apriBoard());
  document.getElementById('board-chiudi').addEventListener('click', ()=> chiudiBoard());

  renderScene();
}
