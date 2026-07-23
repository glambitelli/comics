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

const REFS_COL = 'refs';
const FOLDERS_COL = 'refFolders';

let _refs = [];          // cache locale immagini, dal listener realtime
let _folders = [];       // cache locale cartelle {id, category, name, createdAt}
let _refsUnsub = null;
let _foldersUnsub = null;
let _view = 'folders';           // 'folders' | 'all' | 'folder'
let _activeFolderId = null;
let _lastUploadError = '';

function genId(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}
function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Formatta i metadati di un'immagine: "1920×1080 · 340 KB · 22 lug 2026"
function formatRefMeta(item){
  const parts = [];
  if(item.w && item.h) parts.push(`${item.w}×${item.h}`);
  if(typeof item.bytes === 'number'){
    const kb = item.bytes/1024;
    parts.push(kb < 1024 ? Math.round(kb)+' KB' : (kb/1024).toFixed(1)+' MB');
  }
  if(item.addedAt && item.addedAt.toDate){
    const d = item.addedAt.toDate();
    const MESI = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
    parts.push(d.getDate()+' '+MESI[d.getMonth()]+' '+d.getFullYear());
  }
  return parts.join(' · ');
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

// ── LISTENER REALTIME ──
export function startRefsListener(){
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
  const browserEl = document.getElementById('refs-folder-browser');
  const galleryEl = document.getElementById('refs-gallery-view');
  const crumb = document.getElementById('refs-breadcrumb');
  if(!browserEl || !galleryEl) return;

  if(_view === 'folders'){
    browserEl.style.display = 'block';
    galleryEl.style.display = 'none';
    if(crumb) crumb.style.display = 'none';
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
    renderRefsGrid();
  }
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
      <button class="refs-cat-add" onclick="window.promptNewFolder('${esc(category).replace(/'/g,"\\'")}')" aria-label="Nuova cartella">+</button>
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

  html += `<button class="refs-new-folder-row" onclick="window.promptNewFolderFlow(this)">
    <span class="refs-new-folder-plus">+</span>
    <span>Nuova cartella</span>
  </button>`;
  html += `<button class="refs-inline-add" onclick="document.getElementById('refs-file-input').click()" aria-label="Aggiungi immagine">
    <span class="refs-inline-add-circle">+</span>
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
  const metaEl = document.getElementById('refs-lightbox-meta');
  if(metaEl) metaEl.textContent = formatRefMeta(item);
  if(prevBtn) prevBtn.style.visibility = index>0 ? 'visible' : 'hidden';
  if(nextBtn) nextBtn.style.visibility = index<_lightboxList.length-1 ? 'visible' : 'hidden';
  ov.classList.add('open');
}

export function closeRefLightbox(){
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

    body.addEventListener('touchstart', e=>{
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

    // Desktop: doppio clic per zoomare/dezoomare
    img.addEventListener('dblclick', e=>{ toggleZoomAt(e.clientX, e.clientY); });
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
