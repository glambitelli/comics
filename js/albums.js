// ── ALBI — lettore CBZ/CBR in-browser + ritaglio → Frammento ──
// Filosofia: l'albo NON viene mai ospitato sul cloud. Lo apri dal disco, lo
// sfogli qui, e SOLO ciò che ritagli (una tavola, un pannello, una pagina
// intera) diventa un Frammento su Cloudinary, con la provenienza attaccata
// (opera + pagina). L'unica altra immagine caricata è una copertina piccola
// per lo scaffale (vedi createAlbumFromCurrent). Zero storage per i volumi.
//
// I .cbz (ZIP di immagini) si estraggono con fflate, vendorizzato e sempre
// caricato. I .cbr (RAR) usano libarchive.js (WASM), caricato via import()
// dinamico SOLO al primo .cbr aperto — chi legge solo .cbz non lo scarica mai.
// Entrambi i formati popolano _pages nello stesso identico formato
// [{name,url,blob}], quindi reader/ritaglio/scaffale non sanno da dove viene.

import { unzipSync } from './vendor/fflate.js';
import {
  addRefBlob, getActiveFolderId, findExactAlbumMatch, createAlbumDoc,
  updateAlbumLastPage, updateAlbumSourceName, getAlbumById, findAlbumByDriveId,
} from './refs.js';
import { uploadToCloudinary } from './cloudinary.js';
import { downloadDriveFileAsFile, ensureDriveConnected } from './drive.js';
import { haptic } from './state.js';

// Stato dell'albo attualmente aperto
let _pages = [];        // [{ name, url (objectURL), blob }]
let _idx = 0;
let _albumName = '';
let _albumSig = '';     // firma nome+peso, per ricordare l'ultima pagina letta
let _reader = null;     // riferimento all'overlay DOM (creato lazy una volta)
let _clipMode = false;
let _currentAlbumId = null;  // doc refAlbums collegato alla lettura in corso (null se fuori da una cartella)
// Impostato da refs.js quando si tocca una copertina dello scaffale: il
// prossimo file scelto dal picker viene confrontato con QUESTO albo atteso
// (non con l'intero scaffale) prima di decidere se è una riapertura.
let _pendingReopen = null;

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

// Estrae le pagine di un .cbz (ZIP) con fflate. Ritorna l'array di pagine nel
// formato comune [{name,url,blob}], già filtrato e ordinato — lo stesso
// formato che popolerà _pages qualunque sia il contenitore di origine.
function extractZipPages(buf){
  const entries = unzipSync(buf);
  const names = Object.keys(entries).filter(isImageEntry).sort(naturalCompare);
  return names.map(n=>{
    const blob = new Blob([entries[n]], { type: mimeFor(n) });
    return { name: n, url: URL.createObjectURL(blob), blob };
  });
}

function clampIdx(i){ return (i < 0 || i >= _pages.length) ? 0 : i; }

// Estrae le pagine di un .cbr (RAR) con libarchive.js (WASM). Caricata solo
// qui, al primo .cbr aperto: i .cbz non la toccano mai, così il grosso del
// bundle (~1MB di WASM) non pesa su chi legge solo .cbz. Il lavoro pesante
// gira già in un web worker dentro la libreria: il main thread resta libero.
async function extractRarPages(file){
  const { Archive } = await import('./vendor/libarchive/libarchive.js');
  Archive.init({ workerUrl: new URL('./vendor/libarchive/worker-bundle.js', import.meta.url) });

  const archive = await Archive.open(file);
  let n = 0;
  await archive.extractFiles(()=>{ n++; toast('Estrazione in corso… ' + n + ' file'); });
  const arr = await archive.getFilesArray(); // [{file:File, path:string}]

  const withNames = arr
    .map(({file, path})=>({ name: (path||'') + file.name, file }))
    .filter(e=>isImageEntry(e.name))
    .sort((a,b)=>naturalCompare(a.name, b.name));

  return withNames.map(({name, file})=>({ name, url: URL.createObjectURL(file), blob: file }));
}

// Riconosce il formato dalla firma dei byte (ZIP = "PK\x03\x04", RAR =
// "Rar!\x1a\x07") ed estrae le pagine. Condivisa tra l'apertura da file
// locale e quella da Google Drive: a valle nessuna delle due sa più da dove
// sono arrivati davvero i byte, sono solo pagine [{name,url,blob}].
async function extractPagesForFile(file){
  const nameLc = file.name.toLowerCase();
  let buf;
  try{ buf = new Uint8Array(await file.arrayBuffer()); }
  catch(e){ throw new Error('Non riesco a leggere il file.'); }

  const isZip = buf[0] === 0x50 && buf[1] === 0x4B;
  const isRar = buf[0] === 0x52 && buf[1] === 0x61 && buf[2] === 0x72 && buf[3] === 0x21;

  if(isRar || nameLc.endsWith('.cbr')){
    try{ return await extractRarPages(file); }
    catch(e){ console.error('rar', e); throw new Error('Questo .cbr è illeggibile, danneggiato o cifrato.'); }
  }
  if(isZip){
    try{ return extractZipPages(buf); }
    catch(e){ console.error('unzip', e); throw new Error('Questo .cbz è illeggibile o danneggiato.'); }
  }
  throw new Error('Formato non riconosciuto: serve un .cbz o .cbr.');
}

// ── APERTURA ALBO (file locale) ─────────────────────────────────────────────
export async function openAlbumFromFile(file){
  if(!file) return;
  // Consuma subito il bersaglio in sospeso: qualunque esito di questa apertura
  // (match, mismatch, o errore) non deve restare "in attesa" per la prossima.
  const pendingReopen = _pendingReopen;
  _pendingReopen = null;

  toast('Apro l\'albo…');
  let pages;
  try{ pages = await extractPagesForFile(file); }
  catch(e){ toast(e.message, true); return; }

  if(!pages.length){ toast('Nessuna pagina trovata dentro l\'albo.', true); return; }

  clearPages();
  _pages = pages;
  _albumName = file.name.replace(/\.(cbz|cbr|zip|rar)$/i, '');
  _albumSig  = file.name + ':' + file.size;
  _currentAlbumId = null;

  const folderId = getActiveFolderId();
  if(folderId){
    // Bersaglio noto (si è toccata una copertina dello scaffale): priorità a
    // nome+peso identici, poi solo peso (rinomina da cloud drive). Altrimenti
    // ricadiamo sul match esatto contro l'intera cartella, come per l'apertura
    // "libera" dal bottone principale — evita comunque i doppioni.
    let matched = null, renamed = false;
    if(pendingReopen){
      if(pendingReopen.sourceName === file.name && pendingReopen.sourceSize === file.size){
        matched = pendingReopen;
      } else if(pendingReopen.sourceSize === file.size){
        matched = pendingReopen; renamed = true;
      }
    }
    if(!matched) matched = findExactAlbumMatch(folderId, file.name, file.size);

    if(matched){
      _currentAlbumId = matched.id;
      _albumName = matched.title || _albumName;
      _idx = clampIdx(matched.lastPage || 0);
      if(renamed) updateAlbumSourceName(matched.id, file.name);
    } else {
      _idx = 0; // bersaglio sbagliato o albo mai visto: si parte da capo
    }
  } else {
    _idx = clampIdx(loadReadingPos(_albumSig));
  }

  toast('');
  openReader();

  // Prima apertura riuscita in questa cartella: crea la scheda con copertina.
  // Non blocca la lettura, che è già partita.
  if(folderId && !_currentAlbumId){
    createAlbumFromCurrent(folderId, file).catch(e=>console.warn('creazione scheda albo fallita:', e));
  }
}

// Punto d'ingresso dal file input (bottone "Apri un albo" o tap su una
// copertina dello scaffale). `reopenTarget` — passato da refs.js — è la
// scheda refAlbums attesa quando si riapre da una copertina; assente per
// l'apertura libera dal bottone principale.
export function openAlbumPicker(reopenTarget){
  _pendingReopen = reopenTarget || null;
  const input = document.getElementById('album-file-input');
  if(input) input.click();
}

// ── COPERTINA (scaffale) ────────────────────────────────────────────────────
const COVER_MAX_DIM = 500;
const COVER_MAX_BYTES = 80000;

// Preferisce una pagina il cui nome suggerisce che sia proprio la copertina
// (scan spesso la include come "00 - cover.jpg" fuori sequenza numerica);
// altrimenti la prima pagina del volume.
function pickCoverPage(pages){
  const i = pages.findIndex(p=>/cover|front/i.test(p.name));
  return pages[i >= 0 ? i : 0];
}

async function makeCoverBlob(pageBlob){
  const im = await blobToImage(pageBlob);
  let w = im.naturalWidth, h = im.naturalHeight;
  if(w >= h){ h = Math.round(h * COVER_MAX_DIM / w); w = COVER_MAX_DIM; }
  else { w = Math.round(w * COVER_MAX_DIM / h); h = COVER_MAX_DIM; }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(im, 0, 0, w, h);
  if(im._objurl) URL.revokeObjectURL(im._objurl);

  let quality = 0.82;
  const encode = ()=> new Promise(res=> canvas.toBlob(res, 'image/jpeg', quality));
  let blob = await encode();
  while(blob && blob.size > COVER_MAX_BYTES && quality > 0.4){
    quality = Math.max(0.4, quality - 0.1);
    blob = await encode();
  }
  return blob;
}

async function createAlbumFromCurrent(folderId, file){
  const page = pickCoverPage(_pages);
  if(!page) return;
  const coverBlob = await makeCoverBlob(page.blob);
  if(!coverBlob) return;
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  const { url } = await uploadToCloudinary(coverBlob, 'cover-'+tag+'.jpg');
  const albumId = await createAlbumDoc({
    folderId, title: _albumName, cover: url, pageCount: _pages.length,
    sourceName: file.name, sourceSize: file.size, lastPage: _idx,
  });
  // Se nel frattempo l'utente ha già chiuso e riaperto un altro albo, non
  // agganciare più i cambi pagina a questa scheda: la sessione corrente vince.
  if(_albumSig === file.name+':'+file.size) _currentAlbumId = albumId;
}

// ── GOOGLE DRIVE — sync in background + apertura senza picker ──────────────
// Per ogni file trovato nella sottocartella Drive di una cartella-autore che
// non ha ancora una scheda: lo scarica una volta, genera copertina e conteggio
// pagine esattamente come per un file locale, e scrive la scheda con
// driveFileId agganciato. Da quel momento la copertina appare da sola nello
// scaffale e riaprirla non passerà mai più dal selettore file. Lavora su un
// array di pagine tutto suo (mai su _pages/_idx): se l'utente ha un albo
// aperto mentre la sync gira in background, non deve accorgersene.
export async function createAlbumFromDriveFile(folderId, driveFile){
  if(findAlbumByDriveId(folderId, driveFile.id)) return;
  let file;
  try{ file = await downloadDriveFileAsFile(driveFile); }
  catch(e){ console.warn('drive sync: download fallito per', driveFile.name, e.message); return; }

  let pages;
  try{ pages = await extractPagesForFile(file); }
  catch(e){ console.warn('drive sync: estrazione fallita per', driveFile.name, e.message); return; }
  if(!pages.length) return;

  const coverPage = pickCoverPage(pages);
  let coverBlob = null;
  if(coverPage){
    try{ coverBlob = await makeCoverBlob(coverPage.blob); }
    catch(e){ console.warn('drive sync: copertina fallita per', driveFile.name, e.message); }
  }
  pages.forEach(p=>{ try{ URL.revokeObjectURL(p.url); }catch(e){} }); // solo la copertina serve ora, il resto si riscarica all'apertura
  if(!coverBlob) return;

  let url;
  try{
    const tag = Date.now().toString(36) + Math.random().toString(36).slice(2,8);
    ({ url } = await uploadToCloudinary(coverBlob, 'cover-'+tag+'.jpg'));
  }catch(e){ console.warn('drive sync: upload copertina fallito per', driveFile.name, e.message); return; }

  await createAlbumDoc({
    folderId, title: file.name.replace(/\.(cbz|cbr)$/i,''), cover: url, pageCount: pages.length,
    sourceName: file.name, sourceSize: file.size, lastPage: 0,
    driveFileId: driveFile.id,
  });
}

// Tap su una copertina agganciata a Drive: niente selettore file, si scarica
// e si apre direttamente. Il match è certo (stesso driveFileId), quindi si
// collega subito alla scheda esistente riprendendo dall'ultima pagina letta.
export async function openAlbumFromDrive(albumId){
  const a = getAlbumById(albumId);
  if(!a || !a.driveFileId) return;
  toast('Scarico da Drive…');
  if(!(await ensureDriveConnected())){ toast('Ricollega Google Drive per aprire questo albo.', true); return; }
  let file;
  try{ file = await downloadDriveFileAsFile({ id: a.driveFileId, name: a.sourceName || (a.title||'albo') }); }
  catch(e){ toast('Impossibile scaricare da Drive: '+e.message, true); return; }

  let pages;
  try{ pages = await extractPagesForFile(file); }
  catch(e){ toast(e.message, true); return; }
  if(!pages.length){ toast('Nessuna pagina trovata dentro l\'albo.', true); return; }

  clearPages();
  _pages = pages;
  _albumName = a.title || file.name.replace(/\.(cbz|cbr)$/i,'');
  _albumSig = file.name + ':' + file.size;
  _currentAlbumId = a.id;
  _idx = clampIdx(a.lastPage || 0);
  toast('');
  openReader();
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
      <button class="ar-nav ar-prev" aria-label="Precedente" data-act="prev">
        <svg viewBox="0 0 24 24" width="26" height="26"><path d="M14.5 6.5 8.5 12l6 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="ar-nav ar-next" aria-label="Successiva" data-act="next">
        <svg viewBox="0 0 24 24" width="26" height="26"><path d="M9.5 6.5 15.5 12l-6 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
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
  // Zero-padding sul numero corrente: a larghezza fissa il contatore non
  // "salta" passando da una cifra a due (9 → 10), come in un lettore vero.
  const pad = String(_pages.length).length;
  _reader.querySelector('.ar-counter').textContent = String(_idx + 1).padStart(pad, '0') + ' / ' + _pages.length;
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
  if(_currentAlbumId) updateAlbumLastPage(_currentAlbumId, _idx);
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
