// ── LA LIBRERIA DI GOOGLE, UNA SOLA PER TUTTA L'APP ──
//
// Google Identity Services (GIS) serve a collegare Drive (un token con lo
// scope drive.readonly, vedi drive.js). La libreria e' una sola e il
// caricatore sta qui, cosi' chiunque ne abbia bisogno non se ne porta una
// copia.
//
// ── CONFIGURAZIONE ──
// Il client OAuth si crea sulla console Google Cloud; i passi per intero
// stanno in cima a drive.js, che ha anche la parte sulle cartelle. Qui basta
// sapere che le "Origini JavaScript autorizzate" devono contenere
// https://glambitelli.github.io, se no Google rifiuta la richiesta prima
// ancora di mostrare qualcosa.
export const CLIENT_ID_GOOGLE = '58067893949-o05jibjpk2fgjfal4k57tmjikgg7b78c.apps.googleusercontent.com';

// ── E UN SECONDO CLIENT, PER LA PORTA D'INGRESSO, CHE OGGI NON C'E' ──
//
// La storia, perche' e' costata due giorni e va scritta per intero.
//
// Il 5 settembre 2026, da iPad, "Entra con Google" finiva su una pagina bianca
// con "Unable to process request due to missing initial state". Causa:
// signInWithPopup di Firebase non apre Google, apre una pagina di appoggio su
// inkflow-95f2f.firebaseapp.com — un ALTRO dominio rispetto a
// glambitelli.github.io — e ci lascia in deposito lo stato dell'accesso per
// rileggerlo al ritorno. Safari tiene cassetti separati per lo stesso dominio
// a seconda di chi lo apre (storage partitioning), quindi quello che scriveva
// Inkflow non era quello che rileggeva la pagina d'appoggio: su iPad non era
// un caso sfortunato, era l'unico esito possibile.
//
// La cura giusta e' non passare da nessun terzo dominio: chiedere il token a
// Google con GIS, dal NOSTRO dominio, e consegnarlo a Firebase con
// signInWithCredential. E cosi' e' stato fatto — col client qui sopra, che e'
// quello di Drive. SBAGLIATO: quel client vive nel progetto Google 58067893949,
// mentre Firebase e' il progetto 323774526281. Sono due progetti diversi, e
// Firebase rifiuta (giustamente) un token che non e' suo:
//   "Invalid Idp Response: access_token audience is not for this project"
// Il 14 settembre 2026 questo ha chiuso fuori dall'app anche il telefono, che
// prima entrava: peggio del difetto che doveva curare.
//
// Perche' resta vuoto invece di essere tolto: la strada e' giusta, manca solo
// un client OAuth che appartenga al progetto di FIREBASE. Finche' questa riga
// e' vuota si entra dalla finestra di Firebase (vedi auth.js), che funziona
// dappertutto tranne che su iPad. Riempiendola, l'iPad entra anche lui.
//
// COME RIEMPIRLA (una volta sola, sulla console Google Cloud):
//  1. console.cloud.google.com, in alto scegli il progetto numero 323774526281
//     — quello di Firebase, NON quello di Drive.
//  2. "API e servizi" -> "Credenziali". Se c'e' gia' un client chiamato
//     "Web client (auto created by Google Service)", apri quello; se no,
//     "Crea credenziali" -> "ID client OAuth" -> "Applicazione web".
//  3. In "Origini JavaScript autorizzate" aggiungi:
//       https://glambitelli.github.io
//     (nessun URI di reindirizzamento: GIS non ne usa)
//  4. Copia l'ID client e incollalo qui sotto, fra gli apici.
export const CLIENT_ID_ACCESSO = '';

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
