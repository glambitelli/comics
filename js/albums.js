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
  clipDestinations, clipCategories, getFolderName, rememberClipDest, tagSuggeriti,
} from './refs.js';
import { uploadToCloudinary } from './cloudinary.js';
import { getDriveAlbumFile, ensureDriveConnected, isDownloadCancelled } from './drive.js';
import { openRemoteZipSource, openBlobZipSource } from './zipremote.js';
import { haptic } from './state.js';
import { escAttr } from './testo.js';
import { actionMenu, promptModal } from './dialogs.js';
import {
  ZOOM_IN, ZOOM_MAX, panGain, edgeSpring, EDGE_COMMIT, EDGE_HANDOFF,
  panLimits as limitiPan, clampTo, ZOOM_TRANSITION, EDGE_COMMIT_ZOOM,
} from './gesti.js';

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
// Scaricamento da Drive in corso e annullabile a mano. Un volume da mezzo giga
// su 4G sono minuti: prima l'unico modo di uscirne era chiudere il lettore, ma
// il download proseguiva comunque in sottofondo — dati consumati per un file
// che nessuno stava più aspettando.
let _dlAbort = null;

// Il ritaglio vive in un file suo (vedi ritaglio.js): e' il gesto piu' lungo
// dell'app e non c'entra con lo sfogliare. Da qui gli si passano solo i dati
// del lettore, in sola lettura tranne "sono in modalita' ritaglio".
import { toggleClip, wireClip, blobToImage } from './ritaglio.js';

// ── LA FINESTRELLA CHE IL RITAGLIO GUARDA ──
// Funzioni e non variabili: _idx, _zoom e compagnia cambiano ad ogni pagina e
// ad ogni pizzicata, e chi si fosse tenuto il valore leggerebbe per sempre la
// fotografia di un istante.
export function readerEl(){ return _reader; }
export function indiceCorrente(){ return _idx; }
export function nomeAlbo(){ return _albumName; }
export function zoomCorrente(){ return _zoom; }
export function clipMode(){ return _clipMode; }
export function setClipMode(v){ _clipMode = !!v; }
export { readerImg, resetZoom, toast, toggleClip };

// ── UTIL ──────────────────────────────────────────────────────────────────
const IMG_RE = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;
const _collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// I nomi delle cartelle li scrive l'utente e finiscono dentro HTML (pastiglie
// di destinazione del ritaglio): vanno sempre neutralizzati, apici doppi
// compresi perché entrano anche in attributi.

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
// `durata`: per i rari messaggi che vanno letti con calma. Senza, restano
// i 2,6 secondi di sempre.
function toast(msg, isError, persistent, durata){
  // Il lettore è un overlay a schermo intero SOPRA la schermata References:
  // l'indicatore di stato di quella schermata (usato quando si ritaglia da
  // fuori dal lettore, es. da un'altra vista) resterebbe nascosto dietro.
  // Quando il lettore è aperto usiamo un banner tutto suo, sempre visibile.
  const inReader = _reader && _reader.classList.contains('open');
  const el = inReader
    ? _reader.querySelector('.ar-toast')
    : document.getElementById('refs-upload-status');
  if(el){
    const idle = inReader ? 'ar-toast' : 'refs-upload-status';
    clearTimeout(el._t);
    // toast('') significa "non c'è più niente da dire": va nascosto SUBITO.
    // Prima passava dalla via normale e restava una pastiglia vuota — bordo,
    // fondo e tutto — piantata in alto per i 2,6 secondi del timer, senza una
    // riga di testo dentro. Si vedeva ogni volta che si apriva un albo, che è
    // esattamente il momento in cui la si nota di più.
    if(!msg){
      el.className = idle;
      el.textContent = '';
    } else {
      el.className = idle + ' show ' + (isError ? 'error' : 'ok');
      el.textContent = msg;
      if(!persistent){
        el._t = setTimeout(()=>{ el.className = idle; el.textContent=''; }, durata || (isError ? 6000 : 2600));
      }
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

  // LA FIRMA VINCE SULL'ESTENSIONE. Un mucchio di albi in giro si chiamano
  // .cbr ma dentro sono ZIP (chi li impacchetta cambia formato e non rinomina).
  // Prima decideva l'estensione, e quei file finivano su libarchive: che per
  // dare anche solo l'elenco delle tavole deve leggere l'ARCHIVIO INTERO e
  // copiarselo dentro il WASM. Su un volume da 350MB sono ~6,5 secondi di
  // attesa a ogni apertura, contro i ~50ms della lettura a intervalli qui
  // sotto, che di byte ne tocca giusto quelli dell'indice. Stesso file, stesso
  // contenuto, solo il nome diverso.
  if(isZip){
    // Prima strada: leggere indice e tavole a pezzi dal Blob, senza mai
    // caricare l'albo in memoria. Se lo ZIP è fuori standard (zip64, indice
    // incoerente) si ripiega sulla lettura classica, che però il file lo
    // materializza tutto: accettabile solo perché è il caso raro.
    try{ return await openBlobZipSource(file, isImageEntry, naturalCompare); }
    catch(e){ console.warn('lettura ZIP a intervalli fallita, ripiego sul file intero:', e.message); }
    try{ return zipSource(new Uint8Array(await file.arrayBuffer())); }
    catch(e){ console.warn('unzip fallito, ultimo tentativo con libarchive:', e && e.message); }
    // Ultima spiaggia: libarchive legge (quasi) tutto, zip64 compresi. È la
    // strada lenta — l'archivio intero dentro il WASM — ma meglio lenta che un
    // albo che non si apre. Prima ci finiva ogni .cbr per via del nome; ora
    // solo gli ZIP che le due strade veloci non sanno leggere.
    try{ return await extractRarPages(file); }
    catch(e){ console.error('unzip', e); throw new Error('Questo .cbz è illeggibile o danneggiato.'); }
  }
  if(isRar || nameLc.endsWith('.cbr')){
    try{ return await extractRarPages(file); }
    catch(e){ console.error('rar', e); throw new Error('Questo .cbr è illeggibile, danneggiato o cifrato.'); }
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
  detachCurrentAlbum();   // via le tavole dell'albo precedente (vedi la funzione)
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
  const primaTavola = renderPage();

  // Prima apertura riuscita in questa cartella: crea la scheda con copertina.
  //
  // Si ASPETTA che la prima tavola sia a schermo. "Non blocca" non basta:
  // fare la copertina vuol dire decodificare un'altra tavola intera e
  // ridisegnarla su canvas, e il thread principale è uno solo. Lanciata
  // insieme alla prima tavola le rubava il posto — misurato su un albo da
  // 350MB, tavole 2480x3508: 1515ms per vedere la pagina con la copertina in
  // mezzo, 478ms senza. Un secondo intero di glifo che gira, per un lavoro
  // che nessuno sta aspettando.
  if(folderId && !_currentAlbumId){
    const token = _openToken;
    Promise.resolve(primaTavola)
      .then(()=> new Promise(r=> whenIdle(r)))   // e poi al primo momento di calma
      .then(()=> createAlbumFromCurrent(folderId, file, token))
      .catch(e=>console.warn('creazione scheda albo fallita:', e));
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
  const blob = await coverFromImage(im);
  if(im._objurl) URL.revokeObjectURL(im._objurl);
  return blob;
}

// Il pezzo che conta davvero: riduci e ricomprimi. Separato perché la sorgente
// migliore è la tavola GIÀ DECODIFICATA a schermo (vedi createAlbumFromCurrent):
// decodificarne una seconda copia solo per fare una miniatura da 500px è il
// lavoro più costoso di tutta l'operazione, ed è del tutto evitabile.
async function coverFromImage(im){
  let w = im.naturalWidth, h = im.naturalHeight;
  if(!w || !h) return null;
  if(w >= h){ h = Math.round(h * COVER_MAX_DIM / w); w = COVER_MAX_DIM; }
  else { w = Math.round(w * COVER_MAX_DIM / h); h = COVER_MAX_DIM; }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(im, 0, 0, w, h);

  let quality = 0.82;
  const encode = ()=> new Promise(res=> canvas.toBlob(res, 'image/jpeg', quality));
  let blob = await encode();
  while(blob && blob.size > COVER_MAX_BYTES && quality > 0.4){
    quality = Math.max(0.4, quality - 0.1);
    blob = await encode();
  }
  return blob;
}

async function createAlbumFromCurrent(folderId, file, token){
  // Rinviata a prima tavola mostrata (vedi openAlbumFromFile): nel frattempo
  // si può già aver aperto un altro albo, e la copertina uscirebbe dalle sue
  // tavole. `token` dice quale apertura l'aveva chiesta.
  if(token != null && token !== _openToken) return;
  const page = pickCoverPage(_pages);
  if(!page) return;

  // Se la tavola da usare è proprio quella già a schermo — il caso normale:
  // un albo mai visto si apre a pagina 1, che è anche la copertina — si
  // disegna da lì. Altrimenti tocca decodificarne un'altra, ed è l'unica
  // spesa vera di questa funzione: su una scansione 2480x3508 mezzo secondo
  // di thread principale, che sfogliando si sente come uno scatto.
  const suSchermo = readerImg();
  const gia = suSchermo && suSchermo.complete && suSchermo.naturalWidth > 0
              && _pages[_idx] === page;
  const coverBlob = gia ? await coverFromImage(suSchermo)
                        : await makeCoverBlob(await pageBlob(_source, page));
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
  detachCurrentAlbum();   // via le tavole dell'albo precedente (vedi la funzione)
  toast('', false, true);
  // `true`: qui l'utente ha toccato un albo che vive su Drive, quindi se serve
  // ricollegarsi la finestra di Google e' la conseguenza di un suo gesto, non
  // una sorpresa. In tutti gli altri punti si resta silenziosi.
  if(!(await ensureDriveConnected(true))){ toast('Ricollega Google Drive per aprire questo albo.', true); return; }
  if(token !== _openToken) return;
  // Per LEGGERE si prende il file intero: dalla cache locale se c'è (istantaneo,
  // zero rete), altrimenti un unico download che poi resta in cache. Leggere a
  // richieste di rete separate, una per tavola, sembrava furbo ma su 4G ogni
  // cambio pagina pagava la latenza: molto peggio di un'attesa sola all'inizio
  // e poi tutto immediato.
  let file;
  // Il segnale di annullamento vive per tutta la durata dello scaricamento e lo
  // rende fermabile dal bottone sotto il glifo (vedi cancelAlbumDownload).
  _dlAbort = new AbortController();
  const dlSignal = _dlAbort.signal;
  showCancelDownload(true);
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
      },
      dlSignal
    );
    file = r.file;
  }catch(e){
    showCancelDownload(false);
    if(_dlAbort && _dlAbort.signal === dlSignal) _dlAbort = null;
    // Annullato di proposito: non è un errore, e cancelAlbumDownload ha già
    // chiuso la vista e detto la sua. Qui non c'è altro da aggiungere.
    if(isDownloadCancelled(e)) return;
    if(token === _openToken) toast('Impossibile scaricare da Drive: '+e.message, true);
    return;
  }
  showCancelDownload(false);
  if(_dlAbort && _dlAbort.signal === dlSignal) _dlAbort = null;
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
    </div>
    <div class="ar-stage">
      <div class="ar-track">
        <div class="ar-cell"><img class="ar-img" alt="" decoding="async"></div>
        <div class="ar-cell"><img class="ar-img" alt="" decoding="async"></div>
        <div class="ar-cell"><img class="ar-img" alt="" decoding="async"></div>
      </div>
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
      <button class="ar-cancel-dl" type="button" data-act="canceldl" hidden>Annulla scaricamento</button>
      <div class="ar-cliplayer" hidden>
        <div class="ar-clipbox" hidden>
          <div class="ar-clip-handle" data-corner="nw"></div>
          <div class="ar-clip-handle" data-corner="ne"></div>
          <div class="ar-clip-handle" data-corner="se"></div>
          <div class="ar-clip-handle" data-corner="sw"></div>
          <div class="ar-clip-handle ar-clip-mid" data-corner="n"></div>
          <div class="ar-clip-handle ar-clip-mid" data-corner="s"></div>
          <div class="ar-clip-handle ar-clip-mid" data-corner="w"></div>
          <div class="ar-clip-handle ar-clip-mid" data-corner="e"></div>
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
        <div class="ar-seek-row">
          <button class="ar-jump" data-act="first" aria-label="Prima pagina" title="Prima pagina">
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M18 5 L10 12 L18 19" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 5.5v13" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>
          </button>
          <input class="ar-seek" type="range" min="0" value="0" step="1" aria-label="Vai alla pagina">
          <button class="ar-jump" data-act="last" aria-label="Ultima pagina" title="Ultima pagina">
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 5 L14 12 L6 19" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 5.5v13" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>
          </button>
        </div>
        <!-- I COMANDI STANNO DOVE ARRIVA IL POLLICE. Ritaglio e "tutta la
             tavola" erano in cima, cioe' nell'angolo piu' lontano dalla mano
             che tiene il telefono: per ritagliare una vignetta si cambiava
             presa. Adesso stanno qui, nella stessa riga del numero di pagina,
             esattamente come nella vista a schermo intero dei frammenti —
             stesso posto, stesse icone, in tutte e due le schermate. -->
        <div class="ar-controls-row">
          <span class="ar-counter"></span>
          <span class="ar-divider" aria-hidden="true"></span>
          <span class="ar-title"></span>
          <div class="ar-top-actions">
            <button class="ar-btn ar-retry" data-act="retryclip" title="Ridisegna il riquadro" hidden>
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20 4v4.6h-4.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span>Riprova</span>
            </button>
            <button class="ar-btn ar-tutta" data-act="tuttalatavola" aria-label="Salva tutta la tavola" title="Tutta la tavola">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V5.6A1.6 1.6 0 0 1 5.6 4H9"/><path d="M15 4h3.4A1.6 1.6 0 0 1 20 5.6V9"/><path d="M20 15v3.4a1.6 1.6 0 0 1-1.6 1.6H15"/><path d="M9 20H5.6A1.6 1.6 0 0 1 4 18.4V15"/></svg>
            </button>
            <button class="ar-btn ar-clip" aria-label="Ritaglia" data-act="clip">
              <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="6.5" cy="6.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="6.5" cy="17.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.6 8.2 20 18 M8.6 15.8 20 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>
            </button>
          </div>
        </div>
      </div>
      <div class="ar-clip-hint" hidden>
        <span class="ar-clip-hint-instruct">Trascina un riquadro sulla pagina</span>
        <div class="ar-clip-hint-confirm" hidden>
          <div class="ar-clip-row">
            <span class="ar-clip-label" data-label="recenti">Recenti</span>
            <span class="ar-clip-dests"></span>
          </div>
          <div class="ar-clip-row ar-clip-row-browse">
            <span class="ar-clip-label" data-label="sfoglia">Sfoglia</span>
            <span class="ar-clip-more-wrap"></span>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(ov);

  ov.addEventListener('click', e=>{
    const b = e.target.closest('[data-act]');
    if(!b) return;
    const act = b.dataset.act;
    if(act === 'close') closeReader();
    else if(act === 'prev') stepPage(-1);
    else if(act === 'next') stepPage(1);
    else if(act === 'clip') toggleClip();
    else if(act === 'first') gotoPage(0);
    else if(act === 'last') gotoPage(_pages.length - 1);
    else if(act === 'retryclip'){ if(ov._clipRetry) ov._clipRetry(); }
    // Salvare la tavola intera è un gesto SOLO: non si "entra in ritaglio" per
    // poi dire "tutta". Il pulsante sta sempre accanto alle forbici e da
    // qualsiasi punto della lettura porta dritto alla domanda "dove la metto".
    // Se il ritaglio era spento lo accende per conto suo — serve la superficie
    // e la capsula delle destinazioni — ma chi tocca non se ne accorge.
    else if(act === 'tuttalatavola'){
      if(!_clipMode) toggleClip(true);
      if(ov._clipTutta) ov._clipTutta();
    }
    // La pastiglia della destinazione È la conferma: un gesto solo invece di
    // "conferma" e poi "scegli dove".
    else if(act === 'confirmclip'){ if(ov._clipConfirm) ov._clipConfirm(b.dataset.dest || null); }
    else if(act === 'catdest'){ e.stopPropagation(); if(ov._clipCatDests) ov._clipCatDests(b, +b.dataset.cat); }
    else if(act === 'tagdest'){ e.stopPropagation(); if(ov._clipTagDests) ov._clipTagDests(b); }
    else if(act === 'canceldl') cancelAlbumDownload();
  });

  // Tap sul centro dell'immagine (fuori clip) = avanti; bordo sinistro = indietro.
  // Gestito dai bottoni ar-nav; qui aggiungiamo tastiera e swipe.
  document.addEventListener('keydown', e=>{
    if(!ov.classList.contains('open')) return;
    if(e.key === 'ArrowRight' || e.key === ' ') stepPage(1);
    else if(e.key === 'ArrowLeft') stepPage(-1);
    else if(e.key === 'Escape'){ if(_clipMode) toggleClip(false); else closeReader(); }
  });

  wireSeek(ov);
  wireGestures(ov);
  wireClip(ov);
  _reader = ov;
  return ov;
}

// Il bottone "Annulla scaricamento" compare sotto il glifo di attesa, e solo
// mentre c'è davvero un download da fermare: aprendo un albo già in cache non
// si vede nemmeno, perché non c'è niente da annullare.
function showCancelDownload(on){
  if(!_reader) return;
  const b = _reader.querySelector('.ar-cancel-dl');
  if(b) b.hidden = !on;
}

// Annullamento chiesto a mano. Si ferma la rete (il controller arriva fino
// alla fetch, vedi downloadDriveFileToCache in drive.js: il file a metà viene
// buttato, non resta un albo troncato in cache), si scarta qualunque lavoro
// ancora in sospeso su questa apertura, e si torna allo scaffale da cui si era
// partiti — un lettore aperto e vuoto sarebbe un vicolo cieco.
function cancelAlbumDownload(){
  if(!_dlAbort) return;
  _dlAbort.abort();
  _dlAbort = null;
  showCancelDownload(false);
  ++_openToken;
  toast('');
  // La vista si chiude SUBITO e poi si allinea la cronologia: così il messaggio
  // qui sotto trova il lettore già chiuso e va a finire sulla schermata
  // References, dove l'utente sta per tornare, invece che su un banner che
  // sparisce nello stesso istante.
  closeReaderUI();
  try{ if(history.state && history.state.view === 'albumreader') history.back(); }catch(e){}
  toast('Scaricamento annullato.');
}

// Apre solo il guscio del lettore (chrome + overlay), senza disegnare
// nessuna pagina: usata per mostrare SUBITO il lettore — col glifo di
// caricamento — mentre l'albo si scarica/estrae ancora, invece di aprirlo
// solo a caricamento concluso (quando il messaggio di stato, e con lui il
// glifo, sarebbe già passato sulla schermata References prima ancora che il
// lettore esistesse).
function openReaderShell(title){
  const ov = _reader || buildReaderDOM();
  // Ogni apertura riparte dal ritaglio SPENTO, sempre, senza dare per scontato
  // che la chiusura precedente abbia fatto pulizia.
  //
  // È il difetto che si vedeva così: si comincia un ritaglio, si chiude
  // l'albo col riquadro ancora in sospeso, si riapre — e toccando "Ritaglia"
  // non succede niente. Non era il pulsante a essere rotto: _clipMode era
  // rimasto TRUE, quindi la prima pressione lo SPEGNEVA invece di accenderlo,
  // e spegnere qualcosa di già spento non si vede. Ne servivano due.
  // La chiusura ha già il suo azzeramento (vedi closeReaderUI), ma basta un
  // percorso che non ci passi — il tasto Indietro di sistema, una schermata
  // riaperta da un'altra strada — perché lo stato sopravviva. Qui invece si
  // passa per forza, qualunque sia l'albo e da dove lo si apra.
  toggleClip(false);
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
  // Si annulla il prefetch ancora in attesa, che altrimenti si metterebbe a
  // decomprimere tavole di un albo non più a schermo. E si svuotano i due
  // buffer: finché tengono una src, il browser conserva il bitmap decodificato
  // (decine di MB su una scansione grande) anche a lettore chiuso.
  cancelIdle(_prefetchT); _prefetchT = null;
  showCancelDownload(false);
  clearReaderCells();
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
// NIENTE tavole decodificate tenute da parte.
//
// Qui prima si decodificavano fino a quattro tavole in Image() a parte,
// tenendole vive per "scaldarle". Non funzionava e costava carissimo:
//   · non funzionava perché il browser non riusa la decodifica di un elemento
//     su un altro, quindi il buffer che mostrava davvero la tavola la
//     decodificava comunque da zero (a rendere istantaneo lo scambio è il
//     precarico DENTRO la cella che la mostrerà, vedi primeNeighbours);
//   · costava carissimo perché una tavola decodificata occupa larghezza ×
//     altezza × 4 byte: su scansioni da 2480×3508 sono ~35MB l'una, cioè fino
//     a 140MB di bitmap tenuti in vita oltre alle celle. Su un telefono
//     quella pressione porta il sistema a buttare via e ridecodificare, ed è
//     il motivo per cui gli albi grandi erano molto peggio dei piccoli.
// Restano i Blob/objectURL già materializzati (vedi pageUrl), che sono
// economici e risparmiano la ri-decompressione dallo ZIP.

// Per un .cbz, getData() (e quindi pageUrl) è SINCRONA e bloccante: unzipSync
// non cede mai il thread. Misurato su un volume da 220 tavole: ~13 ms per
// pagina. renderPage() veniva richiamata una volta per ogni pressione del
// tasto "avanti/indietro", senza aspettare la precedente: sfogliando veloce
// (6 pressioni in rapida successione) si accumulavano fino a ~80 ms di
// decompressioni bloccanti sul thread principale — anche per pagine scartate
// un istante dopo, perché nel frattempo si era già premuto oltre. Da qui lo
// scatto percepito.
// Le due variabili sotto coalescono: mentre una pagina è in caricamento, le
// richieste successive non avviano una NUOVA decompressione — si limitano a
// segnare "è arrivata una richiesta più recente" e a tornare subito. Quando
// il caricamento in corso finisce, si riparte automaticamente dalla pagina
// più recente saltando quelle intermedie: N richieste rapide costano al
// massimo 2 decompressioni (quella già avviata + quella per la pagina finale),
// non N.
// Da quando i passi di UNA pagina scorrono sul nastro (vedi gotoPage), qui ci
// passano solo i salti veri — cursore, prima/ultima, apertura — ma la
// coalescenza resta: trascinare il cursore e rilasciarlo più volte di seguito
// fa esattamente lo stesso effetto delle pressioni rapide di prima.
let _pageLoadBusy = false;
let _pageLoadPending = false;
let _readDir = 1;   // +1 = si sta andando avanti, -1 = indietro

// ── NASTRO A TRE CELLE ──────────────────────────────────────────────────────
// Stessa costruzione della galleria References (vedi il nastro in js/refs.js e
// .refs-lightbox-track in css/refs.css): tre celle affiancate — precedente,
// corrente, successiva — dentro uno stage che le taglia. A riposo il nastro sta
// spostato di esattamente una cella (translateX(-100%), percentuale sulla
// PROPRIA larghezza, quindi non serve mai misurarla in px), così la centrale
// riempie lo schermo. Durante il trascinamento cambia solo quel transform: il
// dito muove il nastro, non si ricostruisce e non si decodifica niente.
//
// Qui però c'è una differenza vera rispetto alla galleria, ed è il motivo per
// cui questa parte è più prudente: una tavola non è una miniatura. A 2480×3508
// pesa ~35MB DECODIFICATA, quindi tenerne tre vive porta il picco di memoria da
// ~70 a ~105MB nel momento del passaggio. È un picco, non un accumulo: le
// tavole fuori finestra continuano a essere liberate da trimPages come prima.
//
// Le tre celle sono elementi DOM FISSI: non si ricreano mai. A pagina cambiata
// quella uscita di scena viene RIUSATA per il nuovo vicino, spostandola nel DOM
// (appendChild su un nodo già presente lo sposta soltanto, senza toccare src né
// decodifica). È la stessa ragione per cui già il vecchio doppio buffer
// caricava la tavola successiva DENTRO il buffer che l'avrebbe mostrata: il
// browser non garantisce di riusare la decodifica se la stessa src passa a un
// ELEMENTO diverso, ma la riusa sempre se è lo stesso elemento che si sposta.
let _arCells = null;        // [{el, img, page, shown}] — 0/1/2 = prec/corrente/succ, SEMPRE
let _arAnimating = false;
let _arPendingDir = 0;

function arTrack(){ return _reader && _reader.querySelector('.ar-track'); }

function ensureArCells(){
  if(_arCells) return _arCells;
  const track = arTrack();
  if(!track) return null;
  _arCells = Array.from(track.children).map(el=>({
    el, img: el.querySelector('.ar-img'),
    page: null,    // tavola ASSEGNATA alla cella (anche se ancora in caricamento)
    shown: null,   // tavola davvero dipinta dentro la cella
  }));
  return _arCells;
}

// Riporta il nastro a riposo senza animazione: cella centrale al centro.
// Quanto il nastro è spostato, in px, rispetto alla sua posizione di riposo.
// Serve a dosare la durata dell'animazione su quanto resta DAVVERO da
// percorrere (vedi commitPageSwipe): a nastro fermo è zero.
let _arOffsetPx = 0;

function restArTrack(){
  _arOffsetPx = 0;
  const track = arTrack();
  if(!track) return;
  track.style.transition = 'none';
  track.style.willChange = '';
  track.style.transform = 'translate3d(-100%,0,0)';
}

// L'ordine di _arCells È l'ordine visivo: si riallinea il DOM all'array.
function applyArOrder(){
  const track = arTrack();
  if(!track || !_arCells) return;
  _arCells.forEach(c=> track.appendChild(c.el));
}
function rotateArForward(){  const [a,b,c] = _arCells; _arCells = [b,c,a]; applyArOrder(); }
function rotateArBackward(){ const [a,b,c] = _arCells; _arCells = [c,a,b]; applyArOrder(); }

// Lo zoom vive sull'immagine della cella centrale. Quando le celle ruotano,
// quella che esce di scena si porterebbe dietro la propria trasformazione e
// tornerebbe al centro, un giro dopo, già ingrandita.
function resetArTransforms(){
  if(!_arCells) return;
  _arCells.forEach(c=>{
    c.img.style.transition = 'none';
    c.img.style.transform = 'translate(0px, 0px) scale(1)';
  });
}

function cellHas(cell, index){
  return !!(cell && cell.shown === index && cell.img.complete && cell.img.naturalWidth > 0);
}

// Carica UNA cella con la tavola dell'indice dato. La cella resta segnata
// "pending" finché decode() non è risolta: sulle laterali il lavoro avviene
// fuori schermo e non si vede, ma su una sorgente lenta (Drive, o un .cbr da
// decomprimere) può capitare di arrivarci sopra prima che sia pronta — e una
// cella vuota senza spiegazione è peggio di una che dice "sto arrivando".
async function loadArCell(cell, index, token){
  if(!cell) return;
  if(index < 0 || index >= _pages.length){
    cell.page = null; cell.shown = null;
    cell.el.classList.remove('pending');
    cell.img.removeAttribute('src');
    return;
  }
  if(cellHas(cell, index)){
    cell.page = index;
    cell.el.classList.remove('pending');
    return;
  }
  // Una cella che sta per cambiare tavola si SVUOTA subito. Lasciarci sopra
  // quella di prima costerebbe caro proprio nel caso che conta: se lo swipe
  // arriva mentre la nuova si sta ancora estraendo, si scivolerebbe su una
  // tavola sbagliata invece che su un'attesa dichiarata.
  if(cell.shown !== index){
    cell.img.removeAttribute('src');
    cell.shown = null;
  }
  cell.page = index;
  cell.el.classList.add('pending');
  const url = await pageUrl(_source, _pages[index]);
  // Albo cambiato sotto i piedi, o cella già riassegnata a un'altra tavola
  // mentre si estraeva: questo lavoro non serve più, e peggio ancora
  // sovrascriverebbe una cella che ormai serve a qualcos'altro.
  if(token !== _openToken || cell.page !== index) return;
  if(!url){ cell.el.classList.remove('pending'); return; }
  if(cell.img.src !== url) cell.img.src = url;
  // decode() e non 'load': 'load' vuol dire solo "byte arrivati", mentre su una
  // tavola grande il lavoro pesante è la decodifica, e mostrarla prima che sia
  // finita si vede come uno scatto.
  try{ await cell.img.decode(); }
  catch(e){ /* src cambiata a metà o tavola rotta: si prosegue comunque */ }
  if(token !== _openToken || cell.page !== index) return;
  cell.shown = index;
  cell.el.classList.remove('pending');
}

// Interfaccia intorno alla tavola (contatore, frecce, cursore, salti): non
// dipende dai byte della pagina, si aggiorna SUBITO — sia in apertura sia a
// ogni pagina completata. Si vede il cursore seguire il dito all'istante anche
// mentre l'immagine sta ancora raggiungendo l'ultima pagina scelta.
function updateReaderChrome(){
  if(!_reader || !_pages.length) return;
  const idx = _idx;
  const pad = String(_pages.length).length;
  _reader.querySelector('.ar-counter').textContent = String(idx + 1).padStart(pad, '0') + ' / ' + _pages.length;
  _reader.querySelector('.ar-prev').style.visibility = idx > 0 ? 'visible' : 'hidden';
  _reader.querySelector('.ar-next').style.visibility = idx < _pages.length - 1 ? 'visible' : 'hidden';
  const seek = _reader.querySelector('.ar-seek');
  if(seek && !seek._dragging){
    seek.max = String(Math.max(0, _pages.length - 1));
    seek.value = String(idx);
  }
  const first = _reader.querySelector('[data-act="first"]');
  const last = _reader.querySelector('[data-act="last"]');
  if(first) first.disabled = idx === 0;
  if(last) last.disabled = idx >= _pages.length - 1;
}

async function renderPage(){
  if(!_reader || !_pages.length) return;
  resetZoom(); // ogni tavola si apre a dimensione naturale
  updateReaderChrome();
  if(_pageLoadBusy){ _pageLoadPending = true; return; }
  await loadCenterPage();
  while(_pageLoadPending){
    _pageLoadPending = false;
    await loadCenterPage();
  }
}

// Salto "a freddo": apertura dell'albo, cursore di scorrimento, prima/ultima
// pagina. La tavola nuova NON si carica nella cella centrale, ma in una
// laterale, che viene poi portata al centro d'un colpo, senza animazione.
// Sembra un giro largo ed è invece il vecchio doppio buffer detto sul nastro:
// assegnare una src nuova all'immagine centrale la svuoterebbe all'istante,
// lasciando lo schermo nero per tutta la decompressione. Così invece la tavola
// che stai guardando resta lì finché la prossima non è pronta a essere dipinta.
async function loadCenterPage(){
  _pageLoadBusy = true;
  // Quale ALBO stiamo servendo. Controllare solo l'indice non basta: due albi
  // diversi stanno quasi sempre entrambi a pagina 0, quindi il lavoro rimasto
  // in sospeso sul primo passava i controlli e finiva per dipingere le sue
  // tavole dentro il secondo — è il bug "apro OPUS e si apre ancora Naruto".
  const token = _openToken;
  const stale = ()=> token !== _openToken || !_reader;
  try{
    const cells = ensureArCells();
    if(!cells) return;
    const idx = _idx;
    if(!cellHas(cells[1], idx)){
      // Cella di scorta: quella dal lato OPPOSTO al verso di lettura, che dopo
      // la rotazione finisce comunque alle spalle. Resta fuori schermo per
      // tutto il caricamento.
      const spareAt = _readDir >= 0 ? 2 : 0;
      await loadArCell(cells[spareAt], idx, token);
      if(stale() || idx !== _idx) return;  // albo o pagina cambiati: scarta
      if(spareAt === 2) rotateArForward(); else rotateArBackward();
      restArTrack();
      resetArTransforms();
      resetZoom();
      measureBaseSize();   // dimensioni a riposo, per lo zoom senza ricalcoli
    }
    if(stale() || idx !== _idx) return;
    primeNeighbours(idx, token);
  } finally {
    _pageLoadBusy = false;
  }
}

// Prepara i due vicini DENTRO le celle che li mostreranno, e lascia al thread
// libero il resto della finestra.
//
// È il punto che rendeva lento lo sfogliare sugli albi grandi. Il prefetch di
// una volta decodificava la tavola in un Image() usa-e-getta: il browser tiene
// in cache la RISORSA ma non garantisce di riusare la DECODIFICA su un altro
// elemento — e con un blob: la risorsa è già locale, quindi quel prefetch non
// risparmiava quasi niente. Ogni tavola veniva perciò decodificata da zero
// proprio nell'istante in cui andava mostrata: misurato con swipe veri su
// tavole 2480×3508 (CPU 8×), il contatore avanzava subito ma l'immagine
// arrivava ~400ms dopo, ed è esattamente la sensazione di "swipe che non
// funziona".
//
// Col nastro le celle vicine SONO il prefetch, e per costruzione è simmetrico:
// prima si preparava solo il verso di lettura, perché di buffer liberi ce n'era
// uno solo; adesso trascinare in avanti o all'indietro trova in entrambi i casi
// il lavoro già fatto.
function primeNeighbours(idx, token){
  if(!_arCells) return;
  // Un fotogramma di ritardo, non di più. Estrarre una tavola da un .cbz è
  // lavoro SINCRONO e bloccante (~13ms l'una, vedi il commento su unzipSync):
  // partendo nello stesso istante in cui la pagina si posa — che è anche
  // l'istante in cui spesso il dito si appoggia per lo swipe successivo — quei
  // due lavori cadono dentro il primo fotogramma del gesto e si sentono come
  // una partenza impastata. Un rAF li sposta fuori, e per un precarico
  // sedici millisecondi non cambiano niente.
  requestAnimationFrame(()=>{
    if(token !== _openToken || !_arCells || _idx !== idx) return;
    loadArCell(_arCells[0], idx - 1, token);
    loadArCell(_arCells[2], idx + 1, token);
  });
  // Il resto della finestra (due tavole nel verso di lettura, una alle spalle)
  // resta rinviato a thread libero e si limita a ESTRARRE i byte, senza
  // decodificarli: così saltando avanti o tornando indietro non si ripaga la
  // decompressione, ma non si accumulano bitmap in memoria.
  //
  // Rinviato a thread libero (con la sorgente pigra ogni tavola costa una
  // decompressione, o una richiesta Drive) ma NON annullato ad ogni cambio
  // pagina: il controllo di pertinenza qui sotto scarta da solo il lavoro
  // diventato inutile, senza buttare via quello ancora buono.
  const dir = _readDir;
  const wanted = [idx + 2*dir, idx - dir];
  _prefetchT = whenIdle(async ()=>{
    for(const i of wanted){
      if(token !== _openToken || !_reader) return;   // nel frattempo si è aperto un altro albo
      if(i < 0 || i >= _pages.length) continue;
      // Ancora dentro la finestra utile rispetto a dove siamo ADESSO?
      // Se nel frattempo si è saltati altrove, questa tavola non serve più.
      if(Math.abs(i - _idx) > 2) continue;
      await pageUrl(_source, _pages[i]);
    }
    trimPages();
  });
}

// La durata si commisura a quanto resta DAVVERO da percorrere, non è più fissa.
// Con una durata fissa gli ultimi centimetri dopo un trascinamento lungo si
// prendevano gli stessi 220ms di una pagina girata da ferma: il dito aveva già
// fatto quasi tutto il lavoro e il nastro sembrava frenare sul più bello. Il
// minimo esiste perché sotto una certa soglia un movimento non si legge più
// come movimento, ma come uno scatto.
const AR_DUR_MAX = 220, AR_DUR_MIN = 90;
const AR_EASE = 'cubic-bezier(.22,.61,.36,1)';
function arDuration(distanza, larghezza){
  if(!larghezza) return AR_DUR_MAX;
  const quota = Math.min(1, Math.max(0, distanza / larghezza));
  return Math.round(Math.max(AR_DUR_MIN, AR_DUR_MAX * quota));
}

// Rete di sicurezza sotto transitionend: se il nastro è già esattamente al
// valore d'arrivo (un trascinamento uscito e rientrato allo stesso punto prima
// del rilascio) la proprietà non cambia e transitionend non scatta mai — senza
// questa rete _arAnimating resterebbe bloccato a true per sempre.
let _arFinish = null;   // conclusione dell'animazione in corso, per poterla anticipare
function afterArTransition(track, ms, cb){
  let done = false;
  const finish = ()=>{
    if(done) return;
    done = true;
    track.removeEventListener('transitionend', onEnd);
    clearTimeout(timer);
    if(_arFinish === finish) _arFinish = null;
    cb();
  };
  const onEnd = e=>{ if(e.target === track && e.propertyName === 'transform') finish(); };
  track.addEventListener('transitionend', onEnd);
  const timer = setTimeout(finish, ms + 40);
  _arFinish = finish;
}

// Chiude SUBITO l'animazione in corso, invece di ignorare il gesto che arriva
// mentre il nastro sta ancora scorrendo.
//
// È il motivo per cui a volte serviva un doppio swipe. Fra una pagina e l'altra
// passano ~220ms di scorrimento, e in quella finestra il tocco successivo non
// veniva rallentato: veniva buttato via del tutto, perché il trascinamento
// nemmeno si armava. Sfogliando di lena si finisce in quella finestra di
// continuo, e la sensazione è "il primo swipe non l'ha preso".
function flushArTransition(){
  if(_arFinish) _arFinish();
}

// Anima il nastro di una cella intera e, a fine corsa, ricicla le celle e
// sposta l'indice. Unico ingresso sia per lo swipe confermato sia per frecce e
// tastiera: partendo da un trascinamento già in corso continua da dove il dito
// l'ha lasciato (la transizione interpola dal valore ATTUALE), partendo a
// freddo il nastro è già a riposo e scorre uguale.
function commitPageSwipe(dir){
  // Comando arrivato mentre il nastro scorre ancora (frecce premute in rapida
  // successione, swipe incalzanti): si chiude subito quello in corso e si
  // riparte da lì, invece di lasciar cadere il comando.
  if(_arAnimating) flushArTransition();
  if(_arAnimating) return;   // non si è chiusa: meglio perdere un passo che accavallarne due
  const target = _idx + dir;
  if(target < 0 || target >= _pages.length) return;
  const track = arTrack();
  const cells = ensureArCells();
  if(!track || !cells) return;
  _arAnimating = true;
  _arPendingDir = dir;
  // Se la cella verso cui si sta andando non è ancora pronta (sorgente lenta, o
  // un salto che ha scavalcato il prefetch) la si avvia adesso: arriverà col
  // suo segno di attesa invece che come un buco muto.
  loadArCell(dir > 0 ? cells[2] : cells[0], target, _openToken);
  // Quanta strada resta: una cella intera partendo da fermo (freccia,
  // tastiera), molto meno se il dito ha già trascinato quasi tutto.
  const w = track.clientWidth || 0;
  const ms = arDuration(w - Math.min(w, Math.abs(_arOffsetPx)), w);
  track.style.willChange = 'transform';
  track.style.transition = `transform ${ms}ms ${AR_EASE}`;
  track.style.transform = dir > 0 ? 'translate3d(-200%,0,0)' : 'translate3d(0%,0,0)';
  afterArTransition(track, ms, onPageSettled);
}

function onPageSettled(){
  const dir = _arPendingDir;
  if(dir > 0) rotateArForward(); else rotateArBackward();
  restArTrack();
  resetArTransforms();
  _idx += dir;
  _readDir = dir;   // il verso di lettura è quello appena percorso
  _arAnimating = false;
  resetZoom();
  measureBaseSize();
  updateReaderChrome();
  saveReadingPos();
  if(_currentAlbumId) updateAlbumLastPage(_currentAlbumId, _idx);
  // Il vicino lontano, appena rivelato dalla rotazione, si prepara subito: è la
  // cella riciclata, che porta ancora la tavola di due passi fa.
  primeNeighbours(_idx, _openToken);
}

// Rilascio senza conferma: il nastro torna a riposo con la stessa molla della
// conferma, così cambiare idea a metà gesto si sente naturale quanto arrivare
// in fondo.
function cancelPageSwipe(){
  const track = arTrack();
  if(!track) return;
  _arAnimating = true;
  // Anche il rientro dura quanto la strada da rifare: se il dito si era mosso
  // di poco, il nastro torna a posto subito invece di prendersi tutto il tempo
  // di una pagina intera.
  const w = track.clientWidth || 0;
  const ms = arDuration(Math.abs(_arOffsetPx), w);
  track.style.willChange = 'transform';
  track.style.transition = `transform ${ms}ms ${AR_EASE}`;
  track.style.transform = 'translate3d(-100%,0,0)';
  afterArTransition(track, ms, ()=>{
    _arOffsetPx = 0;
    track.style.transition = '';
    track.style.willChange = '';
    _arAnimating = false;
  });
}

// Ai due estremi dell'albo non c'è niente da mostrare oltre: il nastro cede
// sempre meno, come una molla, invece di scorrere su una cella vuota.
function arResistance(dx, w){
  if(!w) return dx;
  const goingNext = dx < 0;
  const blocked = goingNext ? (_idx + 1 >= _pages.length) : (_idx - 1 < 0);
  if(!blocked) return dx;
  return edgeSpring(dx, w);
}

// Un passo avanti o indietro rispetto a dove siamo ADESSO. Va chiesto come
// DIREZIONE, mai come indice calcolato da fuori: se il nastro sta ancora
// scorrendo, quell'indice è quello di PRIMA, e dopo la chiusura anticipata
// dell'animazione (vedi flushArTransition) coincide con la pagina in cui siamo
// appena arrivati — il comando verrebbe scartato come "sei già lì". È il
// motivo per cui premendo le frecce di lena ne passava sì e no una su due.
function stepPage(dir){
  if(_clipMode) return;
  if(_arAnimating) flushArTransition();
  gotoPage(_idx + dir);
}

function gotoPage(i){
  if(_clipMode) return; // in ritaglio la navigazione è disattivata
  // Un salto richiesto mentre il nastro scorre chiude prima quello in corso:
  // così _idx è già quello giusto quando si decide se è un passo o un salto.
  if(_arAnimating) flushArTransition();
  if(i < 0 || i >= _pages.length || i === _idx) return;
  if(_arAnimating) return;
  // Un passo solo: lo fa scorrere il nastro, riciclando celle già pronte invece
  // di ricaricare qualcosa. Vale anche per frecce e tastiera, così il movimento
  // è lo stesso da qualunque comando arrivi.
  if(Math.abs(i - _idx) === 1 && _reader && _reader.classList.contains('open')){
    commitPageSwipe(i > _idx ? 1 : -1);
    return;
  }
  // Salto vero (cursore, prima/ultima): non c'è niente da far scorrere, si
  // cambia la tavola sotto — vedi loadCenterPage.
  // Verso di lettura: saltando in avanti le pagine utili da preparare sono
  // quelle DAVANTI, non quelle già lasciate indietro (vedi primeNeighbours).
  _readDir = i > _idx ? 1 : -1;
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

// L'immagine a schermo è quella della cella CENTRALE, e le celle si riciclano
// a ogni pagina: va sempre risolta al momento dell'uso, mai memorizzata in una
// closure.
function readerImg(){
  const cells = _arCells || ensureArCells();
  return cells ? cells[1].img : null;
}

// Stacca l'albo precedente prima di aprirne un altro. Da chiamare SUBITO,
// appena si sa che si sta aprendo qualcosa di nuovo — non a fine
// scaricamento: fra il tap e la prima tavola di un albo da mezzo giga passano
// minuti, e per tutto quel tempo il lettore mostrava titolo nuovo e tavole
// vecchie, contatore compreso, con lo swipe che sfogliava ancora l'albo di
// prima. Chi guarda vede semplicemente "ho aperto OPUS ed è uscito Naruto".
function detachCurrentAlbum(){
  saveReadingPos();          // la posizione dell'albo che stiamo lasciando
  cancelIdle(_prefetchT); _prefetchT = null;
  clearReaderCells();
  clearPages();              // niente più tavole da sfogliare finché non arrivano le nuove
  _albumSig = null;
  _currentAlbumId = null;
  _idx = 0;
  if(_reader){
    const c = _reader.querySelector('.ar-counter');
    if(c) c.textContent = '';
    const seek = _reader.querySelector('.ar-seek');
    if(seek) seek.value = '0';
    _reader.querySelector('.ar-prev').style.visibility = 'hidden';
    _reader.querySelector('.ar-next').style.visibility = 'hidden';
  }
}

// Svuota tutte e tre le celle: finché tengono una src il browser conserva il
// bitmap decodificato (decine di MB l'uno su una scansione grande), e —
// soprattutto — la tavola dell'albo precedente resta a schermo.
function clearReaderCells(){
  if(!_reader) return;
  const cells = ensureArCells();
  if(!cells) return;
  cells.forEach(c=>{
    c.img.removeAttribute('src');
    c.page = null; c.shown = null;
    c.el.classList.remove('pending');
  });
  restArTrack();
  resetArTransforms();
  _arAnimating = false;
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
  if(img) img.style.transition = animate ? ZOOM_TRANSITION : 'none';
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

// Fin dove si può spostare la tavola prima di "perderla" fuori dallo schermo.
// Le dimensioni base sono in cache (measureBaseSize): il limite si calcola a
// memoria, senza toccare il layout ad ogni movimento del dito.
function panLimits(scale){
  if(!_baseW || !_baseH) measureBaseSize();
  return limitiPan(_baseW, _baseH, scale);
}
function clampPan(scale, x, y){
  return clampTo(panLimits(scale), x, y);
}

// Alterna 1x ↔ ZOOM_IN centrando sul punto toccato/cliccato.
function zoomAt(clientX, clientY){
  const img = readerImg();
  if(!img) return;
  img.style.transition = ZOOM_TRANSITION;
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
  let x0 = 0, y0 = 0;
  let pinching = false, startDist = 0, startScale = 1;
  let panning = false, panX = 0, panY = 0, origX = 0, origY = 0;
  let lastTap = 0, lastTapX = 0, lastTapY = 0, lastTouchAt = 0;
  // Il tocco in corso ha gia' fatto scattare lo zoom quando si e' appoggiato:
  // al rilascio non va riconteggiato, o un terzo tocco ravvicinato
  // rimpicciolirebbe senza che nessuno lo abbia chiesto.
  let doppioConsumato = false;

  // Trascinamento del NASTRO (cambio pagina a 1x): "candidato" appena parte un
  // tocco singolo a dimensione naturale, "armato" solo quando il movimento
  // indica chiaramente un gesto orizzontale — prima di allora il nastro resta
  // fermo, così un tap con un lieve tremore del dito non lo smuove di un pixel
  // e la logica di tap/doppio tap qui sotto funziona invariata.
  let dragCandidate = false, dragArmed = false, stageW = 0;
  let lastX = 0, lastT = 0, prevX = 0, prevT = 0;
  const ARM_PX = 8;
  // Da dove si conta lo spostamento del nastro. Di solito è il punto in cui il
  // dito si è appoggiato, ma quando si passa dallo spostare la tavola allo
  // sfogliare (vedi il passaggio di consegne più sotto) diventa il punto in cui
  // la tavola è finita: altrimenti il nastro partirebbe già spostato di tutto
  // il tragitto fatto per attraversare la pagina ingrandita.
  let dragOriginX = 0;
  // Il trascinamento arriva dal bordo di una tavola ingrandita, invece che da
  // una pagina a dimensione naturale? Cambia tutto: da ingranditi il cambio
  // pagina non deve MAI capitare per sbaglio, quindi il nastro si comporta
  // come una molla e non accetta scorciatoie (vedi il rilascio più sotto).
  let dragFromEdge = false;
  // Questo gesto ha il permesso di girare pagina? Lo prende al touchstart e
  // non cambia più fino al rilascio (vedi il commento lì).
  let edgeReady = false;
  // Dove stava il dito quando la tavola ha finito di scorrere. Da lì si conta
  // l'insistenza, in pixel di DITO: contarla sullo spostamento della tavola
  // sarebbe falsato dal guadagno di panGain.
  let pinnedAtX = null;

  const dist = (a, b) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);

  stage.addEventListener('touchstart', e=>{
    if(_clipMode) return;
    lastTouchAt = Date.now();
    const img = readerImg();
    if(img) img.style.transition = 'none';
    const t = e.touches;
    if(t.length === 2){
      pinching = true; panning = false; dragCandidate = false; dragArmed = false;
      startDist = dist(t[0], t[1]); startScale = _zoom;
    } else if(t.length === 1){
      pinching = false;
      x0 = t[0].clientX; y0 = t[0].clientY;
      // ── IL DOPPIO TOCCO SI DECIDE QUI, NON AL RILASCIO ──
      //
      // Prima lo zoom partiva sul touchend del secondo tocco: fra il momento
      // in cui il dito arrivava e quello in cui l'immagine si muoveva passava
      // tutto il tempo di CONTATTO di quel tocco — un decimo di secondo
      // buono, che si sente eccome. Eppure quando il secondo dito si appoggia
      // non c'e' piu' niente da sapere: il primo tocco c'e' stato, e' stato
      // meno di 400ms fa e a meno di 50px da qui. Aspettare il rilascio non
      // aggiungeva nessuna informazione, aggiungeva solo attesa.
      //
      // E' anche il momento in cui zoomano i visualizzatori di foto del
      // telefono, quindi la mano se lo aspetta gia'.
      if(Date.now() - lastTap < 400 && Math.hypot(x0 - lastTapX, y0 - lastTapY) < 50){
        lastTap = 0;
        doppioConsumato = true;   // il rilascio non deve contarlo come un tocco nuovo
        panning = false; dragCandidate = false; dragArmed = false;
        dragFromEdge = false; pinnedAtX = null;
        zoomAt(x0, y0);
        return;
      }
      if(_zoom > 1.02){
        panning = true; dragCandidate = false; dragArmed = false;
        dragFromEdge = false; pinnedAtX = null;
        panX = x0; panY = y0; origX = _zx; origY = _zy;
        stageW = stage.clientWidth;
        // SI PUÒ GIRARE PAGINA SOLO SE IL DITO SI APPOGGIA QUANDO LA TAVOLA È
        // GIÀ A FINE CORSA.
        //
        // È la regola che mancava. Su una tavola ingrandita il bordo
        // orizzontale è vicinissimo — bastano un paio di centimetri di dito
        // per arrivarci — quindi muovendosi dentro la tavola ci si sbatte
        // contro di continuo, e ogni volta il gesto rischiava di trasformarsi
        // in uno sfoglio: si voleva guardare una vignetta e si cambiava
        // pagina. Ora l'esplorazione e lo sfoglio sono due gesti DIVERSI:
        // arrivare al bordo trascinando non gira mai pagina, per quanto si
        // insista. Si stacca il dito, lo si riappoggia — adesso la tavola è a
        // fine corsa — e da lì si sfoglia.
        // Se poi la tavola ingrandita è comunque più stretta dello schermo non
        // c'è nessuna corsa orizzontale da fare: maxX vale 0, la condizione è
        // vera da subito, e lo sfoglio funziona come a dimensione naturale.
        edgeReady = Math.abs(_zx) >= panLimits(_zoom).maxX - 1;
      } else {
        panning = false;
        dragFromEdge = false; pinnedAtX = null; edgeReady = true;
        // Il dito è arrivato mentre il nastro scorreva ancora: si chiude subito
        // l'animazione e questo gesto parte da pagina ferma, invece di essere
        // scartato (vedi flushArTransition — è la causa del "doppio swipe").
        if(_arAnimating) flushArTransition();
        dragCandidate = _pages.length > 0;
        dragArmed = false;
        stageW = stage.clientWidth;
        dragOriginX = x0;
        lastX = prevX = x0;
        lastT = prevT = performance.now();
        // Il livello di composizione si prepara già ORA, non alla prima
        // frazione di movimento: promuovere un nastro di tre tavole grandi
        // costa una passata di raster, e pagarla dentro il primo fotogramma
        // del trascinamento è esattamente ciò che si sente come partenza
        // impastata. Si spegne da sé a fine gesto (vedi restArTrack).
        const track = arTrack();
        if(track) track.style.willChange = 'transform';
      }
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
      const x = t[0].clientX, y = t[0].clientY;
      // Il dito porta PIÙ di quanto si muove (vedi panGain): a 1:1 attraversare
      // una tavola ingrandita voleva dire ripassare il dito tre o quattro
      // volte da bordo a bordo, e leggere ingranditi risultava più scomodo
      // che leggere a pagina intera.
      const g = panGain(_zoom);
      const vogliaX = origX + (x - panX) * g;
      const vogliaY = origY + (y - panY) * g;
      const c = clampPan(_zoom, vogliaX, vogliaY);
      const oltre = vogliaX - c.x;   // quanto si è chiesto OLTRE il bordo
      _zx = c.x; _zy = c.y;
      applyZoom();
      // PASSAGGIO DI CONSEGNE: la tavola è finita e il dito continua a
      // spingere da quella parte. Non c'è più niente da mostrare lì, quindi da
      // qui in poi il gesto muove il NASTRO e può girare pagina — senza dover
      // prima uscire dall'ingrandimento, tornare indietro e ripartire.
      // Il verso torna da solo: fermi sul bordo sinistro della tavola si sta
      // spingendo verso destra, che è la pagina precedente; sul bordo destro
      // verso sinistra, che è la successiva.
      //
      // L'insistenza si misura in pixel di DITO da quando la tavola si è
      // fermata, non sullo scarto della tavola: quello è moltiplicato da
      // panGain, e faceva scattare il passaggio molto prima di quanto la mano
      // si aspettasse.
      if(Math.abs(oltre) < 0.5) pinnedAtX = null;         // rientrati nella tavola
      else if(pinnedAtX === null) pinnedAtX = x;          // appena arrivati al bordo
      if(edgeReady && pinnedAtX !== null && Math.abs(x - pinnedAtX) > EDGE_HANDOFF
         && Math.abs(x - panX) > Math.abs(y - panY)){
        panning = false;
        dragCandidate = true; dragArmed = true; dragFromEdge = true;
        dragOriginX = x;
        lastX = prevX = x; lastT = prevT = performance.now();
        const track = arTrack();
        if(track){ track.style.transition = 'none'; track.style.willChange = 'transform'; }
      }
    } else if(dragCandidate && t.length === 1){
      const x = t[0].clientX, y = t[0].clientY;
      const ddx = x - dragOriginX, ddy = y - y0;
      if(!dragArmed){
        if(Math.abs(ddx) > ARM_PX && Math.abs(ddx) > Math.abs(ddy)){
          dragArmed = true;
          const track = arTrack();
          if(track){ track.style.transition = 'none'; track.style.willChange = 'transform'; }
        } else if(Math.abs(ddy) > ARM_PX * 3 && Math.abs(ddy) > Math.abs(ddx) * 2){
          // Si rinuncia solo davanti a un gesto LUNGO e chiaramente verticale.
          // Prima bastavano 8px in verticale per spegnere il candidato PER
          // SEMPRE: un pollice non si muove mai in orizzontale puro, quindi i
          // primi campioni di uno swipe normale sono spesso più verticali che
          // orizzontali (6px di lato, 12 in giù) — roba da rumore, non da
          // intenzione. Quello swipe restava morto anche quando il dito
          // proseguiva dritto di traverso allo schermo, e bisognava rifare il
          // gesto da capo. Sotto questa soglia non si decide: si aspetta il
          // campione dopo.
          // Nel lettore non esiste nessun gesto verticale da proteggere (lo
          // stage ha touch-action:none), quindi rinunciare tardi non toglie
          // niente a nessuno.
          dragCandidate = false;
          return;
        } else {
          return;   // ancora ambiguo: si aspetta il campione successivo
        }
      }
      prevX = lastX; prevT = lastT;
      lastX = x; lastT = performance.now();
      // Dal bordo di una tavola ingrandita il nastro non segue il dito: cede
      // come una molla, sempre meno man mano che si insiste. È il "magnetico"
      // che si vuole — si sente che la pagina resiste, e cambia solo se si
      // decide davvero di andare oltre.
      _arOffsetPx = dragFromEdge ? edgeSpring(ddx, stageW) : arResistance(ddx, stageW);
      const track = arTrack();
      if(track) track.style.transform = `translate3d(calc(-100% + ${_arOffsetPx}px),0,0)`;
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
    // ── RILASCIO DI UN TRASCINAMENTO ARMATO: conferma o molla indietro ──
    // Si conferma per DISTANZA (oltre il 30% dello schermo) o per VELOCITÀ,
    // misurata sugli ultimi due campioni e non sull'intero gesto — così un
    // trascinamento lento che finisce con uno scatto conta come scatto. Il
    // secondo controllo (durata totale breve + distanza minima) resta come rete
    // di sicurezza per i gesti troppo rapidi da campionare bene: prima, con la
    // sola soglia sulla diagonale, un flick corto spesso non arrivava e la
    // pagina non girava, costringendo a ripetere il gesto.
    if(dragArmed){
      dragArmed = false; dragCandidate = false;
      const dx = t.clientX - dragOriginX;
      const adx = Math.abs(dx);
      const vx = lastT > prevT ? (lastX - prevX) / (lastT - prevT) : 0;
      const elapsed = Date.now() - lastTouchAt;
      const dir = dx < 0 ? 1 : -1;   // trascino a sinistra → avanti
      const blocked = dir > 0 ? (_idx + 1 >= _pages.length) : (_idx - 1 < 0);
      let vaiAvanti;
      if(dragFromEdge){
        // Da ingranditi conta solo quanto la molla è stata TIRATA — cioè
        // quello che si vede, non quanto è corso il dito — e non vale nessuna
        // scorciatoia di velocità. Era il flick ad aver reso il cambio pagina
        // troppo facile: un colpetto secco al bordo bastava a girare, anche
        // quando si voleva solo finire di guardare la tavola.
        vaiAvanti = Math.abs(edgeSpring(dx, stageW)) > stageW * EDGE_COMMIT_ZOOM;
      } else {
        const distOk = adx > stageW * 0.3;
        const flickOk = (Math.abs(vx) > 0.5 && Math.sign(vx) === Math.sign(dx)) || (elapsed < 300 && adx > 24);
        vaiAvanti = distOk || flickOk;
      }
      dragFromEdge = false;
      if(!blocked && vaiAvanti) commitPageSwipe(dir);
      else cancelPageSwipe();
      return;
    }
    // Gesto finito senza mai armarsi (un tap, o un movimento verticale): il
    // livello di composizione preparato al touchstart non serve più.
    dragCandidate = false;
    if(!_arAnimating){ const tk = arTrack(); if(tk) tk.style.willChange = ''; }
    const dx = t.clientX - x0, dy = t.clientY - y0;
    const moved = Math.hypot(dx, dy);
    if(doppioConsumato){
      doppioConsumato = false;
    } else if(moved < 20){
      // Primo tocco di un'eventuale coppia: si segna dov'era e quando. Lo
      // zoom, se arriva il secondo, scatta al suo touchstart (vedi sopra).
      lastTap = Date.now(); lastTapX = t.clientX; lastTapY = t.clientY;
    }
  }, { passive: true });

  // Un tocco annullato dal sistema (una notifica, un gesto di bordo) non emette
  // touchend: senza questo il nastro resterebbe fermo dov'era il dito, a metà
  // fra due tavole.
  stage.addEventListener('touchcancel', ()=>{
    pinching = false; panning = false;
    if(dragArmed) cancelPageSwipe();
    else if(!_arAnimating){ const tk = arTrack(); if(tk) tk.style.willChange = ''; }
    dragArmed = false; dragCandidate = false; dragFromEdge = false; pinnedAtX = null;
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
