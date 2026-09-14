// ── L'ACCESSO ──
//
// PERCHÉ ESISTE. Fino a oggi l'archivio era pubblico: nessun login, e quindi
// regole di Firestore aperte per forza — altrimenti l'app non avrebbe potuto
// leggere niente. Il projectId sta nel JavaScript pubblicato, quindi chiunque
// lo leggesse poteva scaricare (e con ogni probabilita' cancellare) progetti,
// artisti, ritagli e idee con una sola richiesta HTTP. Verificato il 17 agosto
// 2026: una GET senza credenziali rispondeva con i progetti veri.
//
// Entrare con Google da' all'app un'identita' (un UID), e l'UID e' quello che
// le regole possono pretendere: "questi documenti li legge e li scrive solo
// quell'account, tutto il resto no". Nessun'altra strada arriva allo stesso
// risultato: App Check filtra le app, non le persone, e una chiave nel codice
// e' pubblica per definizione.
//
// SI ENTRA CON GOOGLE E NON CON UNA PASSWORD perche' l'account Google c'e'
// gia' — e' lo stesso con cui si collega Drive per gli albi. Una password in
// piu' sarebbe una cosa in piu' da perdere.
//
// L'ORDINE DELLE COSE, ed e' importante: prima si accende il login e lo si
// prova sul telefono, POI si chiudono le regole. Al contrario, un login che
// non funziona a fronte di regole gia' chiuse vuol dire archivio irraggiungibile
// dal proprietario.
import { firebaseApp } from './firebase.js';
import { segnaErrore } from './registro.js';
import { CLIENT_ID_ACCESSO, caricaGis, gisPronta } from './gis.js';
import { getAuth, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
         browserPopupRedirectResolver, GoogleAuthProvider, signInWithCredential,
         signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let _auth = null;
let _utente = null;
let _risolto = false;
const _inAscolto = [];
let _attesaPrimoStato = null;
// L'ultima uscita l'ha chiesta qualcuno? Serve a distinguere "ho premuto Esci"
// da "mi sono ritrovato fuori" (vedi sotto).
let _uscitaVoluta = false;

// ── QUANDO LA SESSIONE CADE DA SOLA, SE NE TIENE TRACCIA ──
//
// "Entra con Google compare in modo randomico" (14 settembre 2026), e non
// c'era modo di sapere perche': la porta compariva, il registro raccoglieva
// solo la conseguenza ("Missing or insufficient permissions", cioe' Firestore
// che rifiuta le letture di uno che non e' piu' nessuno), e la causa restava
// fuori. La prima ipotesi — il telefono che si riprende la memoria dell'app —
// e' stata smentita: Diagnostica diceva "Memoria protetta: Sì".
//
// Quindi qui si scrive il fatto nudo, con l'ora e quel poco di contorno che
// puo' servire a riconoscere il momento: da quanto si era dentro, e se
// Firebase si ricorda ancora di qualcuno. Non e' una cura, e' la traccia che
// serviva per trovarla — si legge in Impostazioni -> Diagnostica.
const QUANDO_ENTRATO = 'inkflow_entrato_il';
function segnaEntrata(){
  try{ localStorage.setItem(QUANDO_ENTRATO, String(Date.now())); }catch(e){}
}
function segnaCaduta(){
  let da = '';
  try{
    const t = parseInt(localStorage.getItem(QUANDO_ENTRATO) || '0', 10);
    if(t) da = ', dentro da ' + Math.round((Date.now() - t) / 60000) + ' min';
  }catch(e){}
  const resta = _auth && _auth.currentUser ? 'si' : 'no';
  segnaErrore('Sessione con Google finita da sola' + da
    + ' (Firebase ricorda ancora l\'account: ' + resta + ')', 'accesso');
}

// ── DOVE VIVE LA SESSIONE, E PERCHE' SI DICE ALL'INIZIO E NON DOPO ──
//
// La sessione deve sopravvivere alla chiusura dell'app: senza, ogni avvio
// chiederebbe di rientrare, e da spenti — cioe' proprio quando serve la copia
// offline — non si entrerebbe affatto.
//
// Prima qui c'era getAuth() seguito da setPersistence(browserLocalPersistence)
// lanciato e lasciato andare, e sono due cose sbagliate in una riga:
//
//  1. browserLocalPersistence NON e' IndexedDB, e' localStorage (il commento
//     di prima diceva il contrario). Il default di Firebase sul web e'
//     IndexedDB con localStorage come ripiego: quella riga, invece di
//     rafforzare la persistenza, la declassava.
//  2. setPersistence CAMBIA il magazzino mentre Firebase sta gia' rileggendo
//     chi era entrato, e la si lanciava senza aspettarla, un'istruzione prima
//     di attaccare l'ascolto dello stato. Due cose che corrono sullo stesso
//     dato: se il travaso finisce nell'istante sbagliato, l'utente rimesso in
//     piedi si perde per strada — e da fuori si vede "Entra con Google" che
//     compare senza motivo (segnalato il 14 settembre 2026, con la memoria del
//     telefono protetta, quindi non era il sistema a fare pulizia).
//
// initializeAuth dice le stesse cose UNA volta sola, all'inizio, prima che
// esista qualcosa da travasare: niente corsa, e l'ordine giusto dei magazzini.
// popupRedirectResolver va passato qui, se no signInWithPopup non saprebbe da
// che parte cominciare (con getAuth arriva incluso, con initializeAuth no).
function auth(){
  if(_auth) return _auth;
  try{
    _auth = initializeAuth(firebaseApp, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  }catch(e){
    // initializeAuth protesta se qualcuno ha gia' chiesto l'autenticazione di
    // questa app: allora ci si tiene quella, che e' comunque configurata bene.
    _auth = getAuth(firebaseApp);
  }
  return _auth;
}

// La promessa che si risolve al PRIMO stato conosciuto (utente o nessuno).
// Firebase all'avvio non sa ancora chi sei: c'e' un istante in cui l'utente e'
// null non perche' sei fuori, ma perche' la risposta non e' ancora arrivata.
// Chi decide cosa mostrare deve aspettare questo, se no fa lampeggiare la
// schermata di accesso a chi e' gia' dentro.
export function attendiAccesso(){
  if(_attesaPrimoStato) return _attesaPrimoStato;
  _attesaPrimoStato = new Promise(risolvi=>{
    onAuthStateChanged(auth(), u=>{
      const cEra = !!_utente;
      _utente = u || null;
      const primo = !_risolto;
      _risolto = true;
      if(_utente) segnaEntrata();
      // Si era dentro, adesso no, e nessuno ha premuto Esci: e' il caso che
      // si stava cercando.
      else if(cEra && !_uscitaVoluta) segnaCaduta();
      _uscitaVoluta = false;
      _inAscolto.forEach(fn=>{ try{ fn(_utente); }catch(e){} });
      if(primo) risolvi(_utente);
    }, ()=>{ _risolto = true; risolvi(null); });
  });
  return _attesaPrimoStato;
}

export function utente(){ return _utente; }
export function accessoRisolto(){ return _risolto; }
export function alCambioAccesso(fn){
  _inAscolto.push(fn);
  if(_risolto) { try{ fn(_utente); }catch(e){} }
}

// ── DUE STRADE PER ENTRARE, E OGGI SI PRENDE LA SECONDA ──
//
// STRADA A — GIS dal nostro dominio, poi signInWithCredential.
// E' quella giusta, e serve all'iPad: signInWithPopup di Firebase non apre
// Google, apre una pagina di appoggio su inkflow-95f2f.firebaseapp.com — un
// dominio DIVERSO da glambitelli.github.io — e ci lascia in deposito lo stato
// dell'accesso per rileggerlo al ritorno. Safari tiene cassetti separati per
// lo stesso dominio a seconda di chi lo apre, quindi su iPad quello stato non
// si ritrova mai: "Unable to process request due to missing initial state", e
// nessun modo di entrare (5 settembre 2026). GIS non ha pagine di appoggio.
// Richiede pero' un client OAuth che appartenga al progetto di Firebase, e
// oggi non c'e': vedi CLIENT_ID_ACCESSO in gis.js, dove ci sono anche i
// quattro passi per crearlo. Finche' quella riga e' vuota questa strada non si
// prende — l'ho provata col client di Drive, che sta in un ALTRO progetto
// Google, e Firebase ha risposto "access_token audience is not for this
// project" chiudendo fuori anche il telefono, che prima entrava.
//
// STRADA B — la finestra di Firebase. Funziona dappertutto tranne che su
// iPad, ed e' quella che si usa finche' la A non e' configurata.
//
// SI CHIEDE SOLO L'EMAIL (strada A). Entrare non deve far comparire una
// richiesta di permesso su Drive: quella arriva quando si collega Drive, ed e'
// un'altra decisione.
const SCOPE_ACCESSO = 'https://www.googleapis.com/auth/userinfo.email'
  + ' https://www.googleapis.com/auth/userinfo.profile';

let _clientAccesso = null;
function clientAccesso(){
  if(_clientAccesso) return _clientAccesso;
  if(!CLIENT_ID_ACCESSO || !gisPronta()) return null;
  _clientAccesso = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID_ACCESSO,
    scope: SCOPE_ACCESSO,
    callback: ()=>{},        // riassegnata ad ogni richiesta, vedi tokenGoogle
  });
  return _clientAccesso;
}

// Scarica la libreria e prepara il client SENZA chiedere niente: nessuna
// finestra, nessun token. Serve solo a fare in tempo — si chiama quando
// compare la porta, cosi' quando il dito arriva sul pulsante non c'e' piu'
// niente da aspettare. Ripeterla non costa niente.
export function preparaAccesso(){
  // Senza il client della strada A non c'e' niente da preparare: la finestra
  // di Firebase non ha bisogno di scaldare nessuna libreria.
  if(!CLIENT_ID_ACCESSO) return Promise.resolve(false);
  return caricaGis().then(()=> !!clientAccesso()).catch(()=> false);
}

// LA FINESTRA DI GOOGLE DEVE PARTIRE DENTRO IL TOCCO. E' la lezione che il
// collegamento a Drive ha imparato a sue spese (vedi requestToken in
// drive.js): se fra il dito e requestAccessToken c'e' un await che aspetta il
// download della libreria — sul telefono anche qualche secondo — quando la
// libreria arriva l'attivazione del tocco e' scaduta e il browser blocca la
// finestra IN SILENZIO. Nessuna schermata, nessun errore, e sembra che il
// pulsante non funzioni. Quindi se il client c'e' gia' si parte subito, senza
// nemmeno una promessa di mezzo.
function tokenGoogle(){
  return new Promise((risolvi, rifiuta)=>{
    const parti = (c)=>{
      c.callback = (r)=>{
        if(!r || r.error || !r.access_token){
          rifiuta(new Error((r && (r.error_description || r.error)) || 'Accesso a Google non riuscito.'));
          return;
        }
        risolvi(r.access_token);
      };
      // Finestra chiusa o annullata: non e' un errore da urlare, ed e' lo
      // stesso codice che usava Firebase, cosi' chi lo guarda (vedi
      // entraInInkflow in main.js) non deve imparare un nome nuovo.
      c.error_callback = (err)=>{
        const e = new Error((err && err.message) || 'Accesso annullato.');
        e.code = 'auth/popup-closed-by-user';
        rifiuta(e);
      };
      c.requestAccessToken({});
    };
    const c = clientAccesso();
    if(c){ parti(c); return; }
    caricaGis().then(()=>{
      const pronto = clientAccesso();
      if(pronto) parti(pronto);
      else rifiuta(new Error('Il servizio di accesso Google non e\' disponibile.'));
    }).catch(rifiuta);
  });
}

export async function entraConGoogle(){
  // La scelta fra le due strade e' SINCRONA (una costante), e deve restarlo:
  // la finestra di Google va aperta dentro il tocco, e un await qui davanti
  // la farebbe bloccare in silenzio dal browser.
  const esito = CLIENT_ID_ACCESSO
    ? await signInWithCredential(auth(), GoogleAuthProvider.credential(null, await tokenGoogle()))
    : await signInWithPopup(auth(), new GoogleAuthProvider());
  _utente = esito && esito.user ? esito.user : auth().currentUser;
  if(_utente) segnaEntrata();
  _inAscolto.forEach(fn=>{ try{ fn(_utente); }catch(e){} });
  return _utente;
}

export async function esci(){
  _uscitaVoluta = true;
  await signOut(auth());
  _utente = null;
  _inAscolto.forEach(fn=>{ try{ fn(null); }catch(e){} });
}
