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
const DRIVE_CLIENT_ID = ''; // ← incolla qui il Client ID (....apps.googleusercontent.com)
const DRIVE_ROOT_FOLDER_ID = ''; // ← incolla qui l'ID della cartella radice dedicata

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email';
const TOKEN_KEY = 'inkflow-drive-token';
const ALBUM_EXT_RE = /\.(cbz|cbr)$/i;

let _token = null;             // { access_token, expiresAt, email }
const _folderCache = new Map(); // nome cartella-autore (lowercase) → id sottocartella Drive (o null)
const _listeners = [];

export function isDriveConfigured(){
  return !!DRIVE_CLIENT_ID && !!DRIVE_ROOT_FOLDER_ID;
}

function loadCachedToken(){
  try{
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if(!raw) return null;
    const t = JSON.parse(raw);
    if(t && t.expiresAt > Date.now() + 30000) return t;
  }catch(e){}
  return null;
}
function saveToken(t){
  _token = t;
  try{ sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t)); }catch(e){}
  _listeners.forEach(fn=>{ try{ fn(); }catch(e){} });
}
function clearToken(){
  _token = null;
  try{ sessionStorage.removeItem(TOKEN_KEY); }catch(e){}
  _listeners.forEach(fn=>{ try{ fn(); }catch(e){} });
}

// Avvisa (refs.js) quando lo stato del collegamento cambia, per aggiornare
// bottoni e badge senza dover ricontrollare manualmente ad ogni render.
export function onDriveAuthChange(fn){ _listeners.push(fn); }

export function isDriveConnected(){
  if(_token) return true;
  _token = loadCachedToken();
  return !!_token;
}
export function driveAccountEmail(){
  return (_token && _token.email) || '';
}

function redirectUri(){
  return new URL('./oauth-callback.html', document.baseURI).href;
}

// Apre il popup di consenso Google. Va chiamata da un gesto utente diretto
// (tap su "Connetti Drive"): i browser bloccano i popup aperti fuori da un click.
export function connectDrive(){
  return new Promise((resolve, reject)=>{
    if(!isDriveConfigured()){ reject(new Error('Google Drive non ancora configurato (vedi le istruzioni in js/drive.js).')); return; }
    const params = new URLSearchParams({
      client_id: DRIVE_CLIENT_ID,
      redirect_uri: redirectUri(),
      response_type: 'token',
      scope: DRIVE_SCOPE,
      include_granted_scopes: 'true',
      prompt: 'select_account',
    });
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
    const popup = window.open(url, 'inkflow-drive-auth', 'width=480,height=640');
    if(!popup){ reject(new Error('Il browser ha bloccato il popup di accesso.')); return; }

    let done = false;
    const onMsg = async (e)=>{
      if(e.origin !== location.origin || !e.data || e.data.source !== 'inkflow-drive-oauth') return;
      window.removeEventListener('message', onMsg);
      clearInterval(poll);
      done = true;
      if(e.data.error){ reject(new Error('Accesso negato: '+e.data.error)); return; }
      if(!e.data.access_token){ reject(new Error('Nessun token ricevuto da Google.')); return; }
      const t = {
        access_token: e.data.access_token,
        expiresAt: Date.now() + (parseInt(e.data.expires_in, 10) || 3500) * 1000,
        email: '',
      };
      try{
        const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: 'Bearer ' + t.access_token }
        }).then(r => r.ok ? r.json() : null);
        if(info && info.email) t.email = info.email;
      }catch(err){ /* l'email è solo cosmetica, non blocca il collegamento */ }
      saveToken(t);
      resolve(t);
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

export function disconnectDrive(){
  clearToken();
  _folderCache.clear();
}

async function driveFetch(url){
  if(!isDriveConnected()) throw new Error('Drive non collegato.');
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + _token.access_token } });
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
  const id = hit ? hit.id : null;
  _folderCache.set(key, id);
  return id;
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
export async function downloadDriveFileAsFile(fileMeta){
  if(!isDriveConnected()) throw new Error('Drive non collegato.');
  const url = `https://www.googleapis.com/drive/v3/files/${fileMeta.id}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + _token.access_token } });
  if(res.status === 401){ clearToken(); throw new Error('Sessione Drive scaduta: ricollega.'); }
  if(!res.ok) throw new Error('Download da Drive fallito (' + res.status + ')');
  const blob = await res.blob();
  return new File([blob], fileMeta.name, { type: blob.type || 'application/octet-stream' });
}
