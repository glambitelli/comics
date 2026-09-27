// ── JOBS — le tavole che ti hanno dato da disegnare ─────────────────────────
//
// PERCHE' ESISTE, e perche' NON e' un progetto.
//
// Un progetto di Inkflow e' roba di chi scrive: c'e' il soggetto, i tre atti,
// lo scriptment, le tavole da pianificare. E' lo strumento giusto per una
// storia tua. E' quello sbagliato quando lo script te l'hanno mandato.
//
// Giovanni, 27 settembre 2026: "magari a me e' stato inviato uno script che
// leggo da tablet, e mi serve uno spazio dove gestire le reference. Non ho
// bisogno di tutta la struttura del progetto: non lo creo io da zero".
//
// Da li' la regola di questa sezione: QUI NON SI SCRIVE NIENTE. Niente
// soggetto, niente atti, niente scriptment. Nascondere quelle sezioni non
// sarebbe bastato — resterebbero li' a dire "qui dovresti scrivere una
// storia", che in un lavoro su commissione e' falso. Un Job ha un titolo,
// quante tavole sono, e per ogni tavola le immagini che ti servono sotto gli
// occhi mentre la disegni.
//
// IL RIFERIMENTO E' IL METODO DI CHI DISEGNA SU COMMISSIONE: prima di
// cominciare ci si prepara la cartella di ogni tavola, cosi' mentre si disegna
// non si interrompe il lavoro per andare a cercare com'e' fatto un palazzo.
// L'app serve alla preparazione e poi sta zitta.
//
// COME SONO TENUTE LE IMMAGINI. Il Job tiene la LISTA, non le immagini: per
// ogni tavola un elenco di { url, refId } che punta all'archivio. Tre
// conseguenze, tutte volute:
//   · la stessa immagine puo' stare su piu' tavole senza duplicarsi;
//   · cancellare un Job non tocca l'archivio;
//   · l'immagine resta una sola anche se la si guarda da dieci posti.
// E' la stessa scelta dei beat delle Scene (vedi rifiDi in scene.js), per la
// stessa ragione: le due cose si somigliano e sarebbe strano che si
// comportassero in modo diverso.
import { db, collection, doc, onSnapshot, setDoc, deleteDoc } from './firebase.js';
import { haptic, showUndoToast } from './state.js';
import { actionMenu, promptModal, confirmModal, promptCampi } from './dialogs.js';
import { esc } from './testo.js';
import { cldResize } from './cloudinary.js';
import { sorvegliaMiniature } from './miniature.js';

const JOBS_COL = 'jobs';
// Quante tavole puo' avere un lavoro. Cento e' gia' un volume intero: il
// limite non serve a impedire niente, serve a non far nascere per sbaglio un
// elenco di diecimila righe scrivendo male un numero.
const MAX_TAVOLE = 200;

let _jobs = [];
let _unsub = null;
let _apertoId = null;     // il Job aperto
let _tavolaAperta = null; // la tavola aperta dentro il Job, o null

function genId(){ return 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
const ora = ()=> new Date().toISOString();

export function startJobsListener(){
  if(_unsub) return;
  _unsub = onSnapshot(collection(db, JOBS_COL), snap=>{
    _jobs = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .map(j=>({ ...j, rif: (j.rif && typeof j.rif === 'object') ? j.rif : {} }))
      .sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
    renderJobs();
    // Se si sta guardando un Job e qualcuno l'ha cambiato da un altro
    // dispositivo, la schermata aperta si rinfresca da sola.
    if(_apertoId) renderJobAperto();
  }, err=> console.warn('listener jobs:', err));
}

export function tuttiIJobs(){ return _jobs; }
export function jobAperto(){ return _apertoId ? _jobs.find(j=> j.id === _apertoId) : null; }

async function salva(j){
  j.updatedAt = ora();
  try{ await setDoc(doc(db, JOBS_COL, j.id), j); }
  catch(e){ console.warn('salvataggio job fallito:', e); }
}

// ── LE IMMAGINI DI UNA TAVOLA ──
// La chiave e' il numero di tavola come stringa: Firestore non tiene mappe a
// chiave numerica, e una mappa invece di un array serve a non portarsi dietro
// ventitre caselle vuote per un lavoro in cui hai preparato solo la ventiquattresima.
export function rifiDiTavola(job, n){
  if(!job || !job.rif) return [];
  const v = job.rif[String(n)];
  return Array.isArray(v) ? v.filter(x=> x && x.url) : [];
}
export function quanteTavolePreparate(job){
  if(!job || !job.rif) return 0;
  return Object.keys(job.rif).filter(k=> rifiDiTavola(job, k).length).length;
}

// Aggiunge o toglie un'immagine da una tavola. Torna true se adesso c'e'.
export async function toggleRifTavola(jobId, n, rif){
  const j = _jobs.find(x=> x.id === jobId);
  if(!j || !rif || !rif.url) return false;
  const k = String(n);
  const lista = rifiDiTavola(j, k).slice();
  const i = lista.findIndex(x=> (rif.refId && x.refId === rif.refId) || x.url === rif.url);
  let adesso;
  if(i >= 0){ lista.splice(i, 1); adesso = false; }
  else { lista.push({ url: rif.url, refId: rif.refId || null }); adesso = true; }
  j.rif = { ...(j.rif||{}) };
  if(lista.length) j.rif[k] = lista; else delete j.rif[k];
  await salva(j);
  renderJobAperto();
  return adesso;
}

export async function nuovoJob(){
  const campi = await promptCampi('Nuovo lavoro', [
    { etichetta:'Titolo', placeholder:'es. Nemesis #3' },
    { etichetta:'Quante tavole', valore:'22' },
  ], 'Crea');
  if(!campi) return null;
  const quante = Math.max(1, Math.min(MAX_TAVOLE, parseInt(campi[1], 10) || 22));
  const j = { id: genId(), titolo: (campi[0]||'').trim() || 'Senza titolo',
              tavole: quante, rif: {}, createdAt: ora(), updatedAt: ora() };
  _jobs.unshift(j);
  haptic('done');
  renderJobs();
  await salva(j);
  return j;
}

export async function eliminaJob(id){
  const j = _jobs.find(x=> x.id === id); if(!j) return;
  const si = await confirmModal(`Eliminare "${j.titolo}"? Le immagini restano nell'archivio.`,
                                { title:'Elimina lavoro', confirmLabel:'Elimina' });
  if(!si) return;
  _jobs = _jobs.filter(x=> x.id !== id);
  if(_apertoId === id) chiudiJob();
  renderJobs();
  try{ await deleteDoc(doc(db, JOBS_COL, id)); }catch(e){ console.warn(e); }
  // NIENTE RETE DI SICUREZZA sul contenuto: un Job e' un elenco di
  // collegamenti, non immagini. Cancellandolo non si perde nessun disegno —
  // stanno tutti nell'archivio, dove erano prima.
  showUndoToast('Lavoro eliminato', ()=>{
    _jobs.unshift(j); renderJobs(); salva(j);
  });
}

export async function rinominaJob(id){
  const j = _jobs.find(x=> x.id === id); if(!j) return;
  const campi = await promptCampi('Lavoro', [
    { etichetta:'Titolo', valore: j.titolo || '' },
    { etichetta:'Quante tavole', valore: String(j.tavole || 22) },
  ], 'Salva');
  if(!campi) return;
  j.titolo = (campi[0]||'').trim() || j.titolo;
  j.tavole = Math.max(1, Math.min(MAX_TAVOLE, parseInt(campi[1], 10) || j.tavole));
  renderJobs(); renderJobAperto();
  await salva(j);
}

// ── LO SCAFFALE ──
export function renderJobs(){
  const el = document.getElementById('jobs-lista');
  if(!el) return;
  if(!_jobs.length){
    el.innerHTML = `<div class="jobs-vuoto">Qui stanno i lavori su commissione:
      lo script ce l'hai gia', qui ti prepari le immagini tavola per tavola.</div>`;
    return;
  }
  el.innerHTML = _jobs.map(j=>{
    const fatte = quanteTavolePreparate(j);
    return `<button class="jobs-card" data-id="${j.id}" type="button">
      <span class="jobs-card-t">${esc(j.titolo || 'Senza titolo')}</span>
      <span class="jobs-card-s">${j.tavole} tavole${fatte ? ' · ' + fatte + ' preparate' : ''}</span>
    </button>`;
  }).join('');
  el.querySelectorAll('.jobs-card').forEach(b=>{
    b.addEventListener('click', ()=> apriJob(b.dataset.id));
    // Il menu si apre tenendo premuto, come sulle schede dei progetti.
    let t = null;
    b.addEventListener('pointerdown', ()=>{ t = setTimeout(()=>{
      haptic('tap');
      actionMenu(b, [
        { label:'Rinomina', icon:'rinomina', onSelect:()=> rinominaJob(b.dataset.id) },
        { label:'Elimina', icon:'elimina', danger:true, onSelect:()=> eliminaJob(b.dataset.id) },
      ]);
      t = 'fatto';
    }, 550); });
    for(const e of ['pointerup','pointercancel','pointerleave'])
      b.addEventListener(e, ()=>{ if(t && t !== 'fatto') clearTimeout(t); });
  });
}

// ── DENTRO UN LAVORO ──
export function apriJob(id){
  const j = _jobs.find(x=> x.id === id); if(!j) return;
  _apertoId = id; _tavolaAperta = null;
  if(window.__navPush) window.__navPush('job', id);
  document.querySelectorAll('.screen.active').forEach(el=> el.classList.remove('active'));
  document.getElementById('screen-job').classList.add('active');
  renderJobAperto();
}
export function chiudiJob(){
  _apertoId = null; _tavolaAperta = null;
  const s = document.getElementById('screen-job');
  if(s) s.classList.remove('active');
}
// Il tasto Indietro: dalla tavola si torna all'elenco delle tavole, e solo
// dopo si esce dal lavoro. Un passo per volta, come ci si e' entrati.
export function indietroJob(){
  if(_tavolaAperta != null){ _tavolaAperta = null; renderJobAperto(); return true; }
  return false;
}
export function apriTavola(n){
  _tavolaAperta = n;
  if(window.__navPush) window.__navPush('job-tavola', String(n));
  renderJobAperto();
}
export function tavolaAperta(){ return _tavolaAperta; }

function renderJobAperto(){
  const j = jobAperto();
  const cap = document.getElementById('job-titolo');
  const sot = document.getElementById('job-sotto');
  const corpo = document.getElementById('job-corpo');
  if(!j || !corpo) return;
  if(_tavolaAperta == null){
    if(cap) cap.textContent = j.titolo || 'Senza titolo';
    const fatte = quanteTavolePreparate(j);
    if(sot) sot.textContent = `${j.tavole} tavole` + (fatte ? ` · ${fatte} preparate` : '');
    // L'ELENCO DELLE TAVOLE C'E' TUTTO DALL'INIZIO: il lavoro sa quante sono,
    // e chiedere di "creare la tavola 7" prima di poterci mettere un'immagine
    // sarebbe un passaggio in piu' per una cosa che si sa gia'.
    const righe = [];
    for(let n = 1; n <= j.tavole; n++){
      const q = rifiDiTavola(j, n).length;
      righe.push(`<div class="refs-folder-row job-riga${q?'':' vuota'}" data-n="${n}">
        <span class="refs-mono">${n}</span>
        <span class="refs-folder-name">Tavola ${n}</span>
        <span class="job-quanti">${q ? q + ' rif.' : '—'}</span>
      </div>`);
    }
    corpo.innerHTML = `<div class="refs-scheda">${righe.join('')}</div>`;
    corpo.querySelectorAll('.job-riga').forEach(r=>
      r.addEventListener('click', ()=> apriTavola(+r.dataset.n)));
    return;
  }
  // Dentro una tavola.
  const lista = rifiDiTavola(j, _tavolaAperta);
  if(cap) cap.textContent = 'Tavola ' + _tavolaAperta;
  if(sot) sot.textContent = lista.length
    ? (lista.length === 1 ? '1 riferimento' : lista.length + ' riferimenti')
    : "Nessun riferimento: tocca il piu' per prenderli dall'archivio";
  corpo.innerHTML = `<div class="job-griglia">`
    + lista.map((r,i)=> `<div class="job-cella" data-i="${i}">
        <img src="${esc(cldResize(r.url, 300))}" loading="lazy" decoding="async" alt=""/>
      </div>`).join('')
    + `<button class="job-piu" id="job-piu" type="button" aria-label="Aggiungi dall'archivio">+</button>`
    + `</div>`;
  sorvegliaMiniature(corpo);
  const piu = document.getElementById('job-piu');
  if(piu) piu.addEventListener('click', async ()=>{
    haptic('tap');
    const r = await import('./refs.js');
    r.scegliPerTavola({ jobId: j.id, tavola: _tavolaAperta,
                        nome: 'Tavola ' + _tavolaAperta });
    if(window.openRefsScreen) window.openRefsScreen();
  });
  // Toccare un'immagine la apre grande; tenendola premuta la si toglie.
  corpo.querySelectorAll('.job-cella').forEach(c=>{
    const i = +c.dataset.i;
    let t = null;
    c.addEventListener('pointerdown', ()=>{ t = setTimeout(async ()=>{
      t = 'fatto'; haptic('tap');
      await toggleRifTavola(j.id, _tavolaAperta, lista[i]);
    }, 550); });
    for(const e of ['pointerup','pointercancel','pointerleave'])
      c.addEventListener(e, ()=>{ if(t && t !== 'fatto') clearTimeout(t); });
    c.addEventListener('click', async ()=>{
      if(t === 'fatto'){ t = null; return; }
      const refId = lista[i].refId;
      if(!refId) return;                 // immagine senza scheda in archivio
      const r = await import('./refs.js');
      const lb = await import('./lightbox.js');
      // La galleria scorre fra le immagini DI QUESTA TAVOLA, non fra tutto
      // l'archivio: e' l'elenco che si sta guardando.
      const cache = r.refsCache();
      const elenco = lista.map(x=> cache.find(c=> c.id === x.refId)).filter(Boolean);
      lb.openRefLightbox(refId, elenco);
    });
  });
}

// Solo per le prove: mette in tavola un elenco di lavori senza passare da
// Firestore. Stessa porta di servizio di __seminaGiorni in tempo.js, e per la
// stessa ragione — un banco di prova non ha una rete a cui parlare.
export function __seminaJobs(lista){
  _jobs = Array.isArray(lista) ? lista.map(j=>({ ...j, rif: j.rif || {} })) : [];
  renderJobs();
  if(_apertoId) renderJobAperto();
}
