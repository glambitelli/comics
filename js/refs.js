// ── LIBRERIA REFERENCES — immagini reference fuori dai progetti ──
// Le immagini vivono su Cloudinary (25GB gratis, nessuna carta), Firestore
// tiene solo i metadati (url, cartella, dimensioni, data).
// Organizzazione a cartelle per categoria (es. "Artists" → "Hiroyuki Okiura",
// "Study (Temporary)" → "Hands").
import { db, collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp } from './firebase.js';
import { haptic, showUndoToast } from './state.js';
import { compressImageFile, dataUrlToBlob } from './imgcompress.js';
import { uploadToCloudinary } from './cloudinary.js';
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

function genId(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}
function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

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
    const data = {
      url, source,
      projectId: null,
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
    const data = {
      url, source,
      projectId: null,
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
export function openFolderBrowser(){
  _view = 'folders'; _activeFolderId = null;
  renderRefsScreen();
}
export function openAllGrid(){
  _view = 'all'; _activeFolderId = null;
  renderRefsScreen();
}
export function openFolder(id){
  _view = 'folder'; _activeFolderId = id;
  // Si apre sul tab che ha qualcosa dentro: se la cartella ha albi parte da lì,
  // altrimenti sui ritagli. Evita di sbattere in faccia una schermata vuota.
  _folderTab = countAlbumsByFolder(id) > 0 ? 'albi' : 'ritagli';
  renderRefsScreen();
}

export function setFolderTab(tab){
  if(tab !== 'albi' && tab !== 'ritagli') return;
  if(_folderTab === tab) return;
  _folderTab = tab;
  haptic('tap');
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

// ── SPAZIO OCCUPATO ──
// Le immagini vivono su Cloudinary (25GB gratis); non c'è modo di interrogare
// l'uso reale dell'account senza esporre credenziali admin lato client, quindi
// teniamo il conto noi: ogni immagine salva la propria dimensione (`bytes`) al
// momento del caricamento, e sommiamo. È una stima molto fedele (è la stessa
// dimensione che è stata davvero inviata), non un valore letto in tempo reale.
const CLOUDINARY_FREE_BYTES = 25 * 1024 * 1024 * 1024;

function updateStorageIndicator(){
  const label = document.getElementById('refs-storage-label');
  const fill = document.getElementById('refs-storage-fill');
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
  updateStorageIndicator();
  // Il collegamento a Drive è UNO per tutta l'app (il token è globale): la sua
  // riga vive quindi a livello di References, visibile in ogni vista. Stava
  // dentro il tab Albi di una cartella, e sembrava legata a quella cartella.
  renderDriveRow();
  const browserEl = document.getElementById('refs-folder-browser');
  const galleryEl = document.getElementById('refs-gallery-view');
  const crumb = document.getElementById('refs-breadcrumb');
  if(!browserEl || !galleryEl) return;

  if(_view === 'folders'){
    browserEl.style.display = 'block';
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

// ── RENDER: RIGA STATO GOOGLE DRIVE ──
function renderDriveRow(){
  const el = document.getElementById('refs-drive-row');
  if(!el) return;
  if(!isDriveConfigured()){ el.style.display = 'none'; return; }
  el.style.display = 'flex';
  if(isDriveConnected()){
    const email = driveAccountEmail();
    el.innerHTML = `<span class="drive-status-connected">${DRIVE_ICO} Drive collegato${email ? ' · '+esc(email) : ''}</span>
      <button class="drive-disconnect-btn" onclick="window.disconnectDriveUI()">Scollega</button>`;
  } else {
    el.innerHTML = `<button class="drive-connect-btn" onclick="window.connectDriveAndSync()">${DRIVE_ICO} Connetti Google Drive</button>`;
  }
}

// ── RENDER: SCAFFALE ALBI ──
function renderAlbumsShelf(){
  const grid = document.getElementById('refs-albums-grid');
  const empty = document.querySelector('.refs-albums-empty');
  if(!grid) return;
  const list = getAlbumsInFolder(_activeFolderId);

  if(!list.length){
    grid.innerHTML = '';
    grid.style.display = 'none';
    if(empty) empty.style.display = 'flex';
    return;
  }
  if(empty) empty.style.display = 'none';
  grid.style.display = 'grid';
  grid.innerHTML = list.map(a=>{
    const isDrive = !!a.driveFileId;
    const badge = isDrive
      ? `<span class="album-src-badge src-drive" title="Da Google Drive — si apre da solo">${DRIVE_ICO}</span>`
      : `<span class="album-src-badge src-local" title="Solo su questo dispositivo — va riselezionato">${PHONE_ICO}</span>`;
    return `
    <div class="album-card ${isDrive ? 'is-drive' : 'is-local'}" data-id="${a.id}">
      <div class="album-cover">
        <img src="${a.cover||''}" loading="lazy" alt=""/>
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

  let html = `
    <div class="refs-quicklink" onclick="window.openAllGrid()">
      <span class="refs-quicklink-ico">▦</span>
      <span class="refs-quicklink-lbl">All</span>
      <span class="refs-quicklink-count">${_refs.length}</span>
    </div>`;

  if(cats.size === 0){
    html += `<div class="refs-folders-empty">Ancora nessuna cartella. Crea la prima categoria (es. "Artists" o "Study") per iniziare a organizzare le tue reference.</div>`;
  }

  cats.forEach((folders, category)=>{
    html += `<div class="refs-cat-row">
      <span class="refs-cat-name">${esc(category)}</span>
    </div>`;
    folders.forEach(f=>{
      html += `<div class="refs-folder-row" onclick="window.openFolder('${f.id}')">
        <span class="refs-folder-ico">${FOLDER_ICON}</span>
        <span class="refs-folder-name">${esc(f.name)}</span>
        <span class="refs-folder-count">${countInFolder(f.id)}</span>
        <button class="refs-folder-menu" onclick="event.stopPropagation();window.refsFolderMenu('${f.id}',this)" aria-label="Altro">⋯</button>
      </div>`;
    });
  });

  // Unica azione di questa vista: qui si organizzano contenitori, non immagini.
  html += `<button class="refs-new-folder-row" onclick="window.promptNewFolderFlow(this)">
    <span class="refs-new-folder-ico">${FOLDER_ICON}</span>
    <span>Nuova cartella</span>
  </button>`;

  el.innerHTML = html;
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
function currentGridList(){
  if(_view === 'folder'){
    return _activeFolderId
      ? _refs.filter(r=>r.folderId===_activeFolderId)
      : _refs.filter(r=>!r.folderId);
  }
  return _refs;
}

export function renderRefsGrid(){
  const grid = document.getElementById('refs-grid');
  const empty = document.getElementById('refs-empty');
  if(!grid) return;

  const list = currentGridList();

  if(!list.length){
    grid.innerHTML='';
    if(empty) empty.style.display='flex';
    return;
  }
  if(empty) empty.style.display='none';

  grid.innerHTML = list.map(r=>`
    <div class="refs-thumb" data-id="${r.id}">
      <img src="${r.url}" loading="lazy" alt=""/>
    </div>
  `).join('');

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
  renderLightboxAt(_lightboxIndex);
}

function renderLightboxAt(index){
  if(index < 0 || index >= _lightboxList.length) return;
  _lightboxIndex = index;
  const item = _lightboxList[index];
  const ov = document.getElementById('refs-lightbox');
  const img = document.getElementById('refs-lightbox-img');
  const counter = document.getElementById('refs-lightbox-counter');
  const prevBtn = document.getElementById('refs-lightbox-prev');
  const nextBtn = document.getElementById('refs-lightbox-next');
  if(!ov || !img) return;
  img.src = item.url;
  resetImageZoom();
  ov.dataset.id = item.id;
  ov.classList.remove('chrome-hidden');
  if(counter) counter.textContent = (index+1)+' / '+_lightboxList.length;
  if(prevBtn) prevBtn.style.visibility = index>0 ? 'visible' : 'hidden';
  if(nextBtn) nextBtn.style.visibility = index<_lightboxList.length-1 ? 'visible' : 'hidden';
  ov.classList.add('open');
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
  resetImageZoom();
}

export function nextRefImage(){ renderLightboxAt(_lightboxIndex+1); }
export function prevRefImage(){ renderLightboxAt(_lightboxIndex-1); }

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
// per spostarti dentro la foto invece di cambiarla. ──
let _zoomScale = 1, _zoomX = 0, _zoomY = 0;
const ZOOM_IN = 2.6, ZOOM_MAX = 4;

export function resetImageZoom(){
  _zoomScale = 1; _zoomX = 0; _zoomY = 0;
  const img = document.getElementById('refs-lightbox-img');
  if(img){ img.style.transition = 'none'; applyZoomTransform(img); }
}

function clampPan(scale, x, y){
  const img = document.getElementById('refs-lightbox-img');
  if(!img) return {x, y};
  const r = img.getBoundingClientRect();
  const baseW = r.width / scale, baseH = r.height / scale;
  const maxX = Math.max(0, (baseW*scale - baseW)/2);
  const maxY = Math.max(0, (baseH*scale - baseH)/2);
  return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
}

function applyZoomTransform(img){
  img.style.transform = `translate(${_zoomX}px, ${_zoomY}px) scale(${_zoomScale})`;
  // il cursore "manina" appare solo quando c'è davvero qualcosa da spostare
  const body = document.getElementById('refs-lightbox-body');
  if(body) body.classList.toggle('zoomed', _zoomScale > 1.02);
}

// Alterna zoom 1x ↔ ZOOM_IN centrando sul punto indicato, con animazione.
function toggleZoomAt(clientX, clientY){
  const img = document.getElementById('refs-lightbox-img');
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

(function initLightboxGestures(){
  document.addEventListener('DOMContentLoaded', bind);
  if(document.readyState !== 'loading') bind();

  function bind(){
    const body = document.getElementById('refs-lightbox-body');
    const img = document.getElementById('refs-lightbox-img');
    if(!body || !img || body._gestureInit) return;
    body._gestureInit = true;

    let touches = [];
    let startDist = 0, startScale = 1;
    let panStartX = 0, panStartY = 0, panOrigX = 0, panOrigY = 0;
    let swipeStartX = 0, swipeStartY = 0;
    let isPinching = false, isPanning = false;
    let lastTapTime = 0, lastTapX = 0, lastTapY = 0, singleTapTimer = null;

    function dist(t0, t1){ return Math.hypot(t1.clientX-t0.clientX, t1.clientY-t0.clientY); }

    let lastTouchAt = 0;
    body.addEventListener('touchstart', e=>{
      lastTouchAt = Date.now();
      touches = Array.from(e.touches);
      img.style.transition = 'none';
      if(touches.length === 2){
        isPinching = true; isPanning = false;
        startDist = dist(touches[0], touches[1]);
        startScale = _zoomScale;
      } else if(touches.length === 1){
        isPinching = false;
        swipeStartX = touches[0].clientX; swipeStartY = touches[0].clientY;
        if(_zoomScale > 1.02){
          isPanning = true;
          panStartX = touches[0].clientX; panStartY = touches[0].clientY;
          panOrigX = _zoomX; panOrigY = _zoomY;
        } else {
          isPanning = false;
        }
      }
    }, {passive:true});

    body.addEventListener('touchmove', e=>{
      touches = Array.from(e.touches);
      if(isPinching && touches.length === 2){
        const nd = dist(touches[0], touches[1]);
        _zoomScale = Math.min(ZOOM_MAX, Math.max(1, startScale * (nd/startDist)));
        const c = clampPan(_zoomScale, _zoomX, _zoomY);
        _zoomX = c.x; _zoomY = c.y;
        applyZoomTransform(img);
      } else if(isPanning && touches.length === 1){
        const dx = touches[0].clientX - panStartX;
        const dy = touches[0].clientY - panStartY;
        const c = clampPan(_zoomScale, panOrigX+dx, panOrigY+dy);
        _zoomX = c.x; _zoomY = c.y;
        applyZoomTransform(img);
      }
    }, {passive:true});

    body.addEventListener('touchend', e=>{
      if(isPinching){
        isPinching = false;
        if(_zoomScale < 1.05){ resetImageZoom(); img.style.transition = 'transform .18s'; }
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
      // swipe per cambiare immagine (solo a 1x) o doppio tap per zoomare
      const t = e.changedTouches[0];
      const dx = t.clientX - swipeStartX, dy = t.clientY - swipeStartY;
      const moved = Math.hypot(dx, dy);
      if(_zoomScale <= 1.02 && moved > 55 && Math.abs(dx) > Math.abs(dy)*1.4){
        if(dx < 0) nextRefImage(); else prevRefImage();
        return;
      }
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

    // Desktop: doppio clic per zoomare/dezoomare. I browser mobile generano
    // anche un "dblclick" sintetico dopo un doppio tap reale: se lo lasciassimo
    // passare, zoomerebbe una seconda volta annullando quello già fatto dal
    // gestore touch sopra. Lo ignoriamo se c'è stato un tocco nell'ultimo secondo.
    img.addEventListener('dblclick', e=>{
      if(Date.now() - lastTouchAt < 1000) return;
      toggleZoomAt(e.clientX, e.clientY);
    });

    // Desktop: rotella per zoomare, con lo zoom centrato sul puntatore
    body.addEventListener('wheel', e=>{
      const ov = document.getElementById('refs-lightbox');
      if(!ov || !ov.classList.contains('open')) return;
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
    img.addEventListener('mousedown', e=>{
      if(_zoomScale <= 1.02) return;
      if(Date.now() - lastTouchAt < 1000) return;
      e.preventDefault();
      mDown = true;
      mStartX = e.clientX; mStartY = e.clientY;
      mOrigX = _zoomX; mOrigY = _zoomY;
      body.classList.add('grabbing');
      img.style.transition = 'none';
    });
    window.addEventListener('mousemove', e=>{
      if(!mDown) return;
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
      url: item.url, source: item.source||'file', projectId: item.projectId||null,
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
