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

const IDEE_COL = 'ideas';

// ── ORDINE DELL'ELENCO ──
// Tre soli criteri, tutti con un nome che dice cosa fanno. Il criterio non
// cambia MAI l'elenco in memoria: si applica al momento di disegnarlo, così
// scrivere o modificare un'idea non deve sapere niente di come è ordinata.
const ORDINI = {
  recenti:   { label:'Più recenti',  cmp:(a,b)=> (b.updatedAt||0) - (a.updatedAt||0) },
  vecchie:   { label:'Più vecchie',  cmp:(a,b)=> (a.createdAt||0) - (b.createdAt||0) },
  alfabetico:{ label:'Alfabetico',   cmp:(a,b)=> titoloDi(a.testo).localeCompare(titoloDi(b.testo), 'it', {sensitivity:'base'}) },
};
const ORDINE_KEY = 'inkflow-idee-ordine';
let _ordine = (()=>{
  try{ const v = localStorage.getItem(ORDINE_KEY); return ORDINI[v] ? v : 'recenti'; }
  catch(e){ return 'recenti'; }
})();

let _idee = [];
let _unsub = null;
let _apertaId = null;      // idea aperta nell'editor, o null

function genId(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}
function esc(s){
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
  const idea = { id: genId(), testo: t, createdAt: ora, updatedAt: ora };
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

  const bottone = document.getElementById('idee-ordine');
  if(bottone) bottone.textContent = ORDINI[_ordine].label;
  // La riga dell'ordine ha senso solo quando c'è qualcosa da ordinare: con una
  // sola idea in elenco sarebbe un comando che non cambia niente.
  const barra = document.getElementById('idee-barra');
  if(barra) barra.hidden = _idee.length < 2;

  if(!_idee.length){
    lista.innerHTML = `<div class="idee-vuoto">
      <div class="idee-vuoto-glifo">✦</div>
      <p>Qui finiscono i pensieri che ti passano per la testa:
      una battuta, una scena, un titolo.</p>
      <p class="idee-vuoto-hint">Scrivi qui sopra e tocca Salva.</p>
    </div>`;
    return;
  }

  // Copia prima di ordinare: _idee resta nell'ordine in cui è arrivato, e
  // cambiare criterio non riscrive niente su Firestore.
  lista.innerHTML = _idee.slice().sort(ORDINI[_ordine].cmp).map(idea=>{
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
    { label: 'Modifica', onSelect: ()=> apriEditor(id) },
    { label: 'Elimina', danger: true, onSelect: ()=> eliminaIdea(id) },
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
// Quando è finita l'ultima strisciata. Serve a scartare il click fantasma che
// il browser genera subito dopo un gesto, che altrimenti aprirebbe l'editor
// sotto al menu appena comparso. È un ISTANTE e non un interruttore: da
// interruttore restava alzato quando il gesto non produceva nessun click (dito
// uscito dalla scheda, gesto annullato dal sistema) e a quel punto si mangiava
// il primo tocco buono successivo — un tap che non fa niente, senza spiegazione.
let _stridoA = 0;
const STRIDO_ECO = 500;
export function initIdee(){
  startIdeeListener();
  if(_agganciato) return;
  _agganciato = true;

  const box = document.getElementById('idee-nuovo-testo');
  const salva = document.getElementById('idee-nuovo-salva');
  // Il pulsante Salva compare solo quando c'è qualcosa da salvare: a casella
  // vuota è un invito a un'azione che non si può fare.
  const aggiorna = ()=>{
    const c = box.value.trim().length > 0;
    salva.classList.toggle('pronto', c);
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

  const ordine = document.getElementById('idee-ordine');
  if(ordine) ordine.addEventListener('click', ()=>{
    actionMenu(ordine, Object.entries(ORDINI).map(([chiave, o])=>({
      label: o.label + (chiave === _ordine ? '  ✓' : ''),
      onSelect: ()=>{
        _ordine = chiave;
        try{ localStorage.setItem(ORDINE_KEY, chiave); }catch(e){}
        renderIdee();
      },
    })));
  });

  const lista = document.getElementById('idee-lista');
  lista.addEventListener('click', e=>{
    const menu = e.target.closest('[data-menu]');
    if(menu){ e.stopPropagation(); menuIdea(menu, menu.dataset.menu); return; }
    // Un dito che ha appena strisciato per aprire il menu lascia dietro di sé
    // un click: senza questa riga si aprirebbe anche l'editor, sotto al menu.
    if(Date.now() - _stridoA < STRIDO_ECO){ _stridoA = 0; return; }
    const card = e.target.closest('.idee-card');
    if(card) apriEditor(card.dataset.id);
  });

  // ── STRISCIATA VERSO SINISTRA ──
  // Stesse azioni dei tre puntini, raggiunte col gesto invece che mirando a un
  // bersaglio da venti pixel. Un posto solo dove vivono le azioni: due
  // interfacce diverse per le stesse tre voci si sarebbero disallineate al
  // primo cambiamento.
  //
  // La soglia sull'asse è quella che conta: l'elenco scorre in verticale, e
  // senza il confronto fra dx e dy ogni scorrimento un po' storto aprirebbe
  // un menu. Si chiede che il movimento sia nettamente orizzontale.
  const SOGLIA_X = 44;
  let sx = 0, sy = 0, seguendo = false, cardStrisciata = null;
  lista.addEventListener('touchstart', e=>{
    if(e.touches.length !== 1) { seguendo = false; return; }
    cardStrisciata = e.target.closest('.idee-card');
    if(!cardStrisciata){ seguendo = false; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    seguendo = true;
  }, { passive:true });
  lista.addEventListener('touchmove', e=>{
    if(!seguendo || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if(Math.abs(dy) > Math.abs(dx)){ seguendo = false; return; }   // sta scorrendo
    if(dx < -SOGLIA_X && Math.abs(dx) > Math.abs(dy) * 1.6){
      seguendo = false;
      _stridoA = Date.now();
      haptic('tap');
      menuIdea(cardStrisciata, cardStrisciata.dataset.id);
    }
  }, { passive:true });
  lista.addEventListener('touchend', ()=>{ seguendo = false; }, { passive:true });

  document.getElementById('idea-editor-chiudi').addEventListener('click', ()=> chiudiEditor());

  renderIdee();
}
