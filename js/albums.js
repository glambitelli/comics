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
// Entrambi producono una "sorgente pagine" con la stessa interfaccia (vedi
// zipSource), quindi reader/ritaglio/scaffale non sanno da dove viene.
// In entrambi i casi la lettura è PIGRA: si conosce subito l'elenco delle
// tavole, ma ognuna si estrae solo quando la si guarda davvero — aprire un
// volume non costa più il tempo e la memoria di scompattarlo tutto.
//
// Da Google Drive valgono due strategie diverse, perché i due casi hanno
// esigenze opposte:
//  · COPERTINE (sync dello scaffale): serve una tavola sola, quindi si legge
//    l'albo a intervalli via HTTP Range (zipremote.js) senza scaricarlo —
//    popolare una cartella con molti volumi costa KB invece di centinaia di MB.
//  · LETTURA: si scarica il file intero una volta e si tiene in cache locale.
//    Sembrava meglio leggere anche qui a intervalli, ma così ogni cambio
//    pagina pagava la latenza di rete: su 4G molto peggio di un'attesa sola
//    all'inizio seguita da uno sfogliare del tutto immediato.

import { unzipSync } from './vendor/fflate.js';
import {
  addRefBlob, getActiveFolderId, findExactAlbumMatch, createAlbumDoc,
  updateAlbumLastPage, updateAlbumSourceName, getAlbumById, findAlbumByDriveId,
  clipDestinations, clipCategories, getFolderName, rememberClipDest,
} from './refs.js';
import { uploadToCloudinary } from './cloudinary.js';
import { getDriveAlbumFile, ensureDriveConnected } from './drive.js';
import { openRemoteZipSource, openBlobZipSource } from './zipremote.js';
import { haptic } from './state.js';
import { actionMenu } from './dialogs.js';

// Stato dell'albo attualmente aperto
let _pages = [];        // [{ name, url (objectURL|null), blob (Blob|null) }]
let _source = null;     // sorgente pagine dell'albo aperto (vedi zipSource)
let _prefetchT = null;  // timer del prefetch pagine vicine
let _openToken = 0;     // identifica l'ultima apertura richiesta (vedi openAlbumFromDrive)
let _zoom = 1, _zx = 0, _zy = 0;  // stato zoom/pan della tavola a schermo
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

// I nomi delle cartelle li scrive l'utente e finiscono dentro HTML (pastiglie
// di destinazione del ritaglio): vanno sempre neutralizzati, apici doppi
// compresi perché entrano anche in attributi.
function escAttr(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

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

// `persistent`: per i messaggi "in corso" (download, estrazione…) — non si
// nasconde da solo dopo pochi secondi, altrimenti su un'operazione più lenta
// del solito il banner sparirebbe mentre il lavoro vero continua dietro le
// quinte, sembrando che l'app si sia bloccata o non abbia fatto nulla. Resta
// visibile finché non arriva la prossima chiamata (conferma o errore, che
// invece si nascondono da soli) o toast('') a fine operazione.
function toast(msg, isError, persistent){
  // Il lettore è un overlay a schermo intero SOPRA la schermata References:
  // l'indicatore di stato di quella schermata (usato quando si ritaglia da
  // fuori dal lettore, es. da un'altra vista) resterebbe nascosto dietro.
  // Quando il lettore è aperto usiamo un banner tutto suo, sempre visibile.
  const inReader = _reader && _reader.classList.contains('open');
  const el = inReader
    ? _reader.querySelector('.ar-toast')
    : document.getElementById('refs-upload-status');
  if(el){
    const base = inReader ? 'ar-toast show' : 'refs-upload-status show';
    el.className = base + ' ' + (isError ? 'error' : 'ok');
    el.textContent = msg;
    clearTimeout(el._t);
    if(!persistent){
      el._t = setTimeout(()=>{ el.className = inReader ? 'ar-toast' : 'refs-upload-status'; el.textContent=''; }, isError ? 6000 : 2600);
    }
    // Glifo di caricamento: solo nel lettore, solo per gli stati "sto
    // lavorando" (persistent e non errore) mentre si APRE l'albo — non
    // durante il ritaglio (toast('Ritaglio in corso…') è persistent anche
    // lui, ma lì sotto c'è sempre una pagina visibile: il glifo grande al
    // centro la coprirebbe invece di aiutare).
    if(inReader){
      const glyph = _reader.querySelector('.ar-loading-glyph');
      if(glyph){
        const on = !!persistent && !isError && !_clipMode;
        // Il riempimento si ferma pieno a fine corsa (vedi CSS): riaprendolo
        // per un albo successivo va fatto ripartire da vuoto esplicitamente,
        // altrimenti lo si ritroverebbe già pieno dalla volta prima.
        if(on && !glyph.classList.contains('show')){
          fitLoadingGlyphFill();
          if(!_glyphFitted && document.fonts && document.fonts.ready){
            // Font non ancora pronto: rimisura appena arriva, il glifo resta
            // comunque visibile nel frattempo.
            document.fonts.ready.then(fitLoadingGlyphFill);
          }
          glyph.classList.add('reset');
          void glyph.offsetWidth;
          glyph.classList.remove('reset');
        }
        glyph.classList.toggle('show', on);
      }
    }
    return;
  }
  console[isError ? 'warn' : 'log']('[albi]', msg);
}

// Il rettangolo che "riempie" il glifo era fisso a 0,0 100×100, ma il ✦ di
// Castoro NON sta in quel riquadro: la sua punta superiore arriva a y≈-23 e la
// base si ferma a y≈77. Risultato, la punta restava fuori dal clip e non si
// riempiva MAI, e il primo quinto dell'animazione scorreva a vuoto sotto la
// base. Qui il rettangolo si misura sul glifo vero — a font caricato, perché
// col serif di ripiego le metriche sono altre — così il riempimento parte
// esattamente dalla base e arriva esattamente alla punta.
let _glyphFitted = false;
function fitLoadingGlyphFill(){
  if(_glyphFitted || !_reader) return;
  const ghost = _reader.querySelector('.ar-loading-glyph .star-ghost');
  const rect  = _reader.querySelector('.ar-loading-glyph .fill-rect');
  if(!ghost || !rect) return;
  let b;
  try{ b = ghost.getBBox(); }catch(e){ return; }
  if(!b || !b.height) return;
  // Un filo di margine: gli angoli arrotondati del tratto possono sbordare di
  // una frazione di unità, e mezzo pixel non riempito si vede.
  rect.setAttribute('x', b.x - 1);
  rect.setAttribute('y', b.y - 1);
  rect.setAttribute('width',  b.width  + 2);
  rect.setAttribute('height', b.height + 2);
  _glyphFitted = true;
}

function clearPages(){
  _pages.forEach(p=>{ try{ if(p.url) URL.revokeObjectURL(p.url); }catch(e){} });
  _pages = [];
  // Il .cbr tiene vivo un worker con l'archivio aperto finché si legge:
  // chiudendo l'albo va spento, altrimenti resta appeso a consumare memoria.
  if(_source && _source.close){ try{ _source.close(); }catch(e){} }
  _source = null;
}

// ── SORGENTE PAGINE ────────────────────────────────────────────────────────
// Astrae da dove arrivano i byte di ogni tavola: { pages, getData(name) }.
// Entrambi i formati sono PIGRI: i nomi delle tavole si conoscono tutti
// subito, ma ognuna viene estratta solo quando la si guarda davvero. Il
// resto del lettore non vede la differenza tra .cbz, .cbr e Drive.

// Materializza (se serve) il Blob di una pagina. Asincrona: la sorgente
// remota (Drive via Range HTTP) fa una vera richiesta di rete per tavola; la
// sorgente locale (getData sincrona) risolve comunque all'istante, un
// `await` su un valore non-Promise non costa nulla.
async function pageBlob(src, page){
  if(!page) return null;
  if(page.blob) return page.blob;
  if(!src || !src.getData) return null;
  const data = await src.getData(page.name);
  if(!data) return null;
  // Lo ZIP restituisce byte grezzi, il RAR un File già pronto: nel secondo
  // caso si usa com'è, senza ricopiarlo in un Blob nuovo.
  page.blob = (data instanceof Blob) ? data : new Blob([data], { type: mimeFor(page.name) });
  return page.blob;
}
async function pageUrl(src, page){
  if(page && page.url) return page.url;
  const blob = await pageBlob(src, page);
  if(!blob) return '';
  page.url = URL.createObjectURL(blob);
  return page.url;
}

// Tiene materializzate solo le pagine vicine a quella corrente: oltre quella
// distanza il Blob viene liberato (si ricrea in un lampo al bisogno). Evita
// che sfogliando un volume intero la memoria cresca fino all'albo completo.
// Solo per sorgenti pigre: con il .cbr quei Blob sono l'unica copia esistente.
const PAGE_WINDOW = 3;
function trimPages(){
  if(!_source || !_source.getData) return;
  for(let i = 0; i < _pages.length; i++){
    const p = _pages[i];
    if(p.url && Math.abs(i - _idx) > PAGE_WINDOW){
      try{ URL.revokeObjectURL(p.url); }catch(e){}
      p.url = null; p.blob = null;
    }
  }
}

// Sorgente .cbz. L'elenco delle tavole si ottiene camminando SOLO la directory
// dello ZIP: il filtro di fflate scarta ogni voce, quindi legge le intestazioni
// senza decomprimere niente. Poi si estrae una tavola per volta.
// Prima si decomprimeva l'albo INTERO per mostrarne una pagina: su un volume
// da 50MB erano tre passate da 50MB (unzip + Blob + objectURL per ~190 file)
// sul thread principale, cioè secondi di blocco e centinaia di MB occupati.
function zipSource(buf){
  const names = [];
  unzipSync(buf, { filter: f => { if(isImageEntry(f.name)) names.push(f.name); return false; } });
  names.sort(naturalCompare);
  return {
    pages: names.map(n=>({ name: n, url: null, blob: null })),
    getData(name){ return unzipSync(buf, { filter: f => f.name === name })[name]; },
  };
}

function clampIdx(i){ return (i < 0 || i >= _pages.length) ? 0 : i; }

// Estrae le pagine di un .cbr (RAR) con libarchive.js (WASM). Caricata solo
// qui, al primo .cbr aperto: i .cbz non la toccano mai, così il grosso del
// bundle (~1MB di WASM) non pesa su chi legge solo .cbz. Il lavoro pesante
// gira già in un web worker dentro la libreria: il main thread resta libero.
//
// Come per lo ZIP, la lettura è PIGRA: all'apertura si chiede solo l'ELENCO
// delle tavole (listFiles), che non le estrae; ogni tavola viene poi tirata
// fuori singolarmente quando la si guarda davvero. Prima si chiamava
// extractFiles(), che le estraeva tutte in un colpo: su un volume da 200
// tavole erano una quindicina di secondi di attesa all'apertura, tutta la
// memoria occupata, e il contatore "Estrazione in corso… N file".
//
// Il worker va tenuto vivo finché l'albo resta aperto (lo chiude clearPages):
// è lui a custodire l'archivio da cui peschiamo le tavole su richiesta.
async function extractRarPages(file){
  const { Archive } = await import('./vendor/libarchive/libarchive.js');
  Archive.init({ workerUrl: new URL('./vendor/libarchive/worker-bundle.js', import.meta.url) });

  const archive = await Archive.open(file);
  const arr = await archive.getFilesArray(); // solo elenco: nessun dato estratto

  const entries = arr
    .map(({file, path})=>({ name: (path||'') + file.name, cf: file }))
    .filter(e=>isImageEntry(e.name))
    .sort((a,b)=>naturalCompare(a.name, b.name));

  const byName = new Map(entries.map(e=>[e.name, e.cf]));
  return {
    pages: entries.map(e=>({ name: e.name, url: null, blob: null })),
    async getData(name){
      const cf = byName.get(name);
      if(!cf) return null;
      return await cf.extract();   // File vero, estratto ora
    },
    close(){ try{ archive.close(); }catch(e){} },
  };
}

// Riconosce il formato dalla firma dei byte (ZIP = "PK\x03\x04", RAR =
// "Rar!\x1a\x07") e ne ricava la sorgente pagine. Condivisa tra l'apertura da
// file locale e quella da Google Drive: a valle nessuna delle due sa più da
// dove sono arrivati davvero i byte.
async function extractPagesForFile(file){
  const nameLc = file.name.toLowerCase();
  // Bastano i primi byte per riconoscere il formato: leggere l'intero file
  // solo per guardarne quattro significherebbe portarsi in memoria centinaia
  // di MB su un volume grosso, ed è proprio ciò che faceva morire la scheda.
  let head;
  try{ head = new Uint8Array(await file.slice(0, 8).arrayBuffer()); }
  catch(e){ throw new Error('Non riesco a leggere il file.'); }

  const isZip = head[0] === 0x50 && head[1] === 0x4B;
  const isRar = head[0] === 0x52 && head[1] === 0x61 && head[2] === 0x72 && head[3] === 0x21;

  if(isRar || nameLc.endsWith('.cbr')){
    try{ return await extractRarPages(file); }
    catch(e){ console.error('rar', e); throw new Error('Questo .cbr è illeggibile, danneggiato o cifrato.'); }
  }
  if(isZip){
    // Prima strada: leggere indice e tavole a pezzi dal Blob, senza mai
    // caricare l'albo in memoria. Se lo ZIP è fuori standard (zip64, indice
    // incoerente) si ripiega sulla lettura classica, che però il file lo
    // materializza tutto: accettabile solo perché è il caso raro.
    try{ return await openBlobZipSource(file, isImageEntry, naturalCompare); }
    catch(e){ console.warn('lettura ZIP a intervalli fallita, ripiego sul file intero:', e.message); }
    try{ return zipSource(new Uint8Array(await file.arrayBuffer())); }
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
  // Anche l'apertura da file locale annulla un eventuale scaricamento da Drive
  // ancora in corso: vince sempre l'ultimo albo richiesto (vedi _openToken).
  ++_openToken;

  // Il lettore si apre SUBITO (guscio vuoto + glifo di caricamento): prima si
  // apriva solo a fine estrazione, quindi il glifo — pensato apposta per
  // questa attesa — non compariva mai, e il messaggio di stato restava sulla
  // schermata References invece che nel lettore.
  openReaderShell(file.name.replace(/\.(cbz|cbr|zip|rar)$/i, ''));
  toast('', false, true); // solo il glifo: il testo generico è ridondante col titolo già in barra
  let src;
  try{ src = await extractPagesForFile(file); }
  catch(e){ toast(e.message, true); return; }

  if(!src.pages.length){ toast('Nessuna pagina trovata dentro l\'albo.', true); return; }

  clearPages();
  _source = src;
  _pages = src.pages;
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
  // Il guscio è già aperto: qui basta aggiornare il titolo (potrebbe essere
  // cambiato rispetto alla stima iniziale, se si è agganciato a una scheda
  // con un nome diverso dal file) e disegnare la prima pagina.
  _reader.querySelector('.ar-title').textContent = _albumName;
  renderPage();

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
  const coverBlob = await makeCoverBlob(await pageBlob(_source, page));
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
// Sorgente usata SOLO per generare la copertina in fase di sync: qui serve
// una tavola sola, quindi la lettura remota a intervalli (Range HTTP, vedi
// zipremote.js) è perfetta — popolare lo scaffale costa poche decine di KB
// per albo invece di scaricarli tutti interi.
//
// Per LEGGERE invece si scarica il file intero (vedi openAlbumFromDrive): a
// lettura avviata ogni cambio pagina dev'essere immediato, e una richiesta di
// rete per tavola su 4G è molto peggio di un unico download iniziale seguito
// da tutto istantaneo dalla cache locale.
async function openDriveCoverSource(driveFile){
  const name = driveFile.name || '';
  const size = Number(driveFile.size) || 0;
  if(/\.cbz$/i.test(name) && size > 0){
    try{
      const src = await openRemoteZipSource(driveFile.id, size, isImageEntry, naturalCompare);
      if(src.pages.length) return { file: { name, size }, src };
    }catch(e){ console.warn('lettura remota ZIP fallita, scarico il file intero:', e.message); }
  }
  const { file } = await getDriveAlbumFile(driveFile);
  const src = await extractPagesForFile(file);
  return { file, src };
}

// Per ogni file trovato nella sottocartella Drive di una cartella-autore che
// non ha ancora una scheda: genera copertina e conteggio pagine esattamente
// come per un file locale, e scrive la scheda con driveFileId agganciato. Da
// quel momento la copertina appare da sola nello scaffale e riaprirla non
// passerà mai più dal selettore file. Lavora su un array di pagine tutto suo
// (mai su _pages/_idx): se l'utente ha un albo aperto mentre la sync gira in
// background, non deve accorgersene.
export async function createAlbumFromDriveFile(folderId, driveFile){
  if(findAlbumByDriveId(folderId, driveFile.id)) return;
  let file, src;
  try{ ({ file, src } = await openDriveCoverSource(driveFile)); }
  catch(e){ console.warn('drive sync: apertura fallita per', driveFile.name, e.message); return; }
  const pages = src.pages;
  if(!pages.length) return;

  // Con la sorgente remota/pigra qui si legge UNA sola tavola (la copertina)
  // invece dell'albo intero: la sync di una cartella con molti volumi non
  // scarica più decine o centinaia di MB solo per generare le miniature.
  const coverPage = pickCoverPage(pages);
  let coverBlob = null;
  if(coverPage){
    try{ coverBlob = await makeCoverBlob(await pageBlob(src, coverPage)); }
    catch(e){ console.warn('drive sync: copertina fallita per', driveFile.name, e.message); }
  }
  pages.forEach(p=>{ try{ if(p.url) URL.revokeObjectURL(p.url); }catch(e){} });
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
  // Un download può durare minuti: nel frattempo si può tornare indietro e
  // aprire un altro albo (magari già in cache, quindi immediato). Questo
  // segnaposto rende l'apertura annullabile: se non è più l'ultima richiesta,
  // il suo avanzamento smette di scrivere a schermo — prima finiva sopra le
  // tavole dell'albo che si stava già leggendo — e a fine scaricamento non
  // scavalca l'albo aperto nel frattempo. Il file resta comunque in cache.
  const token = ++_openToken;
  // Guscio del lettore aperto SUBITO (vedi lo stesso ragionamento in
  // openAlbumFromFile): il titolo dell'album è già noto dalla scheda, non
  // serve aspettare il download per mostrarlo.
  openReaderShell(a.title || '');
  toast('', false, true);
  if(!(await ensureDriveConnected())){ toast('Ricollega Google Drive per aprire questo albo.', true); return; }
  if(token !== _openToken) return;
  // Per LEGGERE si prende il file intero: dalla cache locale se c'è (istantaneo,
  // zero rete), altrimenti un unico download che poi resta in cache. Leggere a
  // richieste di rete separate, una per tavola, sembrava furbo ma su 4G ogni
  // cambio pagina pagava la latenza: molto peggio di un'attesa sola all'inizio
  // e poi tutto immediato.
  let file;
  try{
    // Throttle del progresso: aggiornare il banner ad ogni blocco ricevuto
    // (migliaia su un file grande) è lavoro inutile sul thread principale.
    let lastPaint = 0;
    const r = await getDriveAlbumFile(
      { id: a.driveFileId, name: a.sourceName || (a.title||'albo') },
      (loaded, total)=>{
        if(token !== _openToken) return; // apertura superata: non disturbare
        const now = Date.now();
        if(now - lastPaint < 250 && (!total || loaded < total)) return;
        lastPaint = now;
        const mb = n => (n / 1048576).toFixed(1);
        toast('Scarico da Drive… ' + mb(loaded) + (total ? ' / ' + mb(total) + ' MB' : ' MB'), false, true);
      }
    );
    file = r.file;
  }catch(e){
    if(token === _openToken) toast('Impossibile scaricare da Drive: '+e.message, true);
    return;
  }
  if(token !== _openToken) return;

  toast('', false, true); // solo il glifo, come sopra
  let src;
  try{ src = await extractPagesForFile(file); }
  catch(e){ if(token === _openToken) toast(e.message, true); return; }
  if(token !== _openToken) return;
  if(!src.pages.length){ toast('Nessuna pagina trovata dentro l\'albo.', true); return; }

  clearPages();
  _source = src;
  _pages = src.pages;
  _albumName = a.title || file.name.replace(/\.(cbz|cbr)$/i,'');
  _albumSig = file.name + ':' + file.size;
  _currentAlbumId = a.id;
  _idx = clampIdx(a.lastPage || 0);
  toast('');
  _reader.querySelector('.ar-title').textContent = _albumName;
  renderPage();
}

// ── READER (overlay a schermo intero) ───────────────────────────────────────
function buildReaderDOM(){
  const ov = document.createElement('div');
  ov.id = 'album-reader';
  ov.className = 'album-reader';
  ov.innerHTML = `
    <div class="ar-topbar">
      <button class="ar-btn ar-close" aria-label="Chiudi" data-act="close">
        <svg viewBox="0 0 24 24" width="17" height="17"><path d="M6.5 6.5 17.5 17.5 M17.5 6.5 6.5 17.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>
      </button>
      <div class="ar-top-actions">
        <button class="ar-btn ar-clip" aria-label="Ritaglia" data-act="clip">
          <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="6.5" cy="6.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="6.5" cy="17.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.6 8.2 20 18 M8.6 15.8 20 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>
    <div class="ar-stage">
      <div class="ar-toast"></div>
      <div class="ar-loading-glyph" aria-hidden="true">
        <svg class="ff-glyph" viewBox="0 0 100 100">
          <defs><clipPath id="ar-loading-fill-clip" clipPathUnits="userSpaceOnUse">
            <rect x="0" y="0" width="100" height="100" class="fill-rect"/>
          </clipPath></defs>
          <text x="50" y="58" text-anchor="middle" font-size="90" class="star-ghost">✦</text>
          <text x="50" y="58" text-anchor="middle" font-size="90" class="star-fill" clip-path="url(#ar-loading-fill-clip)">✦</text>
        </svg>
      </div>
      <img class="ar-img active" alt="" decoding="async">
      <img class="ar-img" alt="" decoding="async">
      <div class="ar-cliplayer" hidden>
        <div class="ar-clipbox" hidden>
          <div class="ar-clip-handle" data-corner="nw"></div>
          <div class="ar-clip-handle" data-corner="ne"></div>
          <div class="ar-clip-handle" data-corner="se"></div>
          <div class="ar-clip-handle" data-corner="sw"></div>
        </div>
      </div>
      <button class="ar-nav ar-prev" aria-label="Precedente" data-act="prev">
        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="ar-nav ar-next" aria-label="Successiva" data-act="next">
        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M9 5 L16 12 L9 19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
    <div class="ar-bottombar">
      <div class="ar-controls">
        <input class="ar-seek" type="range" min="0" value="0" step="1" aria-label="Vai alla pagina">
        <div class="ar-controls-row">
          <span class="ar-counter"></span>
          <span class="ar-divider" aria-hidden="true"></span>
          <span class="ar-title"></span>
          <button class="ar-jump" data-act="first" aria-label="Prima pagina" title="Prima pagina">
            <svg viewBox="0 0 24 24" width="17" height="17"><path d="M18 5 L10 12 L18 19" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 5.5v13" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>
          </button>
          <button class="ar-jump" data-act="last" aria-label="Ultima pagina" title="Ultima pagina">
            <svg viewBox="0 0 24 24" width="17" height="17"><path d="M6 5 L14 12 L6 19" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 5.5v13" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>
      <div class="ar-clip-hint" hidden>
        <span class="ar-clip-hint-instruct">Trascina un riquadro sulla pagina · <button class="ar-cancelclip" data-act="cancelclip">annulla</button></span>
        <span class="ar-clip-hint-confirm" hidden>
          <button class="ar-cancelclip" data-act="retryclip">Riprova</button>
          <span class="ar-clip-dests"></span>
          <span class="ar-clip-more-wrap"></span>
        </span>
      </div>
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
    else if(act === 'first') gotoPage(0);
    else if(act === 'last') gotoPage(_pages.length - 1);
    else if(act === 'cancelclip') toggleClip(false);
    else if(act === 'retryclip'){ if(ov._clipRetry) ov._clipRetry(); }
    // La pastiglia della destinazione È la conferma: un gesto solo invece di
    // "conferma" e poi "scegli dove".
    else if(act === 'confirmclip'){ if(ov._clipConfirm) ov._clipConfirm(b.dataset.dest || null); }
    else if(act === 'catdest'){ e.stopPropagation(); if(ov._clipCatDests) ov._clipCatDests(b, +b.dataset.cat); }
  });

  // Tap sul centro dell'immagine (fuori clip) = avanti; bordo sinistro = indietro.
  // Gestito dai bottoni ar-nav; qui aggiungiamo tastiera e swipe.
  document.addEventListener('keydown', e=>{
    if(!ov.classList.contains('open')) return;
    if(e.key === 'ArrowRight' || e.key === ' ') gotoPage(_idx + 1);
    else if(e.key === 'ArrowLeft') gotoPage(_idx - 1);
    else if(e.key === 'Escape'){ if(_clipMode) toggleClip(false); else closeReader(); }
  });

  wireSeek(ov);
  wireGestures(ov);
  wireClip(ov);
  _reader = ov;
  return ov;
}

// Apre solo il guscio del lettore (chrome + overlay), senza disegnare
// nessuna pagina: usata per mostrare SUBITO il lettore — col glifo di
// caricamento — mentre l'albo si scarica/estrae ancora, invece di aprirlo
// solo a caricamento concluso (quando il messaggio di stato, e con lui il
// glifo, sarebbe già passato sulla schermata References prima ancora che il
// lettore esistesse).
function openReaderShell(title){
  const ov = _reader || buildReaderDOM();
  ov.querySelector('.ar-title').textContent = title || '';
  ov.classList.add('open');
  document.body.classList.add('album-reading');
  // Registra uno stato nella cronologia (come fa il visualizzatore reference):
  // così il tasto Indietro del browser — o il gesto Indietro di Android —
  // chiude il lettore e riporta alle References, invece di uscire da Inkflow.
  try{
    if(!history.state || history.state.view !== 'albumreader') history.pushState({view:'albumreader'}, '');
  }catch(e){}
  return ov;
}

function openReader(){
  openReaderShell(_albumName);
  renderPage();
}

// Chiusura "morbida" (tasto X, Esc): passa dalla cronologia, così lo stato del
// browser resta allineato a quello che si vede e non restano voci fantasma.
function closeReader(){
  const isOpen = _reader && _reader.classList.contains('open');
  if(isOpen && history.state && history.state.view === 'albumreader'){
    history.back();   // sarà il gestore popstate a chiudere davvero la vista
    return;
  }
  closeReaderUI();
}

// Chiusura immediata della sola interfaccia, senza toccare la cronologia.
// Esportata perché la chiama anche il gestore del tasto Indietro in main.js.
export function closeReaderUI(){
  if(!_reader) return;
  saveReadingPos();
  if(_clipMode) toggleClip(false);
  _reader.classList.remove('open');
  document.body.classList.remove('album-reading');
  // Le tavole tenute calde per il prefetch sono bitmap decodificati da parecchi
  // MB l'uno: chiudendo il lettore non servono più e vanno lasciate andare.
  _warmPages.clear();
  // Le pagine restano in memoria finché non apri un altro albo: riaprire lo
  // stesso file dal picker le ricrea comunque. Le liberiamo alla prossima apertura.
}

// Asincrona: con la sorgente remota (Drive via Range) mostrare una pagina è
// una vera richiesta di rete. Contatore e frecce si aggiornano SUBITO (non
// dipendono dal byte della tavola); l'immagine arriva quando arriva. Se nel
// frattempo si è già cambiata pagina (swipe veloce), il risultato in ritardo
// viene scartato invece di rimpiazzare quella giusta con quella sbagliata.
// Il prefetch gira quando il thread è libero: requestIdleCallback se c'è,
// altrimenti un timer. Decomprimere una tavola è lavoro sincrono e, fatto nel
// momento sbagliato, si sente come uno scatto mentre si sfoglia.
const whenIdle = (fn, timeout=600)=>
  (window.requestIdleCallback ? requestIdleCallback(fn, { timeout }) : setTimeout(fn, 90));
const cancelIdle = (h)=>{ if(h==null) return; (window.cancelIdleCallback||clearTimeout)(h); };

// Prefetch delle tavole vicine: si DECODIFICA subito e si tiene vivo il
// riferimento. Prima si creava un Image() e lo si dimenticava: il garbage
// collector se lo portava via insieme alla decodifica, quindi al cambio pagina
// il buffer doveva rifare tutto da capo e lo swipe restava fermo un attimo.
// La coda è corta di proposito: due tavole decodificate sono già decine di MB.
const _warmPages = new Map();
const WARM_MAX = 3;
function warmPage(url){
  if(!url || _warmPages.has(url)) return;
  const im = new Image();
  im.decoding = 'async';
  im.src = url;
  im.decode().catch(()=>{});
  _warmPages.set(url, im);
  while(_warmPages.size > WARM_MAX) _warmPages.delete(_warmPages.keys().next().value);
}

// Per un .cbz, getData() (e quindi pageUrl) è SINCRONA e bloccante: unzipSync
// non cede mai il thread. Misurato su un volume da 220 tavole: ~13 ms per
// pagina. renderPage() veniva richiamata una volta per ogni pressione del
// tasto "avanti/indietro", senza aspettare la precedente: sfogliando veloce
// (6 pressioni in rapida successione) si accumulavano fino a ~80 ms di
// decompressioni bloccanti sul thread principale — anche per pagine scartate
// un istante dopo, perché nel frattempo si era già premuto oltre. Da qui lo
// scatto percepito.
// Le due variabili sotto coalescono: mentre una pagina è in caricamento, le
// pressioni successive non avviano una NUOVA decompressione — si limitano a
// segnare "è arrivata una richiesta più recente" e a tornare subito. Quando
// il caricamento in corso finisce, si riparte automaticamente dalla pagina
// più recente saltando quelle intermedie: N pressioni rapide costano al
// massimo 2 decompressioni (quella già avviata + quella per la pagina finale),
// non N.
let _pageLoadBusy = false;
let _pageLoadPending = false;

async function renderPage(){
  if(!_reader || !_pages.length) return;
  const idx = _idx;
  resetZoom(); // ogni tavola si apre a dimensione naturale
  const pad = String(_pages.length).length;
  _reader.querySelector('.ar-counter').textContent = String(idx + 1).padStart(pad, '0') + ' / ' + _pages.length;
  _reader.querySelector('.ar-prev').style.visibility = idx > 0 ? 'visible' : 'hidden';
  _reader.querySelector('.ar-next').style.visibility = idx < _pages.length - 1 ? 'visible' : 'hidden';
  // Cursore e salti: aggiornati subito, non dipendono dai byte della tavola —
  // e non dalla coalescenza qui sotto: si vedono seguire il dito all'istante
  // anche mentre l'immagine sta ancora "raggiungendo" l'ultima pagina scelta.
  const seek = _reader.querySelector('.ar-seek');
  if(seek && !seek._dragging){
    seek.max = String(Math.max(0, _pages.length - 1));
    seek.value = String(idx);
  }
  const first = _reader.querySelector('[data-act="first"]');
  const last = _reader.querySelector('[data-act="last"]');
  if(first) first.disabled = idx === 0;
  if(last) last.disabled = idx >= _pages.length - 1;

  if(_pageLoadBusy){ _pageLoadPending = true; return; }
  await loadCurrentPageBitmap();
  while(_pageLoadPending){
    _pageLoadPending = false;
    await loadCurrentPageBitmap();
  }
}

async function loadCurrentPageBitmap(){
  _pageLoadBusy = true;
  try{
    const idx = _idx;
    const url = await pageUrl(_source, _pages[idx]);
    if(idx !== _idx || !_reader) return; // pagina cambiata nel frattempo: scarta
    // La tavola entra nel buffer NASCOSTO e diventa visibile solo quando è
    // decodificata: decode() (non 'load') perché 'load' significa solo "byte
    // arrivati", mentre il lavoro pesante su una tavola grande è la decodifica.
    const idle = readerIdleImg();
    if(!idle) return;
    if(idle.src !== url) idle.src = url;
    try{ await idle.decode(); }
    catch(e){ /* pagina cambiata a metà o immagine rotta: si prosegue */ }
    if(idx !== _idx || !_reader) return;
    swapReaderBuffer(idle);
    resetZoom();
    measureBaseSize();   // dimensioni a riposo, per lo zoom senza ricalcoli

    // Prefetch dei vicini RINVIATO a thread libero: con la sorgente pigra ognuno
    // costa una decompressione (o una richiesta Drive), e farlo subito
    // ritarderebbe la comparsa della pagina che si sta guardando adesso.
    // Sfogliando veloce si annulla e si prefetcha solo dove ci si ferma.
    cancelIdle(_prefetchT);
    _prefetchT = whenIdle(async ()=>{
      for(const i of [idx + 1, idx - 1]){
        if(i < 0 || i >= _pages.length) continue;
        const u = await pageUrl(_source, _pages[i]);
        // Solo se è ancora un vicino della pagina corrente: se nel frattempo
        // si è saltato altrove, questo prefetch non serve più a nulla.
        if(Math.abs(i - _idx) <= 1) warmPage(u);
      }
      trimPages();
    });
  } finally {
    _pageLoadBusy = false;
  }
}

function gotoPage(i){
  if(_clipMode) return; // in ritaglio la navigazione è disattivata
  if(i < 0 || i >= _pages.length) return;
  _idx = i;
  saveReadingPos();
  if(_currentAlbumId) updateAlbumLastPage(_currentAlbumId, _idx);
  renderPage();
}

// ── ZOOM, PAN E SWIPE ───────────────────────────────────────────────────────
// Stessi gesti della galleria reference, così il lettore si comporta come il
// resto dell'app: rotella/pizzico per ingrandire, trascinamento (manina su
// desktop) per spostarsi dentro la tavola, doppio tap/clic per alternare.
// A dimensione naturale lo swipe orizzontale cambia pagina; da ingranditi
// quello stesso gesto serve a spostarsi, quindi il cambio pagina si disattiva.
// In modalità ritaglio lo zoom è azzerato e inerte: il crop calcola le
// coordinate sull'immagine non trasformata, quindi si ritaglia a pagina intera.
const ZOOM_IN = 2.6, ZOOM_MAX = 4;

// L'immagine "attiva" cambia a ogni pagina (doppio buffer): va sempre risolta
// al momento dell'uso, mai memorizzata in una closure.
function readerImg(){ return _reader && _reader.querySelector('.ar-img.active'); }
function readerIdleImg(){ return _reader && _reader.querySelector('.ar-img:not(.active)'); }

// Rende visibile il buffer appena decodificato. La trasformazione viene
// azzerata PRIMA dello scambio: altrimenti la nuova tavola comparirebbe per un
// frame con lo zoom della precedente.
function swapReaderBuffer(next){
  if(!next) return;
  next.style.transition = 'none';
  next.style.transform = 'translate(0px, 0px) scale(1)';
  const prev = readerImg();
  next.classList.add('active');
  if(prev && prev !== next) prev.classList.remove('active');
}

function applyZoom(){
  const img = readerImg();
  if(!img) return;
  img.style.transform = `translate(${_zx}px, ${_zy}px) scale(${_zoom})`;
  const stage = _reader.querySelector('.ar-stage');
  if(stage) stage.classList.toggle('zoomed', _zoom > 1.02);
}

function resetZoom(animate){
  const img = readerImg();
  _zoom = 1; _zx = 0; _zy = 0;
  if(img) img.style.transition = animate ? 'transform .2s' : 'none';
  applyZoom();
}

// Dimensioni della tavola a riposo (scala 1), misurate una volta per pagina.
// Prima clampPan chiamava getBoundingClientRect() ad OGNI movimento del dito:
// una misura forzata del layout per evento, cioè scatti proprio mentre si
// trascina. Con le dimensioni base in cache il limite si calcola a memoria.
let _baseW = 0, _baseH = 0;
function measureBaseSize(){
  const img = readerImg();
  if(!img) return;
  const apply = ()=>{
    const r = img.getBoundingClientRect();
    _baseW = r.width / (_zoom || 1);
    _baseH = r.height / (_zoom || 1);
  };
  if(img.complete && img.naturalWidth) apply();
  else img.addEventListener('load', apply, { once: true });
}

// Limita lo spostamento ai bordi della tavola: non si "perde" mai l'immagine
// fuori dallo schermo trascinando troppo.
function clampPan(scale, x, y){
  if(!_baseW || !_baseH) measureBaseSize();
  const maxX = Math.max(0, (_baseW * scale - _baseW) / 2);
  const maxY = Math.max(0, (_baseH * scale - _baseH) / 2);
  return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
}

// Alterna 1x ↔ ZOOM_IN centrando sul punto toccato/cliccato.
function zoomAt(clientX, clientY){
  const img = readerImg();
  if(!img) return;
  img.style.transition = 'transform .22s';
  if(_zoom > 1.02){ resetZoom(true); return; }
  const r = img.getBoundingClientRect();
  const relX = clientX - (r.left + r.width / 2);
  const relY = clientY - (r.top + r.height / 2);
  _zoom = ZOOM_IN;
  const c = clampPan(_zoom, -relX * (ZOOM_IN - 1), -relY * (ZOOM_IN - 1));
  _zx = c.x; _zy = c.y;
  applyZoom();
}

// Cursore di scorrimento: con volumi da centinaia di tavole, raggiungere un
// punto preciso a colpi di swipe è sfiancante. Durante il trascinamento si
// aggiorna solo il contatore (nessuna decompressione a ogni pixel); la pagina
// si carica al rilascio.
function wireSeek(ov){
  const seek = ov.querySelector('.ar-seek');
  if(!seek) return;
  const preview = (v)=>{
    const n = _pages.length;
    if(!n) return;
    const pad = String(n).length;
    ov.querySelector('.ar-counter').textContent = String(v + 1).padStart(pad, '0') + ' / ' + n;
  };
  seek.addEventListener('pointerdown', ()=>{ seek._dragging = true; });
  seek.addEventListener('input', ()=> preview(parseInt(seek.value, 10) || 0));
  const commit = ()=>{
    seek._dragging = false;
    gotoPage(parseInt(seek.value, 10) || 0);
  };
  seek.addEventListener('change', commit);
  seek.addEventListener('pointerup', commit);
}

function wireGestures(ov){
  const stage = ov.querySelector('.ar-stage');
  let x0 = 0, y0 = 0, swiping = false;
  let pinching = false, startDist = 0, startScale = 1;
  let panning = false, panX = 0, panY = 0, origX = 0, origY = 0;
  let lastTap = 0, lastTapX = 0, lastTapY = 0, tapTimer = null, lastTouchAt = 0;

  const dist = (a, b) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);

  stage.addEventListener('touchstart', e=>{
    if(_clipMode) return;
    lastTouchAt = Date.now();
    const img = readerImg();
    if(img) img.style.transition = 'none';
    const t = e.touches;
    if(t.length === 2){
      pinching = true; panning = false; swiping = false;
      startDist = dist(t[0], t[1]); startScale = _zoom;
    } else if(t.length === 1){
      pinching = false;
      x0 = t[0].clientX; y0 = t[0].clientY;
      if(_zoom > 1.02){ panning = true; swiping = false; panX = x0; panY = y0; origX = _zx; origY = _zy; }
      else { panning = false; swiping = true; }
    }
  }, { passive: true });

  stage.addEventListener('touchmove', e=>{
    if(_clipMode) return;
    const t = e.touches;
    if(pinching && t.length === 2){
      const nd = dist(t[0], t[1]);
      _zoom = Math.min(ZOOM_MAX, Math.max(1, startScale * (nd / startDist)));
      const c = clampPan(_zoom, _zx, _zy); _zx = c.x; _zy = c.y;
      applyZoom();
    } else if(panning && t.length === 1){
      const c = clampPan(_zoom, origX + (t[0].clientX - panX), origY + (t[0].clientY - panY));
      _zx = c.x; _zy = c.y;
      applyZoom();
    }
  }, { passive: true });

  stage.addEventListener('touchend', e=>{
    if(_clipMode) return;
    if(pinching){
      pinching = false;
      if(_zoom < 1.05) resetZoom(true);
      return;
    }
    const t = e.changedTouches[0];
    if(panning){
      panning = false;
      // trascinamento vero: non è un tap, non valutarlo come doppio tocco
      if(Math.hypot(t.clientX - panX, t.clientY - panY) > 14) return;
    }
    const dx = t.clientX - x0, dy = t.clientY - y0;
    const moved = Math.hypot(dx, dy);
    if(swiping && _zoom <= 1.02 && moved > 55 && Math.abs(dx) > Math.abs(dy) * 1.3){
      swiping = false;
      if(dx < 0) gotoPage(_idx + 1); else gotoPage(_idx - 1);
      return;
    }
    swiping = false;
    if(moved < 20){
      const now = Date.now();
      const closeTap = Math.hypot(t.clientX - lastTapX, t.clientY - lastTapY) < 50;
      if(now - lastTap < 400 && closeTap){
        clearTimeout(tapTimer);
        zoomAt(t.clientX, t.clientY);
        lastTap = 0;
      } else {
        lastTap = now; lastTapX = t.clientX; lastTapY = t.clientY;
      }
    }
  }, { passive: true });

  // Desktop: rotella per ingrandire, con lo zoom centrato sul puntatore.
  stage.addEventListener('wheel', e=>{
    if(_clipMode || !ov.classList.contains('open')) return;
    e.preventDefault();
    const img = readerImg();
    if(!img) return;
    const prev = _zoom;
    const factor = e.deltaY < 0 ? 1.16 : 1 / 1.16;
    _zoom = Math.min(ZOOM_MAX, Math.max(1, prev * factor));
    img.style.transition = 'none';
    if(_zoom <= 1.02){
      _zoom = 1; _zx = 0; _zy = 0;
    } else {
      // tiene fermo il punto sotto il puntatore mentre la scala cambia
      const r = img.getBoundingClientRect();
      const relX = e.clientX - (r.left + r.width / 2);
      const relY = e.clientY - (r.top + r.height / 2);
      const k = _zoom / prev;
      const c = clampPan(_zoom, (_zx - relX) * k + relX, (_zy - relY) * k + relY);
      _zx = c.x; _zy = c.y;
    }
    applyZoom();
  }, { passive: false });

  // I browser mobile emettono un dblclick sintetico dopo un doppio tap reale:
  // se lo lasciassimo passare zoomerebbe due volte annullandosi.
  // Delegati sullo stage e non sulla singola <img>: con il doppio buffer
  // l'elemento visibile cambia a ogni pagina, e un listener agganciato una
  // volta sola a quello iniziale smetterebbe di rispondere dopo il primo
  // cambio pagina. Il controllo sul bersaglio conserva il comportamento di
  // prima (si reagisce solo sulla tavola, non sul bordo vuoto attorno).
  stage.addEventListener('dblclick', e=>{
    if(_clipMode || Date.now() - lastTouchAt < 1000) return;
    if(!e.target.classList.contains('ar-img')) return;
    zoomAt(e.clientX, e.clientY);
  });

  // Desktop: trascinamento con la manina quando la tavola è ingrandita.
  let mDown = false, mx = 0, my = 0, mox = 0, moy = 0;
  stage.addEventListener('mousedown', e=>{
    if(_clipMode || _zoom <= 1.02) return;
    if(Date.now() - lastTouchAt < 1000) return;
    if(!e.target.classList.contains('ar-img')) return;
    const img = readerImg();
    if(!img) return;
    e.preventDefault();
    mDown = true; mx = e.clientX; my = e.clientY; mox = _zx; moy = _zy;
    stage.classList.add('grabbing');
    img.style.transition = 'none';
  });
  window.addEventListener('mousemove', e=>{
    if(!mDown) return;
    const c = clampPan(_zoom, mox + (e.clientX - mx), moy + (e.clientY - my));
    _zx = c.x; _zy = c.y;
    applyZoom();
  });
  window.addEventListener('mouseup', ()=>{
    if(!mDown) return;
    mDown = false;
    stage.classList.remove('grabbing');
  });
}

// ── RITAGLIO ────────────────────────────────────────────────────────────────
// Rettangolo di selezione sopra la pagina → crop a piena risoluzione dal blob
// originale → compressione → Frammento nella cartella corrente, con provenienza.
function toggleClip(force){
  const next = (typeof force === 'boolean') ? force : !_clipMode;
  _clipMode = next;
  // Lo zoom NON si azzera più entrando in ritaglio: il conto del crop usa le
  // posizioni reali a schermo di tavola e riquadro (getBoundingClientRect,
  // vedi renderedImageRect), che includono già scala e spostamento — quindi
  // funziona correttamente anche da zoomati, permettendo di ritagliare un
  // dettaglio piccolo con più precisione.
  const layer = _reader.querySelector('.ar-cliplayer');
  const hint = _reader.querySelector('.ar-clip-hint');
  const box = _reader.querySelector('.ar-clipbox');
  _reader.querySelector('.ar-clip').classList.toggle('active', _clipMode);
  layer.hidden = !_clipMode;
  hint.hidden = !_clipMode;
  box.hidden = true;
  // In ritaglio la navigazione non serve: via cursore e salti, resta l'avviso.
  const controls = _reader.querySelector('.ar-controls');
  if(controls) controls.hidden = _clipMode;
  _reader.querySelector('.ar-prev').style.display = _clipMode ? 'none' : '';
  _reader.querySelector('.ar-next').style.display = _clipMode ? 'none' : '';
  // Niente haptic('tap') qui: il pulsante ritaglia è un <button>, già coperto
  // dal tick diffuso su pointerdown (sound.js). Chiamarlo anche qui produceva
  // due suoni per un solo tocco — il gesto reale (pointerdown poi click) dura
  // spesso oltre i 70ms di soglia pensati per fondere i due, quindi entrambi
  // finivano per suonare.
}

// Rettangolo dell'immagine effettivamente renderizzata, in coordinate relative
// a `layer` (il livello di ritaglio, che copre tutto lo stage). Serve la
// posizione VERA a schermo di entrambi — non solo le dimensioni — perché la
// tavola è centrata nello stage (flexbox) e quasi mai ne ha le stesse
// proporzioni: c'è quindi uno scarto tra l'angolo dello stage e quello reale
// dell'immagine, oltre alle eventuali bande vuote di object-fit:contain. Con
// getBoundingClientRect (posizione reale) invece di clientWidth (solo
// dimensione) entrambi gli scarti vengono presi in conto.
function renderedImageRect(img, layer){
  const ir = img.getBoundingClientRect();
  const lr = layer.getBoundingClientRect();
  const nw = img.naturalWidth, nh = img.naturalHeight;
  if(!nw || !nh) return { x: ir.left - lr.left, y: ir.top - lr.top, w: ir.width, h: ir.height, scale: 1 };
  const scale = Math.min(ir.width / nw, ir.height / nh);
  const w = nw * scale, h = nh * scale;
  return {
    x: (ir.left - lr.left) + (ir.width - w) / 2,
    y: (ir.top - lr.top) + (ir.height - h) / 2,
    w, h, scale,
  };
}

function wireClip(ov){
  const layer = ov.querySelector('.ar-cliplayer');
  const box = ov.querySelector('.ar-clipbox');
  const hintInstruct = ov.querySelector('.ar-clip-hint-instruct');
  const hintConfirm = ov.querySelector('.ar-clip-hint-confirm');
  const dests = ov.querySelector('.ar-clip-dests');
  const moreWrap = ov.querySelector('.ar-clip-more-wrap');
  const handles = Array.from(box.querySelectorAll('.ar-clip-handle'));
  const MIN_SIZE = 24; // dimensione minima del riquadro in px CSS, ridimensionando
  let sx = 0, sy = 0, drawing = false;
  // Il rettangolo del livello si misura all'inizio del gesto e si riusa: prima
  // veniva rimisurato ad ogni movimento (una misura forzata del layout per
  // evento), e il riquadro seguiva il dito a scatti.
  let lr = null;
  // Riquadro disegnato in attesa di conferma: rilasciare il dito non salva più
  // subito. Prima lo faceva, e "annulla" non poteva mai tornare indietro da un
  // ritaglio già fatto — poteva solo uscire dalla modalità PRIMA di disegnare.
  let pendingSel = null;
  let resizeCorner = null; // angolo in trascinamento, o null

  // Pastiglie di destinazione: la prima è la cartella da cui stai leggendo
  // (i Ritagli dell'artista), poi le cartelle di Studio. Toccarne una salva
  // il ritaglio lì dentro. Si ricostruiscono ad ogni riquadro perché nel
  // frattempo puoi aver creato una nuova cartella di studio.
  // Quante scorciatoie stanno in una riga su un telefono accanto a "Riprova"
  // e alle categorie. Oltre questo numero le ultime usate scorrono, ma le
  // categorie restano comunque ferme al loro posto.
  const DEST_CHIPS_MAX = 3;
  const renderDests = ()=>{
    if(!dests) return;
    const shortcuts = clipDestinations();
    const cats = clipCategories();
    if(!shortcuts.length && !cats.length){
      // Nessuna cartella: il ritaglio resta non archiviato, come oggi.
      dests.innerHTML = '<button class="ar-clip-confirm-btn" data-act="confirmclip">✓ Salva ritaglio</button>';
      if(moreWrap) moreWrap.innerHTML = '';
      return;
    }
    // Scorciatoie: dove sei (default) e le ultime cartelle usate. È il caso
    // normale — si lavora su pochi studi per volta — e si risolve con un tocco.
    dests.innerHTML = shortcuts.slice(0, DEST_CHIPS_MAX).map(d=>{
      const cls = d.isCurrent ? 'ar-clip-dest is-current' : 'ar-clip-dest';
      const label = d.isCurrent ? ('✓ ' + escAttr(d.name)) : escAttr(d.name);
      const title = d.isCurrent
        ? 'Salva tra i ritagli di ' + escAttr(d.name)
        : 'Salva in ' + escAttr(d.category || '') + ' › ' + escAttr(d.name);
      return `<button class="${cls}" data-act="confirmclip" data-dest="${escAttr(d.id)}" title="${title}">${label}</button>`;
    }).join('');
    // Categorie: ancorate al bordo destro, non scorrono via. Una voce per
    // categoria a prescindere da quante cartelle contenga, così la riga ha la
    // stessa forma con due artisti e con cinquanta — e da lì si raggiunge
    // qualunque sottocartella, anche una mai usata.
    if(moreWrap){
      moreWrap.innerHTML = cats.map((c,i)=>
        `<button class="ar-clip-dest ar-clip-cat" data-act="catdest" data-cat="${i}" title="Sfoglia ${escAttr(c.category)}">${escAttr(c.category)} ›</button>`
      ).join('');
      moreWrap._cats = cats;
    }
  };

  // Sottocartelle di una categoria, per raggiungerne una qualunque.
  ov._clipCatDests = (anchorEl, idx)=>{
    const cats = (moreWrap && moreWrap._cats) || [];
    const c = cats[idx];
    if(!c || !c.folders.length) return;
    actionMenu(anchorEl, c.folders.map(f=>({
      label: f.name,
      onSelect: ()=>{ if(ov._clipConfirm) ov._clipConfirm(f.id); },
    })));
  };

  const showConfirm = (on)=>{
    if(hintInstruct) hintInstruct.hidden = on;
    if(hintConfirm) hintConfirm.hidden = !on;
    if(on) renderDests();
    // Le maniglie di resize hanno senso SOLO nello stato "in attesa di
    // conferma": durante il disegno iniziale coprirebbero il gesto sulla
    // superficie, e a riquadro chiuso non c'è nulla da ridimensionare.
    box.classList.toggle('pending', on);
  };

  const syncPendingSelFromBox = ()=>{
    if(!pendingSel) return;
    pendingSel = {
      left: parseFloat(box.style.left), top: parseFloat(box.style.top),
      width: parseFloat(box.style.width), height: parseFloat(box.style.height),
    };
  };

  const start = (px, py)=>{
    pendingSel = null;
    showConfirm(false);
    lr = layer.getBoundingClientRect();
    sx = px - lr.left; sy = py - lr.top;
    drawing = true;
    box.hidden = false;
    box.style.left = sx + 'px'; box.style.top = sy + 'px';
    box.style.width = '0px'; box.style.height = '0px';
  };
  const move = (px, py)=>{
    if(!drawing) return;
    const r = lr || (lr = layer.getBoundingClientRect());
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
    if(bw < 12 || bh < 12){ box.hidden = true; toast('Trascina un riquadro più grande sulla pagina.', true); return; }
    // Il riquadro RESTA a schermo: si decide con "Conferma" o "Riprova" — o
    // si aggiusta trascinando gli angoli prima di confermare.
    pendingSel = { left: parseFloat(box.style.left), top: parseFloat(box.style.top), width: bw, height: bh };
    showConfirm(true);
  };

  // ── RIDIMENSIONAMENTO (dopo il rilascio, prima della conferma) ──
  // Ogni angolo trascina SÉ STESSO tenendo fermo l'angolo opposto: è quello
  // il punto di ancoraggio, non il centro — così si può sia allargare che
  // restringere il riquadro da qualunque lato senza che "salti".
  const resizeMove = (px, py)=>{
    if(!resizeCorner) return;
    const r = lr || (lr = layer.getBoundingClientRect());
    const cx = Math.max(0, Math.min(px - r.left, r.width));
    const cy = Math.max(0, Math.min(py - r.top, r.height));
    const curLeft = parseFloat(box.style.left), curTop = parseFloat(box.style.top);
    const curW = parseFloat(box.style.width), curH = parseFloat(box.style.height);
    const anchorX = resizeCorner.includes('w') ? curLeft + curW : curLeft;
    const anchorY = resizeCorner.includes('n') ? curTop + curH : curTop;

    let left = Math.min(anchorX, cx), width = Math.abs(cx - anchorX);
    if(width < MIN_SIZE){ width = MIN_SIZE; left = cx <= anchorX ? anchorX - MIN_SIZE : anchorX; }
    let top = Math.min(anchorY, cy), height = Math.abs(cy - anchorY);
    if(height < MIN_SIZE){ height = MIN_SIZE; top = cy <= anchorY ? anchorY - MIN_SIZE : anchorY; }
    // Clamp finale: se il minimo sconfina fuori dal layer, rientra senza
    // cambiare le dimensioni (l'ancora resta comunque il vincolo primario).
    left = Math.max(0, Math.min(left, r.width - width));
    top = Math.max(0, Math.min(top, r.height - height));

    box.style.left = left + 'px'; box.style.top = top + 'px';
    box.style.width = width + 'px'; box.style.height = height + 'px';
  };
  const resizeEnd = ()=>{
    if(!resizeCorner) return;
    resizeCorner = null;
    syncPendingSelFromBox();
  };
  handles.forEach(h=>{
    const corner = h.dataset.corner;
    h.addEventListener('mousedown', e=>{
      e.preventDefault(); e.stopPropagation(); // non deve riavviare un nuovo disegno
      lr = layer.getBoundingClientRect();
      resizeCorner = corner;
    });
    h.addEventListener('touchstart', e=>{
      e.stopPropagation();
      lr = layer.getBoundingClientRect();
      resizeCorner = corner;
    }, { passive:true });
  });
  window.addEventListener('mousemove', e=>{ if(resizeCorner) resizeMove(e.clientX, e.clientY); });
  window.addEventListener('mouseup', resizeEnd);
  window.addEventListener('touchmove', e=>{
    if(!resizeCorner) return;
    resizeMove(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  }, { passive:false });
  window.addEventListener('touchend', resizeEnd, { passive:true });

  // ── SPOSTAMENTO (trascinando il riquadro stesso) ──
  // Gli angoli ridimensionano, il corpo sposta: si può inquadrare il dettaglio
  // giusto senza ridisegnare tutto da capo quando il riquadro ha già la
  // dimensione voluta ma è posizionato male.
  let moving = false, mvDX = 0, mvDY = 0;
  const moveStart = (px, py)=>{
    lr = layer.getBoundingClientRect();
    // Scarto tra il punto afferrato e l'angolo del riquadro: senza, il
    // riquadro salterebbe col suo angolo sotto il dito al primo movimento.
    mvDX = (px - lr.left) - parseFloat(box.style.left);
    mvDY = (py - lr.top) - parseFloat(box.style.top);
    moving = true;
    box.classList.add('grabbing');
  };
  const moveTo = (px, py)=>{
    if(!moving) return;
    const r = lr || (lr = layer.getBoundingClientRect());
    const w = parseFloat(box.style.width), h = parseFloat(box.style.height);
    // Il riquadro resta dentro la pagina: trascinandolo oltre il bordo si
    // ferma invece di uscire e portarsi via una porzione vuota.
    const left = Math.max(0, Math.min((px - r.left) - mvDX, r.width - w));
    const top  = Math.max(0, Math.min((py - r.top) - mvDY, r.height - h));
    box.style.left = left + 'px';
    box.style.top = top + 'px';
  };
  const moveEnd = ()=>{
    if(!moving) return;
    moving = false;
    box.classList.remove('grabbing');
    syncPendingSelFromBox();
  };
  box.addEventListener('mousedown', e=>{
    if(!box.classList.contains('pending')) return;
    if(e.target.closest('.ar-clip-handle')) return; // l'angolo ridimensiona
    e.preventDefault(); e.stopPropagation();
    moveStart(e.clientX, e.clientY);
  });
  box.addEventListener('touchstart', e=>{
    if(!box.classList.contains('pending')) return;
    if(e.target.closest('.ar-clip-handle')) return;
    e.stopPropagation();
    moveStart(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive:true });
  window.addEventListener('mousemove', e=>{ if(moving) moveTo(e.clientX, e.clientY); });
  window.addEventListener('mouseup', moveEnd);
  window.addEventListener('touchmove', e=>{
    if(!moving) return;
    moveTo(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  }, { passive:false });
  window.addEventListener('touchend', moveEnd, { passive:true });

  // Richiamate dal tap su "Riprova"/"✓ Conferma" (vedi il click delegato più sopra).
  ov._clipRetry = ()=>{
    pendingSel = null;
    box.hidden = true;
    showConfirm(false);
  };
  ov._clipConfirm = async (destFolderId)=>{
    if(!pendingSel) return;
    const sel = pendingSel;
    pendingSel = null;
    showConfirm(false);
    // Risolta ORA e non alla creazione del lettore: il ritaglio deve usare la
    // tavola effettivamente a schermo, non il buffer diventato nel frattempo
    // quello nascosto.
    const img = readerImg();
    if(!img) return;
    await commitClip(img, sel, layer, destFolderId);
    box.hidden = true;
  };

  layer.addEventListener('mousedown', e=>{
    if(box.classList.contains('pending')) return; // in questo stato solo le maniglie disegnano
    e.preventDefault(); start(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', e=>{ if(drawing) move(e.clientX, e.clientY); });
  window.addEventListener('mouseup', ()=>{ if(drawing) end(); });
  layer.addEventListener('touchstart', e=>{
    if(box.classList.contains('pending')) return;
    start(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive:true });
  layer.addEventListener('touchmove', e=>{ move(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }, { passive:false });
  layer.addEventListener('touchend', end, { passive:true });
}

// Ritaglia il rettangolo selezionato dalla pagina a piena risoluzione.
async function commitClip(img, sel, layer, destFolderId){
  const rect = renderedImageRect(img, layer);
  // Coordinate del riquadro relative all'immagine renderizzata (tolte le bande).
  const relX = sel.left - rect.x, relY = sel.top - rect.y;
  const cropX = Math.max(0, relX / rect.scale);
  const cropY = Math.max(0, relY / rect.scale);
  const cropW = Math.min(img.naturalWidth  - cropX, sel.width  / rect.scale);
  const cropH = Math.min(img.naturalHeight - cropY, sel.height / rect.scale);
  if(cropW < 4 || cropH < 4){ toast('Riquadro fuori dalla pagina, riprova.', true); toggleClip(false); return; }

  // Si ritaglia DALLA TAVOLA GIÀ A SCHERMO. Prima si rileggeva la pagina
  // dall'archivio e la si decodificava una seconda volta da zero, solo per
  // ritagliarne un rettangolo: su una tavola da qualche migliaio di pixel
  // quella decodifica è la parte più lenta di tutto il ritaglio, ed era
  // completamente inutile — l'immagine identica, già decodificata, era lì
  // davanti. L'elemento a schermo è a piena risoluzione (il conto del crop
  // usa già il suo naturalWidth/naturalHeight), quindi il risultato non
  // cambia di un pixel.
  const done = exportCropAndSave(img, cropX, cropY, cropW, cropH, destFolderId);
  // La modalità ritaglio si chiude SUBITO: il caricamento su Cloudinary
  // prosegue in sottofondo e si annuncia da solo col banner. Prima l'intera
  // interfaccia restava bloccata per tutta la durata della rete.
  toggleClip(false);
  await done;
}

// Serve ancora alla copertina dello scaffale (makeCoverBlob), che parte da un
// Blob e non da un'immagine già a schermo.
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
async function exportCropAndSave(sourceImg, cx, cy, cw, ch, destFolderId){
  toast('Ritaglio in corso…', false, true);
  const im = sourceImg;
  if(!im || !im.naturalWidth){ toast('Ritaglio fallito.', true); return; }

  // Provenienza e destinazione lette ORA, non dopo l'upload: da quando il
  // caricamento prosegue in sottofondo si può già voltare pagina mentre è in
  // corso, e _idx sarebbe quello nuovo — il frammento si porterebbe dietro il
  // numero di pagina sbagliato.
  const sourceFolderId = getActiveFolderId();
  const folderId = destFolderId || sourceFolderId;
  const provenance = {
    opera: _albumName,
    pagina: _idx + 1,
    folderId: sourceFolderId || null,   // cartella artista di origine
  };

  let w = Math.round(cw), h = Math.round(ch);
  if(w > CLIP_MAX_DIM || h > CLIP_MAX_DIM){
    if(w >= h){ h = Math.round(h * CLIP_MAX_DIM / w); w = CLIP_MAX_DIM; }
    else { w = Math.round(w * CLIP_MAX_DIM / h); h = CLIP_MAX_DIM; }
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Niente revoke dell'URL qui: questa immagine è la tavola VISUALIZZATA, non
  // una copia usa-e-getta. Revocarla la farebbe sparire dallo schermo.
  ctx.drawImage(im, cx, cy, cw, ch, 0, 0, w, h);

  let quality = 0.88;
  const encode = ()=> new Promise(res=> canvas.toBlob(res, 'image/jpeg', quality));
  let blob = await encode();
  while(blob && blob.size > CLIP_MAX_BYTES && quality > 0.5){
    quality = Math.max(0.5, quality - 0.1);
    blob = await encode();
  }
  if(!blob){ toast('Ritaglio fallito.', true); return; }

  // folderId e provenance sono stati catturati in cima, prima di qualunque
  // await: la provenienza viaggia SEMPRE col ritaglio, anche quando finisce
  // in una cartella di studio, così le mani archiviate in "Hands" continuano
  // a sapere di essere di Satoshi Kon, pagina 88.
  const id = await addRefBlob(blob, { folderId, source: 'clip', provenance, w, h });
  if(id){
    haptic('done');
    // Solo le destinazioni scelte a mano: la cartella corrente è già in cima
    // per conto suo, e ricordarla spingerebbe giù gli studi davvero usati.
    if(destFolderId && destFolderId !== sourceFolderId) rememberClipDest(destFolderId);
    const destName = destFolderId ? getFolderName(destFolderId) : null;
    toast(destName ? ('Salvato in ' + destName + ' ✓') : 'Frammento salvato ✓');
  }
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
