// ── ALBI — lettore CBZ in-browser + ritaglio → Frammento ──
// Filosofia: l'albo NON viene mai ospitato sul cloud. Lo apri dal disco, lo
// sfogli qui, e SOLO ciò che ritagli (una tavola, un pannello, una pagina
// intera) diventa un Frammento su Cloudinary, con la provenienza attaccata
// (opera + pagina). Zero storage per i volumi, zero banda, zero manutenzione.
//
// Questo primo drop gestisce i .cbz (ZIP di immagini) con fflate vendorizzato.
// Il .cbr (RAR) arriverà come step successivo, caricando libarchive.js in modo
// lazy solo quando serve — l'architettura qui sotto è già pronta ad accoglierlo
// (basta popolare `_pages` allo stesso modo).

import { unzipSync } from './vendor/fflate.js';
import { addRefBlob, getActiveFolderId } from './refs.js';
import { haptic } from './state.js';

// Stato dell'albo attualmente aperto
let _pages = [];        // [{ name, url (objectURL), blob }]
let _idx = 0;
let _albumName = '';
let _albumSig = '';     // firma nome+peso, per ricordare l'ultima pagina letta
let _reader = null;     // riferimento all'overlay DOM (creato lazy una volta)
let _clipMode = false;

// ── UTIL ──────────────────────────────────────────────────────────────────
const IMG_RE = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;
const _collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// Ordinamento "naturale": p2.jpg prima di p10.jpg (il .sort() lessicografico
// sbaglierebbe). Cruciale, altrimenti le pagine escono in ordine sparso.
function naturalCompare(a, b){ return _collator.compare(a, b); }

// Filtra le voci che non sono pagine vere: cartelle, file nascosti, spazzatura
// dello scanner (__MACOSX, Thumbs.db, .nfo, credit dello zip…).
function isImageEntry(name){
  if(!name || name.endsWith('/')) return false;
  if(/^__MACOSX/i.test(name)) return false;
  const base = name.split('/').pop();
  if(!base || base.startsWith('.')) return false;
  if(/^thumbs\.db$/i.test(base)) return false;
  return IMG_RE.test(base);
}

function mimeFor(name){
  const ext = (name.split('.').pop() || '').toLowerCase();
  if(ext === 'png') return 'image/png';
  if(ext === 'gif') return 'image/gif';
  if(ext === 'webp') return 'image/webp';
  if(ext === 'avif') return 'image/avif';
  if(ext === 'bmp') return 'image/bmp';
  return 'image/jpeg';
}

function readingPosKey(sig){ return 'inkflow-album-pos:' + sig; }
function loadReadingPos(sig){
  try{ const v = parseInt(localStorage.getItem(readingPosKey(sig)) || '0', 10); return isNaN(v) ? 0 : v; }
  catch(e){ return 0; }
}
function saveReadingPos(){
  try{ if(_albumSig) localStorage.setItem(readingPosKey(_albumSig), String(_idx)); }catch(e){}
}

function toast(msg, isError){
  // Riusa l'indicatore di stato già presente nella schermata References.
  const el = document.getElementById('refs-upload-status');
  if(el){
    el.className = 'refs-upload-status show ' + (isError ? 'error' : 'ok');
    el.textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(()=>{ el.className='refs-upload-status'; el.textContent=''; }, isError ? 6000 : 2600);
    return;
  }
  console[isError ? 'warn' : 'log']('[albi]', msg);
}

function clearPages(){
  _pages.forEach(p=>{ try{ URL.revokeObjectURL(p.url); }catch(e){} });
  _pages = [];
}

// ── APERTURA ALBO ───────────────────────────────────────────────────────────
export async function openAlbumFromFile(file){
  if(!file) return;
  const nameLc = file.name.toLowerCase();
  toast('Apro l\'albo…');
  let buf;
  try{ buf = new Uint8Array(await file.arrayBuffer()); }
  catch(e){ toast('Non riesco a leggere il file.', true); return; }

  // Firma dei formati: ZIP = "PK\x03\x04", RAR = "Rar!\x1a\x07".
  const isZip = buf[0] === 0x50 && buf[1] === 0x4B;
  const isRar = buf[0] === 0x52 && buf[1] === 0x61 && buf[2] === 0x72 && buf[3] === 0x21;

  if(isRar || nameLc.endsWith('.cbr')){
    toast('I .cbr arrivano nel prossimo aggiornamento — per ora usa un .cbz.', true);
    return;
  }
  if(!isZip){
    toast('Formato non riconosciuto: serve un .cbz.', true);
    return;
  }

  let entries;
  try{ entries = unzipSync(buf); }
  catch(e){ console.error('unzip', e); toast('Questo .cbz è illeggibile o danneggiato.', true); return; }

  const names = Object.keys(entries).filter(isImageEntry).sort(naturalCompare);
  if(!names.length){ toast('Nessuna pagina trovata dentro l\'albo.', true); return; }

  clearPages();
  _pages = names.map(n=>{
    const blob = new Blob([entries[n]], { type: mimeFor(n) });
    return { name: n, url: URL.createObjectURL(blob), blob };
  });
  _albumName = file.name.replace(/\.(cbz|cbr|zip)$/i, '');
  _albumSig  = file.name + ':' + file.size;
  _idx = loadReadingPos(_albumSig);
  if(_idx < 0 || _idx >= _pages.length) _idx = 0;

  toast('');
  openReader();
}

// Punto d'ingresso dal file input (bottone "Apri un albo").
export function openAlbumPicker(){
  const input = document.getElementById('album-file-input');
  if(input) input.click();
}

// ── READER (overlay a schermo intero) ───────────────────────────────────────
function buildReaderDOM(){
  const ov = document.createElement('div');
  ov.id = 'album-reader';
  ov.className = 'album-reader';
  ov.innerHTML = `
    <div class="ar-topbar">
      <button class="ar-btn ar-close" aria-label="Chiudi" data-act="close">‹</button>
      <span class="ar-title"></span>
      <div class="ar-top-actions">
        <button class="ar-btn ar-clip" aria-label="Ritaglia" data-act="clip">
          <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="6.5" cy="6.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="6.5" cy="17.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.6 8.2 20 18 M8.6 15.8 20 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>
        </button>
        <button class="ar-btn ar-savepage" aria-label="Salva pagina" data-act="savepage">
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19.5h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>
    <div class="ar-stage">
      <img class="ar-img" alt="">
      <div class="ar-cliplayer" hidden><div class="ar-clipbox" hidden></div></div>
      <button class="ar-nav ar-prev" aria-label="Precedente" data-act="prev">‹</button>
      <button class="ar-nav ar-next" aria-label="Successiva" data-act="next">›</button>
    </div>
    <div class="ar-bottombar">
      <span class="ar-counter"></span>
      <div class="ar-clip-hint" hidden>Trascina un riquadro sulla pagina · <button class="ar-cancelclip" data-act="cancelclip">annulla</button></div>
    </div>`;
  document.body.appendChild(ov);

  ov.addEventListener('click', e=>{
    const b = e.target.closest('[data-act]');
    if(!b) return;
    const act = b.dataset.act;
    if(act === 'close') closeReader();
    else if(act === 'prev') gotoPage(_idx - 1);
    else if(act === 'next') gotoPage(_idx + 1);
    else if(act === 'clip') toggleClip();
    else if(act === 'cancelclip') toggleClip(false);
    else if(act === 'savepage') saveWholePage();
  });

  // Tap sul centro dell'immagine (fuori clip) = avanti; bordo sinistro = indietro.
  // Gestito dai bottoni ar-nav; qui aggiungiamo tastiera e swipe.
  document.addEventListener('keydown', e=>{
    if(!ov.classList.contains('open')) return;
    if(e.key === 'ArrowRight' || e.key === ' ') gotoPage(_idx + 1);
    else if(e.key === 'ArrowLeft') gotoPage(_idx - 1);
    else if(e.key === 'Escape'){ if(_clipMode) toggleClip(false); else closeReader(); }
  });

  wireSwipe(ov);
  wireClip(ov);
  _reader = ov;
  return ov;
}

function openReader(){
  const ov = _reader || buildReaderDOM();
  ov.querySelector('.ar-title').textContent = _albumName;
  ov.classList.add('open');
  document.body.classList.add('album-reading');
  renderPage();
}

function closeReader(){
  if(!_reader) return;
  saveReadingPos();
  if(_clipMode) toggleClip(false);
  _reader.classList.remove('open');
  document.body.classList.remove('album-reading');
  // Le pagine restano in memoria finché non apri un altro albo: riaprire lo
  // stesso file dal picker le ricrea comunque. Le liberiamo alla prossima apertura.
}

function renderPage(){
  if(!_reader || !_pages.length) return;
  const img = _reader.querySelector('.ar-img');
  const page = _pages[_idx];
  img.src = page.url;
  _reader.querySelector('.ar-counter').textContent = (_idx + 1) + ' / ' + _pages.length;
  // Prefetch leggero della pagina successiva e precedente (decodifica anticipata).
  [_idx + 1, _idx - 1].forEach(i=>{
    if(i >= 0 && i < _pages.length){ const im = new Image(); im.src = _pages[i].url; }
  });
  _reader.querySelector('.ar-prev').style.visibility = _idx > 0 ? 'visible' : 'hidden';
  _reader.querySelector('.ar-next').style.visibility = _idx < _pages.length - 1 ? 'visible' : 'hidden';
}

function gotoPage(i){
  if(_clipMode) return; // in ritaglio la navigazione è disattivata
  if(i < 0 || i >= _pages.length) return;
  _idx = i;
  saveReadingPos();
  renderPage();
}

// ── SWIPE (mobile) ──────────────────────────────────────────────────────────
function wireSwipe(ov){
  const stage = ov.querySelector('.ar-stage');
  let x0 = 0, y0 = 0, active = false;
  stage.addEventListener('touchstart', e=>{
    if(_clipMode) return;
    active = true; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchend', e=>{
    if(!active || _clipMode) return; active = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if(Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3){
      if(dx < 0) gotoPage(_idx + 1); else gotoPage(_idx - 1);
    }
  }, { passive: true });
}

// ── RITAGLIO ────────────────────────────────────────────────────────────────
// Rettangolo di selezione sopra la pagina → crop a piena risoluzione dal blob
// originale → compressione → Frammento nella cartella corrente, con provenienza.
function toggleClip(force){
  const next = (typeof force === 'boolean') ? force : !_clipMode;
  _clipMode = next;
  const layer = _reader.querySelector('.ar-cliplayer');
  const hint = _reader.querySelector('.ar-clip-hint');
  const box = _reader.querySelector('.ar-clipbox');
  _reader.querySelector('.ar-clip').classList.toggle('active', _clipMode);
  layer.hidden = !_clipMode;
  hint.hidden = !_clipMode;
  box.hidden = true;
  _reader.querySelector('.ar-prev').style.display = _clipMode ? 'none' : '';
  _reader.querySelector('.ar-next').style.display = _clipMode ? 'none' : '';
  if(_clipMode) haptic('tap');
}

// Rettangolo dell'immagine effettivamente renderizzata dentro l'<img> (object-fit
// contain lascia bande vuote): serve per mappare i pixel schermo → pixel reali.
function renderedImageRect(img){
  const cw = img.clientWidth, ch = img.clientHeight;
  const nw = img.naturalWidth, nh = img.naturalHeight;
  if(!nw || !nh) return { x:0, y:0, w:cw, h:ch, scale:1 };
  const scale = Math.min(cw / nw, ch / nh);
  const w = nw * scale, h = nh * scale;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h, scale };
}

function wireClip(ov){
  const layer = ov.querySelector('.ar-cliplayer');
  const box = ov.querySelector('.ar-clipbox');
  const img = ov.querySelector('.ar-img');
  let sx = 0, sy = 0, drawing = false;

  const start = (px, py)=>{
    const r = layer.getBoundingClientRect();
    sx = px - r.left; sy = py - r.top;
    drawing = true;
    box.hidden = false;
    box.style.left = sx + 'px'; box.style.top = sy + 'px';
    box.style.width = '0px'; box.style.height = '0px';
  };
  const move = (px, py)=>{
    if(!drawing) return;
    const r = layer.getBoundingClientRect();
    const cx = Math.max(0, Math.min(px - r.left, r.width));
    const cy = Math.max(0, Math.min(py - r.top, r.height));
    box.style.left = Math.min(sx, cx) + 'px';
    box.style.top = Math.min(sy, cy) + 'px';
    box.style.width = Math.abs(cx - sx) + 'px';
    box.style.height = Math.abs(cy - sy) + 'px';
  };
  const end = ()=>{
    if(!drawing) return; drawing = false;
    const bw = parseFloat(box.style.width), bh = parseFloat(box.style.height);
    if(bw < 12 || bh < 12){ box.hidden = true; return; } // tocco accidentale
    commitClip(img, {
      left: parseFloat(box.style.left), top: parseFloat(box.style.top), width: bw, height: bh
    });
  };

  layer.addEventListener('mousedown', e=>{ e.preventDefault(); start(e.clientX, e.clientY); });
  window.addEventListener('mousemove', e=>{ if(drawing) move(e.clientX, e.clientY); });
  window.addEventListener('mouseup', ()=>{ if(drawing) end(); });
  layer.addEventListener('touchstart', e=>{ start(e.touches[0].clientX, e.touches[0].clientY); }, { passive:true });
  layer.addEventListener('touchmove', e=>{ move(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }, { passive:false });
  layer.addEventListener('touchend', end, { passive:true });
}

// Ritaglia il rettangolo selezionato dalla pagina a piena risoluzione.
async function commitClip(img, sel){
  const rect = renderedImageRect(img);
  // Coordinate del riquadro relative all'immagine renderizzata (tolte le bande).
  const relX = sel.left - rect.x, relY = sel.top - rect.y;
  const cropX = Math.max(0, relX / rect.scale);
  const cropY = Math.max(0, relY / rect.scale);
  const cropW = Math.min(img.naturalWidth  - cropX, sel.width  / rect.scale);
  const cropH = Math.min(img.naturalHeight - cropY, sel.height / rect.scale);
  if(cropW < 4 || cropH < 4){ toggleClip(false); return; }

  await exportCropAndSave(_pages[_idx].blob, cropX, cropY, cropW, cropH);
  toggleClip(false);
}

// Salva l'intera pagina corrente come Frammento.
async function saveWholePage(){
  const page = _pages[_idx];
  const im = await blobToImage(page.blob);
  await exportCropAndSave(page.blob, 0, 0, im.naturalWidth, im.naturalHeight);
}

function blobToImage(blob){
  return new Promise((res, rej)=>{
    const url = URL.createObjectURL(blob);
    const im = new Image();
    im.onload = ()=>{ res(im); };
    im.onerror = ()=>{ URL.revokeObjectURL(url); rej(new Error('img')); };
    im.src = url;
    im._objurl = url;
  });
}

const CLIP_MAX_DIM = 2000;
const CLIP_MAX_BYTES = 1400000;

// Disegna il crop su canvas (con cap dimensionale), comprime in JPEG e lo
// consegna a refs.js che lo carica su Cloudinary e scrive il Frammento con
// provenienza { opera, pagina }.
async function exportCropAndSave(sourceBlob, cx, cy, cw, ch){
  toast('Ritaglio in corso…');
  let im;
  try{ im = await blobToImage(sourceBlob); }
  catch(e){ toast('Ritaglio fallito.', true); return; }

  let w = Math.round(cw), h = Math.round(ch);
  if(w > CLIP_MAX_DIM || h > CLIP_MAX_DIM){
    if(w >= h){ h = Math.round(h * CLIP_MAX_DIM / w); w = CLIP_MAX_DIM; }
    else { w = Math.round(w * CLIP_MAX_DIM / h); h = CLIP_MAX_DIM; }
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(im, cx, cy, cw, ch, 0, 0, w, h);
  if(im._objurl) URL.revokeObjectURL(im._objurl);

  let quality = 0.88;
  const encode = ()=> new Promise(res=> canvas.toBlob(res, 'image/jpeg', quality));
  let blob = await encode();
  while(blob && blob.size > CLIP_MAX_BYTES && quality > 0.5){
    quality = Math.max(0.5, quality - 0.1);
    blob = await encode();
  }
  if(!blob){ toast('Ritaglio fallito.', true); return; }

  const folderId = getActiveFolderId();
  const id = await addRefBlob(blob, {
    folderId,
    source: 'clip',
    provenance: { opera: _albumName, pagina: _idx + 1 },
    w, h
  });
  if(id){ haptic('done'); toast('Frammento salvato ✓'); }
  else { toast('Salvataggio del frammento fallito.', true); }
}

// ── INIT ────────────────────────────────────────────────────────────────────
export function initAlbums(){
  const input = document.getElementById('album-file-input');
  if(input && !input.dataset.wired){
    input.dataset.wired = '1';
    input.addEventListener('change', async ()=>{
      if(input.files && input.files.length){
        await openAlbumFromFile(input.files[0]);
        input.value = '';
      }
    });
  }
}
