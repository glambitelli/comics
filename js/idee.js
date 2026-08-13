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
// E quando un'idea cresce abbastanza da diventare un lavoro, "Diventa
// progetto" la promuove portandosi dietro tutto il testo dentro lo scriptment,
// così non si ricomincia da una pagina bianca proprio nel momento in cui si
// aveva già qualcosa da dire.
import { db, collection, doc, onSnapshot, setDoc, deleteDoc, saveProject } from './firebase.js';
import { projects, haptic, showUndoToast } from './state.js';
import { actionMenu } from './dialogs.js';
import { newProjectObj } from './home.js';

const IDEE_COL = 'ideas';

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
    _idee = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .sort((a,b)=> (b.updatedAt||0) - (a.updatedAt||0));
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
  const idea = { id: genId(), testo: t, createdAt: ora, updatedAt: ora, promossaA: null };
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
  _idee = [idea, ..._idee.filter(x=>x.id!==id)];
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
      _idee = [idea, ..._idee].sort((a,b)=> (b.updatedAt||0) - (a.updatedAt||0));
      renderIdee();
      await scrivi(idea);
    });
  }
  return true;
}

// ── DA IDEA A PROGETTO ──────────────────────────────────────────────────────
// Il testo intero finisce nello scriptment, non solo il titolo: il senso della
// promozione è non ripartire da una pagina bianca. L'idea NON viene cancellata
// — resta in elenco con l'etichetta di dov'è finita, così il taccuino conserva
// anche la memoria di cosa è germogliato e cosa no.
export async function promuoviIdea(id){
  const idea = _idee.find(x=>x.id===id);
  if(!idea || idea.promossaA) return null;
  const titolo = titoloDi(idea.testo) || 'Nuovo progetto';
  // Stesso costruttore del pulsante "+" in home: colore, emoji e campi sono
  // quelli di un progetto qualunque, non una versione ridotta.
  const p = newProjectObj(titolo, 10);
  p.scriptment = { text: idea.testo, font:'courier', size:13 };
  await saveProject(p);
  const agg = { ...idea, promossaA: p.id, updatedAt: Date.now() };
  _idee = _idee.map(x=> x.id===id ? agg : x);
  renderIdee();
  await scrivi(agg);
  haptic('reward');
  return p.id;
}

function nomeProgetto(pid){
  const p = (projects||[]).find(x=>x.id===pid);
  return p ? p.title : null;
}

// ── SCHERMATA ───────────────────────────────────────────────────────────────
export function renderIdee(){
  const lista = document.getElementById('idee-lista');
  if(!lista) return;

  if(!_idee.length){
    lista.innerHTML = `<div class="idee-vuoto">
      <div class="idee-vuoto-glifo">✦</div>
      <p>Qui finiscono i pensieri che non hanno ancora un progetto:
      una battuta, una scena, un titolo.</p>
      <p class="idee-vuoto-hint">Scrivi qui sopra e tocca Salva.</p>
    </div>`;
    return;
  }

  lista.innerHTML = _idee.map(idea=>{
    const titolo = titoloDi(idea.testo);
    const resto = restoDi(idea.testo);
    const nome = idea.promossaA ? nomeProgetto(idea.promossaA) : null;
    // Se il progetto è stato cancellato dopo la promozione l'etichetta
    // sparisce da sola invece di puntare al vuoto.
    const targa = (idea.promossaA && nome)
      ? `<button class="idee-targa" data-vai="${esc(idea.promossaA)}">→ ${esc(nome)}</button>`
      : '';
    return `<article class="idee-card${idea.promossaA && nome ? ' promossa' : ''}" data-id="${esc(idea.id)}">
      <div class="idee-card-riga">
        <div class="idee-card-testo">
          <b>${esc(titolo)}</b>
          ${resto ? `<span>${esc(resto)}</span>` : ''}
        </div>
        <button class="idee-menu" data-menu="${esc(idea.id)}" aria-label="Cosa fare con questa idea">⋯</button>
      </div>
      <div class="idee-card-piede">
        <span class="idee-data">${esc(quando(idea.updatedAt||idea.createdAt))}</span>
        ${targa}
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
  const nome = idea.promossaA ? nomeProgetto(idea.promossaA) : null;
  const voci = [
    { label: 'Modifica', onSelect: ()=> apriEditor(id) },
  ];
  // Il nome dice cosa SUCCEDE, non come si chiama l'operazione: "Diventa
  // progetto" non spiegava né cosa nasce né dove finisce quello che hai
  // scritto.
  voci.push(nome
    ? { label: 'Apri “' + nome + '”', onSelect: ()=> window.openProject && window.openProject(idea.promossaA) }
    : { label: 'Crea un progetto da questa idea', onSelect: async ()=>{
        const pid = await promuoviIdea(id);
        if(pid && window.openProject) window.openProject(pid);
      } });
  voci.push({ label: 'Elimina', danger: true, onSelect: ()=> eliminaIdea(id) });
  actionMenu(ancora, voci);
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

  const lista = document.getElementById('idee-lista');
  lista.addEventListener('click', e=>{
    const menu = e.target.closest('[data-menu]');
    if(menu){ e.stopPropagation(); menuIdea(menu, menu.dataset.menu); return; }
    const vai = e.target.closest('[data-vai]');
    if(vai){ e.stopPropagation(); if(window.openProject) window.openProject(vai.dataset.vai); return; }
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
