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
import { montaScelta } from './scelta.js';

const SCENE_COL = 'scene';

// Il limite dei cento caratteri, e la soglia oltre la quale si comincia a
// contare. Il limite E' la funzione, non il vincolo: cento caratteri non bastano
// per fare prosa, e obbligano a dire cosa si VEDE. Sotto i settanta il contatore
// direbbe solo "hai ancora spazio", che mentre si scrive non serve a niente.
export const MAX_BEAT = 100;
const CONTA_DA = 70;

// Le due sagome appena accennate dopo la card tratteggiata. Vedi renderBeat.
// (C'era anche una regola che alzava le card quando i beat erano pochi: da
// quando la miniatura 4:3 occupa mezza card, ogni card e' gia' piu' alta di
// quanto quella regola sapesse alzarla, e non serviva piu' a niente.)
const SAGOME = 2;

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
  return !!(b && ((b.testo||'').trim().length || rifiDi(b).length));
}

// I RIFERIMENTI DI UN BEAT SONO UNA PILA, non uno solo. Un'inquadratura si
// costruisce guardando piu' cose insieme — la posa da una parte, la luce da
// un'altra, l'ambiente da una terza — e tenerne una sola voleva dire scegliere
// quale buttare.
// Le scene scritte prima avevano un campo `img` singolo: si leggono come una
// pila di uno, senza toccare niente in archivio. La conversione avviene da sola
// alla prima modifica del beat.
export function rifiDi(b){
  if(b && Array.isArray(b.rifs)) return b.rifs;
  if(b && b.img) return [{ url: b.img, refId: b.refId || null }];
  return [];
}
// Quante ne mostra la pila prima di limitarsi a contarle: oltre tre fogli
// sovrapposti non si distingue piu' niente, si vede solo un pasticcio.
const PILA_MAX = 3;
// Di quanto sbuca ogni foglio da sotto quello sopra.
const SBUCA = 6;
// LA PILA STA TUTTA DENTRO IL RIQUADRO, e questa e' la correzione di un guaio
// vero: i fogli erano posizionati in assoluto dentro un pulsante che non era un
// contesto di posizionamento, quindi si ancoravano alla CARD — si spalmavano
// per tutta la sua larghezza, ruotati, coprendo il testo. A schermo sembrava
// che la scheda si fosse rotta.
// Adesso i fogli vivono dentro un contenitore loro, e lo spazio che serve a
// farli sbucare viene TOLTO dal foglio in cima invece che aggiunto attorno:
// con tre riferimenti il primo e' piu' piccolo di dodici pixel, e nessuno esce
// dal riquadro di un millimetro. Con un riferimento solo non si toglie niente,
// perche' non c'e' niente da far sbucare.
function pilaHTML(rifi){
  if(!rifi.length) return '';
  const visti = rifi.slice(0, PILA_MAX);
  const riserva = (visti.length - 1) * SBUCA;
  // Si dipingono dal fondo verso l'alto, cosi' il PRIMO riferimento resta
  // quello sopra: e' quello che si e' scelto per primo, ed e' quello che di
  // solito comanda l'inquadratura.
  const fogli = visti.map((r,i)=>
    `<img class="pila-foglio" draggable="false" style="--g:${visti.length-1-i}" src="${esc(cldResize(r.url, 320))}" alt=""/>`
  ).reverse().join('');
  return `<span class="pila" style="--r:${riserva}px">${fogli}${
    rifi.length > 1 ? `<span class="pila-conta">${rifi.length}</span>` : ''}</span>`;
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
    const foto0 = rifiDi(b0)[0];
    const anteprima = primo
      ? `<span>${esc(primo)}</span>`
      : (foto0 ? `<img class="scene-card-img" src="${esc(cldResize(foto0.url, 160))}" alt=""/>` : '');
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
  // NIENTE TASTIERA ALL'APERTURA. Il cursore ci andava da solo, nel primo
  // riquadro vuoto, col ragionamento che aperta la scena si scrive. Sbagliato
  // per due motivi: aprendo una scena che esiste gia' si vuole prima GUARDARLA,
  // e la tastiera che sale si mangia meta' schermo proprio mentre il foglio sta
  // ancora salendo. Chi vuole scrivere tocca il riquadro, che e' li'.
}

export function chiudiScenaUI(){
  const foglio = document.getElementById('scena');
  if(!foglio || !foglio.classList.contains('open')) return;
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
// ── IL BEAT, RIBALTATO ──
// La miniatura sta a SINISTRA e occupa quasi meta' della card, in proporzione
// 4:3 come una vignetta. Prima era un quadratino da 42px nell'angolo destro,
// con accanto una matita: il disegno era un'opzione da scovare, e la card era
// un campo di testo con un vuoto bianco intorno. Ribaltata, la card si riempie
// da sola e aprendo la sezione si vedono immagini invece di righe — che per chi
// disegna e' la differenza fra una sezione che si apre e una che si rimanda.
//
// E la matita e' sparita: la miniatura STESSA e' il punto d'ingresso al
// disegno. Un bersaglio grande mezza card non ha bisogno di un'icona che spieghi
// che si puo' toccare.
function riquadroHTML(n, id, testo, nuovo, rifi){
  const l = (testo||'').length;
  rifi = rifi || [];
  return `<div class="beat ${nuovo ? 'beat-nuovo' : ''}" ${id ? `data-id="${esc(id)}"` : ''}>
    <div class="beat-riga">
      <button class="beat-mini ${rifi.length ? 'pieno' : ''}" data-schizzo type="button"
        aria-label="${rifi.length ? 'Riferimenti del beat ' + n : 'Collega un riferimento al beat ' + n}">${
        pilaHTML(rifi)}</button>
      <div class="beat-corpo">
        <span class="beat-n">${n}</span>
        <textarea rows="1" maxlength="${MAX_BEAT}" placeholder="Cosa si vede?"
          aria-label="Beat ${n}">${esc(testo||'')}</textarea>
        <span class="beat-conta" ${l < CONTA_DA ? 'hidden' : ''}>${l}/${MAX_BEAT}</span>
      </div>
    </div>
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
  cont.innerHTML = scena.beat.map((b,i)=> riquadroHTML(i+1, b.id, b.testo, false, rifiDi(b))).join('')
    + riquadroHTML(scena.beat.length + 1, null, '', true, null)
    + SAGOME_HTML;
  cont.querySelectorAll('textarea').forEach(cresci);
  cont.querySelectorAll('.beat[data-id]').forEach(aggiornaAvviso);
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
  const beat = { id: genId(), testo: dati.testo || '',
    ...(dati.rifs && dati.rifs.length ? { rifs: dati.rifs } : {}) };
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

// ── UN BEAT = UNA INQUADRATURA ──────────────────────────────────────────────
//
// "Prende il telefono, gira su se stesso e inizia a correre" non e' una
// vignetta: sono tre. E' l'errore piu' facile da fare qui dentro — si scrive
// come si racconta, di seguito — e chi disegna se ne accorge solo dopo, davanti
// alla tavola, quando quella riga non entra in un riquadro.
//
// COME LO SI RICONOSCE, e perche' cosi'. Riconoscere i verbi italiani a regola
// (desinenze, ausiliari) da' troppi falsi allarmi: "la porta" e "porta" si
// scrivono uguale, e un avviso che compare quando non serve si impara a
// ignorare in due giorni — cioe' smette di funzionare anche quando serve.
// Quindi si va per elenco: un centinaio di verbi d'azione alla terza persona,
// quelli che si usano davvero scrivendo cosa si vede. Sbagliare per DIFETTO qui
// non costa niente (nessun avviso), sbagliare per eccesso costa tutto.
//
// E il suggerimento non blocca, non colora di rosso, non impedisce di salvare:
// e' una riga sotto la card, con due tocchi possibili — separale, o taci.
const VERBI = ('entra esce apre chiude prende posa lascia guarda osserva alza abbassa corre '
  + 'cammina sale scende cade salta lancia tira spinge afferra molla tocca accende spegne '
  + 'legge scrive beve mangia sorride ride piange urla grida sussurra parla risponde chiede '
  + 'gira volta torna arriva parte fugge scappa insegue bussa suona colpisce spara punta mira '
  + 'sbatte rompe strappa accarezza abbraccia bacia indica annuisce scuote respira sospira '
  + 'aspetta attraversa supera scavalca nasconde appare scompare estrae infila sfila stringe '
  + 'solleva appoggia getta raccoglie conta cerca trova perde segue precede indossa toglie '
  + 'siede china inginocchia stende sdraia ferma inizia comincia finisce smette continua '
  + 'entrano escono aprono chiudono prendono guardano corrono salgono scendono cadono '
  + 'girano tornano arrivano partono fuggono colpiscono parlano rispondono si').split(' ');
const VERBO = new Set(VERBI);

// I punti in cui una riga si spezza in piu' inquadrature: la virgola, la "e"
// che incolla due azioni, e gli avverbi di seguito. "Mentre" NON c'e' apposta —
// dice che le due cose succedono insieme, cioe' in una vignetta sola.
const CUCITURE = /\s*(?:,|;|\be poi\b|\bpoi\b|\bquindi\b|\binfine\b|\bdopo di che\b|\bed\b|\be\b)\s+/gi;

function spezzoni(testo){
  return (testo||'').split(CUCITURE).map(t=> t.trim()).filter(t=> t.length);
}

// Un pezzo "e' un'azione" se comincia con un verbo dell'elenco, saltando gli
// eventuali pronomi davanti ("si volta", "lo prende").
const PRONOMI = new Set(['si','lo','la','li','le','gli','ne','ci','mi','ti']);
function eAzione(pezzo){
  const parole = pezzo.toLowerCase().replace(/[^a-zàèéìòù\s]/g,'').split(/\s+/).filter(Boolean);
  for(let i=0; i<Math.min(2, parole.length); i++){
    if(PRONOMI.has(parole[i])) continue;
    return VERBO.has(parole[i]);
  }
  return false;
}

// Quante inquadrature sembra contenere questo testo. Due o piu' → si suggerisce.
export function inquadrature(testo){
  const pezzi = spezzoni(testo);
  if(pezzi.length < 2) return [testo];
  const azioni = pezzi.filter(eAzione);
  return azioni.length >= 2 ? pezzi : [testo];
}

// La riga sotto la card. Compare e sparisce senza ridisegnare i riquadri: chi
// sta scrivendo non deve vedersi portare via il cursore da un consiglio.
function avvisoHTML(id){
  return `<div class="beat-avviso" data-avviso="${esc(id)}">
    <span>Sembrano piu\' vignette, le separo?</span>
    <button data-separa="${esc(id)}" type="button">Separa</button>
    <button data-zitto="${esc(id)}" type="button" aria-label="Lascia com\'e\'">✕</button>
  </div>`;
}

// L'avviso sta DENTRO la card, appeso in fondo. Fuori — fra una card e l'altra —
// avrebbe falsato le altezze che il riordino misura una volta sola quando il
// dito solleva la scheda, e la card sarebbe atterrata nel posto sbagliato.
function aggiornaAvviso(box){
  const scena = scenaAperta();
  const b = scena && scena.beat.find(x=> x.id === box.dataset.id);
  const appeso = box.querySelector('.beat-avviso');
  // "zitto" e' la memoria del rifiuto, e sta nel beat perche' deve durare: un
  // consiglio gia' scartato che ritorna riaprendo la scena e' peggio del
  // consiglio stesso.
  const serve = b && !b.zitto && inquadrature(b.testo).length > 1;
  if(serve && !appeso) box.insertAdjacentHTML('beforeend', avvisoHTML(b.id));
  else if(!serve && appeso) appeso.remove();
}

// Spezza il beat nei suoi pezzi: il primo resta dov'e', gli altri nascono
// sotto di lui. Non e' un annulla-bile: e' testo che si puo' riscrivere.
function separaBeat(id){
  const scena = scenaAperta();
  const i = scena ? scena.beat.findIndex(b=> b.id === id) : -1;
  if(i < 0) return;
  const pezzi = inquadrature(scena.beat[i].testo);
  if(pezzi.length < 2) return;
  const primo = { ...scena.beat[i], testo: pezzi[0].slice(0, MAX_BEAT) };
  const altri = pezzi.slice(1).map(t=> ({ id: genId(), testo: t.slice(0, MAX_BEAT) }));
  scena.beat = scena.beat.slice(0,i).concat([primo], altri, scena.beat.slice(i+1));
  scena.updatedAt = Date.now();
  haptic('done');
  renderBeat();
  salvaFraPoco(scena.id);
}

function zittisciBeat(id){
  const scena = scenaAperta();
  const b = scena && scena.beat.find(x=> x.id === id);
  if(!b) return;
  b.zitto = true;
  const av = document.querySelector(`[data-avviso="${CSS.escape(id)}"]`);
  if(av) av.remove();
  salvaFraPoco(scena.id);
}

// ── COSA C'E' NELLA VIGNETTA ────────────────────────────────────────────────
//
// Toccando la vignetta di un beat si apre l'archivio: si scelgono i frammenti o
// le tavole che servono e si attaccano li'. E' la stessa cosa che si fa coi
// progetti — riferimenti visivi collegati a qualcosa da disegnare — solo
// dall'altro capo: li' si parte dall'immagine e si sceglie il progetto, qui si
// parte dal beat e si scelgono le immagini.
//
// SI NAVIGA PER CARTELLE, non si guarda tutto l'archivio in fila. La prima
// versione buttava a schermo ogni frammento in ordine di data: con un archivio
// vero e' una parete di miniature senza un ordine riconoscibile, e cercare la
// posa che si ha in mente diventa scorrere. Le cartelle sono gia' il modo in cui
// l'archivio e' organizzato — un artista, uno studio — quindi si entra da li'.
// La ricerca invece taglia trasversale: quando si scrive, le cartelle spariscono
// e si vede tutto quello che corrisponde, ovunque stia.
//
// E IL DISEGNO? E' rimasto, ma non e' piu' la porta: e' la prima tessera. Col
// dito su un telefono, o col mouse, disegnare non serviva a niente — su un iPad
// con la matita si'. Toglierlo del tutto avrebbe buttato via l'unico caso in cui
// funziona bene; lasciarlo davanti a tutto costringeva a passare di li' anche
// chi voleva solo collegare un ritaglio che ha gia'.
let _boxScelta = null;      // il beat su cui si sta scegliendo
let _cercaRif = '';
let _cartellaRif = null;    // la cartella aperta, o null per l'elenco
// TRE VISTE, UNA DENTRO L'ALTRA.
//   'pila'     — i riferimenti di QUESTO beat, e nient'altro
//   'cartelle' — l'archivio, raggruppato per categoria
//   'dentro'   — una cartella, con le sue due schede
// Toccando una vignetta gia' piena si atterra sulla PILA e non sull'archivio:
// il momento in cui si tocca una vignetta piena e' quasi sempre "fammi
// rivedere cosa avevo messo qui" — si sta disegnando, e si vuole guardare le
// proprie referenze, non ricominciare a sceglierne. Ritrovarsi il catalogo
// intero voleva dire dover cercare due volte la stessa cosa.
let _vista = 'cartelle';

async function apriScelta(box){
  const scena = scenaAperta();
  if(!scena) return;
  _boxScelta = box;
  _cercaRif = '';
  _cartellaRif = null;
  const b0 = scena.beat.find(x=> x.id === box.dataset.id);
  _vista = rifiDi(b0).length ? 'pila' : 'cartelle';
  if(_sceltaPila) _sceltaPila.azzera();
  const campo = document.getElementById('sceltarif-cerca');
  if(campo) campo.value = '';
  const foglio = document.getElementById('sceltarif');
  foglio.classList.add('open');
  try{ if(!history.state || history.state.view !== 'sceltarif') history.pushState({view:'sceltarif'}, ''); }catch(e){}
  // L'archivio si carica solo adesso, e solo la parte che serve: ascoltaRefs
  // NON sveglia Google Drive (vedi la nota in refs.js).
  const r = await import('./refs.js');
  // TUTTE E DUE le collezioni. Un'immagine sa in quale cartella sta, ma il NOME
  // della cartella e' nell'altra: ascoltando solo le immagini ogni gruppo cadeva
  // sul ripiego "Senza cartella", e la scelta mostrava sei cartelle senza nome.
  r.ascoltaRefs();
  r.ascoltaCartelle();
  disegnaScelta();
}

// Esposta al modulo dell'archivio: quando arrivano immagini nuove mentre questa
// griglia e' aperta, si rinfresca invece di restare a quello che c'era.
window.rinfrescaSceltaRif = ()=>{ if(sceltaAperta()) disegnaScelta(); };

export function sceltaAperta(){
  const f = document.getElementById('sceltarif');
  return !!(f && f.classList.contains('open'));
}

// Il beat su cui si sta scegliendo, e la sua pila.
function beatDiScelta(){
  const scena = scenaAperta();
  if(!scena || !_boxScelta) return null;
  return scena.beat.find(x=> x.id === _boxScelta.dataset.id) || null;
}

function tesseraHTML(x, presa, tavola){
  return `<button class="sceltarif-tessera ${presa ? 'presa' : ''}" data-rif="${esc(x.id)}" type="button"
      aria-pressed="${presa ? 'true' : 'false'}"${tavola ? forma(x) : ''}>
      <img src="${esc(cldResize(x.url, tavola ? 420 : 300))}" loading="lazy" alt=""/>
      ${presa ? '<span class="sceltarif-segno">✓</span>' : ''}
    </button>`;
}

// Quale delle due schede di una cartella si sta guardando. Si parte dai
// frammenti perche' sono la maggior parte di quello che si collega a un beat:
// le tavole intere si guardano nel lettore, i frammenti si sono ritagliati
// apposta per riguardarli.
let _tabRif = 'ritagli';

function mostraTab(dentro){
  const tab = document.getElementById('sceltarif-tab');
  if(!tab) return;
  tab.hidden = !dentro;
  const cur = document.getElementById('sceltarif-cursore');
  if(cur) cur.style.setProperty('--i', _tabRif === 'tavole' ? 1 : 0);
  tab.querySelectorAll('[data-tab]').forEach(b=>
    b.classList.toggle('active', b.dataset.tab === _tabRif));
}

async function disegnaScelta(){
  const griglia = document.getElementById('sceltarif-griglia');
  const togli = document.getElementById('sceltarif-togli');
  const dove = document.getElementById('sceltarif-dove');
  if(!griglia || !_boxScelta) return;
  const b = beatDiScelta();
  const presi = new Set(rifiDi(b).map(r=> r.refId).filter(Boolean));
  // Fuori dalla pila il pulsante non serve: li' non si butta via niente.
  if(togli){ togli.hidden = true; togli.textContent = 'Togli'; }

  const r = await import('./refs.js');
  const tutte = r.refsCache().filter(x=> x && x.url);
  const q = _cercaRif.trim().toLowerCase();
  const cerca = document.getElementById('sceltarif-cerca');

  // ── LA PILA DI QUESTO BEAT, e nient'altro ──
  // Si arriva qui toccando una vignetta gia' piena, ed e' quasi sempre per
  // guardare cosa ci si era messo mentre si disegna: quindi le immagini sono
  // grandi e in colonna, una sotto l'altra, non tessere da catalogo. Da qui si
  // toglie quello che non serve piu' e si scende nell'archivio per aggiungerne.
  if(_vista === 'pila'){
    mostraTab(false);
    if(dove) dove.textContent = 'Riferimenti';
    // Niente ricerca: qui non c'e' niente da cercare, ci sono le tue.
    if(cerca) cerca.hidden = true;
    // MINIATURE, non le immagini intere. A tutta larghezza si vedeva una
    // referenza per schermata e per averne il quadro bisognava scorrere: qui
    // servono tutte insieme, per capire in un colpo cosa si era messo da parte.
    // Toccandone una si apre la galleria vera dell'archivio — la stessa dei
    // frammenti, con la provenienza e le frecce — solo che scorre fra QUESTE.
    const pila = rifiDi(b);
    griglia.className = 'sceltarif-tessere sceltarif-pila';
    montaSceltaPila(griglia);
    const n = _sceltaPila ? _sceltaPila.quante() : 0;
    // Mentre si sceglie la barra dice quante ne hai prese e il pulsante diventa
    // il cestino: la stessa forma della barra di References, e per lo stesso
    // motivo — si sceglie, poi si agisce, che e' l'ordine in cui la cosa si
    // pensa.
    if(dove) dove.textContent = n ? (n === 1 ? '1 scelta' : n + ' scelte') : 'Riferimenti';
    if(togli){
      togli.hidden = !n;
      togli.textContent = n === 1 ? 'Togli' : 'Togli ' + n;
    }
    griglia.classList.toggle('scegliendo', n > 0);
    // NIENTE ✕ SU OGNI MINIATURA. Era un bersaglio da ventiquattro pixel
    // appiccicato all'angolo di ognuna, e per toglierne tre servivano tre
    // tocchi centrati bene. Adesso si tiene premuto per cominciare a scegliere
    // e poi si butta via in blocco — lo stesso identico gesto degli artisti e
    // dei frammenti (vedi scelta.js), che e' il punto: in tutta l'app le cose
    // si scelgono in un modo solo.
    griglia.innerHTML = pila.map((x,i)=> {
      const preso = _sceltaPila && _sceltaPila.ha(String(i));
      return `<div class="pila-mini${preso ? ' scelta' : ''}" data-mini="${i}">
        <img src="${esc(cldResize(x.url, 300))}" alt=""/>
        <span class="refs-spunta${preso ? ' on' : ''}" role="checkbox" aria-checked="${preso}" aria-label="Scegli"></span>
      </div>`;
    }).join('')
      + `<button class="sceltarif-tessera sceltarif-disegna" data-archivio type="button">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>
          <span>Aggiungi</span>
        </button>`;
    return;
  }
  if(cerca) cerca.hidden = false;

  // ── cercando: tutto l'archivio in fila, ovunque stia ──
  if(q){
    mostraTab(false);
    if(dove) dove.textContent = '';
    const trovate = tutte.filter(x=>
      ((x.tags||[]).join(' ') + ' ' + (x.provenance && x.provenance.opera || '')).toLowerCase().includes(q));
    griglia.className = 'sceltarif-tessere';
    griglia.innerHTML = trovate.length
      ? trovate.map(x=> tesseraHTML(x, presi.has(x.id), false)).join('')
      : `<div class="sceltarif-vuoto"><p>Nessun riferimento con questo nome.</p></div>`;
    return;
  }

  // ── dentro una cartella: le sue due schede ──
  if(_cartellaRif){
    mostraTab(true);
    if(dove) dove.textContent = nomeCartella(_cartellaRif, r);
    const dentro = tutte.filter(x=> (x.folderId || '__sciolte') === _cartellaRif);
    const scelte = dentro.filter(x=> _tabRif === 'tavole' ? !!x.tavola : !x.tavola);
    // I numeri sulle due schede: si vede se vale la pena passare all'altra
    // prima di toccarla e trovarla vuota.
    const tab = document.getElementById('sceltarif-tab');
    if(tab) tab.querySelectorAll('[data-tab]').forEach(btn=>{
      const n = dentro.filter(x=> btn.dataset.tab === 'tavole' ? !!x.tavola : !x.tavola).length;
      btn.textContent = (btn.dataset.tab === 'tavole' ? 'Tavole' : 'Frammenti') + ' ' + n;
    });
    // Le tavole si guardano INTERE: tessere con le proporzioni della pagina e
    // immagine contenuta, come nello scaffale delle tavole dell'archivio.
    const suTavole = _tabRif === 'tavole';
    griglia.className = 'sceltarif-tessere' + (suTavole ? ' tavole' : '');
    griglia.innerHTML = scelte.length
      ? scelte.map(x=> tesseraHTML(x, presi.has(x.id), suTavole)).join('')
      : `<div class="sceltarif-vuoto"><p>Qui dentro non c\'e\' niente${
          suTavole ? ' fra le tavole' : ' fra i frammenti'}.</p></div>`;
    if(suTavole) correggiForme(griglia);
    return;
  }

  // ── l'elenco: le cartelle raggruppate per categoria, come nell'archivio ──
  // Qui NON si mura: le cartelle non sono fotografie, sono contenitori, e a
  // tessere tutte uguali si contano a colpo d'occhio.
  griglia.className = 'sceltarif-griglia';
  mostraTab(false);
  if(dove) dove.textContent = '';
  const perCartella = new Map();
  for(const x of tutte){
    const k = x.folderId || '__sciolte';
    if(!perCartella.has(k)) perCartella.set(k, []);
    perCartella.get(k).push(x);
  }
  const disegna = `<button class="sceltarif-tessera sceltarif-disegna" data-disegna type="button">
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16Z"/><path d="M13.5 6.5 17.5 10.5"/></svg>
      <span>Disegnalo</span>
    </button>`;
  if(!perCartella.size){
    griglia.innerHTML = disegna
      + `<div class="sceltarif-vuoto"><p>Nell\'archivio non c\'e\' ancora niente da collegare.</p></div>`;
    return;
  }
  // RAGGRUPPATE PER CATEGORIA, nello stesso ordine dell'archivio: e' li' che si
  // e' deciso come sta insieme questa roba, e ritrovarla ordinata in un altro
  // modo vorrebbe dire impararla due volte. Le immagini senza cartella stanno
  // in fondo, in un gruppo loro.
  const cartelle = r.getFolders();
  const gruppi = new Map();
  for(const [k, foto] of perCartella){
    const f = k === '__sciolte' ? null : cartelle.find(c=> c.id === k);
    const cat = f ? (f.category || 'Senza categoria') : '\u00ff';   // le sciolte in fondo
    if(!gruppi.has(cat)) gruppi.set(cat, []);
    gruppi.get(cat).push([k, foto]);
  }
  const ordinati = [...gruppi.entries()].sort((x,y)=> x[0].localeCompare(y[0], 'it', {sensitivity:'base'}));
  griglia.innerHTML = disegna + ordinati.map(([cat, elenco])=>
    `<div class="sceltarif-categoria">${esc(cat === '\u00ff' ? 'Senza cartella' : cat)}</div>` +
    elenco
      .sort((x,y)=> nomeCartella(x[0], r).localeCompare(nomeCartella(y[0], r), 'it', {sensitivity:'base'}))
      .map(([k, foto])=> `<button class="sceltarif-cartella" data-cartella="${esc(k)}" type="button">
        <span class="sceltarif-mosaico">${foto.slice(0,4).map(x=>
          `<img src="${esc(cldResize(x.url, 160))}" loading="lazy" alt=""/>`).join('')}</span>
        <span class="sceltarif-nome">${esc(nomeCartella(k, r))}</span>
        <span class="sceltarif-quante">${foto.length}</span>
      </button>`).join('')
  ).join('');
}

// ── LE MINIATURE, QUELLE DEI FRAMMENTI ──────────────────────────────────────
// Qui c'e' stato per un giorno un muretto alla Pinterest: ogni immagine intera,
// alta quanto le tocca, incastrata nelle colonne. Non funzionava, e non per una
// svista: una griglia CSS piazza gli elementi per RIGHE e il cursore non torna
// mai indietro, quindi accanto a una tessera alta ne resta una corta con sotto
// il vuoto fino alla banda successiva. A schermo erano buchi grandi come le
// immagini. Il muretto vero si fa con le colonne CSS, che pero' riempiono
// dall'alto in basso — e nella pila di un beat l'ordine e' quello in cui le hai
// scelte, non a serpentina.
//
// Quindi si fa come lo fa gia' l'archivio, che e' la stessa roba guardata
// dall'altra parte: tessere quadrate e fitte per i frammenti (un frammento e'
// un dettaglio, e il quadrato lo incornicia), e per le tavole tessere con le
// proporzioni della pagina, che una tavola si guarda intera. Stesse misure,
// stesse regole: passare dall'archivio alla scelta non deve sembrare di
// cambiare app.
//
// Le proporzioni delle tavole si prendono dai dati e poi si correggono
// sull'immagine caricata: quelle scritte sul documento possono mancare (roba
// archiviata da versioni vecchie) o non essere quelle vere, la miniatura che si
// sta guardando no.
function forma(x){
  return (x && x.w && x.h) ? ` style="aspect-ratio:${x.w} / ${x.h}"` : '';
}
function correggiForme(griglia){
  griglia.querySelectorAll('.sceltarif-tessera img').forEach(im=>{
    const adatta = ()=>{
      if(!im.naturalWidth || !im.naturalHeight) return;
      im.parentElement.style.aspectRatio = im.naturalWidth + ' / ' + im.naturalHeight;
    };
    if(im.complete) adatta(); else im.addEventListener('load', adatta, { once:true });
  });
}

function nomeCartella(id, r){
  if(id === '__sciolte') return 'Senza cartella';
  const f = r.getFolders().find(x=> x.id === id);
  return f ? (f.name || 'Senza nome') : 'Senza cartella';
}

// Si scende di un livello per volta, e ogni discesa lascia il suo segno nella
// cronologia: cosi' il tasto Indietro del telefono e la freccia a schermo
// risalgono allo stesso modo, un passo alla volta.
function scendi(dove){
  _vista = dove;
  try{ history.pushState({view:'sceltarif-' + dove}, ''); }catch(e){}
  disegnaScelta();
}
function entraCartella(id){
  _cartellaRif = id;
  _tabRif = 'ritagli';
  scendi('dentro');
}
// Torna true se c'era un livello da risalire, false se si era gia' alla radice
// — e allora chi ha chiamato chiude il foglio.
export function risaliScelta(){
  // Prima si esce dalla scelta, poi si risale: uscire dalla schermata con delle
  // miniature ancora spuntate vorrebbe dire ritrovarsele spuntate al ritorno,
  // senza ricordarsi di averle scelte.
  if(_vista === 'pila' && _sceltaPila && _sceltaPila.azzera()){ disegnaScelta(); return true; }
  if(_vista === 'dentro'){ _cartellaRif = null; _vista = 'cartelle'; disegnaScelta(); return true; }
  // Dall'archivio si torna alla pila solo se una pila c'e': un beat vuoto parte
  // dall'archivio, e li' l'archivio E' la radice.
  if(_vista === 'cartelle' && rifiDi(beatDiScelta()).length){ _vista = 'pila'; disegnaScelta(); return true; }
  return false;
}

// Accende o spegne un riferimento sulla pila del beat. Toccarne uno gia' preso
// lo toglie: e' lo stesso gesto in tutte e due i sensi, e non c'e' un secondo
// posto in cui andare a sganciarlo.
function tocca(refId, url){
  const scena = scenaAperta();
  if(!scena || !_boxScelta) return;
  const nuovo = _boxScelta.classList.contains('beat-nuovo');
  if(nuovo){
    // Collegare dentro la card fantasma la promuove esattamente come scriverci
    // dentro: e' un beat a tutti gli effetti.
    promuovi(_boxScelta, { rifs: [{ url, refId: refId || null }] });
  } else {
    const b = beatDiScelta();
    if(!b) return;
    const pila = rifiDi(b).slice();
    const i = refId ? pila.findIndex(x=> x.refId === refId) : -1;
    if(i >= 0) pila.splice(i, 1);
    else pila.push({ url, refId: refId || null });
    b.rifs = pila;
    // La conversione dal vecchio campo singolo avviene qui, alla prima modifica.
    delete b.img; delete b.refId;
  }
  scena.updatedAt = Date.now();
  aggiornaPila();
  haptic('tap');
  salvaSubito(scena.id);
  // Si ritocca SOLO la tessera toccata, non tutta la griglia. Ridisegnarla ad
  // ogni scelta faceva due danni: dentro una cartella lunga lo scorrimento
  // tornava in cima — cioe' scegliendo la quinta immagine si perdeva il posto —
  // e le tessere venivano ricreate sotto il dito, quindi due tocchi rapidi di
  // fila arrivavano su elementi diversi e il secondo si perdeva.
  segnaTessere();
}

// Aggiorna le spunte e il pulsante "Togli tutto" senza rifare la griglia.
function segnaTessere(){
  const griglia = document.getElementById('sceltarif-griglia');
  const togli = document.getElementById('sceltarif-togli');
  if(!griglia) return;
  const presi = new Set(rifiDi(beatDiScelta()).map(r=> r.refId).filter(Boolean));
  griglia.querySelectorAll('[data-rif]').forEach(el=>{
    const presa = presi.has(el.dataset.rif);
    el.classList.toggle('presa', presa);
    el.setAttribute('aria-pressed', presa ? 'true' : 'false');
    const segno = el.querySelector('.sceltarif-segno');
    if(presa && !segno) el.insertAdjacentHTML('beforeend', '<span class="sceltarif-segno">✓</span>');
    if(!presa && segno) segno.remove();
  });
  if(togli) togli.hidden = !rifiDi(beatDiScelta()).length;
}

// Guarda un riferimento a schermo intero. Se e' roba d'archivio si apre la
// galleria vera — quella dei frammenti, con provenienza, tag e frecce — e le
// frecce scorrono fra i riferimenti DI QUESTO BEAT, non fra quelli della
// cartella da cui erano stati presi.
// Se invece e' uno schizzo fatto qui non sta in archivio, e allora si riapre il
// foglio da disegno: per un disegno "guardarlo" e "continuarlo" sono la stessa
// cosa.
async function apriRiferimento(i){
  const pila = rifiDi(beatDiScelta());
  const x = pila[i];
  if(!x) return;
  if(!x.refId){ disegnaBeat(); return; }
  const r = await import('./refs.js');
  const elenco = pila.map(y=> y.refId && r.refsCache().find(z=> z.id === y.refId)).filter(Boolean);
  r.openRefLightbox(x.refId, elenco);
}

// LO STESSO GESTO DI TUTTO IL RESTO: si tiene premuta una miniatura per
// cominciare a scegliere, poi ogni tocco ne aggiunge o ne toglie una, e dalla
// barra in alto si buttano via tutte insieme. Prima ognuna aveva la sua ✕
// nell'angolo: un bersaglio da ventiquattro pixel, tre tocchi centrati bene per
// toglierne tre, e un modo di cancellare diverso da quello che l'app usa
// dappertutto.
let _sceltaPila = null;
function montaSceltaPila(griglia){
  if(_sceltaPila) return;
  _sceltaPila = montaScelta(griglia, {
    selettore: '.pila-mini',
    id: el=> el.dataset.mini,
    spunta: '.refs-spunta',
    apri: i=> apriRiferimento(+i),
    cambiato: ()=>{ disegnaScelta(); },
  });
}

// Toglie dalla pila tutte le miniature scelte.
function togliDallaPila(indici){
  const scena = scenaAperta();
  const b = beatDiScelta();
  if(!scena || !b || !indici.length) return;
  const via = new Set(indici.map(Number));
  const pila = rifiDi(b).filter((_,i)=> !via.has(i));
  b.rifs = pila;
  delete b.img; delete b.refId;
  scena.updatedAt = Date.now();
  aggiornaPila();
  haptic('done');
  salvaSubito(scena.id);
  if(_sceltaPila) _sceltaPila.azzera();
  // Svuotata del tutto, restare su una schermata vuota non ha senso: si scende
  // dove si sceglie.
  if(!pila.length){ _vista = 'cartelle'; }
  disegnaScelta();
}

function svuotaPila(){
  const scena = scenaAperta();
  const b = beatDiScelta();
  if(!scena || !b) return;
  b.rifs = [];
  delete b.img; delete b.refId;
  scena.updatedAt = Date.now();
  aggiornaPila();
  haptic('done');
  salvaSubito(scena.id);
  if(_vista === 'pila'){ _vista = 'cartelle'; disegnaScelta(); return; }
  segnaTessere();
}

// Si ridipinge SOLO la vignetta della card: rifare i riquadri porterebbe via il
// cursore a chi stava scrivendo nel beat accanto.
function aggiornaPila(){
  const b = beatDiScelta();
  const q = _boxScelta && _boxScelta.querySelector('[data-schizzo]');
  if(!q) return;
  const rifi = rifiDi(b);
  q.classList.toggle('pieno', !!rifi.length);
  q.innerHTML = pilaHTML(rifi);
  q.setAttribute('aria-label', rifi.length ? 'Riferimenti del beat' : 'Collega un riferimento');
}

export function chiudiSceltaUI(){
  const foglio = document.getElementById('sceltarif');
  if(foglio) foglio.classList.remove('open');
  _boxScelta = null;
  _cartellaRif = null;
}
export function chiudiScelta(){
  const foglio = document.getElementById('sceltarif');
  if(foglio && foglio.classList.contains('open') && history.state
     && /^sceltarif/.test(history.state.view || '')){
    history.back();
    return;
  }
  chiudiSceltaUI();
}
export function vistaScelta(){ return _vista; }

// ── DISEGNARE UN BEAT ───────────────────────────────────────────────────────
// Il foglio vive in schizzo.js e si carica solo se lo si apre davvero: chi non
// disegna mai non se lo porta dietro. Il PNG finisce su Cloudinary come tutte le
// altre immagini dell'app, e nel beat resta l'indirizzo — dentro il documento
// starebbero stretti, quindici disegni sfiorerebbero il limite di Firestore.
// Un disegno si AGGIUNGE alla pila come un riferimento qualsiasi: non ha un
// refId perche' non sta in archivio, sta solo qui.
async function disegnaBeat(){
  const m = await import('./schizzo.js');
  m.apriSchizzo({
    onSalva: async (blob)=>{
      const { url } = await uploadToCloudinary(blob, 'schizzo.png');
      tocca(null, url);
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
    // Dopo aver spostato una scheda il browser manda comunque un click: senza
    // questa riga, mollando il dito sulla vignetta si aprirebbe anche la scelta
    // di un riferimento.
    if(_gestoBeat && _gestoBeat.strisciaRecente()) return;
    const separa = e.target.closest('[data-separa]');
    if(separa){ separaBeat(separa.dataset.separa); return; }
    const zitto = e.target.closest('[data-zitto]');
    if(zitto){ zittisciBeat(zitto.dataset.zitto); return; }
    const q = e.target.closest('[data-schizzo]');
    if(q) apriScelta(q.closest('.beat'));
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
    aggiornaAvviso(box);
    salvaFraPoco(scena.id);
  });
  // Uscendo da un riquadro rimasto vuoto lo si butta, e la scena si ricompatta.
  beat.addEventListener('focusout', ()=> setTimeout(potaVuoti, 0));

  _gestoBeat = montaRiordino(beat, {
    selettore: '.beat',
    spazio: 10,
    // La presa non parte dal testo: li' tenere premuto e' il gesto con cui il
    // telefono comincia a selezionare (vedi la nota in riordino.js). Parte da
    // tutto il resto della scheda — la vignetta, che e' quasi meta', il numero,
    // i margini — che e' molto piu' di quanto serva a un dito.
    escludi: 'textarea',
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

  const griglia = document.getElementById('sceltarif-griglia');
  griglia.addEventListener('click', e=>{
    if(e.target.closest('[data-disegna]')){
      // Il foglio da disegno si apre SOPRA questo, e chiudendosi torna qui:
      // per questo la scelta non si chiude adesso.
      disegnaBeat();
      return;
    }
    if(e.target.closest('[data-archivio]')){ scendi('cartelle'); return; }
    const cart = e.target.closest('[data-cartella]');
    if(cart){ entraCartella(cart.dataset.cartella); return; }
    const t = e.target.closest('[data-rif]');
    if(!t) return;
    // Il foglio NON si chiude scegliendo: di riferimenti se ne attaccano
    // quanti se ne vuole, e chiudere al primo obbligherebbe a riaprire per il
    // secondo. Si esce quando si e' finito, con la freccia.
    import('./refs.js').then(r=>{
      const rif = r.refsCache().find(x=> x.id === t.dataset.rif);
      if(rif) tocca(rif.id, rif.url);
    });
  });
  document.getElementById('sceltarif-tab').addEventListener('click', e=>{
    const t = e.target.closest('[data-tab]');
    if(!t || t.dataset.tab === _tabRif) return;
    _tabRif = t.dataset.tab;
    haptic('tap');
    disegnaScelta();
  });
  document.getElementById('sceltarif-cerca').addEventListener('input', e=>{
    _cercaRif = e.target.value;
    disegnaScelta();
  });
  document.getElementById('sceltarif-togli').addEventListener('click', ()=>{
    if(_sceltaPila) togliDallaPila(_sceltaPila.scelti());
  });
  // La freccia risale di un passo: dentro una cartella torna all'elenco, e
  // dall'elenco chiude. Passa dalla cronologia, come il tasto del telefono.
  document.getElementById('sceltarif-chiudi').addEventListener('click', ()=> chiudiScelta());
  document.getElementById('scena-chiudi').addEventListener('click', ()=> chiudiScena());

  renderScene();
}
