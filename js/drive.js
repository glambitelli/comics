// ── GOOGLE DRIVE — sorgente "senza picker" per gli albi ──
// Filosofia: la maggior parte dei .cbz/.cbr vive in un account Google Drive
// dedicato al progetto. Una volta collegato, i file dentro una sottocartella
// (che deve chiamarsi come la cartella-autore in Inkflow) compaiono da soli
// nello scaffale Albi, con copertina già pronta: si tocca e si legge, senza
// mai passare dal selettore file locale. Quello resta solo come ripiego per
// tutto ciò che non è su Drive (vedi albums.js → openAlbumPicker).
//
// Niente backend, niente libreria esterna: l'autenticazione è un classico
// OAuth "implicit flow" in popup (redirect su oauth-callback.html, stesso
// dominio), le chiamate sono normali fetch alle REST API di Drive v3 con il
// solo header Authorization — nessun segreto da proteggere perché lo scope è
// "readonly" e il client è pubblico, come si conviene a una SPA statica.
//
// ── CONFIGURAZIONE (obbligatoria prima dell'uso) ──
// 1. Su https://console.cloud.google.com crea un progetto (va bene anche solo
//    per questo, con l'account Google dedicato al progetto).
// 2. "API e servizi" → "Libreria" → abilita la Google Drive API.
// 3. "API e servizi" → "Schermata consenso OAuth": tipo Esterno va bene; se il
//    progetto resta "in fase di test" aggiungi l'account Drive dedicato tra
//    gli utenti di test, altrimenti Google blocca l'accesso dopo 7 giorni.
// 4. "API e servizi" → "Credenziali" → "Crea credenziali" → "ID client OAuth"
//    → tipo "Applicazione web":
//      - Origini JavaScript autorizzate: https://glambitelli.github.io
//      - URI di reindirizzamento autorizzati:
//        https://glambitelli.github.io/comics/oauth-callback.html
// 5. Incolla il Client ID qui sotto in DRIVE_CLIENT_ID.
// 6. Sul Drive dell'account dedicato crea UNA cartella radice per Inkflow;
//    apri la cartella nel browser, copia l'ID dall'URL (dopo "/folders/") e
//    incollalo in DRIVE_ROOT_FOLDER_ID.
// 7. Dentro quella cartella crea una sottocartella per ogni cartella-autore
//    già presente in Inkflow, con lo STESSO NOME (es. "Otomo"): i file .cbz/
//    .cbr messi lì dentro appariranno da soli nello scaffale di quell'autore.
const DRIVE_CLIENT_ID = '58067893949-o05jibjpk2fgjfal4k57tmjikgg7b78c.apps.googleusercontent.com';
const DRIVE_ROOT_FOLDER_ID = '1CY6IGLbsd_M5pX8APCiOmLxssWCjWtaE';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email';
const TOKEN_KEY = 'inkflow-drive-token';
const ALBUM_EXT_RE = /\.(cbz|cbr)$/i;

let _token = null;             // { access_token, expiresAt, email }
const _folderCache = new Map(); // nome cartella-autore (lowercase) → id sottocartella Drive (o null)
const _listeners = [];

export function isDriveConfigured(){
  return !!DRIVE_CLIENT_ID && !!DRIVE_ROOT_FOLDER_ID;
}

// Il token vive in localStorage (non sessionStorage): così sopravvive alla
// chiusura del browser/PWA e, finché non è scaduto, riaprendo Inkflow si è
// già collegati senza rifare nulla. I token OAuth "implicit" durano però solo
// ~1 ora e non sono rinnovabili con un refresh token (servirebbe un backend):
// quando scadono proviamo un ri-collegamento SILENZIOSO in un iframe nascosto
// (vedi trySilentAuth), che riesce senza alcun popup se la sessione Google è
// ancora attiva e il consenso è già stato dato. Solo se anche quello fallisce
// si torna a mostrare il bottone "Connetti".
function loadCachedToken(){
  try{
    const raw = localStorage.getItem(TOKEN_KEY);
    if(!raw) return null;
    const t = JSON.parse(raw);
    if(t && t.expiresAt > Date.now() + 30000) return t;
  }catch(e){}
  return null;
}
function saveToken(t){
  _token = t;
  try{ localStorage.setItem(TOKEN_KEY, JSON.stringify(t)); }catch(e){}
  _listeners.forEach(fn=>{ try{ fn(); }catch(e){} });
}
function clearToken(){
  _token = null;
  try{ localStorage.removeItem(TOKEN_KEY); }catch(e){}
  _listeners.forEach(fn=>{ try{ fn(); }catch(e){} });
}

// Avvisa (refs.js) quando lo stato del collegamento cambia, per aggiornare
// bottoni e badge senza dover ricontrollare manualmente ad ogni render.
export function onDriveAuthChange(fn){ _listeners.push(fn); }

// Sincrono: c'è un token valido in memoria/localStorage adesso? Non tenta
// alcun collegamento — per quello c'è ensureDriveConnected (asincrono).
export function isDriveConnected(){
  if(_token && _token.expiresAt > Date.now() + 30000) return true;
  _token = loadCachedToken();
  return !!_token;
}
export function driveAccountEmail(){
  return (_token && _token.email) || '';
}

function redirectUri(){
  return new URL('./oauth-callback.html', document.baseURI).href;
}

function buildAuthUrl(prompt){
  const params = new URLSearchParams({
    client_id: DRIVE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: DRIVE_SCOPE,
    include_granted_scopes: 'true',
    prompt,
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

// Dal messaggio della pagina di callback costruisce il token e recupera
// l'email dell'account (solo cosmetica, non blocca nulla se fallisce).
async function tokenFromMessage(data){
  const t = {
    access_token: data.access_token,
    expiresAt: Date.now() + (parseInt(data.expires_in, 10) || 3500) * 1000,
    email: '',
  };
  try{
    const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + t.access_token }
    }).then(r => r.ok ? r.json() : null);
    if(info && info.email) t.email = info.email;
  }catch(err){}
  return t;
}

// Apre il popup di consenso Google. Va chiamata da un gesto utente diretto
// (tap su "Connetti Drive"): i browser bloccano i popup aperti fuori da un click.
export function connectDrive(){
  return new Promise((resolve, reject)=>{
    if(!isDriveConfigured()){ reject(new Error('Google Drive non ancora configurato (vedi le istruzioni in js/drive.js).')); return; }
    const popup = window.open(buildAuthUrl('select_account'), 'inkflow-drive-auth', 'width=480,height=640');
    if(!popup){ reject(new Error('Il browser ha bloccato il popup di accesso.')); return; }

    let done = false;
    const onMsg = async (e)=>{
      if(e.origin !== location.origin || !e.data || e.data.source !== 'inkflow-drive-oauth') return;
      window.removeEventListener('message', onMsg);
      clearInterval(poll);
      done = true;
      if(e.data.error){ reject(new Error('Accesso negato: '+e.data.error)); return; }
      if(!e.data.access_token){ reject(new Error('Nessun token ricevuto da Google.')); return; }
      saveToken(await tokenFromMessage(e.data));
      resolve(_token);
    };
    window.addEventListener('message', onMsg);
    // Se l'utente chiude il popup senza completare, non restiamo in attesa per sempre.
    const poll = setInterval(()=>{
      if(popup.closed){
        clearInterval(poll);
        window.removeEventListener('message', onMsg);
        if(!done) reject(new Error('Finestra chiusa prima di completare l\'accesso.'));
      }
    }, 700);
  });
}

// Ri-collegamento SILENZIOSO: carica la pagina di consenso con prompt=none in
// un iframe nascosto. Se la sessione Google è attiva e il consenso è già dato,
// Google reindirizza col token senza mostrare nulla; altrimenti torna un
// errore (login_required/consent_required) e qui rispondiamo semplicemente
// "no" — senza mai disturbare l'utente. Nota: alcuni browser (Safari, Chrome
// col blocco dei cookie di terze parti) possono impedire questo flusso in
// iframe: in quel caso resta il bottone "Connetti", un solo tap.
function trySilentAuth(){
  return new Promise((resolve)=>{
    if(!isDriveConfigured()){ resolve(false); return; }
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    let settled = false;
    const cleanup = ()=>{ window.removeEventListener('message', onMsg); clearTimeout(timer); try{ iframe.remove(); }catch(e){} };
    const onMsg = async (e)=>{
      if(e.origin !== location.origin || !e.data || e.data.source !== 'inkflow-drive-oauth') return;
      if(settled) return; settled = true;
      cleanup();
      if(e.data.access_token){ saveToken(await tokenFromMessage(e.data)); resolve(true); }
      else resolve(false);
    };
    window.addEventListener('message', onMsg);
    const timer = setTimeout(()=>{ if(!settled){ settled = true; cleanup(); resolve(false); } }, 8000);
    iframe.src = buildAuthUrl('none');
    document.body.appendChild(iframe);
  });
}

// Garantisce (se possibile senza interazione) un token valido: usa quello in
// cache se buono, altrimenti prova UNA volta il collegamento silenzioso. Le
// chiamate concorrenti condividono lo stesso tentativo. Torna true se alla
// fine siamo collegati. È il punto d'ingresso che refs.js/albums.js usano
// prima di leggere o scaricare da Drive.
let _silentPromise = null;
export function ensureDriveConnected(){
  if(isDriveConnected()) return Promise.resolve(true);
  if(!isDriveConfigured()) return Promise.resolve(false);
  if(!_silentPromise){
    _silentPromise = trySilentAuth().finally(()=>{ _silentPromise = null; });
  }
  return _silentPromise;
}

// Chiamata all'avvio dell'app: se non c'è già un token valido, tenta il
// collegamento silenzioso in sottofondo così l'utente si ritrova già
// collegato senza toccare nulla.
export function initDriveAuth(){
  if(isDriveConfigured() && !isDriveConnected()) ensureDriveConnected();
}

export function disconnectDrive(){
  clearToken();
  _folderCache.clear();
}

// Timeout "duro" per le chiamate leggere (elenco file, ricerca cartelle): se
// non rispondono entro pochi secondi è quasi certamente un problema di rete,
// meglio un errore chiaro che un banner che resta appeso all'infinito.
async function fetchWithTimeout(url, opts, timeoutMs){
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), timeoutMs);
  try{ return await fetch(url, { ...opts, signal: ctrl.signal }); }
  catch(e){
    if(e.name === 'AbortError') throw new Error('Drive non risponde (connessione lenta o caduta).');
    throw e;
  }finally{ clearTimeout(timer); }
}

async function driveFetch(url){
  if(!isDriveConnected()) throw new Error('Drive non collegato.');
  const res = await fetchWithTimeout(url, { headers: { Authorization: 'Bearer ' + _token.access_token } }, 20000);
  if(res.status === 401){
    clearToken();
    throw new Error('Sessione Drive scaduta: ricollega.');
  }
  if(!res.ok){
    const txt = await res.text().catch(()=> '');
    throw new Error('Drive API (' + res.status + '): ' + txt.slice(0, 200));
  }
  return res.json();
}

// Trova (con cache) l'ID della sottocartella dedicata a una cartella-autore,
// cercandola per nome dentro la cartella radice. Se non esiste ancora su
// Drive torna null: niente sync per quella cartella finché l'utente non la crea.
async function findAuthorSubfolderId(folderName){
  const key = (folderName || '').trim().toLowerCase();
  if(!key) return null;
  if(_folderCache.has(key)) return _folderCache.get(key);
  const safeName = (folderName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = `'${DRIVE_ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false and name='${safeName}'`;
  const url = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
    q, fields: 'files(id,name)', spaces: 'drive', pageSize: '10',
  });
  const data = await driveFetch(url);
  const hit = (data.files || []).find(f => f.name.trim().toLowerCase() === key) || (data.files || [])[0] || null;
  // Mettiamo in cache solo un ID trovato davvero: se la sottocartella non
  // esiste ancora, ricontrolliamo ad ogni sync invece di darla per persa per
  // tutta la sessione — altrimenti crearla dopo il primo tentativo non
  // basterebbe, servirebbe ricaricare la pagina per farla ritrovare.
  if(!hit) return null;
  _folderCache.set(key, hit.id);
  return hit.id;
}

// Elenca i .cbz/.cbr dentro la sottocartella Drive di questa cartella-autore.
// Torna [] (silenziosamente) se Drive non è configurato, non è collegato, o
// la sottocartella non esiste ancora: mai un errore per un caso "normale".
export async function listDriveAlbumsForFolder(folderName){
  if(!isDriveConfigured() || !isDriveConnected()) return [];
  try{
    const subId = await findAuthorSubfolderId(folderName);
    if(!subId) return [];
    const q = `'${subId}' in parents and trashed=false`;
    const url = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
      q, fields: 'files(id,name,size,modifiedTime)', spaces: 'drive', pageSize: '200', orderBy: 'name',
    });
    const data = await driveFetch(url);
    return (data.files || []).filter(f => ALBUM_EXT_RE.test(f.name));
  }catch(e){
    console.warn('listDriveAlbumsForFolder:', e.message);
    return [];
  }
}

// Scarica il contenuto di un file Drive e lo restituisce come File vero, così
// entra nella stessa identica pipeline di apertura .cbz/.cbr usata per i file
// locali (albums.js non deve sapere da dove arrivano davvero i byte).
// `onProgress(loaded, total)` (total 0 se Drive non lo dichiara) permette di
// mostrare un avanzamento reale invece di un messaggio fermo — un albo può
// pesare decine di MB e su rete mobile ci mette il suo. Il download è in
// streaming con un timer di STALLO (si resetta ad ogni blocco ricevuto): una
// connessione lenta ma viva non viene mai interrotta, solo una che si è
// davvero bloccata per più di 25s.
export async function downloadDriveFileAsFile(fileMeta, onProgress){
  if(!isDriveConnected()) throw new Error('Drive non collegato.');
  const url = `https://www.googleapis.com/drive/v3/files/${fileMeta.id}?alt=media`;
  const ctrl = new AbortController();
  let stallTimer;
  const armStall = ()=>{ clearTimeout(stallTimer); stallTimer = setTimeout(()=>ctrl.abort(), 25000); };
  armStall();

  let res;
  try{
    res = await fetch(url, { headers: { Authorization: 'Bearer ' + _token.access_token }, signal: ctrl.signal });
  }catch(e){
    clearTimeout(stallTimer);
    throw e.name === 'AbortError' ? new Error('Download da Drive interrotto: connessione troppo lenta o caduta.') : e;
  }
  if(res.status === 401){ clearTimeout(stallTimer); clearToken(); throw new Error('Sessione Drive scaduta: ricollega.'); }
  if(!res.ok){ clearTimeout(stallTimer); throw new Error('Download da Drive fallito (' + res.status + ')'); }

  const total = parseInt(res.headers.get('Content-Length') || '0', 10) || 0;
  if(!res.body || !res.body.getReader){
    // Browser senza streaming body: scarica in blocco, niente progresso intermedio.
    clearTimeout(stallTimer);
    const blob = await res.blob();
    return new File([blob], fileMeta.name, { type: blob.type || 'application/octet-stream' });
  }

  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  while(true){
    let step;
    try{ step = await reader.read(); }
    catch(e){ clearTimeout(stallTimer); throw new Error('Download da Drive interrotto: connessione troppo lenta o caduta.'); }
    if(step.done) break;
    armStall();
    chunks.push(step.value);
    loaded += step.value.length;
    if(onProgress){ try{ onProgress(loaded, total); }catch(e){} }
  }
  clearTimeout(stallTimer);
  const blob = new Blob(chunks);
  return new File([blob], fileMeta.name, { type: res.headers.get('Content-Type') || 'application/octet-stream' });
}

// ── CACHE LOCALE DEGLI ALBI SCARICATI ─────────────────────────────────────
// Un albo pesa decine di MB: riscaricarlo ad ogni apertura — o scaricarlo una
// volta per la copertina e di nuovo per leggerlo — è inaccettabile su 4G.
// Teniamo quindi i file scaricati nella Cache API del browser, indicizzati per
// id Drive: la PRIMA apertura scarica, tutte le successive sono immediate (e
// funzionano anche offline). È solo una cache locale, evictabile dal browser e
// svuotabile a mano: nessun file finisce sul cloud, coerente con la filosofia
// "zero storage per i volumi" (che riguarda Cloudinary). Il nome della cache
// deve restare identico ad ALBUM_CACHE in sw.js, che la preserva tra i deploy.
const ALBUM_CACHE = 'inkflow-drive-albums';
const ALBUM_CACHE_MAX = 4; // quanti albi tenere (i più recenti); il resto si riscarica al bisogno

function albumCacheKey(id){ return 'https://inkflow.local/album/' + id; }

async function readAlbumCache(driveFileId, name){
  try{
    const cache = await caches.open(ALBUM_CACHE);
    const hit = await cache.match(albumCacheKey(driveFileId));
    if(!hit) return null;
    const blob = await hit.blob();
    return new File([blob], name, { type: blob.type || 'application/octet-stream' });
  }catch(e){ return null; }
}

async function writeAlbumCache(driveFileId, file){
  try{
    const cache = await caches.open(ALBUM_CACHE);
    await cache.put(albumCacheKey(driveFileId), new Response(file));
    // Tieni solo gli ultimi ALBUM_CACHE_MAX: cache.keys() torna in ordine di
    // inserimento, quindi le prime chiavi sono le più vecchie.
    const keys = await cache.keys();
    if(keys.length > ALBUM_CACHE_MAX){
      for(const k of keys.slice(0, keys.length - ALBUM_CACHE_MAX)) await cache.delete(k);
    }
  }catch(e){ /* quota piena o Cache API assente: pazienza, si riscaricherà */ }
}

// Ottiene il File dell'albo: dalla cache locale se c'è (immediato, niente
// rete), altrimenti lo scarica da Drive e lo mette in cache per le prossime
// volte. Ritorna { file, fromCache } così il chiamante può regolare i messaggi.
export async function getDriveAlbumFile(fileMeta, onProgress){
  const cached = await readAlbumCache(fileMeta.id, fileMeta.name);
  if(cached) return { file: cached, fromCache: true };
  const file = await downloadDriveFileAsFile(fileMeta, onProgress);
  writeAlbumCache(fileMeta.id, file); // fire-and-forget: non far aspettare la lettura
  return { file, fromCache: false };
}
