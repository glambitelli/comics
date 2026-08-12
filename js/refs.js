// ── LIBRERIA REFERENCES — immagini reference fuori dai progetti ──
// Le immagini vivono su Cloudinary (25GB gratis, nessuna carta), Firestore
// tiene solo i metadati (url, cartella, dimensioni, data).
// Organizzazione a cartelle per categoria (es. "Artists" → "Hiroyuki Okiura",
// "Study (Temporary)" → "Hands").
import { db, collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp } from './firebase.js';
import { haptic, showUndoToast, projects, currentId } from './state.js';
import { compressImageFile, dataUrlToBlob } from './imgcompress.js';
import { uploadToCloudinary, cldResize } from './cloudinary.js';
import { promptModal, confirmModal, actionMenu } from './dialogs.js';
import {
  isDriveConfigured, isDriveConnected, connectDrive, disconnectDrive,
  driveAccountEmail, onDriveAuthChange, listDriveAlbumsForFolder,
  ensureDriveConnected, initDriveAuth,
} from './drive.js';

const REFS_COL = 'refs';
const FOLDERS_COL = 'refFolders';
const ALBUMS_COL = 'refAlbums';

let _refs = [];          // cache locale immagini, dal listener realtime
let _folders = [];       // cache locale cartelle {id, category, name, createdAt}
let _albums = [];        // cache locale scaffale albi {id, folderId, title, cover, pageCount, sourceName, sourceSize, lastPage}
let _refsUnsub = null;
let _foldersUnsub = null;
let _albumsUnsub = null;
let _view = 'folders';           // 'folders' | 'all' | 'folder'
let _activeFolderId = null;
// Dentro una cartella vera convivono due assi: gli albi (fumetti da .cbr/.cbz)
// e i ritagli (immagini sciolte). Nelle viste "All" e "senza cartella" i tab
// non compaiono: lì si guardano solo immagini.
let _folderTab = 'ritagli';      // 'albi' | 'ritagli'
let _lastUploadError = '';

// ── RICERCA E ORDINAMENTO ──
// Il testo si azzera cambiando cartella/vista (vedi openFolder/openAllGrid/
// openFolderBrowser): un filtro dimenticato acceso nasconderebbe ritagli
// senza spiegazione. L'ordinamento invece è un'abitudine — resta impostato
// finché non lo cambi tu, per tutta la sessione.
let _folderQuery = '';                 // cerca cartelle nell'elenco
let _gridQuery = '';                   // cerca ritagli (opera/pagina/artista)
let _gridSort = 'recenti';             // 'recenti' | 'vecchi' | 'artista'
let _albumQuery = '';                  // cerca albi (titolo)
let _albumSort = 'recenti';            // 'recenti' | 'vecchi' | 'titolo'

// Larghezze FISSE, non dipendenti dal devicePixelRatio dello schermo.
// Cloudinary genera ogni variante la prima volta che qualcuno la chiede e poi
// la tiene in cache: legare la larghezza al dpr significava che telefono
// (300) e desktop non-retina (150) chiedevano due immagini DIVERSE della
// stessa foto, e ognuno pagava per conto suo l'attesa della prima
// generazione. Con un valore unico la variante è una sola per immagine, e
// una volta scaldata da un dispositivo è già pronta per tutti gli altri.
// I numeri sono quelli che un telefono retina generava già (300/260): così
// il lavoro fatto finora resta valido e non si riparte da zero.
// Misure CSS di riferimento: .refs-grid sta tra 78 e ~130px, .album-cover
// intorno a 104px — 300 e 260 coprono con abbondanza anche a 3×.
const THUMB_W = 300;
const COVER_W = 260;
// La lightbox usa l'URL ORIGINALE, senza trasformazioni. Ci avevo messo
// q_auto/f_auto per risparmiare byte, ma ogni immagine così diventava una
// variante nuova da generare al primo sguardo: swipando in galleria si
// aspettava quella generazione ad ogni foto mai vista, e lo swipe sembrava
// non funzionare. L'originale invece esiste da sempre ed è servito subito.
// Il risparmio non valeva il prezzo: gli originali sono già limitati a 2000px
// e ~1.4MB dalla compressione fatta al salvataggio.
const lightboxUrl = url => url;

function genId(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}
function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── PRE-GENERAZIONE DELLA MINIATURA ──
// Cloudinary crea una variante ridimensionata solo quando qualcuno gliela
// chiede per la prima volta, e da lì in poi la serve dalla cache. Senza
// questo, la prima volta che un ritaglio nuovo compare in griglia si vede
// l'attesa della generazione. Qui la chiediamo SUBITO dopo il caricamento,
// mentre l'utente sta ancora guardando il banner di conferma: quando poi
// aprirà la cartella, la miniatura è già pronta e compare all'istante.
// Non blocca niente e un fallimento non conta — è solo un anticipo di
// lavoro, se salta lo si rifà al primo sguardo come prima.
// La variante grande della lightbox NON si scalda: sarebbe quasi un
// megabyte riscaricato subito dopo averlo caricato, e lì una sola immagine
// per volta si sta comunque già aspettando.
const _warmedThumbs = [];
function warmDerived(url, w = THUMB_W){
  try{
    const im = new Image();
    im.decoding = 'async';
    im.src = cldResize(url, w);
    // Tenuta viva finché non ha finito: un Image() creato e subito
    // dimenticato può essere raccolto dal GC prima di aver fatto la richiesta.
    _warmedThumbs.push(im);
    const done = ()=>{
      const i = _warmedThumbs.indexOf(im);
      if(i >= 0) _warmedThumbs.splice(i, 1);
    };
    im.onload = done; im.onerror = done;
  }catch(e){ /* pre-generazione: se fallisce non cambia nulla */ }
}

// ── SALVATAGGIO IMMAGINE ──
// Cattura sempre istantanea e senza cartella: si archivia dopo, dal lightbox,
// così drag&drop/incolla/condivisione restano al primo colpo.
export async function addRefImage(file, source='file', folderId=null){
  if(!file || !file.type || !file.type.startsWith('image/')){
    console.warn('addRefImage: file non immagine ignorato', file&&file.type);
    return null;
  }
  const id = genId();
  try{
    const { blob, w, h } = await compressImageFile(file);
    const { url } = await uploadToCloudinary(blob, id+'.jpg');
    warmDerived(url);
    const data = {
      url, source,
      // Nessun progetto all'inizio. I due campi convivono: `projectIds` è
      // quello vero, `projectId` resta scritto col primo dell'elenco per non
      // lasciare indietro i ritagli creati prima (vedi projectIdsOf).
      projectIds: [], projectId: null,
      folderId: folderId || null,
      addedAt: serverTimestamp(),
      w, h, bytes: blob.size,
    };
    await setDoc(doc(db, REFS_COL, id), data);
    return id;
  }catch(e){
    console.error('addRefImage errore:', e);
    _lastUploadError = (e && e.message) ? e.message : String(e);
    return null;
  }
}

// ── SALVATAGGIO DA RITAGLIO (albi) ──
// Un frammento ritagliato da un albo arriva già come Blob JPEG pronto (il
// ritaglio + compressione avvengono in albums.js). Qui lo carichiamo su
// Cloudinary e scriviamo il documento, con la provenienza { opera, pagina }
// così il frammento sa da dove viene.
export async function addRefBlob(blob, opts={}){
  if(!blob) return null;
  const { folderId=null, source='clip', provenance=null, w=null, h=null } = opts;
  const id = genId();
  try{
    const { url } = await uploadToCloudinary(blob, id+'.jpg');
    warmDerived(url);
    const data = {
      url, source,
      // Nessun progetto all'inizio. I due campi convivono: `projectIds` è
      // quello vero, `projectId` resta scritto col primo dell'elenco per non
      // lasciare indietro i ritagli creati prima (vedi projectIdsOf).
      projectIds: [], projectId: null,
      folderId: folderId || null,
      addedAt: serverTimestamp(),
      w, h, bytes: blob.size,
    };
    if(provenance) data.provenance = provenance;
    await setDoc(doc(db, REFS_COL, id), data);
    return id;
  }catch(e){
    console.error('addRefBlob errore:', e);
    _lastUploadError = (e && e.message) ? e.message : String(e);
    return null;
  }
}

// Espone la cartella attualmente aperta (autore), così un ritaglio finisce
// automaticamente tra i Frammenti di quell'autore. Fuori da una cartella vera
// (viste "All"/"senza cartella") torna null e il frammento resta non archiviato.
export function getActiveFolderId(){
  return _view === 'folder' ? _activeFolderId : null;
}

// ── DESTINAZIONI DEL RITAGLIO ───────────────────────────────────────────────
// Due strade affiancate, perché rispondono a due bisogni diversi:
//   1. le SCORCIATOIE (qui sotto): dove sei + le ultime cartelle usate. Coprono
//      il caso normale — si lavora su pochi studi per volta — con un tocco solo.
//   2. le CATEGORIE (clipCategories): "Artisti", "Studio"… da cui si naviga
//      fino a qualunque sottocartella. Non dipendono da quante cartelle ci
//      sono: due voci oggi, due voci con cinquanta artisti.
// Un elenco piatto di tutte le cartelle non regge la crescita; queste due
// insieme sì, e nessuna cartella resta irraggiungibile.
//
// Le "recenti" vivono anche su Firestore, non solo in localStorage: la
// cartella corrente compare sempre perché è calcolata al volo, ma le recenti
// no — se il browser svuota lo storage locale (poco spazio, tab privata,
// un altro dispositivo) sparivano senza preavviso, mentre il resto di
// Inkflow è sincronizzato. Ora anche loro sopravvivono al cambio dispositivo.
const CLIP_RECENT_KEY = 'inkflow-clip-dest-recent';
const CLIP_RECENT_DOC = 'inkflow_clip_recents';
const CLIP_RECENT_MAX = 12;
let _recentDests = loadRecentDestsLocal();
let _recentDestsUnsub = null;

function loadRecentDestsLocal(){
  try{
    const v = JSON.parse(localStorage.getItem(CLIP_RECENT_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  }catch(e){ return []; }
}
function saveRecentDestsLocal(list){
  try{ localStorage.setItem(CLIP_RECENT_KEY, JSON.stringify(list)); }catch(e){}
}

function subscribeRecentDests(){
  if(_recentDestsUnsub) return;
  _recentDestsUnsub = onSnapshot(doc(db, 'userdata', CLIP_RECENT_DOC), snap=>{
    if(snap.exists() && Array.isArray(snap.data().ids)){
      _recentDests = snap.data().ids;
      saveRecentDestsLocal(_recentDests);
    }
  }, err=>console.warn('clip recents listener error:', err));
}

export function rememberClipDest(folderId){
  if(!folderId) return;
  _recentDests = [folderId, ..._recentDests.filter(id => id !== folderId)].slice(0, CLIP_RECENT_MAX);
  saveRecentDestsLocal(_recentDests);
  setDoc(doc(db, 'userdata', CLIP_RECENT_DOC), { ids: _recentDests, updatedAt: serverTimestamp() })
    .catch(e=>console.warn('salvataggio recenti fallito:', e));
}

// Scorciatoie: la cartella da cui stai leggendo (default) seguita dalle ultime
// destinazioni scelte a mano, nell'ordine in cui le hai usate.
export function clipDestinations(){
  const currentId = getActiveFolderId();
  const current = currentId ? _folders.find(f=>f.id===currentId) : null;
  const out = [];
  if(current) out.push({ id: current.id, name: current.name, category: current.category, isCurrent: true });
  _recentDests.forEach(id=>{
    if(id === currentId) return;
    const f = _folders.find(x=>x.id===id);
    if(f) out.push({ id: f.id, name: f.name, category: f.category, isCurrent: false });
  });
  return out;
}

// Categorie con le loro sottocartelle, per navigare fino a una qualunque.
export function clipCategories(){
  const out = [];
  foldersByCategory().forEach((folders, category)=>{
    out.push({ category, folders: folders.map(f=>({ id:f.id, name:f.name, category:f.category })) });
  });
  return out.sort((a,b)=> (a.category||'').localeCompare(b.category||''));
}

// Nome della cartella (per mostrare la provenienza di un ritaglio di studio).
export function getFolderName(id){
  const f = _folders.find(x=>x.id===id);
  return f ? f.name : null;
}

function setUploadStatus(state, text){
  const el = document.getElementById('refs-upload-status');
  if(!el) return;
  if(!state){ el.className = 'refs-upload-status'; el.textContent=''; return; }
  el.className = 'refs-upload-status show '+state;
  el.textContent = text;
  if(state !== 'loading'){
    clearTimeout(el._t);
    el._t = setTimeout(()=>{ el.className='refs-upload-status'; el.textContent=''; }, state==='error' ? 9000 : 2600);
  }
}

// Se stai sfogliando dentro una cartella (es. "Otomo"), le nuove immagini
// catturate lì vanno dritte in quella cartella invece che in "senza cartella".
// In "Tutte le immagini" o nell'elenco cartelle, restano non archiviate.
function currentUploadFolderId(){
  return _view === 'folder' ? _activeFolderId : null;
}

export async function addRefImages(fileList, source='file', folderId=currentUploadFolderId()){
  const files = Array.from(fileList).filter(f=>f.type && f.type.startsWith('image/'));
  if(!files.length) return 0;
  setUploadStatus('loading', files.length===1 ? 'Caricamento in corso…' : `Caricamento di ${files.length} immagini…`);
  let ok=0;
  for(const f of files){
    const id = await addRefImage(f, source, folderId);
    if(id) ok++;
  }
  if(ok===0){
    setUploadStatus('error', 'Caricamento fallito — '+(_lastUploadError || 'errore sconosciuto'));
  } else if(ok < files.length){
    setUploadStatus('error', `${ok} su ${files.length} salvate — le altre hanno dato: ${_lastUploadError||'errore sconosciuto'}`);
  } else {
    setUploadStatus('ok', files.length===1 ? 'Immagine salvata ✓' : `${files.length} immagini salvate ✓`);
  }
  return ok;
}

export async function deleteRefImage(id){
  await deleteDoc(doc(db, REFS_COL, id));
}

export function assignRefToFolder(id, folderId){
  setDoc(doc(db, REFS_COL, id), {folderId: folderId||null}, {merge:true});
}

// ── CARTELLE ──
export async function createFolder(category, name){
  category = (category||'').trim();
  name = (name||'').trim();
  if(!category || !name) return null;
  const id = genId();
  await setDoc(doc(db, FOLDERS_COL, id), { category, name, createdAt: serverTimestamp() });
  return id;
}

export function renameFolder(id, newName){
  newName = (newName||'').trim();
  if(!newName) return;
  setDoc(doc(db, FOLDERS_COL, id), { name: newName }, {merge:true});
}

export async function deleteFolder(id){
  await deleteDoc(doc(db, FOLDERS_COL, id));
  // le immagini che erano in questa cartella tornano "senza cartella", non si perdono
  _refs.filter(r=>r.folderId===id).forEach(r=>{
    setDoc(doc(db, REFS_COL, r.id), {folderId:null}, {merge:true});
  });
}

function foldersByCategory(){
  const map = new Map(); // category -> [folders]
  _folders.forEach(f=>{
    if(!map.has(f.category)) map.set(f.category, []);
    map.get(f.category).push(f);
  });
  map.forEach(arr=>arr.sort((a,b)=>(a.name||'').localeCompare(b.name||'')));
  return map;
}

function countInFolder(folderId){
  return _refs.filter(r=>r.folderId===folderId).length;
}

function countAlbumsByFolder(folderId){
  return _albums.filter(a=>a.folderId===folderId).length;
}

// ── SCAFFALE ALBI (refAlbums) ──
// Un documento per ogni albo aperto almeno una volta in una cartella: solo
// metadati + una copertina piccola (l'unica immagine dell'albo che finisce
// su Cloudinary). Il file vero resta sul dispositivo e va riselezionato ad
// ogni lettura — qui teniamo solo il necessario per riconoscerlo e ricordare
// dove si era arrivati.
export function getAlbumsInFolder(folderId){
  return _albums.filter(a=>a.folderId===folderId).sort((a,b)=>{
    const ta=a.addedAt&&a.addedAt.toMillis?a.addedAt.toMillis():0;
    const tb=b.addedAt&&b.addedAt.toMillis?b.addedAt.toMillis():0;
    return tb-ta;
  });
}

// Match esatto (nome+peso identici) contro l'intera cartella: usato
// dall'apertura "libera" (bottone principale) per evitare doppioni quando si
// riapre lo stesso file senza essere passati dallo scaffale.
export function findExactAlbumMatch(folderId, sourceName, sourceSize){
  return _albums.find(a=>a.folderId===folderId && a.sourceName===sourceName && a.sourceSize===sourceSize) || null;
}

export async function createAlbumDoc({folderId, title, cover, pageCount, sourceName, sourceSize, lastPage=0, driveFileId=null}){
  const id = genId();
  // Come per i ritagli: la copertina ridotta si chiede subito, così quando lo
  // scaffale si apre è già pronta invece di doverla generare lì per lì.
  if(cover) warmDerived(cover, COVER_W);
  await setDoc(doc(db, ALBUMS_COL, id), {
    folderId, title: title||'Senza titolo', cover: cover||null, pageCount: pageCount||0,
    sourceName: sourceName||'', sourceSize: sourceSize||0, lastPage,
    driveFileId: driveFileId||null,
    addedAt: serverTimestamp(),
  });
  return id;
}

export function getAlbumById(id){
  return _albums.find(a=>a.id===id) || null;
}

// Match certo per un file Drive: stesso driveFileId nella stessa cartella.
// Usato dalla sync in background per non ricreare una scheda già esistente.
export function findAlbumByDriveId(folderId, driveFileId){
  return _albums.find(a=>a.folderId===folderId && a.driveFileId===driveFileId) || null;
}

// Scrittura throttled: i cambi pagina sono frequenti (swipe/frecce), non ha
// senso un round-trip Firestore ad ogni tocco. Un solo timer per albo aperto.
const _lastPageTimers = new Map();
export function updateAlbumLastPage(albumId, page){
  if(!albumId) return;
  clearTimeout(_lastPageTimers.get(albumId));
  _lastPageTimers.set(albumId, setTimeout(()=>{
    _lastPageTimers.delete(albumId);
    setDoc(doc(db, ALBUMS_COL, albumId), { lastPage: page }, {merge:true});
  }, 900));
}

// Il nome del file può cambiare (cloud drive che rinomina in "nome (1).cbz");
// se un match "probabile" (solo peso) è confermato riallineamo il nome atteso.
export function updateAlbumSourceName(albumId, sourceName){
  if(!albumId) return;
  setDoc(doc(db, ALBUMS_COL, albumId), { sourceName }, {merge:true});
}

export function renameAlbum(id, title){
  title = (title||'').trim();
  if(!title) return;
  setDoc(doc(db, ALBUMS_COL, id), { title }, {merge:true});
}

export async function deleteAlbum(id){
  await deleteDoc(doc(db, ALBUMS_COL, id));
}

export function albumShelfMenu(id, anchorEl){
  const a = _albums.find(x=>x.id===id);
  if(!a) return;
  actionMenu(anchorEl, [
    {label:'Rinomina', onSelect:()=>promptRenameAlbum(id)},
    {label:'Elimina', danger:true, onSelect:()=>promptDeleteAlbum(id)},
  ]);
}

export async function promptRenameAlbum(id){
  const a = _albums.find(x=>x.id===id);
  if(!a) return;
  const nv = await promptModal('Rinomina albo', a.title||'');
  if(!nv) return;
  renameAlbum(id, nv);
}

export async function promptDeleteAlbum(id){
  const a = _albums.find(x=>x.id===id);
  if(!a) return;
  const ok = await confirmModal(
    `Eliminare "${a.title}" dallo scaffale? Il file resta comunque sul tuo dispositivo, sparisce solo da qui.`,
    {title:'Elimina albo', confirmLabel:'Elimina'}
  );
  if(!ok) return;
  deleteAlbum(id);
  renderRefsScreen();
}

// Tap su una copertina: prepara nel reader il "bersaglio" atteso (nome/peso/
// ultima pagina) e riapre lo stesso file input usato dal bottone principale.
// Il matching vero e proprio (nome+peso identici, o solo peso se il nome è
// cambiato) avviene in albums.js quando l'utente sceglie davvero il file.
export function reopenAlbum(albumId){
  const a = _albums.find(x=>x.id===albumId);
  if(!a) return;
  // Albo agganciato a Google Drive: si scarica e si apre da solo, mai un
  // selettore file. Il ripiego locale resta solo per gli albi senza driveFileId.
  if(a.driveFileId){ if(window.openAlbumFromDrive) window.openAlbumFromDrive(albumId); return; }
  if(window.openAlbumPicker) window.openAlbumPicker(a);
}

// ── GOOGLE DRIVE — sync automatica dello scaffale di una cartella ──────────
// Chiamata ogni volta che si apre il tab "Albi" di una cartella: cerca la
// sottocartella Drive con lo stesso nome e crea le schede per i file nuovi.
// Silenziosa e "best effort" — se Drive non è configurato/collegato o la
// sottocartella non esiste ancora, semplicemente non succede nulla.
const _syncingFolders = new Set();
export async function syncDriveAlbumsForFolder(folderId){
  if(!isDriveConfigured()) return;
  if(_syncingFolders.has(folderId)) return;
  const f = _folders.find(x=>x.id===folderId);
  if(!f) return;
  _syncingFolders.add(folderId);
  try{
    // Se il token è scaduto ma la sessione Google è viva, si ricollega da
    // solo in silenzio; altrimenti niente sync finché non si tocca "Connetti".
    if(!(await ensureDriveConnected())) return;
    const files = await listDriveAlbumsForFolder(f.name);
    for(const file of files){
      if(findAlbumByDriveId(folderId, file.id)) continue;
      if(window.createAlbumFromDriveFile) await window.createAlbumFromDriveFile(folderId, file);
    }
  }catch(e){
    console.warn('sync Drive fallita:', e.message);
  }finally{
    _syncingFolders.delete(folderId);
  }
}

let _driveAuthHooked = false;
export async function connectDriveAndSync(){
  try{
    await connectDrive();
    haptic('done');
    renderRefsScreen();
    if(_view === 'folder' && _activeFolderId) syncDriveAlbumsForFolder(_activeFolderId);
  }catch(e){
    setUploadStatus('error', e.message || 'Collegamento a Drive fallito.');
  }
}

export function disconnectDriveUI(){
  disconnectDrive();
  renderRefsScreen();
}

// ── LISTENER REALTIME ──
export function startRefsListener(){
  if(!_driveAuthHooked){
    _driveAuthHooked = true;
    // Se il token scade o viene revocato a metà sessione, il bottone/badge
    // Drive nello scaffale deve aggiornarsi da solo al prossimo render.
    onDriveAuthChange(()=>renderRefsScreen());
    // All'avvio prova a ricollegarsi in silenzio, così riaprendo l'app ci si
    // ritrova già collegati senza dover ritoccare "Connetti" ogni volta.
    initDriveAuth();
  }
  if(!_refsUnsub){
    _refsUnsub = onSnapshot(collection(db, REFS_COL), snap=>{
      _refs = snap.docs.map(d=>({id:d.id, ...d.data()}))
        .sort((a,b)=>{
          const ta=a.addedAt&&a.addedAt.toMillis?a.addedAt.toMillis():0;
          const tb=b.addedAt&&b.addedAt.toMillis?b.addedAt.toMillis():0;
          return tb-ta;
        });
      renderRefsScreen();
      migrateLegacyBase64Refs();
      // Se in questo momento è aperta la schermata Progetto, il suo pannello
      // "Riferimenti visivi" pesca anche lui da _refs: senza questa riga
      // resterebbe fermo alla foto scattata all'apertura del progetto finché
      // non lo si riapriva da capo.
      const projScreen = document.getElementById('screen-project');
      if(projScreen && projScreen.classList.contains('active') && currentId){
        renderProjectRefPanel(currentId);
      }
    }, err=>console.warn('refs listener error:', err));
  }
  if(!_foldersUnsub){
    _foldersUnsub = onSnapshot(collection(db, FOLDERS_COL), snap=>{
      _folders = snap.docs.map(d=>({id:d.id, ...d.data()}));
      renderRefsScreen();
    }, err=>console.warn('refFolders listener error:', err));
  }
  if(!_albumsUnsub){
    _albumsUnsub = onSnapshot(collection(db, ALBUMS_COL), snap=>{
      _albums = snap.docs.map(d=>({id:d.id, ...d.data()}));
      renderRefsScreen();
    }, err=>console.warn('refAlbums listener error:', err));
  }
  subscribeRecentDests();
}

// ── MIGRAZIONE UNA TANTUM: vecchie immagini base64 (Firestore) → Cloudinary ──
// Silenziosa, in background, una alla volta per non sovraccaricare nulla.
// Una volta ricaricato l'url su Cloudinary, il documento Firestore torna
// leggero (solo testo), liberando spazio nel piano gratuito da 1GB.
let _migrating = false;
async function migrateLegacyBase64Refs(){
  if(_migrating) return;
  const legacy = _refs.filter(r=> typeof r.url === 'string' && r.url.startsWith('data:'));
  if(!legacy.length) return;
  _migrating = true;
  try{
    const item = legacy[0];
    const blob = dataUrlToBlob(item.url);
    const { url } = await uploadToCloudinary(blob, item.id+'.jpg');
    await setDoc(doc(db, REFS_COL, item.id), {url, bytes: blob.size}, {merge:true});
  }catch(e){
    console.warn('migrazione reference fallita, riprovo al prossimo giro:', e);
  }finally{
    _migrating = false;
  }
}

export function getRefs(){ return _refs; }

// ── NAVIGAZIONE INTERNA (cartelle ↔ galleria) ──
// Entrare in una cartella (o in "All") registra un secondo livello nella
// cronologia del browser, sopra il livello base "refs" (già registrato
// all'apertura della schermata). Prima non c'era: il tasto Indietro da
// dentro una cartella saltava dritto alla Home, scavalcando l'elenco
// cartelle. Stesso schema già usato per aprire un progetto (vedi
// project.js): la chiamata è incondizionata, __navSync no-opera da sola
// durante il "replay" del tasto Indietro (vedi _navReplaying in main.js).
// Le variabili di stato si azzerano SEMPRE con la navigazione (vedi sopra);
// gli <input> a schermo vanno svuotati insieme a loro, altrimenti il campo
// mostrerebbe ancora il testo cercato anche se il filtro è già stato tolto.
function clearSearchInputs(){
  ['refs-folder-search-input','refs-grid-search-input','refs-albums-search-input'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
}

export function openFolderBrowser(){
  _view = 'folders'; _activeFolderId = null;
  _folderQuery = '';
  clearSearchInputs();
  renderRefsScreen();
}
export function openAllGrid(){
  _view = 'all'; _activeFolderId = null;
  _gridQuery = '';
  clearSearchInputs();
  if(window.__navSync) window.__navSync('refs-all', null);
  renderRefsScreen();
}
export function openFolder(id){
  _view = 'folder'; _activeFolderId = id;
  // La ricerca resta legata a dove sei: portarsela dietro da una cartella
  // all'altra nasconderebbe ritagli senza che se ne veda il motivo.
  _gridQuery = ''; _albumQuery = '';
  clearSearchInputs();
  if(window.__navSync) window.__navSync('refs-folder', id);
  // Si apre sul tab che ha qualcosa dentro: se la cartella ha albi parte da lì,
  // altrimenti sui ritagli. Evita di sbattere in faccia una schermata vuota.
  _folderTab = countAlbumsByFolder(id) > 0 ? 'albi' : 'ritagli';
  renderRefsScreen();
}

// Bottone "‹ Cartelle" del breadcrumb: se il livello corrente in cronologia è
// proprio quello della cartella/All aperti, torna indietro DAVVERO (pop dalla
// cronologia), così browser Indietro e bottone in pagina restano coerenti —
// stesso principio del lightbox e del lettore album. Altrimenti (stato base
// o cronologia non disponibile) mostra la lista e basta.
export function refsBackToFolders(){
  const st = history.state;
  if(st && (st.view === 'refs-folder' || st.view === 'refs-all')){
    history.back();
  } else {
    openFolderBrowser();
  }
}

export function setFolderTab(tab){
  if(tab !== 'albi' && tab !== 'ritagli') return;
  if(_folderTab === tab) return;
  _folderTab = tab;
  // Niente haptic('tap') qui: la tab è un <button onclick>, già coperta dal
  // tick diffuso su pointerdown (sound.js) — chiamarlo anche qui suonava due
  // volte per un solo tocco (stesso motivo del pulsante ritaglia in albums.js).
  renderRefsScreen();
}

// Flusso unificato "Nuova cartella": la categoria si sceglie qui dentro (o se
// ne crea una al volo), perché una categoria vuota non ha senso di esistere.
export function promptNewFolderFlow(btnEl){
  const cats = Array.from(foldersByCategory().keys()).sort((a,b)=>a.localeCompare(b));
  if(!cats.length){ promptNewFolder(); return; }
  const actions = cats.map(c=>({ label: c, onSelect: ()=>promptNewFolder(c) }));
  actions.push({ label: '+ Nuova categoria…', onSelect: ()=>promptNewFolder() });
  actionMenu(btnEl, actions);
}

export async function promptNewFolder(category){
  let cat = category;
  if(!cat){
    cat = await promptModal('Nome della categoria', '', 'es. Artists, Study');
    if(!cat) return;
    cat = cat.trim();
    if(!cat) return;
  }
  const name = await promptModal('Nome della cartella'+(cat?` in "${cat}"`:''), '', 'es. Otomo, Hands');
  if(!name) return;
  const id = await createFolder(cat, name);
  if(id){ haptic('done'); openFolder(id); }
}

export async function promptRenameFolder(id){
  const f = _folders.find(x=>x.id===id);
  if(!f) return;
  const nv = await promptModal('Rinomina cartella', f.name||'');
  if(!nv) return;
  renameFolder(id, nv);
}

export async function promptDeleteFolder(id){
  const f = _folders.find(x=>x.id===id);
  if(!f) return;
  const n = countInFolder(id);
  const msg = n>0
    ? `Eliminare la cartella "${f.name}"? Le ${n} immagini al suo interno non verranno cancellate, torneranno solo senza cartella.`
    : `Eliminare la cartella "${f.name}"?`;
  const ok = await confirmModal(msg, {title:'Elimina cartella', confirmLabel:'Elimina'});
  if(!ok) return;
  deleteFolder(id);
  openFolderBrowser();
}

// ── RICERCA E ORDINAMENTO: azioni ──
export function refsFolderSearch(value){
  _folderQuery = value || '';
  renderFolderBrowser();
}
export function refsGridSearch(value){
  _gridQuery = value || '';
  renderRefsGrid();
}
export function refsAlbumsSearch(value){
  _albumQuery = value || '';
  renderAlbumsShelf();
}

// "✓ " davanti alla voce già selezionata, come le altre scelte a pastiglia
// dell'app (i.e. le destinazioni del ritaglio) — si vede subito cos'è attivo
// senza dover leggere un'etichetta a parte sul bottone.
function sortMenuActions(current, options, apply){
  return options.map(([key,label])=>({
    label: (key===current ? '✓ ' : '') + label,
    onSelect: ()=>apply(key),
  }));
}
export function refsGridSortMenu(btnEl){
  // "Artista A→Z" ha senso solo guardando più artisti insieme (vista "All"):
  // dentro la cartella di un singolo artista ordinare per artista non
  // cambierebbe nulla, quindi l'opzione sparisce invece di restare lì inerte.
  const opts = [['recenti','Più recenti'], ['vecchi','Meno recenti']];
  if(_view === 'all') opts.push(['artista','Artista A→Z']);
  actionMenu(btnEl, sortMenuActions(_gridSort, opts, key=>{
    _gridSort = key;
    renderRefsGrid();
  }));
}
export function refsAlbumsSortMenu(btnEl){
  const opts = [['recenti','Più recenti'], ['vecchi','Meno recenti'], ['titolo','Titolo A→Z']];
  actionMenu(btnEl, sortMenuActions(_albumSort, opts, key=>{
    _albumSort = key;
    renderAlbumsShelf();
  }));
}

// ── SPAZIO OCCUPATO ──
// Le immagini vivono su Cloudinary (25GB gratis); non c'è modo di interrogare
// l'uso reale dell'account senza esporre credenziali admin lato client, quindi
// teniamo il conto noi: ogni immagine salva la propria dimensione (`bytes`) al
// momento del caricamento, e sommiamo. È una stima molto fedele (è la stessa
// dimensione che è stata davvero inviata), non un valore letto in tempo reale.
const CLOUDINARY_FREE_BYTES = 25 * 1024 * 1024 * 1024;

// Spazio Cloudinary, ora dentro il pannello profilo (non più una barra fissa
// sotto l'header): l'interfaccia References resta più pulita.
function updateStorageIndicator(){
  const label = document.getElementById('rp-storage-label');
  const fill = document.getElementById('rp-storage-fill');
  if(!label || !fill) return;
  const used = _refs.reduce((sum,r)=> sum + (typeof r.bytes==='number' ? r.bytes : 0), 0);
  const mb = used / (1024*1024);
  const pct = Math.min(100, (used / CLOUDINARY_FREE_BYTES) * 100);
  label.textContent = '~' + (mb < 0.1 ? '<0.1' : mb.toFixed(1)) + ' MB su 25 GB';
  fill.style.width = Math.max(pct, used>0 ? 0.3 : 0) + '%';
  fill.classList.toggle('warn', pct > 80);
}

// ── RENDER: DISPATCHER ──
export function renderRefsScreen(){
  // Profilo (avatar in alto a destra + pannello): raccoglie stato Drive e
  // spazio Cloudinary, unici per tutta l'app, così non ingombrano ogni vista.
  renderProfile();
  const browserEl = document.getElementById('refs-folder-browser');
  const galleryEl = document.getElementById('refs-gallery-view');
  const crumb = document.getElementById('refs-breadcrumb');
  const folderToolbar = document.getElementById('refs-folder-toolbar');
  if(!browserEl || !galleryEl) return;

  if(_view === 'folders'){
    browserEl.style.display = 'block';
    if(folderToolbar) folderToolbar.style.display = 'flex';
    galleryEl.style.display = 'none';
    if(crumb) crumb.style.display = 'none';
    // I tab appartengono alla cartella aperta: uscendo vanno nascosti qui,
    // perché renderFolderTabs() (che se ne occupa) gira solo dentro la
    // galleria. Senza questo restavano visibili ma orfani dei loro pannelli:
    // si vedevano "Albi/Ritagli" nell'elenco cartelle, e non cliccabili.
    const tabs = document.getElementById('refs-tabs');
    if(tabs) tabs.classList.remove('show');
    renderFolderBrowser();
  } else {
    browserEl.style.display = 'none';
    if(folderToolbar) folderToolbar.style.display = 'none';
    galleryEl.style.display = 'block';
    if(crumb){
      crumb.style.display = 'flex';
      const nameEl = document.getElementById('refs-breadcrumb-name');
      if(nameEl){
        if(_view === 'all') nameEl.textContent = 'All';
        else{
          const f = _folders.find(x=>x.id===_activeFolderId);
          nameEl.textContent = f ? f.name : 'Senza cartella';
        }
      }
    }
    renderFolderTabs();
    renderRefsGrid();
  }
}

// I tab hanno senso solo dentro una cartella vera: in "All" e in "senza
// cartella" restano nascosti e si vedono le immagini come sempre.
function renderFolderTabs(){
  const tabs = document.getElementById('refs-tabs');
  const albumsPane = document.getElementById('refs-albums-pane');
  const imagesPane = document.getElementById('refs-images-pane');
  if(!tabs || !albumsPane || !imagesPane) return;

  const inRealFolder = (_view === 'folder' && !!_activeFolderId);
  tabs.classList.toggle('show', inRealFolder);

  if(!inRealFolder){
    albumsPane.style.display = 'none';
    imagesPane.style.display = 'block';
    return;
  }

  const nAlbi = countAlbumsByFolder(_activeFolderId);
  const nRitagli = countInFolder(_activeFolderId);
  const albiN = document.getElementById('refs-tab-albi-n');
  const ritagliN = document.getElementById('refs-tab-ritagli-n');
  if(albiN) albiN.textContent = nAlbi;
  if(ritagliN) ritagliN.textContent = nRitagli;

  const btnAlbi = document.getElementById('refs-tab-albi');
  const btnRitagli = document.getElementById('refs-tab-ritagli');
  if(btnAlbi) btnAlbi.classList.toggle('active', _folderTab === 'albi');
  if(btnRitagli) btnRitagli.classList.toggle('active', _folderTab === 'ritagli');

  albumsPane.style.display = _folderTab === 'albi' ? 'block' : 'none';
  imagesPane.style.display = _folderTab === 'albi' ? 'none' : 'block';
  if(_folderTab === 'albi'){
    renderAlbumsShelf();
    syncDriveAlbumsForFolder(_activeFolderId);
  }
}

const DRIVE_ICO = `<svg viewBox="0 0 24 24" width="12" height="12"><path d="M12 5.5 6 16.5h12Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
// Icona "smartphone" per gli albi che vivono solo sul dispositivo (aperti dal
// selettore file locale): riaprirli richiede riscegliere il file, e da un
// altro dispositivo non ci sono. Il badge lo dice a colpo d'occhio.
const PHONE_ICO = `<svg viewBox="0 0 24 24" width="11" height="11"><rect x="7" y="3" width="10" height="18" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/><line x1="10.5" y1="18" x2="13.5" y2="18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;

// ── RENDER: PROFILO (avatar + pannello) ──
// Avatar tondo in alto a destra, alla Google: iniziale dell'account su disco
// azzurro quando Drive è collegato, sagoma neutra quando no. Toccandolo si
// apre il pannello con stato Drive e spazio Cloudinary.
// Glifo a nuvola: evoca lo storage/Drive senza il logo Google. Il pallino
// verde (via CSS ::after) segnala "collegato" senza bisogno di testo.
const CLOUD_ICO = `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M7.2 18.5h9.4a3.6 3.6 0 0 0 .35-7.18 5.1 5.1 0 0 0-9.78-1.2A4 4 0 0 0 7.2 18.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`;

function renderProfile(){
  updateStorageIndicator();

  const connected = isDriveConfigured() && isDriveConnected();
  const email = connected ? driveAccountEmail() : '';

  const btn = document.getElementById('refs-profile-btn');
  if(btn){
    btn.classList.toggle('connected', connected);
    btn.innerHTML = CLOUD_ICO;
  }

  // Testata del pannello: nuvola + identità dell'account (o "Non collegato").
  const avatar = document.getElementById('rp-avatar');
  const name = document.getElementById('rp-id-name');
  const sub = document.getElementById('rp-id-sub');
  if(avatar){ avatar.innerHTML = CLOUD_ICO; avatar.classList.toggle('connected', connected); }
  if(name) name.textContent = connected ? (email || 'Account Drive') : 'Nessun account';
  if(sub) sub.textContent = connected ? 'Google Drive collegato' : 'Drive non collegato';

  // Sezione Drive: azione connetti/scollega.
  const drive = document.getElementById('rp-drive');
  if(drive){
    if(!isDriveConfigured()){
      drive.innerHTML = `<div class="rp-note">Google Drive non ancora configurato.</div>`;
    } else if(connected){
      drive.innerHTML = `<button class="rp-btn rp-btn-ghost" onclick="window.disconnectDriveUI()">Scollega</button>`;
    } else {
      drive.innerHTML = `<button class="rp-btn rp-btn-primary" onclick="window.connectDriveAndSync()">${DRIVE_ICO} Connetti Google Drive</button>`;
    }
  }
}

// Apertura/chiusura del pannello profilo.
export function toggleRefsProfile(){
  const panel = document.getElementById('refs-profile-panel');
  const back = document.getElementById('refs-profile-backdrop');
  if(!panel) return;
  const open = !panel.classList.contains('open');
  renderProfile(); // rinfresca prima di mostrarlo
  panel.hidden = false; if(back) back.hidden = false;
  requestAnimationFrame(()=>{
    panel.classList.toggle('open', open);
    if(back) back.classList.toggle('open', open);
    if(!open) setTimeout(()=>{ panel.hidden = true; if(back) back.hidden = true; }, 180);
  });
}
export function closeRefsProfile(){
  const panel = document.getElementById('refs-profile-panel');
  const back = document.getElementById('refs-profile-backdrop');
  if(panel && panel.classList.contains('open')){
    panel.classList.remove('open');
    if(back) back.classList.remove('open');
    setTimeout(()=>{ panel.hidden = true; if(back) back.hidden = true; }, 180);
  }
}

function sortAlbumsList(list){
  const arr = list.slice();
  if(_albumSort === 'titolo'){
    arr.sort((a,b)=>(a.title||'').localeCompare(b.title||'', undefined, {sensitivity:'base'}));
    return arr;
  }
  // getAlbumsInFolder torna già per data decrescente: "vecchi" ribalta.
  if(_albumSort === 'vecchi') arr.reverse();
  return arr;
}

// ── RENDER: SCAFFALE ALBI ──
function renderAlbumsShelf(){
  const grid = document.getElementById('refs-albums-grid');
  const empty = document.querySelector('.refs-albums-empty');
  const noResults = document.getElementById('refs-albums-noresults');
  if(!grid) return;
  const all = getAlbumsInFolder(_activeFolderId);
  const q = _albumQuery.trim().toLowerCase();
  const list = sortAlbumsList(q ? all.filter(a=>(a.title||'').toLowerCase().includes(q)) : all);

  if(!list.length){
    grid.innerHTML = '';
    grid.dataset.sig = '';
    grid.style.display = 'none';
    // Cartella davvero vuota vs ricerca senza risultati: due messaggi diversi,
    // altrimenti "Sfoglia un albo" suggerirebbe di aprirne uno che magari hai
    // già, solo filtrato via dal testo cercato.
    const isSearchMiss = q && all.length > 0;
    if(empty) empty.style.display = isSearchMiss ? 'none' : 'flex';
    if(noResults) noResults.style.display = isSearchMiss ? 'flex' : 'none';
    return;
  }
  if(empty) empty.style.display = 'none';
  if(noResults) noResults.style.display = 'none';
  grid.style.display = 'grid';
  const sig = list.map(a=>[a.id,a.cover,a.title,a.pageCount,a.driveFileId].join(':')).join('|');
  if(grid.dataset.sig === sig) return;
  grid.dataset.sig = sig;
  grid.innerHTML = list.map(a=>{
    const isDrive = !!a.driveFileId;
    const badge = isDrive
      ? `<span class="album-src-badge src-drive" title="Da Google Drive — si apre da solo">${DRIVE_ICO}</span>`
      : `<span class="album-src-badge src-local" title="Solo su questo dispositivo — va riselezionato">${PHONE_ICO}</span>`;
    return `
    <div class="album-card ${isDrive ? 'is-drive' : 'is-local'}" data-id="${a.id}">
      <div class="album-cover">
        <img src="${cldResize(a.cover||'', COVER_W)}" loading="lazy" alt=""/>
        ${badge}
        <button class="album-menu-btn" onclick="event.stopPropagation();window.albumShelfMenu('${a.id}',this)" aria-label="Altro">⋯</button>
      </div>
      <div class="album-title">${esc(a.title||'Senza titolo')}</div>
      <div class="album-pages">${a.pageCount||0} pagine</div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.album-card').forEach(el=>{
    el.addEventListener('click', ()=> reopenAlbum(el.dataset.id));
  });
}

// ── RENDER: SFOGLIA CARTELLE ──
const FOLDER_ICON = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M3 6.5a1.5 1.5 0 0 1 1.5-1.5h5l2 2h8a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`;

function renderFolderBrowser(){
  const el = document.getElementById('refs-folder-browser');
  if(!el) return;
  const cats = foldersByCategory();
  const q = _folderQuery.trim().toLowerCase();

  // "All" è una scorciatoia fissa, non un risultato di ricerca: resta sempre
  // in cima, cercare "kon" non deve farla sparire insieme alle cartelle.
  let html = `
    <div class="refs-quicklink" onclick="window.openAllGrid()">
      <span class="refs-quicklink-ico">▦</span>
      <span class="refs-quicklink-lbl">All</span>
      <span class="refs-quicklink-count">${_refs.length}</span>
    </div>`;

  if(cats.size === 0){
    html += `<div class="refs-folders-empty">Ancora nessuna cartella. Crea la prima categoria (es. "Artists" o "Study") per iniziare a organizzare le tue reference.</div>`;
  }

  let shown = 0;
  cats.forEach((folders, category)=>{
    const visible = q ? folders.filter(f=>f.name.toLowerCase().includes(q)) : folders;
    if(!visible.length) return;
    shown += visible.length;
    html += `<div class="refs-cat-row">
      <span class="refs-cat-name">${esc(category)}</span>
    </div>`;
    visible.forEach(f=>{
      html += `<div class="refs-folder-row" onclick="window.openFolder('${f.id}')">
        <span class="refs-folder-ico">${FOLDER_ICON}</span>
        <span class="refs-folder-name">${esc(f.name)}</span>
        <span class="refs-folder-count">${countInFolder(f.id)}</span>
        <button class="refs-folder-menu" onclick="event.stopPropagation();window.refsFolderMenu('${f.id}',this)" aria-label="Altro">⋯</button>
      </div>`;
    });
  });

  if(cats.size > 0 && q && shown === 0){
    html += `<div class="refs-folders-empty">Nessuna cartella corrisponde a "${esc(_folderQuery.trim())}".</div>`;
  }

  // Unica azione di questa vista: qui si organizzano contenitori, non immagini.
  html += `<button class="refs-new-folder-row" onclick="window.promptNewFolderFlow(this)">
    <span class="refs-new-folder-ico">${FOLDER_ICON}</span>
    <span>Nuova cartella</span>
  </button>`;

  // Confronto sul contenuto vero: una firma "furba" (es. la lunghezza) manca
  // i casi in cui cambia il testo ma non la misura, tipo una cartella
  // rinominata con un nome della stessa lunghezza.
  if(el._html !== html){ el._html = html; el.innerHTML = html; }
}

export function refsFolderMenu(id, btnEl){
  const f = _folders.find(x=>x.id===id);
  if(!f) return;
  actionMenu(btnEl, [
    {label:'Rinomina', onSelect:()=>promptRenameFolder(id)},
    {label:'Elimina', danger:true, onSelect:()=>promptDeleteFolder(id)},
  ]);
}

// ── RENDER: GALLERIA (vista "Tutte" o cartella singola) ──
// Testo cercato contro l'artista (nome cartella) e la provenienza (opera,
// eventuale artista di origine se il ritaglio vive altrove — es. in Studio):
// gli unici campi che un ritaglio porta sempre con sé.
function refMatchesQuery(r, q){
  const bits = [];
  const f = _folders.find(x=>x.id===r.folderId);
  if(f) bits.push(f.name);
  if(r.provenance){
    if(r.provenance.opera) bits.push(r.provenance.opera);
    const pf = r.provenance.folderId && _folders.find(x=>x.id===r.provenance.folderId);
    if(pf) bits.push(pf.name);
  }
  return bits.join(' ').toLowerCase().includes(q);
}

function sortRefsList(list){
  const arr = list.slice();
  if(_gridSort === 'artista'){
    arr.sort((a,b)=>{
      const fa = _folders.find(x=>x.id===a.folderId);
      const fb = _folders.find(x=>x.id===b.folderId);
      return (fa?fa.name:'').localeCompare(fb?fb.name:'', undefined, {sensitivity:'base'});
    });
    return arr;
  }
  // "recenti"/"vecchi": _refs arriva già ordinato per data dal listener
  // (vedi startRefsListener), quindi "recenti" è già l'ordine naturale —
  // qui basta eventualmente ribaltarlo.
  if(_gridSort === 'vecchi') arr.reverse();
  return arr;
}

function rawGridList(){
  if(_view === 'folder'){
    return _activeFolderId
      ? _refs.filter(r=>r.folderId===_activeFolderId)
      : _refs.filter(r=>!r.folderId);
  }
  return _refs;
}

function currentGridList(){
  const raw = rawGridList();
  const q = _gridQuery.trim().toLowerCase();
  return sortRefsList(q ? raw.filter(r=>refMatchesQuery(r,q)) : raw);
}

export function renderRefsGrid(){
  const grid = document.getElementById('refs-grid');
  const empty = document.getElementById('refs-empty');
  const noResults = document.getElementById('refs-noresults');
  if(!grid) return;

  const list = currentGridList();

  if(!list.length){
    grid.innerHTML='';
    grid.dataset.sig = '';
    // Stessa distinzione dello scaffale albi: cartella vuota vs ricerca a vuoto.
    const isSearchMiss = _gridQuery.trim() && rawGridList().length > 0;
    if(empty) empty.style.display = isSearchMiss ? 'none' : 'flex';
    if(noResults) noResults.style.display = isSearchMiss ? 'flex' : 'none';
    return;
  }
  if(empty) empty.style.display='none';
  if(noResults) noResults.style.display='none';

  // I tre listener Firestore chiamano renderRefsScreen ad OGNI modifica, anche
  // di un campo che qui non si vede: ricostruire l'HTML rifà da capo tutte le
  // miniature (nuovi <img>, decodifica, sfarfallio). Se il contenuto mostrato
  // è identico non tocchiamo niente.
  // I progetti collegati entrano nella firma apposta: sono invisibili in
  // griglia (il puntino sotto li riassume) ma cambiano con "Collega a un
  // progetto", e senza di loro in coda quel cambiamento non farebbe mai
  // ridisegnare la griglia.
  const sig = list.map(r=>r.id+':'+r.url+':'+projectIdsOf(r).join(',')).join('|');
  if(grid.dataset.sig === sig) return;
  grid.dataset.sig = sig;

  grid.innerHTML = list.map(r=>{
    // Puntino nell'angolo, colorato come il progetto a cui il ritaglio è
    // agganciato: un promemoria muto mentre scorri la griglia, senza dover
    // aprire ogni immagine per saperlo.
    // Con più progetti il puntino prende il colore del primo e li elenca
    // tutti nel titolo: un pallino solo resta leggibile a colpo d'occhio,
    // due o tre puntini accanto diventerebbero coriandoli.
    const suoi = projectIdsOf(r).map(pid => projects.find(p=>p.id===pid)).filter(Boolean);
    const proj = suoi[0] || null;
    const dot = proj ? `<span class="refs-thumb-linkdot" style="background:${proj.color||'#4ab8d8'}" title="${esc(suoi.map(p=>p.title||'').join(' · '))}"></span>` : '';
    return `
    <div class="refs-thumb" data-id="${r.id}">
      <img src="${cldResize(r.url, THUMB_W)}" loading="lazy" decoding="async" alt=""/>
      ${dot}
    </div>
  `;
  }).join('');

  // Tap = apri · tocco prolungato (o tasto destro) = menu sposta/elimina
  grid.querySelectorAll('.refs-thumb').forEach(el=>{
    const id = el.dataset.id;
    let holdTimer = null, held = false;
    el.addEventListener('click', ()=>{ if(!held) openRefLightbox(id); held=false; });
    el.addEventListener('contextmenu', e=>{ e.preventDefault(); refsImageMenu(el, id); });
    el.addEventListener('touchstart', ()=>{
      held = false;
      holdTimer = setTimeout(()=>{ held = true; haptic('done'); refsImageMenu(el, id); }, 480);
    }, {passive:true});
    ['touchend','touchmove','touchcancel'].forEach(ev=>
      el.addEventListener(ev, ()=>clearTimeout(holdTimer), {passive:true}));
  });
}

// ── LIGHTBOX ──
let _lightboxList = [];
let _lightboxIndex = -1;

// Nastro di TRE celle affiancate (precedente/corrente/successiva, vedi
// css/refs.css .refs-lightbox-track/-cell): a riposo il nastro sta spostato
// esattamente di una cella (translateX(-100%), percentuale = sulla propria
// larghezza, quindi non serve mai misurarla in px), così la cella centrale
// riempie lo schermo. Durante il trascinamento si somma solo un delta in px
// alla stessa formula: il dito muove il nastro, non ricostruisce nulla.
//
// Le tre celle sono elementi DOM FISSI: non si ricreano mai. A ogni pagina
// completata (swipe confermato o freccia/tastiera) la cella ormai fuori
// schermo viene RIUSATA per il prossimo vicino — spostata nel DOM con
// insertBefore/appendChild, che non tocca src né decodifica, esattamente
// come già succedeva nel lettore album per lo stesso motivo (vedi commento
// storico più sotto): il browser non garantisce di riusare la decodifica se
// si riassegna la stessa src a un ELEMENTO diverso, ma la riusa sempre se è
// lo stesso elemento che si sposta.
let _lbCells = null;   // [{el,img}, {el,img}, {el,img}] — indici 0/1/2 = prev/cur/next, SEMPRE (ordine DOM = ordine visivo)
let _lbAnimating = false;

function ensureLbCells(){
  if(_lbCells) return;
  const track = document.getElementById('refs-lightbox-track');
  if(!track) return;
  _lbCells = Array.from(track.children).map(el => ({ el, img: el.querySelector('.refs-lightbox-img') }));
}

function curImg(){ return _lbCells && _lbCells[1] && _lbCells[1].img; }

// Carica UNA cella con l'immagine dell'indice dato. `hideUntilReady` nasconde
// la cella (visibility, il layout a fisarmonica resta invariato) finché
// decode() non è risolta — usato solo per la cella CENTRALE in apertura, dove
// altrimenti si vedrebbe un frame vuoto/rotto; le celle vicine si caricano
// invece già fuori schermo, quindi non serve nascondere nulla.
async function preloadCell(cell, index, hideUntilReady){
  if(!cell) return;
  const item = _lightboxList[index];
  if(!item){ cell.img.removeAttribute('src'); return; }
  const url = lightboxUrl(item.url);
  if(cell.img.src !== url){
    if(hideUntilReady) cell.el.style.visibility = 'hidden';
    cell.img.src = url;
  } else if(!hideUntilReady){
    return; // già quella giusta e nessuno sta aspettando: niente da fare
  }
  try{ await cell.img.decode(); }
  catch(e){ /* src cambiata a metà o file rotto: si prosegue comunque */ }
  if(hideUntilReady) cell.el.style.visibility = '';
}

export function openRefLightbox(id){
  const item = _refs.find(r=>r.id===id);
  if(!item) return;
  _lightboxList = currentGridList();
  _lightboxIndex = _lightboxList.findIndex(r=>r.id===id);
  // Registra uno stato nella cronologia: così il tasto Indietro (browser o
  // gesto Android) chiude l'immagine e torna alla griglia, invece di uscire.
  try{
    if(!history.state || history.state.view !== 'lightbox') history.pushState({view:'lightbox'}, '');
  }catch(e){}
  // Nasconde la barra-duna sotto (vedi body.refs-lightbox-open in
  // layout.css): senza, restava visibile dietro la capsula della galleria.
  document.body.classList.add('refs-lightbox-open');
  renderLightboxAt(_lightboxIndex);
}

// Pulsante "collega a un progetto" nel lightbox: pieno e colorato come il
// progetto agganciato, altrimenti solo il contorno — stesso linguaggio del
// puntino in griglia, così riconosci lo stato senza dover leggere niente.
// Funzione a parte (non solo inline in updateLightboxChrome) perché va
// rifatta anche subito dopo aver collegato un ritaglio dal menu, senza
// aspettare il giro di andata e ritorno da Firestore.
function refreshLightboxLinkBtn(item){
  const linkBtn = document.getElementById('refs-lightbox-link');
  if(!linkBtn || !item) return;
  const suoi = projectIdsOf(item).map(pid => projects.find(p=>p.id===pid)).filter(Boolean);
  const proj = suoi[0] || null;
  const path = linkBtn.querySelector('path');
  if(path) path.style.fill = proj ? (proj.color||'#4ab8d8') : 'none';
  linkBtn.classList.toggle('linked', !!proj);
  linkBtn.setAttribute('aria-label', suoi.length
    ? `Collegato a ${suoi.map(p=>'"'+(p.title||'')+'"').join(', ')} — cambia`
    : 'Collega a un progetto');
}

// Interfaccia intorno alla foto (contatore, frecce, provenienza, segnalibro):
// non dipende dal bitmap, si aggiorna subito — sia in apertura sia a ogni
// pagina completata.
function updateLightboxChrome(item, index){
  const ov = document.getElementById('refs-lightbox');
  if(!ov) return;
  const counter = document.getElementById('refs-lightbox-counter');
  const prevBtn = document.getElementById('refs-lightbox-prev');
  const nextBtn = document.getElementById('refs-lightbox-next');
  ov.dataset.id = item.id;
  ov.classList.remove('chrome-hidden');
  if(counter) counter.textContent = (index+1)+' / '+_lightboxList.length;
  // Provenienza: da che albo/pagina viene il ritaglio, e — se è archiviato in
  // una cartella di studio — di quale artista è. Il dato veniva già salvato da
  // sempre ma non era mostrato da nessuna parte: senza, guardando una mano
  // dentro "Hands" non c'è modo di sapere chi l'ha disegnata.
  const prov = document.getElementById('refs-lightbox-prov');
  const provWrap = document.getElementById('refs-lightbox-prov-wrap');
  if(prov){
    const p = item.provenance;
    if(p && (p.opera || p.folderId)){
      const artista = p.folderId ? getFolderName(p.folderId) : null;
      // L'artista si mostra solo se il ritaglio NON è già nella sua cartella:
      // dentro la cartella di Otomo, ripetere "Otomo" su ogni immagine è
      // rumore. Nello studio invece è l'informazione che serve.
      const showArtist = artista && item.folderId !== p.folderId;
      const bits = [];
      if(showArtist) bits.push(artista);
      if(p.opera) bits.push(p.opera);
      if(p.pagina) bits.push('p. ' + p.pagina);
      prov.textContent = bits.join(' · ');
      if(provWrap) provWrap.classList.toggle('is-empty', bits.length === 0);
    } else {
      prov.textContent = '';
      if(provWrap) provWrap.classList.add('is-empty');
    }
  }
  if(prevBtn) prevBtn.style.visibility = index>0 ? 'visible' : 'hidden';
  if(nextBtn) nextBtn.style.visibility = index<_lightboxList.length-1 ? 'visible' : 'hidden';
  refreshLightboxLinkBtn(item);
  ov.classList.add('open');
}

// Apertura "a freddo": popola le tre celle da zero e riporta il nastro a
// riposo senza animazione. La navigazione dentro la galleria (swipe, frecce,
// tastiera) NON passa più di qui: usa commitSwipe, che anima e ricicla le
// celle già pronte invece di ricaricare tutto — vedi sotto.
async function renderLightboxAt(index){
  if(index < 0 || index >= _lightboxList.length) return;
  _lightboxIndex = index;
  ensureLbCells();
  const track = document.getElementById('refs-lightbox-track');
  _lbOffsetPx = 0;
  if(track){ track.style.transition='none'; track.style.willChange=''; track.style.transform='translate3d(-100%,0,0)'; }
  updateLightboxChrome(_lightboxList[index], index);
  resetImageZoom();
  // decode() e non 'load': 'load' scatta quando i BYTE sono arrivati, ma la
  // decodifica del bitmap avviene dopo, al primo paint. Su una foto grande
  // quella decodifica dura parecchio, e mostrare la cella su 'load' si
  // tradurrebbe in un frame vuoto/a scatti, tanto più lungo quanto è grande
  // il file. decode() si risolve solo quando è pronta a essere dipinta.
  await preloadCell(_lbCells[1], index, true);
  if(_lightboxIndex !== index) return; // si è già passati oltre nel frattempo: scarta
  // I vicini si preparano DENTRO le celle che li mostreranno già a riposo,
  // fuori schermo: quando lo swipe li porta al centro, decode() trova il
  // lavoro già fatto, in ENTRAMBE le direzioni — trascinare da una parte o
  // dall'altra deve essere fluido allo stesso modo.
  preloadCell(_lbCells[0], index-1, false);
  preloadCell(_lbCells[2], index+1, false);
}

// Le celle riciclate si spostano nel DOM (mai ricreate): appendChild/
// insertBefore su un nodo già presente lo SPOSTA soltanto, senza toccare src
// né decodifica — la cella che PRIMA era "successiva", già decodificata
// mentre si trascinava, diventa "corrente" senza ridecodificare nulla.
function rotateCellsForward(){   // si è confermato "avanti"
  const track = document.getElementById('refs-lightbox-track');
  const [a,b,c] = _lbCells;
  track.appendChild(a.el);
  _lbCells = [b, c, a];
}
function rotateCellsBackward(){  // si è confermato "indietro"
  const track = document.getElementById('refs-lightbox-track');
  const [a,b,c] = _lbCells;
  track.insertBefore(c.el, a.el);
  _lbCells = [c, a, b];
}

// Rete di sicurezza sotto transitionend: se il nastro è già esattamente al
// valore di arrivo (es. un trascinamento uscito e rientrato allo stesso punto
// prima del rilascio) la proprietà non cambia e transitionend non scatta mai
// — senza questa rete _lbAnimating resterebbe bloccato a true per sempre.
let _lbFinish = null;   // conclusione dell'animazione in corso, per poterla anticipare
function afterLbTransition(track, ms, cb){
  let done = false;
  const finish = () => {
    if(done) return;
    done = true;
    track.removeEventListener('transitionend', onEnd);
    clearTimeout(timer);
    if(_lbFinish === finish) _lbFinish = null;
    cb();
  };
  const onEnd = e => { if(e.target === track && e.propertyName === 'transform') finish(); };
  track.addEventListener('transitionend', onEnd);
  const timer = setTimeout(finish, ms + 40);
  _lbFinish = finish;
}

// Chiude SUBITO l'animazione in corso, invece di ignorare il gesto che arriva
// mentre il nastro sta ancora scorrendo.
//
// È il motivo per cui a volte serviva un doppio swipe: fra una foto e l'altra
// passano ~220ms di scorrimento, e in quella finestra il tocco successivo non
// veniva rallentato ma buttato via del tutto — il trascinamento nemmeno si
// armava. Sfogliando di lena ci si finisce dentro di continuo, e la sensazione
// è "il primo swipe non l'ha preso".
function flushLbTransition(){
  if(_lbFinish) _lbFinish();
}

// La durata si commisura a quanto resta DAVVERO da percorrere, non è più fissa.
// Con una durata fissa gli ultimi centimetri dopo un trascinamento lungo si
// prendevano gli stessi 220ms di una foto girata da ferma: il dito aveva già
// fatto quasi tutto il lavoro e il nastro sembrava frenare sul più bello. Il
// minimo esiste perché sotto una certa soglia un movimento non si legge più
// come movimento, ma come uno scatto.
const LB_DUR_MAX = 220, LB_DUR_MIN = 90;
const LB_EASE = 'cubic-bezier(.22,.61,.36,1)';
function lbDuration(distanza, larghezza){
  if(!larghezza) return LB_DUR_MAX;
  const quota = Math.min(1, Math.max(0, distanza / larghezza));
  return Math.round(Math.max(LB_DUR_MIN, LB_DUR_MAX * quota));
}
// Quanto il nastro è spostato, in px, rispetto alla posizione di riposo.
let _lbOffsetPx = 0;
let _lbPendingDir = 0;

// Anima il nastro di una cella intera nella direzione data (+1 avanti,
// -1 indietro) e, a fine corsa, ricicla le celle e sposta l'indice. Unico
// punto d'ingresso sia per lo swipe confermato sia per frecce/tastiera:
// quando parte da un trascinamento già in corso continua da dove il dito
// l'ha lasciato (la transizione interpola dal valore ATTUALE), quando parte
// "a freddo" (freccia, tastiera) il nastro è già a riposo e scorre uguale.
function commitSwipe(dir){
  // Comando arrivato mentre il nastro scorre ancora (frecce o tastiera in
  // rapida successione, swipe incalzanti): si chiude subito quello in corso e
  // si riparte da lì, invece di lasciar cadere il comando.
  if(_lbAnimating) flushLbTransition();
  if(_lbAnimating) return;   // non si è chiusa: meglio perdere un passo che accavallarne due
  const target = _lightboxIndex + dir;
  if(target < 0 || target >= _lightboxList.length) return;
  const track = document.getElementById('refs-lightbox-track');
  if(!track) return;
  _lbAnimating = true;
  _lbPendingDir = dir;
  // Quanta strada resta: una cella intera partendo da fermo (freccia,
  // tastiera), molto meno se il dito ha già trascinato quasi tutto.
  const w = track.clientWidth || 0;
  const ms = lbDuration(w - Math.min(w, Math.abs(_lbOffsetPx)), w);
  track.style.willChange = 'transform';
  track.style.transition = `transform ${ms}ms ${LB_EASE}`;
  track.style.transform = dir > 0 ? 'translate3d(-200%,0,0)' : 'translate3d(0%,0,0)';
  afterLbTransition(track, ms, onSwipeSettled);
}

function onSwipeSettled(){
  const dir = _lbPendingDir;
  const track = document.getElementById('refs-lightbox-track');
  if(dir > 0) rotateCellsForward(); else rotateCellsBackward();
  _lbOffsetPx = 0;
  if(track){
    track.style.transition = 'none';
    track.style.transform = 'translate3d(-100%,0,0)';
    track.style.willChange = '';
  }
  _lightboxIndex += dir;
  _lbAnimating = false;
  resetImageZoom();
  updateLightboxChrome(_lightboxList[_lightboxIndex], _lightboxIndex);
  // Il nuovo vicino lontano, appena rivelato dalla rotazione, si prepara
  // subito — è la cella riciclata, ancora vuota o con la foto di due passi fa.
  const farIndex = dir > 0 ? _lightboxIndex + 1 : _lightboxIndex - 1;
  const farCell = dir > 0 ? _lbCells[2] : _lbCells[0];
  preloadCell(farCell, farIndex, false);
}

// Rilascio senza conferma: il nastro torna a riposo con la stessa molla
// dell'animazione di conferma, così cambiare idea a metà gesto si sente
// naturale quanto completarlo.
function cancelSwipe(){
  const track = document.getElementById('refs-lightbox-track');
  if(!track) return;
  _lbAnimating = true;
  // Anche il rientro dura quanto la strada da rifare: se il dito si era mosso
  // di poco, il nastro torna a posto subito invece di prendersi tutto il tempo
  // di una foto intera.
  const w = track.clientWidth || 0;
  const ms = lbDuration(Math.abs(_lbOffsetPx), w);
  track.style.willChange = 'transform';
  track.style.transition = `transform ${ms}ms ${LB_EASE}`;
  track.style.transform = 'translate3d(-100%,0,0)';
  afterLbTransition(track, ms, ()=>{
    _lbOffsetPx = 0;
    track.style.transition = '';
    track.style.willChange = '';
    _lbAnimating = false;
  });
}

// Chiusura "morbida": passa dalla cronologia, così lo stato del browser resta
// allineato a quello che vedi (niente voci fantasma nel tasto Indietro).
export function closeRefLightbox(){
  const ov = document.getElementById('refs-lightbox');
  const isOpen = ov && ov.classList.contains('open');
  if(isOpen && history.state && history.state.view === 'lightbox'){
    history.back();   // sarà il gestore popstate a chiudere davvero la vista
    return;
  }
  closeLightboxUI();
}

// Chiusura immediata della sola interfaccia, senza toccare la cronologia.
export function closeLightboxUI(){
  const ov = document.getElementById('refs-lightbox');
  if(ov) ov.classList.remove('open');
  document.body.classList.remove('refs-lightbox-open');
  resetImageZoom();
}

export function nextRefImage(){ commitSwipe(1); }
export function prevRefImage(){ commitSwipe(-1); }

// ── GALLERIA SCOPED A UN PROGETTO ────────────────────────────────────────────
// Apre la stessa identica lightbox usata da References, ma con l'elenco
// ristretto ai soli ritagli agganciati a QUESTO progetto: sfogliare avanti e
// indietro resta dentro quel sottoinsieme, non nell'intera libreria. La
// lightbox è un overlay a schermo intero indipendente dalle .screen — non
// serve lasciare la schermata Progetto per aprirla, né tornarci esplicitamente
// alla chiusura: quella sotto è già lì, invariata.
export function openProjectRefGallery(projectId, startIndex=0){
  const list = _refs.filter(r => projectIdsOf(r).includes(projectId));
  if(!list.length) return;
  _lightboxList = list;
  _lightboxIndex = Math.min(Math.max(0, startIndex), list.length-1);
  try{
    if(!history.state || history.state.view !== 'lightbox') history.pushState({view:'lightbox'}, '');
  }catch(e){}
  document.body.classList.add('refs-lightbox-open');
  renderLightboxAt(_lightboxIndex);
}

// ── PANNELLO "RIFERIMENTI VISIVI" — schermata Progetto ─────────────────────
// Chiuso di default ("pannello nascosto all'inizio"): un progetto lavorato
// per mesi non deve aprirsi con una parete di miniature. Si apre solo se
// c'è qualcosa da mostrare — nessuna sezione vuota che invita a chiedersi
// "a che serve questo".
let _refPanelOpen = false;

export function renderProjectRefPanel(projectId){
  const section = document.getElementById('ref-panel');
  const grid = document.getElementById('ref-panel-grid');
  const countEl = document.getElementById('ref-panel-count');
  if(!section || !grid) return;
  const list = _refs.filter(r => projectIdsOf(r).includes(projectId));
  if(!list.length){
    section.style.display = 'none';
    grid.dataset.sig = '';
    return;
  }
  section.style.display = '';
  if(countEl) countEl.textContent = list.length;
  const sig = list.map(r=>r.id+':'+r.url).join('|');
  if(grid.dataset.sig !== sig){
    grid.dataset.sig = sig;
    // In coda alle miniature, una tessera tratteggiata che porta a References:
    // il momento in cui ti accorgi che i riferimenti non bastano è proprio
    // questo, mentre li stai guardando. Tratteggiata e senza immagine per non
    // farsi scambiare per un ritaglio.
    grid.innerHTML = list.map((r,i)=>`
      <div class="ref-panel-thumb" data-i="${i}">
        <img src="${cldResize(r.url, THUMB_W)}" loading="lazy" decoding="async" alt=""/>
      </div>
    `).join('') + `
      <button class="ref-panel-add" id="ref-panel-add" title="Apri References per aggiungerne altri" aria-label="Apri References per aggiungere riferimenti">
        <span class="ref-panel-add-plus">+</span>
        <span class="ref-panel-add-lbl">Aggiungi</span>
      </button>`;
    grid.querySelectorAll('.ref-panel-thumb').forEach(el=>{
      el.addEventListener('click', ()=> openProjectRefGallery(projectId, +el.dataset.i));
    });
    const addBtn = grid.querySelector('#ref-panel-add');
    if(addBtn) addBtn.addEventListener('click', ()=>{
      haptic('tap');
      if(window.openRefsScreen) window.openRefsScreen();
    });
  }
}

// Richiamata da openProject() a ogni apertura: il pannello riparte sempre
// chiuso, anche se era stato aperto l'ultima volta che si era su questo
// stesso progetto — "nascosto all'inizio" vale a ogni apertura, non solo
// alla prima.
export function resetProjectRefPanel(projectId){
  _refPanelOpen = false;
  const section = document.getElementById('ref-panel');
  if(section) section.classList.remove('open');
  renderProjectRefPanel(projectId);
}

export function toggleProjectRefPanel(){
  const section = document.getElementById('ref-panel');
  if(!section) return;
  _refPanelOpen = !_refPanelOpen;
  section.classList.toggle('open', _refPanelOpen);
  haptic('tap');
}

// Tastiera (desktop): ← → per scorrere, Esc per chiudere
document.addEventListener('keydown', e=>{
  const ov = document.getElementById('refs-lightbox');
  if(!ov || !ov.classList.contains('open')) return;
  if(e.key === 'ArrowRight') nextRefImage();
  else if(e.key === 'ArrowLeft') prevRefImage();
  else if(e.key === 'Escape') closeRefLightbox();
});

// ── ZOOM/PAN/SWIPE — tocca due volte o pizzica per ingrandire, come una vera
// galleria: a 1x lo swipe orizzontale cambia immagine, da zoomato trascini
// per spostarti dentro la foto invece di cambiarla. Lo zoom lavora SEMPRE
// sulla sola cella centrale (curImg()) e non tocca mai il nastro: le due
// trasformazioni (pagina/nastro, zoom/immagine) restano indipendenti apposta,
// altrimenti trascinare per zoomare e trascinare per sfogliare si
// confonderebbero. ──
let _zoomScale = 1, _zoomX = 0, _zoomY = 0;
const ZOOM_IN = 2.6, ZOOM_MAX = 4;

export function resetImageZoom(){
  _zoomScale = 1; _zoomX = 0; _zoomY = 0;
  const img = curImg();
  if(img){ img.style.transition = 'none'; applyZoomTransform(img); }
}

// Quanto la foto segue il dito, da ingranditi. Non 1:1: più si è ingranditi,
// più piccola è la porzione visibile e più lungo il tragitto da fare, quindi a
// 1:1 servivano tre o quattro passate di dito per attraversarla. Il tetto
// esiste perché oltre una certa soglia l'immagine "scappa" e non ci si riesce
// più a fermare sul dettaglio che si voleva guardare. Gemella di panGain nel
// lettore (js/albums.js): stesso gesto, stessa risposta.
const PAN_GAIN_MAX = 2.2;
function panGain(z){
  return Math.min(PAN_GAIN_MAX, Math.max(1, 1 + (z - 1) * 0.55));
}

// Fin dove si può spostare la foto prima di "perderla" fuori dallo schermo.
function panLimits(scale){
  const img = curImg();
  if(!img) return null;
  const r = img.getBoundingClientRect();
  const baseW = r.width / scale, baseH = r.height / scale;
  return {
    maxX: Math.max(0, (baseW*scale - baseW)/2),
    maxY: Math.max(0, (baseH*scale - baseH)/2),
  };
}
function clampPan(scale, x, y){
  const lim = panLimits(scale);
  if(!lim) return {x, y};
  return { x: Math.min(lim.maxX, Math.max(-lim.maxX, x)), y: Math.min(lim.maxY, Math.max(-lim.maxY, y)) };
}

function applyZoomTransform(img){
  img.style.transform = `translate(${_zoomX}px, ${_zoomY}px) scale(${_zoomScale})`;
  // il cursore "manina" appare solo quando c'è davvero qualcosa da spostare
  const body = document.getElementById('refs-lightbox-body');
  if(body) body.classList.toggle('zoomed', _zoomScale > 1.02);
}

// Alterna zoom 1x ↔ ZOOM_IN centrando sul punto indicato, con animazione.
function toggleZoomAt(clientX, clientY){
  const img = curImg();
  if(!img) return;
  img.style.transition = 'transform .22s';
  if(_zoomScale > 1.02){
    _zoomScale = 1; _zoomX = 0; _zoomY = 0;
    applyZoomTransform(img);
  } else {
    const r = img.getBoundingClientRect();
    const relX = clientX - (r.left + r.width/2);
    const relY = clientY - (r.top + r.height/2);
    _zoomScale = ZOOM_IN;
    const c = clampPan(_zoomScale, -relX*(ZOOM_IN-1), -relY*(ZOOM_IN-1));
    _zoomX = c.x; _zoomY = c.y;
    applyZoomTransform(img);
  }
}

// Resistenza elastica ai bordi della galleria: se non c'è un vicino in quella
// direzione, il trascinamento rallenta invece di seguire il dito 1:1 (curva
// standard "rubber band", converge a poco più di metà schermo e non oltre —
// così si SENTE che sei all'estremo, invece di uno scatto nel vuoto).
function applyLbResistance(dx, w){
  if(!w) return dx;
  const goingNext = dx < 0;
  const blocked = goingNext ? (_lightboxIndex+1 >= _lightboxList.length) : (_lightboxIndex-1 < 0);
  if(!blocked) return dx;
  const c = 0.55;
  const rb = (1 - 1/((Math.abs(dx)*c/w)+1)) * w;
  return goingNext ? -rb : rb;
}

(function initLightboxGestures(){
  document.addEventListener('DOMContentLoaded', bind);
  if(document.readyState !== 'loading') bind();

  function bind(){
    const body = document.getElementById('refs-lightbox-body');
    if(!body || body._gestureInit) return;
    body._gestureInit = true;

    let touches = [];
    let startDist = 0, startScale = 1;
    let panStartX = 0, panStartY = 0, panOrigX = 0, panOrigY = 0;
    let swipeStartX = 0, swipeStartY = 0;
    let isPinching = false, isPanning = false;
    let lastTapTime = 0, lastTapX = 0, lastTapY = 0, singleTapTimer = null;

    // Trascinamento del NASTRO (cambio immagine a 1x): "candidato" appena
    // parte un tocco singolo a zoom 1x, "armato" solo quando il movimento
    // indica chiaramente un gesto orizzontale — prima di allora il nastro
    // resta fermo, così un tap con un lieve tremore del dito non lo smuove
    // di un pixel e la logica di tap/doppio-tap sotto funziona invariata.
    let lbDragCandidate = false, lbArmed = false, lbBodyW = 0;
    let lbLastX = 0, lbLastT = 0, lbPrevX = 0, lbPrevT = 0;
    const LB_ARM_PX = 8;
    // Da dove si conta lo spostamento del nastro: di solito il punto in cui il
    // dito si è appoggiato, ma passando dallo spostare la foto al cambiarla
    // diventa il punto in cui la foto è finita — altrimenti il nastro
    // partirebbe già spostato di tutto il tragitto fatto sull'immagine.
    let lbDragOriginX = 0;
    // Il trascinamento arriva dal bordo di una foto ingrandita? Da ingranditi
    // il cambio immagine non deve MAI capitare per sbaglio: il nastro si
    // comporta come una molla e non accetta scorciatoie (vedi il rilascio).
    let lbFromEdge = false;
    // Questo gesto ha il permesso di cambiare foto? Lo prende al touchstart.
    let lbEdgeReady = false;
    // Dove stava il dito quando la foto ha finito di scorrere. L'insistenza si
    // conta da lì in pixel di DITO: contarla sullo spostamento della foto
    // sarebbe falsata dal guadagno di panGain.
    let lbPinnedAtX = null;
    // Quanto insistere, dito alla mano, prima che il nastro accenni a muoversi.
    const EDGE_HANDOFF = 30;
    // Quanto va tirata la molla, in frazione di schermo, perche' si cambi foto.
    const EDGE_COMMIT = 0.22;
    // Con questa costante servono circa 165px di dito per arrivarci, piu' i 30
    // di innesco: una spinta decisa, non un colpetto che scappa.
    const SPRING_C = 0.7;
    const edgeSpring = (dx, w)=>{
      if(!w) return dx;
      const rb = (1 - 1/((Math.abs(dx)*SPRING_C/w)+1)) * w;
      return dx < 0 ? -rb : rb;
    };

    function dist(t0, t1){ return Math.hypot(t1.clientX-t0.clientX, t1.clientY-t0.clientY); }

    let lastTouchAt = 0;
    body.addEventListener('touchstart', e=>{
      lastTouchAt = Date.now();
      touches = Array.from(e.touches);
      const img = curImg();
      if(img) img.style.transition = 'none';
      if(touches.length === 2){
        isPinching = true; isPanning = false; lbDragCandidate = false; lbArmed = false;
        startDist = dist(touches[0], touches[1]);
        startScale = _zoomScale;
      } else if(touches.length === 1){
        isPinching = false;
        swipeStartX = touches[0].clientX; swipeStartY = touches[0].clientY;
        if(_zoomScale > 1.02){
          isPanning = true; lbDragCandidate = false; lbArmed = false;
          lbFromEdge = false; lbPinnedAtX = null;
          // SI CAMBIA FOTO SOLO SE IL DITO SI APPOGGIA QUANDO L'IMMAGINE È GIÀ
          // A FINE CORSA. Su una foto ingrandita il bordo orizzontale è
          // vicinissimo: muovendosi dentro ci si sbatte contro di continuo, e
          // ogni volta il gesto rischiava di diventare un cambio immagine.
          // Esplorare e sfogliare restano così due gesti distinti: si stacca
          // il dito, lo si riappoggia a fine corsa, e da lì si sfoglia.
          {
            const lim = panLimits(_zoomScale);
            lbEdgeReady = !lim || Math.abs(_zoomX) >= lim.maxX - 1;
          }
          panStartX = touches[0].clientX; panStartY = touches[0].clientY;
          panOrigX = _zoomX; panOrigY = _zoomY;
        } else {
          isPanning = false;
          // Il dito è arrivato mentre il nastro scorreva ancora: si chiude
          // subito l'animazione e questo gesto parte da foto ferma, invece di
          // essere scartato (vedi flushLbTransition — è il "doppio swipe").
          if(_lbAnimating) flushLbTransition();
          lbDragCandidate = true;
          lbArmed = false;
          lbFromEdge = false; lbPinnedAtX = null; lbEdgeReady = true;
          lbBodyW = body.clientWidth;
          lbDragOriginX = touches[0].clientX;
          lbLastX = lbPrevX = touches[0].clientX;
          lbLastT = lbPrevT = performance.now();
          // Il livello di composizione si prepara già ORA, non alla prima
          // frazione di movimento: pagare la promozione dentro il primo
          // fotogramma del trascinamento si sente come partenza impastata.
          const track = document.getElementById('refs-lightbox-track');
          if(track) track.style.willChange = 'transform';
        }
      }
    }, {passive:true});

    body.addEventListener('touchmove', e=>{
      touches = Array.from(e.touches);
      if(isPinching && touches.length === 2){
        const img = curImg(); if(!img) return;
        const nd = dist(touches[0], touches[1]);
        _zoomScale = Math.min(ZOOM_MAX, Math.max(1, startScale * (nd/startDist)));
        const c = clampPan(_zoomScale, _zoomX, _zoomY);
        _zoomX = c.x; _zoomY = c.y;
        applyZoomTransform(img);
      } else if(isPanning && touches.length === 1){
        const img = curImg(); if(!img) return;
        const x = touches[0].clientX, y = touches[0].clientY;
        const g = panGain(_zoomScale);
        const vogliaX = panOrigX + (x - panStartX) * g;
        const vogliaY = panOrigY + (y - panStartY) * g;
        const c = clampPan(_zoomScale, vogliaX, vogliaY);
        const oltre = vogliaX - c.x;   // quanto si è chiesto OLTRE il bordo
        _zoomX = c.x; _zoomY = c.y;
        applyZoomTransform(img);
        // PASSAGGIO DI CONSEGNE: la foto è finita e il dito continua a spingere
        // da quella parte. Non c'è più niente da mostrare lì, quindi da qui in
        // poi il gesto muove il NASTRO e cambia immagine, senza dover prima
        // uscire dall'ingrandimento e ripartire da capo.
        // L'insistenza si misura in pixel di DITO da quando la foto si e'
        // fermata, non sullo scarto della foto: quello e' moltiplicato da
        // panGain, e faceva scattare il passaggio molto prima di quanto la
        // mano si aspettasse.
        if(Math.abs(oltre) < 0.5) lbPinnedAtX = null;
        else if(lbPinnedAtX === null) lbPinnedAtX = x;
        if(lbEdgeReady && lbPinnedAtX !== null && Math.abs(x - lbPinnedAtX) > EDGE_HANDOFF
           && Math.abs(x - panStartX) > Math.abs(y - panStartY)){
          isPanning = false;
          lbDragCandidate = true; lbArmed = true; lbFromEdge = true;
          lbDragOriginX = x; lbBodyW = body.clientWidth;
          lbLastX = lbPrevX = x; lbLastT = lbPrevT = performance.now();
          const track = document.getElementById('refs-lightbox-track');
          if(track){ track.style.transition = 'none'; track.style.willChange = 'transform'; }
        }
      } else if(lbDragCandidate && touches.length === 1){
        const x = touches[0].clientX, y = touches[0].clientY;
        const ddx = x - lbDragOriginX, ddy = y - swipeStartY;
        if(!lbArmed){
          if(Math.abs(ddx) > LB_ARM_PX && Math.abs(ddx) > Math.abs(ddy)){
            lbArmed = true;
            const track = document.getElementById('refs-lightbox-track');
            if(track){ track.style.transition = 'none'; track.style.willChange = 'transform'; }
          } else if(Math.abs(ddy) > LB_ARM_PX * 3 && Math.abs(ddy) > Math.abs(ddx) * 2){
            // Si rinuncia solo davanti a un gesto LUNGO e chiaramente
            // verticale. Prima bastavano 8px in verticale per spegnere il
            // candidato PER SEMPRE: un pollice non si muove mai in orizzontale
            // puro, quindi i primi campioni di uno swipe normale sono spesso
            // più verticali che orizzontali (6px di lato, 12 in giù) — roba da
            // rumore, non da intenzione. Quello swipe restava morto anche
            // quando il dito proseguiva dritto di traverso allo schermo, e
            // bisognava rifare il gesto da capo. Qui sotto quella soglia non si
            // decide: si aspetta il campione dopo.
            // Nella galleria non esiste nessun gesto verticale da proteggere
            // (il corpo ha touch-action:none), quindi rinunciare tardi non
            // toglie niente a nessuno.
            lbDragCandidate = false;
            return;
          } else {
            return;   // ancora ambiguo: si aspetta il campione successivo
          }
        }
        lbPrevX = lbLastX; lbPrevT = lbLastT;
        lbLastX = x; lbLastT = performance.now();
        // Dal bordo di una foto ingrandita il nastro non segue il dito: cede
        // come una molla, sempre meno man mano che si insiste.
        _lbOffsetPx = lbFromEdge ? edgeSpring(ddx, lbBodyW) : applyLbResistance(ddx, lbBodyW);
        const track = document.getElementById('refs-lightbox-track');
        if(track) track.style.transform = `translate3d(calc(-100% + ${_lbOffsetPx}px),0,0)`;
      }
    }, {passive:true});

    body.addEventListener('touchend', e=>{
      if(isPinching){
        isPinching = false;
        if(_zoomScale < 1.05){
          resetImageZoom();
          const img = curImg();
          if(img) img.style.transition = 'transform .18s';
        }
        return;
      }
      // Un tocco senza spostamento non è un trascinamento: lasciamo che venga
      // valutato sotto come possibile doppio tap (anche da immagine ingrandita).
      if(isPanning){
        isPanning = false;
        const tp = e.changedTouches[0];
        const movedPan = Math.hypot(tp.clientX - panStartX, tp.clientY - panStartY);
        if(movedPan > 14) return;
      }
      // ── RILASCIO DI UN TRASCINAMENTO ARMATO: conferma o molla indietro ──
      // Si conferma per DISTANZA (oltre il 30% dello schermo) o per VELOCITÀ,
      // misurata sugli ultimi due campioni e non sull'intero gesto — così un
      // trascinamento lento che finisce con uno scatto conta come scatto. Il
      // secondo controllo (durata totale breve + distanza minima) resta come
      // rete di sicurezza per i gesti troppo rapidi da campionare bene.
      if(lbArmed){
        lbArmed = false; lbDragCandidate = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - lbDragOriginX;
        const adx = Math.abs(dx);
        const vx = lbLastT > lbPrevT ? (lbLastX - lbPrevX) / (lbLastT - lbPrevT) : 0;
        const elapsed = Date.now() - lastTouchAt;
        const dir = dx < 0 ? 1 : -1;   // trascino a sinistra → avanti
        const blocked = dir > 0 ? (_lightboxIndex+1 >= _lightboxList.length) : (_lightboxIndex-1 < 0);
        let vaiAvanti;
        if(lbFromEdge){
          // Da ingranditi conta solo quanto la molla e' stata TIRATA — quello
          // che si vede — e non vale nessuna scorciatoia di velocita': era il
          // flick a rendere il cambio troppo facile, bastava un colpetto al
          // bordo per cambiare foto senza volerlo.
          vaiAvanti = Math.abs(edgeSpring(dx, lbBodyW)) > lbBodyW * EDGE_COMMIT;
        } else {
          const distOk = adx > lbBodyW * 0.3;
          const flickOk = (Math.abs(vx) > 0.5 && Math.sign(vx) === Math.sign(dx)) || (elapsed < 300 && adx > 24);
          vaiAvanti = distOk || flickOk;
        }
        lbFromEdge = false;
        if(!blocked && vaiAvanti) commitSwipe(dir);
        else cancelSwipe();
        return;
      }
      // Gesto finito senza mai armarsi (un tap, o un movimento verticale): il
      // livello di composizione preparato al touchstart non serve più.
      lbDragCandidate = false;
      if(!_lbAnimating){
        const tk = document.getElementById('refs-lightbox-track');
        if(tk) tk.style.willChange = '';
      }
      // tap / doppio tap (solo se non si è mai armato un trascinamento)
      const t = e.changedTouches[0];
      const dx = t.clientX - swipeStartX, dy = t.clientY - swipeStartY;
      const moved = Math.hypot(dx, dy);
      if(moved < 20){
        const now = Date.now();
        const closeTap = Math.hypot(t.clientX-lastTapX, t.clientY-lastTapY) < 50;
        if(now - lastTapTime < 400 && closeTap){
          // ── DOPPIO TAP: alterna 1x ↔ zoom centrato sul punto toccato ──
          clearTimeout(singleTapTimer);
          toggleZoomAt(t.clientX, t.clientY);
          lastTapTime = 0;
        } else {
          lastTapTime = now; lastTapX = t.clientX; lastTapY = t.clientY;
          // tap singolo: mostra/nasconde l'interfaccia (solo se non zoomato),
          // ritardato per non rubare il gesto al doppio tap
          clearTimeout(singleTapTimer);
          singleTapTimer = setTimeout(()=>{
            const ov = document.getElementById('refs-lightbox');
            if(ov && _zoomScale <= 1.02) ov.classList.toggle('chrome-hidden');
          }, 340);
        }
      }
    }, {passive:true});

    // Un tocco annullato dal sistema (una notifica, un gesto di bordo) non
    // emette touchend: senza questo il nastro resterebbe fermo dov'era il dito,
    // a metà fra due foto, e da lì non si sbloccherebbe più.
    // Con l'interfaccia nascosta (un tocco sulla foto la fa sparire) le due
    // fasce sopra e sotto diventano pointer-events:none, quindi un tocco lì
    // non arrivava a NESSUNO: né al pulsante invisibile, né al gestore del tap
    // sulla foto, che copre solo il corpo centrale. Il risultato era una
    // striscia di schermo morta — si toccava il pulsante "collega", non
    // succedeva niente, e non si capiva perché.
    // Ora un tocco ovunque nella galleria richiama l'interfaccia, e da lì il
    // pulsante è di nuovo lì dov'era.
    const ov = document.getElementById('refs-lightbox');
    if(ov && !ov._chromeWake){
      ov._chromeWake = true;
      ov.addEventListener('pointerdown', e=>{
        if(!ov.classList.contains('chrome-hidden')) return;
        if(e.target.closest('.refs-lightbox-body')) return;   // lì ci pensa già il tap sulla foto
        ov.classList.remove('chrome-hidden');
      }, true);
    }

    body.addEventListener('touchcancel', ()=>{
      isPinching = false; isPanning = false;
      if(lbArmed) cancelSwipe();
      else if(!_lbAnimating){
        const tk = document.getElementById('refs-lightbox-track');
        if(tk) tk.style.willChange = '';
      }
      lbArmed = false; lbDragCandidate = false; lbFromEdge = false; lbPinnedAtX = null;
    }, {passive:true});

    // Desktop: doppio clic per zoomare/dezoomare. I browser mobile generano
    // anche un "dblclick" sintetico dopo un doppio tap reale: se lo lasciassimo
    // passare, zoomerebbe una seconda volta annullando quello già fatto dal
    // gestore touch sopra. Lo ignoriamo se c'è stato un tocco nell'ultimo secondo.
    // Delegati sul contenitore (non sulla singola <img>): la cella "centrale"
    // cambia a ogni pagina col riciclo del nastro, quindi un listener legato
    // una volta sola all'elemento originale smetterebbe di funzionare dopo il
    // primo giro. Le celle laterali hanno pointer-events:none (vedi CSS),
    // quindi i click/drag arrivano comunque solo a quella davvero centrale.
    body.addEventListener('dblclick', e=>{
      if(Date.now() - lastTouchAt < 1000) return;
      if(!e.target.classList.contains('refs-lightbox-img')) return;
      toggleZoomAt(e.clientX, e.clientY);
    });

    // Desktop: rotella per zoomare, con lo zoom centrato sul puntatore
    body.addEventListener('wheel', e=>{
      const ov = document.getElementById('refs-lightbox');
      if(!ov || !ov.classList.contains('open')) return;
      const img = curImg();
      if(!img) return;
      e.preventDefault();
      const prev = _zoomScale;
      const factor = e.deltaY < 0 ? 1.16 : 1/1.16;
      _zoomScale = Math.min(ZOOM_MAX, Math.max(1, prev * factor));
      img.style.transition = 'none';
      if(_zoomScale <= 1.02){
        _zoomScale = 1; _zoomX = 0; _zoomY = 0;
      } else {
        // mantiene fermo il punto sotto il puntatore mentre la scala cambia
        const r = img.getBoundingClientRect();
        const relX = e.clientX - (r.left + r.width/2);
        const relY = e.clientY - (r.top + r.height/2);
        const k = _zoomScale/prev;
        const c = clampPan(_zoomScale, (_zoomX - relX)*k + relX, (_zoomY - relY)*k + relY);
        _zoomX = c.x; _zoomY = c.y;
      }
      applyZoomTransform(img);
    }, {passive:false});

    // Desktop: trascinamento con la "manina" quando l'immagine è ingrandita
    let mDown = false, mStartX = 0, mStartY = 0, mOrigX = 0, mOrigY = 0;
    body.addEventListener('mousedown', e=>{
      if(_zoomScale <= 1.02) return;
      if(Date.now() - lastTouchAt < 1000) return;
      if(!e.target.classList.contains('refs-lightbox-img')) return;
      const img = curImg();
      if(!img) return;
      e.preventDefault();
      mDown = true;
      mStartX = e.clientX; mStartY = e.clientY;
      mOrigX = _zoomX; mOrigY = _zoomY;
      body.classList.add('grabbing');
      img.style.transition = 'none';
    });
    window.addEventListener('mousemove', e=>{
      if(!mDown) return;
      const img = curImg();
      if(!img) return;
      const c = clampPan(_zoomScale, mOrigX + (e.clientX-mStartX), mOrigY + (e.clientY-mStartY));
      _zoomX = c.x; _zoomY = c.y;
      applyZoomTransform(img);
    });
    window.addEventListener('mouseup', ()=>{
      if(!mDown) return;
      mDown = false;
      body.classList.remove('grabbing');
    });
  }
})();





// ── MENU AZIONI IMMAGINE — unico punto per spostare/eliminare ──
// Usato sia dal "⋯" nella vista a schermo intero sia dal tocco prolungato
// sulla griglia, così le stesse azioni sono raggiungibili da entrambi i posti.
export function refsImageMenu(anchorEl, imageId){
  const id = imageId || (document.getElementById('refs-lightbox')||{}).dataset?.id;
  if(!id) return;
  actionMenu(anchorEl, [
    { label:'Collega a un progetto…', onSelect:()=>promptLinkProject(id, anchorEl) },
    { label:'Sposta in cartella…', onSelect:()=>promptMoveImage(id, anchorEl) },
    { label:'Elimina', danger:true, onSelect:()=>deleteRefImageWithUndo(id) },
  ]);
}

function promptMoveImage(id, anchorEl){
  const cats = foldersByCategory();
  const actions = [];
  cats.forEach((folders, category)=>{
    folders.forEach(f=>{
      actions.push({ label: category+' › '+f.name, onSelect:()=>{ assignRefToFolder(id, f.id); haptic('tap'); } });
    });
  });
  actions.push({ label:'Nessuna cartella', onSelect:()=>{ assignRefToFolder(id, null); haptic('tap'); } });
  if(!actions.length) return;
  actionMenu(anchorEl, actions);
}

// ── COLLEGAMENTO AI PROGETTI ────────────────────────────────────────────────
// Un ritaglio può servire a PIÙ progetti: la stessa mano ben disegnata è
// riferimento per due storie diverse, e doverla ritagliare due volte per
// tenerla in entrambe è lavoro inventato. All'inizio il campo era uno solo
// (`projectId`), quindi scegliere il secondo progetto scollegava il primo
// senza dirlo — sembrava che il collegamento non funzionasse, mentre stava
// facendo esattamente quello che sapeva fare.
//
// Ora l'elenco sta in `projectIds`. I ritagli scritti prima hanno solo il
// vecchio campo: projectIdsOf li legge lo stesso, così non serve nessuna
// migrazione e niente si perde. Il vecchio campo continua a essere scritto
// col PRIMO della lista, per non lasciare indietro eventuali dati altrove.
export function projectIdsOf(item){
  if(!item) return [];
  if(Array.isArray(item.projectIds)) return item.projectIds.filter(Boolean);
  return item.projectId ? [item.projectId] : [];
}

function writeProjectLinks(id, ids){
  const lista = Array.from(new Set(ids.filter(Boolean)));
  setDoc(doc(db, REFS_COL, id), { projectIds: lista, projectId: lista[0] || null }, {merge:true});
  // Riflette subito il cambio in locale: aspettare il giro di andata e
  // ritorno da Firestore per aggiornare il pulsante nel lightbox si sente,
  // anche se dura poco — e qui serve fluido "nel minor numero di passi".
  const item = _refs.find(r=>r.id===id);
  if(item){
    item.projectIds = lista;
    item.projectId = lista[0] || null;
    const ov = document.getElementById('refs-lightbox');
    if(ov && ov.dataset.id === id) refreshLightboxLinkBtn(item);
  }
}

// Aggiunge o toglie UN progetto, lasciando stare gli altri.
export function toggleRefProject(id, projectId){
  const item = _refs.find(r=>r.id===id);
  const attuali = projectIdsOf(item);
  const dopo = attuali.includes(projectId)
    ? attuali.filter(p => p !== projectId)
    : attuali.concat(projectId);
  writeProjectLinks(id, dopo);
}

export function linkRefToProject(id, projectId){
  writeProjectLinks(id, projectId ? [projectId] : []);
}

function promptLinkProject(id, anchorEl){
  const item = _refs.find(r=>r.id===id);
  const collegati = projectIdsOf(item);
  // Ogni voce ACCENDE o SPEGNE quel progetto: la spunta dice quali sono già
  // collegati, e sceglierne un altro non scollega più il primo. Il menu si
  // chiude ad ogni scelta come tutti gli altri dell'app — per collegarne due
  // lo si riapre, e la seconda volta si vede la spunta comparsa.
  const actions = projects.map(p => ({
    label: (collegati.includes(p.id) ? '✓ ' : '') + (p.title||'Senza titolo'),
    onSelect: ()=>{ toggleRefProject(id, p.id); haptic('tap'); },
  }));
  if(collegati.length){
    actions.push({ label:'Scollega da tutti', onSelect:()=>{ writeProjectLinks(id, []); haptic('tap'); } });
  }
  if(!actions.length) return;
  actionMenu(anchorEl, actions);
}

// Stesso ingresso usato dal pulsante dedicato nella galleria a schermo
// intero (vedi index.html): legge l'id dal ritaglio aperto, come fa già
// refsImageMenu quando viene chiamato senza un id esplicito.
export function promptLinkProjectFromLightbox(anchorEl){
  const id = (document.getElementById('refs-lightbox')||{}).dataset?.id;
  if(!id) return;
  promptLinkProject(id, anchorEl);
}

export function deleteRefImageWithUndo(id){
  const item = _refs.find(r=>r.id===id);
  const lb = document.getElementById('refs-lightbox');
  if(lb && lb.classList.contains('open') && lb.dataset.id === id) closeRefLightbox();
  haptic('done');
  // Rimuove solo il riferimento su Firestore (unica fonte di verita per
  // Inkflow); il file resta su Cloudinary come orfano — irrilevante con 25GB.
  deleteDoc(doc(db, REFS_COL, id));
  showUndoToast('Immagine eliminata', ()=>{
    if(!item) return;
    setDoc(doc(db, REFS_COL, id), {
      url: item.url, source: item.source||'file',
      projectIds: projectIdsOf(item), projectId: projectIdsOf(item)[0] || null,
      folderId: item.folderId||null, bytes: item.bytes||null,
      addedAt: serverTimestamp(), w: item.w||null, h: item.h||null,
    });
  });
}

// ── ACQUISIZIONE RAPIDA: drag&drop + incolla ──
export function initRefsCapture(){
  const dropZone = document.getElementById('screen-refs');
  if(!dropZone || dropZone._refsCaptureInit) return;
  dropZone._refsCaptureInit = true;

  ['dragover','drop'].forEach(ev=>document.addEventListener(ev, e=>{
    if(dropZone.classList.contains('active')) e.preventDefault();
  }));

  ['dragover','dragenter'].forEach(ev=>dropZone.addEventListener(ev, e=>{
    e.preventDefault();
    dropZone.classList.add('drag-over');
  }));
  ['dragleave','dragend'].forEach(ev=>dropZone.addEventListener(ev, e=>{
    dropZone.classList.remove('drag-over');
  }));
  dropZone.addEventListener('drop', async e=>{
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if(!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    haptic('done');
    await addRefImages(e.dataTransfer.files, 'drop');
  });

  document.addEventListener('paste', async e=>{
    if(!dropZone.classList.contains('active')) return;
    const items = e.clipboardData && e.clipboardData.items;
    if(!items) return;
    const files=[];
    for(const it of items){
      if(it.type && it.type.startsWith('image/')){
        const f = it.getAsFile();
        if(f) files.push(f);
      }
    }
    if(files.length){
      haptic('done');
      await addRefImages(files, 'paste');
    }
  });

  const fileInput = document.getElementById('refs-file-input');
  if(fileInput){
    fileInput.addEventListener('change', async ()=>{
      if(fileInput.files && fileInput.files.length){
        haptic('done');
        await addRefImages(fileInput.files, 'file');
        fileInput.value='';
      }
    });
  }
}
