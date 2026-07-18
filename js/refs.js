// ── LIBRERIA REFERENCES — immagini reference fuori dai progetti ──
// Firestore: metadati + immagine compressa come data-URI (niente Storage/Blaze).
// Organizzazione a cartelle per categoria (es. "Artists" → "Hiroyuki Okiura",
// "Study (Temporary)" → "Hands"), oltre al tag progetto già esistente.
import { db, collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp } from './firebase.js';
import { projects, haptic, showUndoToast } from './state.js';
import { compressImageFile } from './imgcompress.js';

const REFS_COL = 'refs';
const FOLDERS_COL = 'refFolders';

let _refs = [];          // cache locale immagini, dal listener realtime
let _folders = [];       // cache locale cartelle {id, category, name, createdAt}
let _refsUnsub = null;
let _foldersUnsub = null;
let _activeProjectFilter = null; // usato solo nella vista "Tutte"
let _view = 'folders';           // 'folders' | 'all' | 'folder'
let _activeFolderId = null;

function genId(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}
function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── SALVATAGGIO IMMAGINE ──
// Cattura sempre istantanea e senza cartella: si archivia dopo, dal lightbox,
// così drag&drop/incolla/condivisione restano al primo colpo.
export async function addRefImage(file, source='file'){
  if(!file || !file.type || !file.type.startsWith('image/')){
    console.warn('addRefImage: file non immagine ignorato', file&&file.type);
    return null;
  }
  const id = genId();
  try{
    const { dataUrl, w, h } = await compressImageFile(file);
    const data = {
      url: dataUrl, source,
      projectId: null,
      folderId: null,
      tag: null,
      addedAt: serverTimestamp(),
      w, h,
    };
    await setDoc(doc(db, REFS_COL, id), data);
    return id;
  }catch(e){
    console.error('addRefImage errore:', e);
    return null;
  }
}

export async function addRefImages(fileList, source='file'){
  const files = Array.from(fileList).filter(f=>f.type && f.type.startsWith('image/'));
  if(!files.length) return 0;
  let ok=0;
  for(const f of files){
    const id = await addRefImage(f, source);
    if(id) ok++;
  }
  if(ok===0){
    alert('Non sono riuscito a salvare l\'immagine. Controlla la connessione e riprova — se il problema persiste potrebbero servire le regole di Firestore per la collezione "refs".');
  }
  return ok;
}

export async function deleteRefImage(id){
  await deleteDoc(doc(db, REFS_COL, id));
}

export function assignRefToProject(id, projectId){
  setDoc(doc(db, REFS_COL, id), {projectId: projectId||null}, {merge:true});
}
export function assignRefToFolder(id, folderId){
  setDoc(doc(db, REFS_COL, id), {folderId: folderId||null}, {merge:true});
}
export function assignRefTag(id, tag){
  const clean = (tag||'').trim().slice(0, 24) || null;
  setDoc(doc(db, REFS_COL, id), {tag: clean}, {merge:true});
  const item = _refs.find(r=>r.id===id);
  if(item) item.tag = clean; // aggiorna la cache locale così la griglia si ridisegna subito
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
    }, err=>console.warn('refs listener error:', err));
  }
  if(!_foldersUnsub){
    _foldersUnsub = onSnapshot(collection(db, FOLDERS_COL), snap=>{
      _folders = snap.docs.map(d=>({id:d.id, ...d.data()}));
      renderRefsScreen();
    }, err=>console.warn('refFolders listener error:', err));
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
export function setRefsFilter(projectId){
  _activeProjectFilter = projectId;
  renderRefsScreen();
}

export async function promptNewFolder(category){
  let cat = category;
  if(!cat){
    cat = window.prompt('Nome della categoria (es. Artists, Study)');
    if(cat === null) return;
    cat = cat.trim();
    if(!cat) return;
  }
  const name = window.prompt('Nome della cartella'+(cat?` in "${cat}"`:''));
  if(name === null) return;
  const id = await createFolder(cat, name);
  if(id){ haptic('done'); openFolder(id); }
}

export function promptRenameFolder(id){
  const f = _folders.find(x=>x.id===id);
  if(!f) return;
  const nv = window.prompt('Rinomina cartella', f.name||'');
  if(nv === null) return;
  renameFolder(id, nv);
}

export function promptDeleteFolder(id){
  const f = _folders.find(x=>x.id===id);
  if(!f) return;
  const n = countInFolder(id);
  const msg = n>0
    ? `Eliminare la cartella "${f.name}"? Le ${n} immagini al suo interno non verranno cancellate, torneranno solo senza cartella.`
    : `Eliminare la cartella "${f.name}"?`;
  if(!confirm(msg)) return;
  deleteFolder(id);
  openFolderBrowser();
}

// ── SPAZIO OCCUPATO ──
// Le immagini vivono come data-URI dentro i documenti Firestore: la lunghezza
// del campo `url` corrisponde 1:1 ai byte realmente salvati. Il piano gratuito
// Spark concede 1GiB di storage Firestore totale (progetti + reference).
const FIRESTORE_FREE_BYTES = 1024*1024*1024;

function updateStorageIndicator(){
  const label = document.getElementById('refs-storage-label');
  const fill = document.getElementById('refs-storage-fill');
  if(!label || !fill) return;
  const used = _refs.reduce((sum,r)=> sum + (r.url ? r.url.length : 0), 0);
  const mb = used / (1024*1024);
  const pct = Math.min(100, (used / FIRESTORE_FREE_BYTES) * 100);
  label.textContent = (mb < 0.1 ? '<0.1' : mb.toFixed(1)) + ' MB su 1 GB';
  fill.style.width = Math.max(pct, used>0 ? 0.6 : 0) + '%';
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
        if(_view === 'all') nameEl.textContent = 'Tutte le immagini';
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
  const uncategorized = _refs.filter(r=>!r.folderId).length;
  const cats = foldersByCategory();

  let html = `
    <div class="refs-quicklink" onclick="window.openAllGrid()">
      <span class="refs-quicklink-ico">▦</span>
      <span class="refs-quicklink-lbl">Tutte le immagini</span>
      <span class="refs-quicklink-count">${_refs.length}</span>
    </div>`;
  if(uncategorized>0){
    html += `
    <div class="refs-quicklink" onclick="window.openFolder(null)">
      <span class="refs-quicklink-ico">${FOLDER_ICON}</span>
      <span class="refs-quicklink-lbl">Senza cartella</span>
      <span class="refs-quicklink-count">${uncategorized}</span>
    </div>`;
  }

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
        <button class="refs-folder-menu" onclick="event.stopPropagation();window.refsFolderMenu('${f.id}')" aria-label="Altro">⋯</button>
      </div>`;
    });
  });

  html += `<button class="refs-new-cat-btn" onclick="window.promptNewFolder()">+ Nuova categoria</button>`;

  el.innerHTML = html;
}

export function refsFolderMenu(id){
  const f = _folders.find(x=>x.id===id);
  if(!f) return;
  const choice = window.prompt('Scrivi "rinomina" o "elimina" per '+f.name, 'rinomina');
  if(choice === null) return;
  if(choice.trim().toLowerCase().startsWith('elim')) promptDeleteFolder(id);
  else if(choice.trim().toLowerCase().startsWith('rinom')) promptRenameFolder(id);
}

// ── RENDER: GALLERIA (vista "Tutte" o cartella singola) ──
function currentGridList(){
  if(_view === 'folder'){
    return _activeFolderId
      ? _refs.filter(r=>r.folderId===_activeFolderId)
      : _refs.filter(r=>!r.folderId);
  }
  return _activeProjectFilter ? _refs.filter(r=>r.projectId===_activeProjectFilter) : _refs;
}

export function renderRefsGrid(){
  const grid = document.getElementById('refs-grid');
  const empty = document.getElementById('refs-empty');
  const filterBar = document.getElementById('refs-filter-bar');
  if(!grid) return;

  if(filterBar){
    if(_view === 'all'){
      let fb = `<button class="refs-filter-chip${_activeProjectFilter===null?' active':''}" onclick="window.setRefsFilter(null)">Tutte</button>`;
      projects.forEach(p=>{
        fb += `<button class="refs-filter-chip${_activeProjectFilter===p.id?' active':''}" onclick="window.setRefsFilter('${p.id}')">${esc(p.title)}</button>`;
      });
      filterBar.innerHTML = fb;
      filterBar.style.display = projects.length ? 'flex' : 'none';
    } else {
      filterBar.style.display = 'none';
    }
  }

  const list = currentGridList();

  if(!list.length){
    grid.innerHTML='';
    if(empty) empty.style.display='flex';
    return;
  }
  if(empty) empty.style.display='none';

  grid.innerHTML = list.map(r=>`
    <div class="refs-thumb" data-id="${r.id}" onclick="window.openRefLightbox('${r.id}')">
      <img src="${r.url}" loading="lazy" alt=""/>
      ${r.tag ? `<span class="refs-tag-badge">${esc(r.tag)}</span>` : ''}
    </div>
  `).join('');
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
  const id = item.id;
  const ov = document.getElementById('refs-lightbox');
  const img = document.getElementById('refs-lightbox-img');
  const projSel = document.getElementById('refs-lightbox-project');
  const folderSel = document.getElementById('refs-lightbox-folder');
  const counter = document.getElementById('refs-lightbox-counter');
  const tagInput = document.getElementById('refs-lightbox-tag');
  const prevBtn = document.getElementById('refs-lightbox-prev');
  const nextBtn = document.getElementById('refs-lightbox-next');
  if(!ov || !img) return;
  img.src = item.url;
  ov.dataset.id = id;
  if(counter) counter.textContent = (index+1)+' / '+_lightboxList.length;
  if(tagInput) tagInput.value = item.tag || '';
  if(prevBtn) prevBtn.style.visibility = index>0 ? 'visible' : 'hidden';
  if(nextBtn) nextBtn.style.visibility = index<_lightboxList.length-1 ? 'visible' : 'hidden';
  if(projSel){
    projSel.innerHTML = '<option value="">Nessun progetto</option>' +
      projects.map(p=>`<option value="${p.id}"${p.id===item.projectId?' selected':''}>${esc(p.title)}</option>`).join('');
  }
  if(folderSel){
    const cats = foldersByCategory();
    let opts = '<option value="">Nessuna cartella</option>';
    cats.forEach((folders, category)=>{
      opts += `<optgroup label="${esc(category)}">`;
      folders.forEach(f=>{
        opts += `<option value="${f.id}"${f.id===item.folderId?' selected':''}>${esc(f.name)}</option>`;
      });
      opts += `</optgroup>`;
    });
    opts += '<option value="__new__">+ Nuova cartella…</option>';
    folderSel.innerHTML = opts;
  }
  ov.classList.add('open');
}

export function closeRefLightbox(){
  const ov = document.getElementById('refs-lightbox');
  if(ov) ov.classList.remove('open');
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

// Swipe (mobile): trascinamento orizzontale sull'immagine per scorrere
(function initLightboxSwipe(){
  let sx=0, sy=0, dragging=false;
  document.addEventListener('DOMContentLoaded', bind);
  if(document.readyState !== 'loading') bind();
  function bind(){
    const body = document.getElementById('refs-lightbox-body');
    if(!body || body._swipeInit) return;
    body._swipeInit = true;
    body.addEventListener('touchstart', e=>{
      if(e.touches.length!==1) return;
      sx=e.touches[0].clientX; sy=e.touches[0].clientY; dragging=true;
    }, {passive:true});
    body.addEventListener('touchend', e=>{
      if(!dragging) return;
      dragging=false;
      const dx = (e.changedTouches[0].clientX)-sx;
      const dy = (e.changedTouches[0].clientY)-sy;
      if(Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)*1.4){
        if(dx < 0) nextRefImage(); else prevRefImage();
      }
    }, {passive:true});
  }
})();

export function onRefLightboxProjectChange(sel){
  const ov = document.getElementById('refs-lightbox');
  const id = ov && ov.dataset.id;
  if(!id) return;
  assignRefToProject(id, sel.value || null);
}

export function onRefLightboxTagChange(input){
  const ov = document.getElementById('refs-lightbox');
  const id = ov && ov.dataset.id;
  if(!id) return;
  assignRefTag(id, input.value);
}

export async function onRefLightboxFolderChange(sel){
  const ov = document.getElementById('refs-lightbox');
  const id = ov && ov.dataset.id;
  if(!id) return;
  if(sel.value === '__new__'){
    const cat = window.prompt('Nome della categoria (es. Artists, Study)');
    if(cat === null || !cat.trim()){ openRefLightbox(id); return; }
    const name = window.prompt('Nome della cartella in "'+cat.trim()+'"');
    if(name === null || !name.trim()){ openRefLightbox(id); return; }
    const newId = await createFolder(cat.trim(), name.trim());
    if(newId) assignRefToFolder(id, newId);
    return;
  }
  assignRefToFolder(id, sel.value || null);
}

export function deleteCurrentRefImage(){
  const ov = document.getElementById('refs-lightbox');
  const id = ov && ov.dataset.id;
  if(!id) return;
  const item = _refs.find(r=>r.id===id);
  closeRefLightbox();
  haptic('done');
  deleteRefImage(id);
  showUndoToast('Immagine eliminata', ()=>{
    if(!item) return;
    setDoc(doc(db, REFS_COL, id), {
      url: item.url, source: item.source||'file', projectId: item.projectId||null,
      folderId: item.folderId||null, tag: item.tag||null,
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
