// ── IDEE — il taccuino senza padrone ─────────────────────────────────────
//
// PERCHÉ ESISTE.
//
// Story e Scriptment vivono DENTRO un progetto, ma le idee arrivano prima che
// il progetto esista: una battuta in metropolitana, una scena vista in sogno,
// un titolo. Finora l'unico modo di annotarle era creare un progetto finto —
// che poi restava lì in home, a occupare una riga accanto ai lavori veri, con
// zero tavole e nessuna intenzione di essere fatto. Il risultato è che le idee
// non si scrivevano proprio.
//
// Qui non c'è nessun campo obbligatorio, nessun titolo da inventare, nessuna
// scelta da fare prima di scrivere: c'è una casella e basta. Il titolo, quando
// serve, è la prima riga — come in un foglio di carta vero, dove il titolo è
// semplicemente la prima cosa che scrivi.
//
// C'è stato per un giorno un collegamento coi progetti — "diventa progetto",
// con la targa del progetto nato attaccata all'idea. È stato tolto: nessuno
// capiva cosa facesse guardandolo, e un taccuino che ti chiede di decidere il
// destino di un pensiero mentre lo stai solo rileggendo non è più un taccuino.
// Qui dentro le idee restano idee. Se una diventa un lavoro, il lavoro si apre
// da Home come tutti gli altri.
import { db, collection, doc, onSnapshot, setDoc, deleteDoc } from './firebase.js';
import { haptic, showUndoToast } from './state.js';
import { actionMenu } from './dialogs.js';
import { montaRiordino } from './riordino.js';
import { esc } from './testo.js';

const IDEE_COL = 'ideas';

// ── L'ORDINE LO DECIDI TU ──
// Non per data e non per titolo: le idee stanno dove le metti. Ognuna porta un
// numero `ordine`, e l'elenco si legge in quel senso. Le nuove entrano in cima
// perché è lì che si guarda tornando sulla schermata; da quel momento in poi
// si spostano tenendo premuto su una scheda e trascinandola.
//
// Un criterio automatico (più recenti, alfabetico…) era la prima versione ed è
// stata buttata: rispondeva a una domanda che non era quella giusta. In un
// taccuino la posizione è essa stessa un'informazione — in cima c'è quello a
// cui stai pensando adesso — e nessun criterio la sa indovinare.
const cmpOrdine = (a,b)=> (a.ordine||0) - (b.ordine||0);

let _idee = [];
let _unsub = null;
let _apertaId = null;      // idea aperta nell'editor, o null

function genId(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}
// Il titolo di un'idea è la sua prima riga non vuota. Nessun campo separato:
// chiedere un titolo prima di lasciar scrivere è esattamente l'attrito che
// impedisce di annotare le idee al volo.
export function titoloDi(testo){
  const riga = (testo||'').split('\n').map(r=>r.trim()).find(r=>r.length) || '';
  return riga.length > 70 ? riga.slice(0,69) + '…' : riga;
}
// Quel che resta dopo la prima riga, per l'anteprima nella scheda.
function restoDi(testo){
  const righe = (testo||'').split('\n');
  const i = righe.findIndex(r=>r.trim().length);
  return righe.slice(i+1).join(' ').trim();
}

function quando(ms){
  if(!ms) return '';
  const d = new Date(ms), ora = new Date();
  const giorni = Math.floor((ora.setHours(0,0,0,0) - new Date(ms).setHours(0,0,0,0)) / 86400000);
  if(giorni === 0) return 'oggi';
  if(giorni === 1) return 'ieri';
  if(giorni < 7) return giorni + ' giorni fa';
  return d.toLocaleDateString('it-IT', { day:'numeric', month:'short' });
}

// ── DATI ────────────────────────────────────────────────────────────────────
export function startIdeeListener(){
  if(_unsub) return;
  _unsub = onSnapshot(collection(db, IDEE_COL), snap=>{
    _idee = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    // Le idee scritte prima che l'ordine esistesse non hanno un numero: se lo
    // prendono adesso, una volta sola, partendo dall'ordine in cui si erano
    // sempre viste (le più recenti in cima). Senza questo finirebbero tutte a
    // zero e l'elenco si rimescolerebbe sotto gli occhi.
    if(_idee.some(i=> i.ordine == null)){
      _idee.sort((a,b)=> (b.updatedAt||0) - (a.updatedAt||0))
           .forEach((idea,k)=>{ idea.ordine = k; scrivi(idea); });
    }
    renderIdee();
  }, err=>console.warn('listener idee:', err));
}

export function tutteLeIdee(){ return _idee; }

async function scrivi(idea){
  try{ await setDoc(doc(db, IDEE_COL, idea.id), idea); }
  catch(e){ console.warn('salvataggio idea fallito:', e); }
}

export async function aggiungiIdea(testo){
  const t = (testo||'').trim();
  if(!t) return null;
  const ora = Date.now();
  // Sopra a tutte: un pensiero appena scritto è quello a cui stai pensando.
  const cima = _idee.length ? Math.min(..._idee.map(i=> i.ordine||0)) - 1 : 0;
  const idea = { id: genId(), testo: t, createdAt: ora, updatedAt: ora, ordine: cima };
  // Ottimistico: l'idea compare SUBITO nell'elenco, senza aspettare la rete.
  // Scrivere un pensiero e vederlo sparire per un secondo mentre il server
  // risponde è il modo più veloce di non fidarsi più di un taccuino.
  _idee = [idea, ..._idee];
  renderIdee();
  haptic('done');
  await scrivi(idea);
  return idea.id;
}

export async function salvaIdea(id, testo){
  const i = _idee.findIndex(x=>x.id===id);
  if(i < 0) return;
  const t = (testo||'').trim();
  // Svuotarla del tutto equivale a buttarla: non ha senso tenere una scheda
  // vuota in elenco, e chiedere conferma per un foglio bianco sarebbe noioso.
  if(!t){ await eliminaIdea(id, true); return; }
  if(t === _idee[i].testo) return;
  const idea = { ..._idee[i], testo: t, updatedAt: Date.now() };
  _idee = _idee.map(x=> x.id===id ? idea : x);
  renderIdee();
  await scrivi(idea);
}

// NIENTE finestra di conferma. Un'idea costa tre parole e si riscrive in
// dieci secondi: fermare tutto con un "sei sicuro?" a schermo intero per
// buttare una riga era sproporzionato — e la finestra, aperta da dentro
// l'editor, finiva perfino DIETRO di esso (z-index 200 contro 210), così il
// pulsante sembrava morto e la domanda compariva dal nulla dopo, a editor
// chiuso. Si cancella e basta, con cinque secondi per ripensarci: è lo stesso
// modo in cui l'app tratta le altre cose eliminabili.
export async function eliminaIdea(id, silenzioso){
  const idea = _idee.find(x=>x.id===id);
  if(!idea) return false;
  _idee = _idee.filter(x=>x.id!==id);
  renderIdee();
  try{ await deleteDoc(doc(db, IDEE_COL, id)); }
  catch(e){ console.warn('eliminazione idea fallita:', e); }
  // Svuotare il testo è già di per sé un modo di dire "non la voglio più":
  // proporre di annullare sarebbe un invito a disfare quello che si è appena
  // fatto apposta.
  if(!silenzioso){
    showUndoToast('Idea eliminata', async ()=>{
      _idee = [idea, ..._idee];
      renderIdee();
      await scrivi(idea);
    });
  }
  return true;
}

// ── SCHERMATA ───────────────────────────────────────────────────────────────
export function renderIdee(){
  const lista = document.getElementById('idee-lista');
  if(!lista) return;

  if(!_idee.length){
    // Tre parole e un glifo. La spiegazione lunga ("qui finiscono i pensieri
    // che ti passano per la testa: una battuta, una scena, un titolo") diceva a
    // chi ha aperto il taccuino una cosa che sapeva gia', e la ripeteva ogni
    // volta che il taccuino tornava vuoto. Cosa scriverci lo dice la casella
    // qui sopra, dove si scrive davvero.
    lista.innerHTML = `<div class="idee-vuoto">
      <div class="idee-vuoto-glifo">✦</div>
      <p>Nessuna idea, per ora.</p>
    </div>`;
    return;
  }

  lista.innerHTML = _idee.slice().sort(cmpOrdine).map(idea=>{
    const titolo = titoloDi(idea.testo);
    const resto = restoDi(idea.testo);
    return `<article class="idee-card" data-id="${esc(idea.id)}">
      <div class="idee-card-riga">
        <div class="idee-card-testo">
          <b>${esc(titolo)}</b>
          ${resto ? `<span>${esc(resto)}</span>` : ''}
        </div>
        <button class="idee-menu" data-menu="${esc(idea.id)}" aria-label="Cosa fare con questa idea">⋯</button>
      </div>
      <div class="idee-card-piede">
        <span class="idee-data">${esc(quando(idea.updatedAt||idea.createdAt))}</span>
      </div>
    </article>`;
  }).join('');
}

// ── COSA FARE CON UN'IDEA ───────────────────────────────────────────────────
// Tutte le azioni stanno QUI, in un posto solo, raggiungibile dai tre puntini
// o strisciando la scheda verso sinistra. Prima erano sparse dentro l'editor:
// aprire un'idea per rileggerla significava trovarsi davanti "Diventa
// progetto" e un cestino, cioè due decisioni che non si stavano prendendo. Ora
// l'editor serve solo a scrivere, e le decisioni si prendono dall'elenco.
function menuIdea(ancora, id){
  const idea = _idee.find(x=>x.id===id);
  if(!idea) return;
  actionMenu(ancora, [
    { label: 'Modifica', icon: 'rinomina', onSelect: ()=> apriEditor(id) },
    { label: 'Elimina', icon: 'elimina', danger: true, onSelect: ()=> eliminaIdea(id) },
  ]);
}

// ── EDITOR ──────────────────────────────────────────────────────────────────
function apriEditor(id){
  const idea = _idee.find(x=>x.id===id);
  if(!idea) return;
  _apertaId = id;
  const ov = document.getElementById('idea-editor');
  const ta = document.getElementById('idea-editor-testo');
  ta.value = idea.testo;
  ov.classList.add('open');
  document.body.classList.add('idea-editor-open');
  setTimeout(()=>{ ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 260);
}

export async function chiudiEditor(){
  const ov = document.getElementById('idea-editor');
  if(!ov || !ov.classList.contains('open')) return;
  const ta = document.getElementById('idea-editor-testo');
  const id = _apertaId;
  _apertaId = null;
  ov.classList.remove('open');
  document.body.classList.remove('idea-editor-open');
  if(id) await salvaIdea(id, ta.value);
}

export function editorAperto(){
  const ov = document.getElementById('idea-editor');
  return !!(ov && ov.classList.contains('open'));
}

// ── AGGANCI ─────────────────────────────────────────────────────────────────
let _agganciato = false;
let _gesto = null;          // il riordino montato sull'elenco (vedi riordino.js)
export function initIdee(){
  startIdeeListener();
  if(_agganciato) return;
  _agganciato = true;

  const box = document.getElementById('idee-nuovo-testo');
  const salva = document.getElementById('idee-nuovo-salva');
  // Il pulsante Salva compare solo quando c'è qualcosa da salvare: a casella
  // vuota è un invito a un'azione che non si può fare.
  const piede = salva.parentElement;
  const aggiorna = ()=>{
    const c = box.value.trim().length > 0;
    salva.classList.toggle('pronto', c);
    piede.hidden = !c;
    // Cresce col testo invece di far scorrere dentro una finestrella di due
    // righe: un'idea lunga si deve poter rileggere tutta mentre la si scrive.
    box.style.height = 'auto';
    box.style.height = Math.min(box.scrollHeight, 260) + 'px';
  };
  box.addEventListener('input', aggiorna);
  salva.addEventListener('click', async ()=>{
    const t = box.value;
    if(!t.trim()) return;
    box.value = ''; aggiorna(); box.blur();
    await aggiungiIdea(t);
  });

  const lista = document.getElementById('idee-lista');
  lista.addEventListener('click', e=>{
    const menu = e.target.closest('[data-menu]');
    if(menu){ e.stopPropagation(); menuIdea(menu, menu.dataset.menu); return; }
    // Un dito che ha appena strisciato per aprire il menu lascia dietro di sé
    // un click: senza questa riga si aprirebbe anche l'editor, sotto al menu.
    if(_gesto && _gesto.strisciaRecente()) return;
    const card = e.target.closest('.idee-card');
    if(card) apriEditor(card.dataset.id);
  });

  // Il gesto — tenere premuto per sollevare, strisciare a sinistra per il menu
  // — vive in riordino.js: lo usano anche le Scene, e i suoi numeri sono stati
  // aggiustati a mano sul telefono. Qui resta solo cosa farne.
  _gesto = montaRiordino(lista, {
    selettore: '.idee-card',
    alStriscia: card=> menuIdea(card, card.dataset.id),
    alPosa: (da, a)=>{
      // Si riscrive l'ordine di TUTTE le idee, non solo di quella spostata:
      // numeri consecutivi da zero, così non ci si ritrova mai con due schede
      // sullo stesso posto né con buchi che crescono ad ogni trascinamento.
      const fila = _idee.slice().sort(cmpOrdine);
      const [presa] = fila.splice(da, 1);
      fila.splice(a, 0, presa);
      fila.forEach((idea,k)=>{ idea.ordine = k; });
      _idee = fila;
      renderIdee();
      fila.forEach(idea=> scrivi(idea));
    },
  });

  document.getElementById('idea-editor-chiudi').addEventListener('click', ()=> chiudiEditor());

  renderIdee();
}
