// ── LIBRERIA RIFERIMENTI — immagini reference fuori dai progetti ──
// Storage: i file binari vivono su Firebase Storage (bucket già configurato).
// Firestore: solo i metadati (url, path, data, tag progetto opzionale).
import { db, collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp } from './firebase.js';
import { projects, haptic, showUndoToast } from './state.js';
import { compressImageFile } from './imgcompress.js';

const REFS_COL = 'refs';
let _refs = [];        // cache locale, popolata dal listener realtime
let _unsub = null;
let _activeFilter = null; // projectId o null (tutte)

function genId(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

// ── SALVATAGGIO — comprime lato browser e salva come data-URI dentro Firestore ──
// (niente Firebase Storage/Blaze: tutto resta nel piano gratuito Spark)
// file: File/Blob immagine. source: 'drop'|'paste'|'share'|'file'.
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

// Carica più file in sequenza (drop multiplo, share con più immagini)
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

// ── REALTIME LISTENER ──
export function startRefsListener(){
  if(_unsub) return;
  _unsub = onSnapshot(collection(db, REFS_COL), snap=>{
    _refs = snap.docs.map(d=>({id:d.id, ...d.data()}))
      .sort((a,b)=>{
        const ta=a.addedAt&&a.addedAt.toMillis?a.addedAt.toMillis():0;
        const tb=b.addedAt&&b.addedAt.toMillis?b.addedAt.toMillis():0;
        return tb-ta;
      });
    renderRefsGrid();
  }, err=>console.warn('refs listener error:', err));
}

export function getRefs(){ return _refs; }

// ── RENDER GRIGLIA ──
export function setRefsFilter(projectId){
  _activeFilter = projectId;
  renderRefsGrid();
}

function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

export function renderRefsGrid(){
  const grid = document.getElementById('refs-grid');
  const empty = document.getElementById('refs-empty');
  const filterBar = document.getElementById('refs-filter-bar');
  if(!grid) return;

  // barra filtro per progetto (solo se esistono progetti)
  if(filterBar){
    let fb = `<button class="refs-filter-chip${_activeFilter===null?' active':''}" onclick="window.setRefsFilter(null)">Tutte</button>`;
    projects.forEach(p=>{
      fb += `<button class="refs-filter-chip${_activeFilter===p.id?' active':''}" onclick="window.setRefsFilter('${p.id}')">${esc(p.title)}</button>`;
    });
    filterBar.innerHTML = fb;
    filterBar.style.display = projects.length ? 'flex' : 'none';
  }

  const list = _activeFilter ? _refs.filter(r=>r.projectId===_activeFilter) : _refs;

  if(!list.length){
    grid.innerHTML='';
    if(empty) empty.style.display='flex';
    return;
  }
  if(empty) empty.style.display='none';

  grid.innerHTML = list.map(r=>`
    <div class="refs-thumb" data-id="${r.id}" onclick="window.openRefLightbox('${r.id}')">
      <img src="${r.url}" loading="lazy" alt=""/>
    </div>
  `).join('');
}

// ── LIGHTBOX ──
export function openRefLightbox(id){
  const item = _refs.find(r=>r.id===id);
  if(!item) return;
  const ov = document.getElementById('refs-lightbox');
  const img = document.getElementById('refs-lightbox-img');
  const sel = document.getElementById('refs-lightbox-project');
  if(!ov || !img) return;
  img.src = item.url;
  ov.dataset.id = id;
  if(sel){
    sel.innerHTML = '<option value="">Nessun progetto</option>' +
      projects.map(p=>`<option value="${p.id}"${p.id===item.projectId?' selected':''}>${esc(p.title)}</option>`).join('');
  }
  ov.classList.add('open');
}

export function closeRefLightbox(){
  const ov = document.getElementById('refs-lightbox');
  if(ov) ov.classList.remove('open');
}

export function onRefLightboxProjectChange(sel){
  const ov = document.getElementById('refs-lightbox');
  const id = ov && ov.dataset.id;
  if(!id) return;
  assignRefToProject(id, sel.value || null);
}

export function deleteCurrentRefImage(){
  const ov = document.getElementById('refs-lightbox');
  const id = ov && ov.dataset.id;
  if(!id) return;
  const item = _refs.find(r=>r.id===id);
  closeRefLightbox();
  haptic('done');
  deleteRefImage(id);
  // il data-URI è già in memoria (arrivava dal listener realtime), quindi qui
  // l'undo è un vero ripristino: basta riscrivere lo stesso documento.
  showUndoToast('Immagine eliminata', ()=>{
    if(!item) return;
    setDoc(doc(db, REFS_COL, id), {
      url: item.url, source: item.source||'file', projectId: item.projectId||null,
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
    // Rete di sicurezza: se la schermata References è aperta, un trascinamento
    // che sfiora appena fuori dalla zona non deve mai far aprire l'immagine nel browser.
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
    if(!dropZone.classList.contains('active')) return; // solo se la schermata References è aperta
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
