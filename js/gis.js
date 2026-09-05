// ── LA LIBRERIA DI GOOGLE, UNA SOLA PER TUTTA L'APP ──
//
// Google Identity Services (GIS) serve a due cose diverse che finiscono nello
// stesso posto: collegare Drive (un token con lo scope drive.readonly, vedi
// drive.js) ed ENTRARE in Inkflow (un token con la sola email, vedi auth.js).
// E' la stessa libreria e lo stesso client OAuth: teneva senso averla in due
// copie finche' la usava solo Drive, non piu' da quando ci passa anche la
// porta d'ingresso.
//
// PERCHE' L'ACCESSO NON USA PIU' LA FINESTRA DI FIREBASE.
// signInWithPopup di Firebase non apre Google: apre una pagina di appoggio su
// inkflow-95f2f.firebaseapp.com, che e' un ALTRO dominio rispetto a
// glambitelli.github.io. Lo stato dell'accesso viene scritto prima di partire
// e riletto al ritorno, e Safari su iPad tiene due cassetti separati per lo
// stesso dominio a seconda di chi lo apre (storage partitioning): quello che
// scriveva la pagina di Inkflow non era quello che rileggeva la pagina di
// appoggio. Risultato, il 5 settembre 2026 su iPad:
//   "Unable to process request due to missing initial state."
// e nessun modo di entrare. GIS non ha pagine di appoggio: parla con Google
// dal NOSTRO dominio, e il problema non si pone.
//
// ── CONFIGURAZIONE ──
// Il client OAuth si crea sulla console Google Cloud; i passi per intero
// stanno in cima a drive.js, che ha anche la parte sulle cartelle. Qui basta
// sapere che le "Origini JavaScript autorizzate" devono contenere
// https://glambitelli.github.io, se no Google rifiuta la richiesta prima
// ancora di mostrare qualcosa.
export const CLIENT_ID_GOOGLE = '58067893949-o05jibjpk2fgjfal4k57tmjikgg7b78c.apps.googleusercontent.com';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let _inCaricamento = null;

export function gisPronta(){
  return !!(window.google && window.google.accounts && window.google.accounts.oauth2);
}

// Scarica la libreria una volta sola. Chiamarla di nuovo non costa niente:
// serve proprio a questo, la si chiama presto e spesso per fare in tempo.
export function caricaGis(){
  if(gisPronta()) return Promise.resolve();
  if(_inCaricamento) return _inCaricamento;
  _inCaricamento = new Promise((risolvi, rifiuta)=>{
    const sc = document.createElement('script');
    sc.src = GIS_SRC;
    sc.async = true; sc.defer = true;
    sc.onload = ()=> risolvi();
    sc.onerror = ()=>{ _inCaricamento = null; rifiuta(new Error('Impossibile caricare il servizio di accesso Google.')); };
    document.head.appendChild(sc);
  });
  return _inCaricamento;
}
