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
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
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

// La finestra di Google va aperta DENTRO il tocco, senza niente di lento prima:
// e' la stessa lezione di Drive (vedi requestToken in drive.js). Qui l'unica
// cosa che precede e' getAuth, che e' sincrono.
export async function entraConGoogle(){
  const provider = new GoogleAuthProvider();
  const esito = await signInWithPopup(auth(), provider);
  _utente = esito && esito.user ? esito.user : auth().currentUser;
  _inAscolto.forEach(fn=>{ try{ fn(_utente); }catch(e){} });
  return _utente;
}

export async function esci(){
  await signOut(auth());
  _utente = null;
  _inAscolto.forEach(fn=>{ try{ fn(null); }catch(e){} });
}
