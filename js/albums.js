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
} from './refs.js';
import { uploadToCloudinary } from './cloudinary.js';
import { getDriveAlbumFile, ensureDriveConnected } from './drive.js';
import { openRemoteZipSource, openBlobZipSource } from './zipremote.js';
import { haptic } from './state.js';

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
    return;
  }
  console[isError ? 'warn' : 'log']('[albi]', msg);
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

  toast('Apro l\'albo…', false, true);
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
  toast('Apro l\'albo…', false, true);
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

  toast('Preparo le pagine…', false, true);
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
  openReader();
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
      <span class="ar-title"></span>
      <div class="ar-top-actions">
        <button class="ar-btn ar-clip" aria-label="Ritaglia" data-act="clip">
          <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="6.5" cy="6.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="6.5" cy="17.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.6 8.2 20 18 M8.6 15.8 20 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>
    <div class="ar-stage">
      <div class="ar-toast"></div>
      <img class="ar-img" alt="">
      <div class="ar-cliplayer" hidden><div class="ar-clipbox" hidden></div></div>
      <button class="ar-nav ar-prev" aria-label="Precedente" data-act="prev">
        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="ar-nav ar-next" aria-label="Successiva" data-act="next">
        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M9 5 L16 12 L9 19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
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
  });

  // Tap sul centro dell'immagine (fuori clip) = avanti; bordo sinistro = indietro.
  // Gestito dai bottoni ar-nav; qui aggiungiamo tastiera e swipe.
  document.addEventListener('keydown', e=>{
    if(!ov.classList.contains('open')) return;
    if(e.key === 'ArrowRight' || e.key === ' ') gotoPage(_idx + 1);
    else if(e.key === 'ArrowLeft') gotoPage(_idx - 1);
    else if(e.key === 'Escape'){ if(_clipMode) toggleClip(false); else closeReader(); }
  });

  wireGestures(ov);
  wireClip(ov);
  _reader = ov;
  return ov;
}

function openReader(){
  const ov = _reader || buildReaderDOM();
  ov.querySelector('.ar-title').textContent = _albumName;
  ov.classList.add('open');
  document.body.classList.add('album-reading');
  // Registra uno stato nella cronologia (come fa il visualizzatore reference):
  // così il tasto Indietro del browser — o il gesto Indietro di Android —
  // chiude il lettore e riporta alle References, invece di uscire da Inkflow.
  try{
    if(!history.state || history.state.view !== 'albumreader') history.pushState({view:'albumreader'}, '');
  }catch(e){}
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
  // Le pagine restano in memoria finché non apri un altro albo: riaprire lo
  // stesso file dal picker le ricrea comunque. Le liberiamo alla prossima apertura.
}

// Asincrona: con la sorgente remota (Drive via Range) mostrare una pagina è
// una vera richiesta di rete. Contatore e frecce si aggiornano SUBITO (non
// dipendono dal byte della tavola); l'immagine arriva quando arriva. Se nel
// frattempo si è già cambiata pagina (swipe veloce), il risultato in ritardo
// viene scartato invece di rimpiazzare quella giusta con quella sbagliata.
async function renderPage(){
  if(!_reader || !_pages.length) return;
  const idx = _idx;
  resetZoom(); // ogni tavola si apre a dimensione naturale
  const pad = String(_pages.length).length;
  _reader.querySelector('.ar-counter').textContent = String(idx + 1).padStart(pad, '0') + ' / ' + _pages.length;
  _reader.querySelector('.ar-prev').style.visibility = idx > 0 ? 'visible' : 'hidden';
  _reader.querySelector('.ar-next').style.visibility = idx < _pages.length - 1 ? 'visible' : 'hidden';

  const url = await pageUrl(_source, _pages[idx]);
  if(idx !== _idx || !_reader) return; // pagina cambiata nel frattempo: scarta
  _reader.querySelector('.ar-img').src = url;

  // Prefetch dei vicini RINVIATO a thread/rete libera: con la sorgente pigra
  // ognuno costa una decompressione (o una richiesta Drive), e farlo subito
  // ritarderebbe la comparsa della pagina che si sta guardando adesso.
  // Sfogliando veloce il timer si azzera e si prefetcha solo dove ci si ferma.
  clearTimeout(_prefetchT);
  _prefetchT = setTimeout(async ()=>{
    for(const i of [idx + 1, idx - 1]){
      if(i < 0 || i >= _pages.length) continue;
      const u = await pageUrl(_source, _pages[i]);
      // Solo se è ancora un vicino della pagina corrente: se nel frattempo
      // si è saltato altrove, questo prefetch non serve più a nulla.
      if(Math.abs(i - _idx) <= 1){ const im = new Image(); im.src = u; }
    }
    trimPages();
  }, 90);
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

function readerImg(){ return _reader && _reader.querySelector('.ar-img'); }

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

// Limita lo spostamento ai bordi della tavola: non si "perde" mai l'immagine
// fuori dallo schermo trascinando troppo.
function clampPan(scale, x, y){
  const img = readerImg();
  if(!img) return { x, y };
  const r = img.getBoundingClientRect();
  const baseW = r.width / scale, baseH = r.height / scale;
  const maxX = Math.max(0, (baseW * scale - baseW) / 2);
  const maxY = Math.max(0, (baseH * scale - baseH) / 2);
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

function wireGestures(ov){
  const stage = ov.querySelector('.ar-stage');
  const img = ov.querySelector('.ar-img');
  let x0 = 0, y0 = 0, swiping = false;
  let pinching = false, startDist = 0, startScale = 1;
  let panning = false, panX = 0, panY = 0, origX = 0, origY = 0;
  let lastTap = 0, lastTapX = 0, lastTapY = 0, tapTimer = null, lastTouchAt = 0;

  const dist = (a, b) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);

  stage.addEventListener('touchstart', e=>{
    if(_clipMode) return;
    lastTouchAt = Date.now();
    img.style.transition = 'none';
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
  img.addEventListener('dblclick', e=>{
    if(_clipMode || Date.now() - lastTouchAt < 1000) return;
    zoomAt(e.clientX, e.clientY);
  });

  // Desktop: trascinamento con la manina quando la tavola è ingrandita.
  let mDown = false, mx = 0, my = 0, mox = 0, moy = 0;
  img.addEventListener('mousedown', e=>{
    if(_clipMode || _zoom <= 1.02) return;
    if(Date.now() - lastTouchAt < 1000) return;
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
  // Il crop mappa i pixel schermo → pixel reali sull'immagine NON trasformata:
  // si ritaglia quindi sempre a pagina intera, con lo zoom azzerato (i gesti
  // di zoom restano inerti finché si è in ritaglio).
  if(_clipMode) resetZoom();
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
    if(bw < 12 || bh < 12){ box.hidden = true; toast('Trascina un riquadro più grande sulla pagina.', true); return; }
    commitClip(img, {
      left: parseFloat(box.style.left), top: parseFloat(box.style.top), width: bw, height: bh
    }, layer);
  };

  layer.addEventListener('mousedown', e=>{ e.preventDefault(); start(e.clientX, e.clientY); });
  window.addEventListener('mousemove', e=>{ if(drawing) move(e.clientX, e.clientY); });
  window.addEventListener('mouseup', ()=>{ if(drawing) end(); });
  layer.addEventListener('touchstart', e=>{ start(e.touches[0].clientX, e.touches[0].clientY); }, { passive:true });
  layer.addEventListener('touchmove', e=>{ move(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }, { passive:false });
  layer.addEventListener('touchend', end, { passive:true });
}

// Ritaglia il rettangolo selezionato dalla pagina a piena risoluzione.
async function commitClip(img, sel, layer){
  const rect = renderedImageRect(img, layer);
  // Coordinate del riquadro relative all'immagine renderizzata (tolte le bande).
  const relX = sel.left - rect.x, relY = sel.top - rect.y;
  const cropX = Math.max(0, relX / rect.scale);
  const cropY = Math.max(0, relY / rect.scale);
  const cropW = Math.min(img.naturalWidth  - cropX, sel.width  / rect.scale);
  const cropH = Math.min(img.naturalHeight - cropY, sel.height / rect.scale);
  if(cropW < 4 || cropH < 4){ toast('Riquadro fuori dalla pagina, riprova.', true); toggleClip(false); return; }

  await exportCropAndSave(await pageBlob(_source, _pages[_idx]), cropX, cropY, cropW, cropH);
  toggleClip(false);
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
  toast('Ritaglio in corso…', false, true);
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
