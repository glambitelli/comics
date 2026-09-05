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
import { CLIENT_ID_GOOGLE, caricaGis, gisPronta } from './gis.js';
import { getAuth, GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged,
         setPersistence, browserLocalPersistence }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let _auth = null;
let _utente = null;
let _risolto = false;
const _inAscolto = [];
let _attesaPrimoStato = null;

function auth(){
  if(_auth) return _auth;
  _auth = getAuth(firebaseApp);
  // La sessione vive in IndexedDB e sopravvive alla chiusura dell'app: senza,
  // ogni avvio chiederebbe di rientrare, e da spenti — cioe' proprio quando
  // serve la copia offline — non si entrerebbe affatto.
  setPersistence(_auth, browserLocalPersistence).catch(()=>{});
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
      _utente = u || null;
      const primo = !_risolto;
      _risolto = true;
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

// ── SI ENTRA DAL NOSTRO DOMINIO, NON DALLA PAGINA DI APPOGGIO DI FIREBASE ──
//
// Prima qui c'era signInWithPopup, ed e' andato bene finche' non e' arrivato
// un iPad. signInWithPopup non apre Google: apre
// inkflow-95f2f.firebaseapp.com/__/auth/handler, che e' un dominio DIVERSO da
// glambitelli.github.io. Lo stato dell'accesso viene scritto prima di partire
// e riletto al ritorno, ma Safari tiene cassetti separati per lo stesso
// dominio a seconda di chi lo apre (storage partitioning): quello scritto
// dalla pagina di Inkflow non e' quello riletto dalla pagina di appoggio.
// Il 5 settembre 2026, su iPad, questo si vedeva cosi':
//   "Unable to process request due to missing initial state."
// e non c'era modo di entrare — non un caso raro, l'unico esito possibile su
// quel browser.
//
// Adesso il giro e' piu' corto e non tocca nessun terzo dominio: la libreria
// di Google (la stessa che collega Drive) apre la finestra di Google dal
// nostro dominio e restituisce un token; il token si consegna a Firebase con
// signInWithCredential, che e' una normale chiamata HTTP. Nessuna pagina di
// appoggio, nessuno stato da riprendere al ritorno, niente da partizionare.
//
// SI CHIEDE SOLO L'EMAIL. Entrare non deve far comparire una richiesta di
// permesso su Drive: quella arriva quando si collega Drive, ed e' un'altra
// decisione. Firebase con l'email costruisce l'account, e basta.
const SCOPE_ACCESSO = 'https://www.googleapis.com/auth/userinfo.email'
  + ' https://www.googleapis.com/auth/userinfo.profile';

let _clientAccesso = null;
function clientAccesso(){
  if(_clientAccesso) return _clientAccesso;
  if(!gisPronta()) return null;
  _clientAccesso = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID_GOOGLE,
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
  const token = await tokenGoogle();
  const esito = await signInWithCredential(auth(), GoogleAuthProvider.credential(null, token));
  _utente = esito && esito.user ? esito.user : auth().currentUser;
  _inAscolto.forEach(fn=>{ try{ fn(_utente); }catch(e){} });
  return _utente;
}

export async function esci(){
  await signOut(auth());
  _utente = null;
  _inAscolto.forEach(fn=>{ try{ fn(null); }catch(e){} });
}
