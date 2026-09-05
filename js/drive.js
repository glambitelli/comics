// ── GOOGLE DRIVE — sorgente "senza picker" per gli albi ──
// Filosofia: la maggior parte dei .cbz/.cbr vive in un account Google Drive
// dedicato al progetto. Una volta collegato, i file dentro una sottocartella
// (che deve chiamarsi come la cartella-autore in Inkflow) compaiono da soli
// nello scaffale Albi, con copertina già pronta: si tocca e si legge, senza
// mai passare dal selettore file locale. Quello resta solo come ripiego per
// tutto ciò che non è su Drive (vedi albums.js → openAlbumPicker).
//
// Niente backend: l'autenticazione usa Google Identity Services (la libreria
// ufficiale di Google, unica dipendenza esterna), le chiamate sono normali
// fetch alle REST API di Drive v3 con il solo header Authorization — nessun
// segreto da proteggere perché lo scope è "readonly" e il client è pubblico,
// come si conviene a una SPA statica.
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
//      (nessun URI di reindirizzamento: GIS non ne usa)
// 5. Incolla il Client ID in CLIENT_ID_GOOGLE dentro js/gis.js. Sta li' e non
//    piu' qui perche' lo stesso client serve adesso anche alla porta
//    d'ingresso dell'app (vedi auth.js): e' un client OAuth del progetto, non
//    un dettaglio di Drive.
// 6. Sul Drive dell'account dedicato crea UNA cartella radice per Inkflow;
//    apri la cartella nel browser, copia l'ID dall'URL (dopo "/folders/") e
//    incollalo in DRIVE_ROOT_FOLDER_ID.
// 7. Dentro quella cartella crea una sottocartella per ogni cartella-autore
//    già presente in Inkflow, con lo STESSO NOME (es. "Otomo"): i file .cbz/
//    .cbr messi lì dentro appariranno da soli nello scaffale di quell'autore.
import { CLIENT_ID_GOOGLE as DRIVE_CLIENT_ID, caricaGis } from './gis.js';
const DRIVE_ROOT_FOLDER_ID = '1CY6IGLbsd_M5pX8APCiOmLxssWCjWtaE';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email';
const TOKEN_KEY = 'inkflow-drive-token';
// "Questo dispositivo ha collegato Drive almeno una volta". Sopravvive alla
// scadenza del token — che dura un'ora — e sparisce solo scollegando a mano.
// Serve a distinguere due situazioni che il token da solo non distingue: chi
// era collegato e va semplicemente rinnovato, e chi non ha mai collegato
// niente e a cui non si deve aprire nessuna finestra senza che l'abbia chiesto.
const LINKED_KEY = 'inkflow-drive-linked';
const ALBUM_EXT_RE = /\.(cbz|cbr)$/i;

let _token = null;             // { access_token, expiresAt, email }
const _folderCache = new Map(); // nome cartella-autore (lowercase) → id sottocartella Drive (o null)
const _listeners = [];

export function isDriveConfigured(){
  return !!DRIVE_CLIENT_ID && !!DRIVE_ROOT_FOLDER_ID;
}

// Il token vive in localStorage (non sessionStorage): così sopravvive alla
// chiusura del browser/PWA e, finché non è scaduto, riaprendo Inkflow si è
// già collegati senza rifare nulla. Alla scadenza (~1 ora) ci pensa il
// rinnovo silenzioso di GIS — vedi ensureDriveConnected più sotto.
function loadCachedToken(){
  try{
    const raw = localStorage.getItem(TOKEN_KEY);
    if(!raw) return null;
    const t = JSON.parse(raw);
    if(t && t.expiresAt > Date.now() + 30000) return t;
  }catch(e){}
  return null;
}
function wasLinked(){
  try{
    if(localStorage.getItem(LINKED_KEY) === '1') return true;
    // Chi era già collegato prima che questo segno esistesse non ce l'ha, ma
    // ha comunque un token in cache — anche scaduto: vale come collegamento,
    // e glielo si scrive ora. Senza questo si sarebbe ritrovato Drive spento
    // dopo un aggiornamento, con l'unica spiegazione "ricollegalo".
    if(localStorage.getItem(TOKEN_KEY)){
      localStorage.setItem(LINKED_KEY, '1');
      return true;
    }
  }catch(e){}
  return false;
}
function saveToken(t){
  _token = t;
  try{ localStorage.setItem(TOKEN_KEY, JSON.stringify(t)); localStorage.setItem(LINKED_KEY, '1'); }catch(e){}
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

// ── AUTENTICAZIONE (Google Identity Services) ─────────────────────────────
// GIS è la libreria ufficiale che ha sostituito il vecchio flusso "implicit"
// fatto a mano (popup + pagina di callback + iframe nascosto per il rinnovo).
// Il motivo del cambio è pratico: quel rinnovo silenzioso si appoggiava ai
// cookie di terze parti verso accounts.google.com, che Chrome sta dismettendo
// — su Android falliva quasi sempre, e ogni ora ricompariva "Connetti Drive".
// GIS non ha quel vincolo e rinnova in silenzio finché la sessione Google del
// browser è viva.
//
// Resta il limite di fondo di ogni app senza server: i token durano circa
// un'ora e non esiste un refresh token (richiederebbe un segreto lato server,
// che un sito statico non può custodire). La differenza è che ora il rinnovo
// avviene da solo, senza mostrare nulla.
// Il caricatore della libreria sta in gis.js: lo condivide con la porta
// d'ingresso, che da settembre 2026 passa dalla stessa libreria.
let _tokenClient = null;
async function getTokenClient(){
  await caricaGis();
  if(!_tokenClient){
    _tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: DRIVE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: ()=>{},        // riassegnata ad ogni richiesta, vedi requestToken
    });
  }
  return _tokenClient;
}

// Chiede un token.
//   prompt = ''     → silenzioso: riesce solo se la sessione Google è viva e il
//                     consenso è già stato dato. Serve al rinnovo automatico.
//   prompt = null   → nessuna preferenza: e' Google a decidere cosa mostrare
//                     (scelta account, consenso, niente). E' la forma giusta
//                     quando a chiedere e' stato l'utente premendo un pulsante.
function requestToken(prompt){
  return new Promise((resolve, reject)=>{
    const parti = (client)=>{
      client.callback = async (resp)=>{
        if(!resp || resp.error){
          reject(new Error(resp && (resp.error_description || resp.error) || 'Accesso a Drive non riuscito.'));
          return;
        }
        const t = {
          access_token: resp.access_token,
          expiresAt: Date.now() + (parseInt(resp.expires_in, 10) || 3500) * 1000,
          email: '',
        };
        try{
          const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: 'Bearer ' + t.access_token }
          }).then(r => r.ok ? r.json() : null);
          if(info && info.email) t.email = info.email;
        }catch(err){ /* l'email è solo cosmetica */ }
        saveToken(t);
        resolve(t);
      };
      // Chiusura/annullamento della finestra di Google: non è un errore da urlare.
      client.error_callback = (err)=>{
        reject(new Error((err && err.message) || 'Accesso a Drive annullato.'));
      };
      // Con prompt null non si passa proprio la chiave: `{prompt: undefined}`
      // e "nessun override" non sono la stessa cosa per la libreria di Google.
      client.requestAccessToken(prompt === null ? {} : { prompt });
    };
    // SENZA ATTENDERE, se il client c'e' gia'. E' il punto in cui il pulsante
    // "Ricollega" continuava a non funzionare: qui prima c'era sempre un
    // getTokenClient().then(...), e quel `then` la prima volta aspetta il
    // download della libreria di Google (un tag <script> verso accounts.
    // google.com, sul telefono anche qualche secondo). Quando la libreria
    // arrivava, il tocco era ormai scaduto — il browser tiene buona
    // l'"attivazione" per pochi secondi — e la finestra di Google veniva
    // bloccata in silenzio: nessuna schermata, nessun errore, account ancora
    // scollegato. Con il client gia' pronto (vedi prepareDriveAuth) la
    // richiesta parte DENTRO il gesto, che e' l'unica condizione che il
    // browser guarda.
    if(_tokenClient) parti(_tokenClient);
    else getTokenClient().then(parti).catch(reject);
  });
}

// Scarica la libreria di Google e prepara il client SENZA chiedere niente:
// nessuna finestra, nessuna schermata, nessun token. Serve solo a fare in
// tempo, cosi' quando il dito arriva sul pulsante non c'e' piu' niente da
// aspettare. Si chiama entrando nell'archivio e aprendo il pannello Drive
// (vedi refs.js); ripeterla non costa niente, il client si crea una volta.
export function prepareDriveAuth(){
  if(!isDriveConfigured()) return Promise.resolve(false);
  return getTokenClient().then(()=> true).catch(()=> false);
}

// Tap su "Collega Drive". UNA SOLA chiamata, e senza preferenze sul prompt.
//
// Prima si tentava il silenzioso e, se falliva, si riprovava con 'consent'.
// Sembrava furbo — niente schermata quando il consenso c'era gia' — ed era
// rotto proprio nel caso che conta: il secondo tentativo parte da dentro una
// callback asincrona, cioe' FUORI dal gesto dell'utente, e il browser blocca
// la finestra di Google come blocca qualunque popup non chiesto da un tocco.
// Risultato: si premeva "Ricollega Google Drive" e non succedeva niente —
// nessuna schermata, nessun errore, l'account restava scollegato.
//
// Con una chiamata sola dentro il gesto e' Google a decidere cosa mostrare:
// niente se il consenso c'e' gia', la scelta dell'account o la schermata di
// consenso se serve. Il silenzioso resta dov'e' utile davvero, cioe' nel
// rinnovo automatico del token (vedi ensureDriveConnected).
// "C'e' un collegamento cominciato e non ancora finito", con l'ora in cui e'
// cominciato. Sta in localStorage e non in una variabile perche' deve
// sopravvivere proprio al caso per cui esiste: la pagina che riparte.
const PENDING_KEY = 'inkflow-drive-in-corso';
const PENDING_MS = 3 * 60 * 1000;

function segnaTentativo(){ try{ localStorage.setItem(PENDING_KEY, String(Date.now())); }catch(e){} }
function chiudiTentativo(){ try{ localStorage.removeItem(PENDING_KEY); }catch(e){} }
function tentativoInSospeso(){
  try{
    const t = parseInt(localStorage.getItem(PENDING_KEY), 10);
    if(t && Date.now() - t < PENDING_MS) return true;
    if(t) chiudiTentativo();          // troppo vecchio: non e' piu' un ritorno
  }catch(e){}
  return false;
}

export async function connectDrive(){
  if(!isDriveConfigured()) throw new Error('Google Drive non ancora configurato (vedi le istruzioni in js/drive.js).');
  segnaTentativo();
  try{
    const t = await requestToken(null);
    chiudiTentativo();
    return t;
  }catch(e){
    // Il segno NON si cancella qui. Un errore puo' voler dire "annullato", ma
    // anche "la finestra si e' chiusa e la risposta non e' mai tornata", ed e'
    // il secondo caso che va recuperato al rientro (vedi resumeDriveConnect).
    throw e;
  }
}

// ── IL RIENTRO DA GOOGLE ──
// Sintomo: la schermata di Google si apriva, l'accesso andava a buon fine, si
// tornava su Inkflow e il pannello diceva ancora "Nessun account". Poi bastava
// aprire un albo di Otomo e Drive risultava collegato.
//
// La spiegazione sta in quella differenza. La finestra di Google e' una
// finestra a parte, e la risposta torna alla pagina che l'ha aperta: se nel
// frattempo il telefono quella pagina l'ha ricaricata o congelata — su Android
// succede di continuo quando si passa a un'altra scheda — la risposta non
// trova piu' nessuno ad aspettarla. Il token e' stato concesso, ma l'app non
// l'ha mai visto. Aprire un albo funzionava perche' quella strada usa il
// rinnovo silenzioso, che con la sessione Google ormai calda riesce al primo
// colpo.
//
// Quindi: al rientro, se un tentativo era in corso, si finisce il lavoro per
// conto suo con lo stesso rinnovo silenzioso. Non e' "partire da soli" — la
// regola di ensureDriveConnected resta intatta — e' completare un gesto che
// l'utente ha fatto meno di tre minuti fa e che si e' rotto per strada.
export async function resumeDriveConnect(){
  if(!isDriveConfigured()) return false;
  if(!tentativoInSospeso()) return false;
  if(isDriveConnected()){ chiudiTentativo(); return false; }
  const fatto = await requestToken('').then(()=> true).catch(()=> false);
  // In un verso o nell'altro il tentativo e' concluso: se il rinnovo
  // silenzioso non ce l'ha fatta vuol dire che da Google non e' arrivato
  // niente, e insistere ad ogni rientro sarebbe un agguato.
  chiudiTentativo();
  return fatto;
}

// ── E IL RIENTRO VA ASCOLTATO DA TUTTA L'APP, NON DA UNA SCHERMATA SOLA ──
// Il recupero qui sopra stava agganciato dentro References, e finche' Drive si
// collegava solo da li' bastava. Da quando si collega anche dalle impostazioni
// non basta piu': chi premeva "Ricollega" senza aver mai aperto l'archivio in
// quella sessione tornava da Google e trovava ancora "Non collegato", per
// sempre — nessuno stava ad aspettare quella risposta.
//
// E c'e' un secondo caso che il solo visibilitychange non copre, ed e' proprio
// quello che capita piu' spesso sul telefono: la pagina non viene nascosta e
// riportata a galla, viene RICARICATA da capo al ritorno. Allora
// visibilitychange non scatta mai. Per questo si prova anche subito, appena
// l'app riparte: il segno del tentativo sta in localStorage apposta, e vale
// solo per tre minuti.
let _rientroAcceso = false;
export function ascoltaRientroDrive(alCollegato){
  const riprendi = ()=>{
    if(document.hidden) return;
    resumeDriveConnect().then(ok=>{ if(ok && alCollegato) alCollegato(); });
  };
  if(!_rientroAcceso){
    _rientroAcceso = true;
    document.addEventListener('visibilitychange', riprendi);
    // Ritorno dalla cache di navigazione (Android ci passa spesso): la pagina
    // non e' "diventata visibile", e' stata ripescata gia' viva.
    window.addEventListener('pageshow', riprendi);
  }
  riprendi();
}

// Garantisce (senza interazione, se possibile) un token valido: usa quello in
// cache se buono, altrimenti prova UNA volta il rinnovo silenzioso. Le
// chiamate concorrenti condividono lo stesso tentativo. È il punto d'ingresso
// che refs.js/albums.js usano prima di leggere o scaricare da Drive.
let _silentPromise = null;
export function ensureDriveConnected(richiesto = false){
  if(isDriveConnected()) return Promise.resolve(true);
  if(!isDriveConfigured()) return Promise.resolve(false);
  // NIENTE PARTE DA SOLO. MAI.
  //
  // requestToken('') si chiama "rinnovo silenzioso", e la parola silenzioso è
  // una promessa che Google non mantiene: lo è finché esiste una sessione viva
  // col consenso già dato, ma quando quella sessione si è raffreddata — ed è
  // la norma su un telefono, fra restrizioni sui cookie di terze parti e
  // sessioni che scadono — apre la sua pagina di accesso a tutto schermo.
  //
  // Il risultato, dal lato di chi usa l'app: entri in References per guardare
  // dei ritagli e ti piomba addosso una schermata di login che non hai
  // chiesto; fai l'accesso, e la pagina si richiude di scatto. Due strappi per
  // un'operazione che non avevi nemmeno avviato.
  //
  // Quindi: senza una richiesta esplicita qui non si chiede niente a Google.
  // Se il token in cache è ancora buono si va avanti, altrimenti si risponde
  // "no" e chi ha chiamato mostrerà il suo invito a ricollegare — che è un
  // bottone, cioè qualcosa che si tocca quando si vuole.
  if(!richiesto) return Promise.resolve(false);
  if(!_silentPromise){
    _silentPromise = requestToken('')
      .then(()=> true)
      .catch(()=> false)
      .finally(()=>{ _silentPromise = null; });
  }
  return _silentPromise;
}

// Un tempo qui partiva un rinnovo automatico all'apertura di References.
// Non c'è più: era l'origine della pagina di Google che compariva da sola
// (vedi la nota dentro ensureDriveConnected). Resta come funzione vuota
// perché chiamarla non deve rompere niente, ma non fa nulla e non va
// rimessa a fare qualcosa.
export function initDriveAuth(){ /* di proposito: niente */ }

// Drive è stato collegato in passato ma il token è scaduto? Serve a dire
// "Ricollega" invece di "Connetti": non è la stessa cosa, e chiamarla
// prima connessione a chi l'ha già fatta sembra un errore dell'app.
export function daRicollegare(){
  return isDriveConfigured() && !isDriveConnected() && wasLinked();
}

export function disconnectDrive(){
  clearToken();
  // Scollegare vuol dire anche "non riprovarci da solo": si torna a chi non ha
  // mai collegato niente, e la prossima connessione la si chiede a mano.
  try{ localStorage.removeItem(LINKED_KEY); }catch(e){}
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
//
// TORNA ANCHE SE LA CARTELLA C'ERA, e non e' un dettaglio: prima tornava un
// elenco vuoto sia quando la sottocartella su Drive non esisteva, sia quando
// esisteva ed era vuota. Sono due cose diversissime — la prima quasi sempre
// vuol dire che i nomi non combaciano — e chi guardava lo scaffale vedeva lo
// stesso identico niente in tutti e due i casi, senza una parola. Adesso lo
// scaffale lo puo' dire (vedi renderScaffaleDrive in refs.js).
//
// `stato` vale: 'spento' (Drive non configurato o non collegato), 'senzaCartella'
// (su Drive non c'e' nessuna cartella con questo nome), 'errore' (la chiamata
// e' fallita), 'ok'.
export async function listDriveAlbumsForFolder(folderName){
  if(!isDriveConfigured() || !isDriveConnected()) return { stato:'spento', files:[] };
  try{
    const subId = await findAuthorSubfolderId(folderName);
    if(!subId) return { stato:'senzaCartella', files:[] };
    const q = `'${subId}' in parents and trashed=false`;
    const url = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
      q, fields: 'files(id,name,size,modifiedTime,mimeType)', spaces: 'drive', pageSize: '200', orderBy: 'name',
    });
    const data = await driveFetch(url);
    const tutti = data.files || [];
    const files = tutti.filter(f => ALBUM_EXT_RE.test(f.name));
    // Chi resta fuori si porta dietro il nome: quasi sempre e' un file a cui
    // rinominandolo e' stata mangiata l'estensione, e senza dirlo non c'e'
    // modo di accorgersene — nell'elenco non compare e basta.
    // Le cartelle non contano: non sono albi mancati, sono un'altra cosa.
    const scartati = tutti
      .filter(f => !ALBUM_EXT_RE.test(f.name) && f.mimeType !== 'application/vnd.google-apps.folder')
      .map(f => f.name);
    return { stato:'ok', files, scartati };
  }catch(e){
    console.warn('listDriveAlbumsForFolder:', e.message);
    return { stato:'errore', files:[] };
  }
}

// Legge un INTERVALLO di byte di un file Drive (HTTP Range), autenticato allo
// stesso modo delle altre chiamate. Usata da zipremote.js per leggere solo
// l'indice di uno ZIP e le singole tavole, senza mai scaricare il file
// intero. Se il server ignora il Range e risponde 200 con tutto il file
// (capita raramente), tagliamo noi la parte che serve.
export async function driveRangeFetch(fileId, start, end){
  if(!isDriveConnected()) throw new Error('Drive non collegato.');
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: 'Bearer ' + _token.access_token, Range: `bytes=${start}-${end}` }
  }, 20000);
  if(res.status === 401){ clearToken(); throw new Error('Sessione Drive scaduta: ricollega.'); }
  if(res.status !== 206 && res.status !== 200){
    throw new Error('Drive API (' + res.status + ') durante una lettura parziale.');
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const wanted = end - start + 1;
  if(res.status === 200 && buf.length > wanted) return buf.subarray(start, start + wanted);
  return buf;
}

// Scarica un albo da Drive scrivendolo DIRETTAMENTE nella cache su disco,
// senza mai tenerlo tutto in memoria. È la differenza tra funzionare e far
// morire la scheda: accumulando i pezzi in un array, poi unendoli in un Blob,
// poi rileggendoli per aprire lo ZIP, un albo da 500MB ne occupava oltre un
// giga — ben oltre il budget di una scheda su telefono, che veniva uccisa dal
// browser ("Uffa!" di Chrome) proprio verso la fine dello scaricamento.
//
// Il conteggio per l'avanzamento avviene al volo, mentre i byte transitano
// verso il disco (TransformStream), quindi non serve una seconda copia.
// `onProgress(loaded, total)` (total 0 se Drive non lo dichiara). Un timer di
// STALLO si riarma ad ogni blocco: una connessione lenta ma viva non viene
// mai interrotta, solo una davvero bloccata per più di 25s.
async function downloadDriveFileToCache(fileMeta, onProgress, ctrl){
  if(!isDriveConnected()) throw new Error('Drive non collegato.');
  const url = `https://www.googleapis.com/drive/v3/files/${fileMeta.id}?alt=media`;
  // Il controller arriva da fuori (vedi startDownload): è lo stesso su cui si
  // aggancia il pulsante "Annulla" di chi sta guardando, e su cui batte il
  // guardiano dello stallo qui sotto — la fetch ne ascolta uno solo.
  ctrl = ctrl || new AbortController();
  let stallTimer;
  // Chi ha fermato la corsa? "L'ho fermato io" e "è caduta la linea" meritano
  // due messaggi diversi, e soprattutto il primo non è un errore da mostrare
  // come tale. Lo distingue chi ha chiamato abort(): lo stallo passa di qui.
  let perStallo = false;
  const armStall = ()=>{
    clearTimeout(stallTimer);
    stallTimer = setTimeout(()=>{ perStallo = true; ctrl.abort(); }, 25000);
  };
  armStall();
  if(ctrl.signal.aborted) throw downloadCancelled();
  const done = ()=> clearTimeout(stallTimer);
  const stopped = (e)=> !!e && (e.name === 'AbortError' || /aborted/i.test(e.message || ''));
  const cancelledByUser = ()=> ctrl.signal.aborted && !perStallo;

  let res;
  try{
    res = await fetch(url, { headers: { Authorization: 'Bearer ' + _token.access_token }, signal: ctrl.signal });
  }catch(e){
    done();
    if(cancelledByUser()) throw downloadCancelled();
    throw stopped(e) ? new Error('Download da Drive interrotto: connessione troppo lenta o caduta.') : e;
  }
  if(res.status === 401){ done(); clearToken(); throw new Error('Sessione Drive scaduta: ricollega.'); }
  if(!res.ok){ done(); throw new Error('Download da Drive fallito (' + res.status + ')'); }

  const total = parseInt(res.headers.get('Content-Length') || '0', 10) || 0;
  const type = res.headers.get('Content-Type') || 'application/octet-stream';
  const cache = await caches.open(ALBUM_CACHE);
  const key = albumCacheKey(fileMeta.id);

  let body = res.body;
  if(body && typeof TransformStream !== 'undefined'){
    let loaded = 0;
    const counter = new TransformStream({
      transform(chunk, controller){
        loaded += chunk.byteLength;
        armStall();
        if(onProgress){ try{ onProgress(loaded, total); }catch(e){} }
        controller.enqueue(chunk);
      }
    });
    body = body.pipeThrough(counter);
  }

  try{
    await putWithQuotaRetry(cache, key, new Response(body, { headers: { 'Content-Type': type } }));
  }catch(e){
    done();
    try{ await cache.delete(key); }catch(_){}   // non lasciare un albo troncato
    if(cancelledByUser()) throw downloadCancelled();
    if(stopped(e)) throw new Error('Download da Drive interrotto: connessione troppo lenta o caduta.');
    if(e && e.name === 'QuotaExceededError'){
      throw new Error('Spazio esaurito: libera memoria sul dispositivo e riprova.');
    }
    throw e;
  }
  done();
  // Il segnale può arrivare mentre l'ultimo blocco sta finendo di scriversi:
  // a quel punto in cache c'è un albo completo, ma chi ha chiesto di annullare
  // non se lo aspetta più. Si butta e si dichiara annullato, com'è stato
  // chiesto — riscaricarlo è una scelta di chi legge, non una sorpresa.
  if(cancelledByUser()){
    try{ await cache.delete(key); }catch(_){}
    throw downloadCancelled();
  }
}

// Annullamento volontario: non è un errore, e chi chiama deve poterlo
// riconoscere senza leggere il testo del messaggio.
function downloadCancelled(){
  const e = new Error('Scaricamento annullato.');
  e.cancelled = true;
  return e;
}
export function isDownloadCancelled(e){ return !!(e && e.cancelled); }

// Se lo spazio è finito, libera gli albi più vecchi e riprova una volta sola:
// con volumi da centinaia di MB la quota del browser si raggiunge in fretta.
async function putWithQuotaRetry(cache, key, response){
  try{
    await cache.put(key, response);
  }catch(e){
    if(!e || e.name !== 'QuotaExceededError') throw e;
    const keys = await cache.keys();
    for(const k of keys){ if(k.url !== key) await cache.delete(k); }
    await cache.put(key, response);
  }
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

// C'E' GIA' IN CASA? Serve a chi apre un albo senza rete: il file scaricato
// ieri e' li', ma per arrivarci si passava prima da "collegati a Google Drive"
// — che senza rete non riesce — e l'albo restava chiuso con dentro tutto
// quello che serviva. Questa domanda si fa PRIMA di chiedere qualcosa a
// Google, e non chiede niente a nessuno.
export async function albumGiaScaricato(driveFileId, name){
  return readAlbumCache(driveFileId, name);
}

async function readAlbumCache(driveFileId, name){
  try{
    const cache = await caches.open(ALBUM_CACHE);
    const hit = await cache.match(albumCacheKey(driveFileId));
    if(!hit) return null;
    const blob = await hit.blob();
    return new File([blob], name, { type: blob.type || 'application/octet-stream' });
  }catch(e){ return null; }
}

// Tiene solo gli ultimi ALBUM_CACHE_MAX albi: cache.keys() torna in ordine di
// inserimento, quindi le prime chiavi sono le più vecchie.
async function trimAlbumCache(){
  try{
    const cache = await caches.open(ALBUM_CACHE);
    const keys = await cache.keys();
    if(keys.length > ALBUM_CACHE_MAX){
      for(const k of keys.slice(0, keys.length - ALBUM_CACHE_MAX)) await cache.delete(k);
    }
  }catch(e){}
}

// Scaricamenti in corso, per id di file Drive.
//
// Toccare di nuovo lo stesso albo mentre sta arrivando non deve far ripartire
// niente da zero. Prima succedeva proprio questo: ogni apertura avviava una
// fetch sua, quindi due tocchi diventavano DUE scaricamenti in parallelo dello
// stesso file, che si scrivevano pure sulla stessa chiave di cache — il doppio
// dei dati consumati e la barra che tornava a 0 MB davanti agli occhi. Ora il
// secondo tocco si aggancia a quello che sta già scaricando e ne eredita
// l'avanzamento.
const _inFlight = new Map();

// Prende in mano uno scaricamento già in corso: l'avanzamento va a chi guarda
// ADESSO, e il pulsante "annulla" di chi guarda adesso è quello che lo ferma.
// Solo un lettore per volta è aperto, quindi l'ultimo arrivato è quello giusto.
function adoptDownload(entry, onProgress, signal){
  entry.onProgress = onProgress || entry.onProgress;
  if(entry.offAbort){ entry.offAbort(); entry.offAbort = null; }
  if(!signal) return;
  if(signal.aborted){ entry.ctrl.abort(); return; }
  const h = ()=> entry.ctrl.abort();
  signal.addEventListener('abort', h, { once:true });
  entry.offAbort = ()=> signal.removeEventListener('abort', h);
}

function startDownload(fileMeta, onProgress, signal){
  const entry = { ctrl: new AbortController(), onProgress: null, offAbort: null };
  adoptDownload(entry, onProgress, signal);
  entry.promise = downloadDriveFileToCache(
    fileMeta,
    (loaded, total)=>{ if(entry.onProgress) entry.onProgress(loaded, total); },
    entry.ctrl
  ).finally(()=>{ if(entry.offAbort){ entry.offAbort(); entry.offAbort = null; } });
  return entry;
}

export async function getDriveAlbumFile(fileMeta, onProgress, signal){
  const cached = await readAlbumCache(fileMeta.id, fileMeta.name);
  if(cached) return { file: cached, fromCache: true };

  let entry = _inFlight.get(fileMeta.id);
  if(entry){
    adoptDownload(entry, onProgress, signal);
    await entry.promise;          // stesso scaricamento, nessuna seconda fetch
  } else {
    entry = startDownload(fileMeta, onProgress, signal);
    _inFlight.set(fileMeta.id, entry);
    try{ await entry.promise; }
    finally{ if(_inFlight.get(fileMeta.id) === entry) _inFlight.delete(fileMeta.id); }
  }
  await trimAlbumCache();
  // Il File torna dalla cache: è appoggiato al disco, non una copia in memoria.
  const file = await readAlbumCache(fileMeta.id, fileMeta.name);
  if(!file) throw new Error('Albo scaricato ma non rileggibile dalla cache.');
  return { file, fromCache: false };
}
