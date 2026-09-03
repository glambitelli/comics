// ── IL TEMPO CHE PASSI A DISEGNARE ──────────────────────────────────────────
//
// COSA MISURA, e cosa non misura. Misura il tempo in cui il cronometro e'
// acceso, non il tempo in cui la matita si muove: ci sono dentro le pause per
// il caffe', il telefono guardato, i dieci minuti a fissare il foglio. E va
// bene cosi' — sono ore passate al tavolo, e su mesi la stima e' onesta.
// Quello che conta e' che sia UN NUMERO CHE NON SCENDE MAI: non e' una
// prestazione da difendere, e' un investimento che si accumula.
//
// COME SI CONSERVA PER SEMPRE, che e' la parte delicata.
//
// Non come un numero solo. Tutto il resto dell'app scrive documenti interi e
// chi scrive per ultimo vince — perfetto per un titolo, sbagliato per un
// contatore: due telefoni che aggiungono mezz'ora ciascuno, scrivendo il
// totale, ne perderebbero una. E sarebbe tempo davvero passato a disegnare,
// sparito senza che nessuno se ne accorga.
//
// Quindi: UNA RIGA AL GIORNO, e la si aggiorna sommando lato server
// (increment). Nessuna sovrascrittura possibile, il totale e' la somma delle
// righe. Sono trecentosessantacinque righe l'anno da poche decine di byte: in
// dieci anni tremilaseicento documenti, cioe' niente. Sopravvivono al cambio
// telefono, funzionano senza rete e si sincronizzano al ritorno.
import { db, collection, doc, onSnapshot, setDoc, deleteDoc, getDocs, increment, arrayUnion, serverTimestamp } from './firebase.js';
import { haptic } from './state.js';

const SESSIONI = 'sessioni';
// Dove sta il cronometro acceso mentre l'app e' chiusa. Si salva QUANDO e'
// partito, non quanto e' passato: cosi' il tempo continua a scorrere anche se
// il telefono si spegne, e riaprendo l'app il conto e' giusto.
const ACCESO = 'inkflow_tempo_acceso';

// IL TETTO DELLA SESSIONE DIMENTICATA. Il cronometro lasciato acceso una notte
// regalerebbe otto ore mai fatte, e da li' in poi il totale sarebbe una bugia
// che non si puo' piu' togliere. Oltre questa soglia la sessione si chiude da
// sola al valore del tetto: e' il massimo che si puo' credere.
const TETTO = 8 * 3600;

// NESSUNA SOGLIA MINIMA, e non e' una svista. C'e' stata: prima un minuto, poi
// dieci secondi, per non segnare il tocco premuto per sbaglio. Ma i totali a
// schermo contano gia' la sessione in corso — devono, se no una mezz'ora di
// lavoro sembra non esistere finche' non premi stop — e allora una soglia fa
// una cosa sola: il cronometro arriva a 4 secondi, la settimana dice 17, premi
// stop e torna 13. Il numero SCENDE, davanti agli occhi, ed e' l'unica cosa che
// questo numero non puo' fare, mai, per nessun motivo.
//
// E il danno che la soglia evitava non esisteva: non si scrive una riga per
// sessione, si somma sulla riga del giorno. Un tocco per sbaglio aggiunge due
// secondi a oggi. Nessuno se ne accorgera' mai.

// LE SESSIONI CHE IL SERVER NON HA PRESO. Prima, se la scrittura su Firestore
// falliva, si scriveva una riga nella console e basta: il tempo appena fatto
// spariva dai totali al primo aggiornamento che arrivava da fuori, senza che
// niente lo dicesse. Per un contatore che deve durare anni e' il difetto
// peggiore possibile. Adesso una sessione rifiutata resta qui, in tasca al
// telefono: continua a essere contata nei totali e si riprova a mandarla ad
// ogni avvio e ad ogni fine. Non e' un ripiego per stare offline — a quello ci
// pensa gia' la cache di Firestore, che tiene la scrittura in sospeso e la
// consegna al ritorno della rete — e' la rete di sicurezza per quando la
// scrittura viene proprio RIFIUTATA.
const CODA = 'inkflow_tempo_coda';

let _stato = null;      // { da, accumulato, inPausa } — da = istante di avvio
let _tic = null;
// Chi vuole essere avvisato ad ogni secondo. Sono piu' di uno: la capsula in
// fondo e, quando e' a schermo, la scheda delle Statistiche — che deve muoversi
// mentre il cronometro gira, se no una sessione in corso sembra non esistere.
let _ascoltatori = [];
let _giorni = new Map(); // 'AAAA-MM-GG' → secondi
let _unsub = null;

function leggi(){
  try{ return JSON.parse(localStorage.getItem(ACCESO) || 'null'); }catch(e){ return null; }
}
function scrivi(s){
  try{
    if(s) localStorage.setItem(ACCESO, JSON.stringify(s));
    else localStorage.removeItem(ACCESO);
  }catch(e){}
}

let _coda = leggiCoda();
function leggiCoda(){
  try{
    const v = JSON.parse(localStorage.getItem(CODA) || '[]');
    return Array.isArray(v) ? v.filter(x=> x && x.giorno && x.secondi > 0) : [];
  }catch(e){ return []; }
}
function scriviCoda(){
  try{ localStorage.setItem(CODA, JSON.stringify(_coda)); }catch(e){}
}
// Quante sessioni aspettano ancora di arrivare al server. Serve alla scheda
// delle Statistiche, che lo dice invece di far finta di niente.
export function daSincronizzare(){ return _coda.length; }

function mezzogiornoDi(giorno){
  const [a,m,g] = giorno.split('-').map(Number);
  return new Date(a, m-1, g, 12, 0, 0).getTime();
}

export function giornoDi(ms){
  const d = new Date(ms);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// LA VERITA' STA IN TASCA, NON IN MEMORIA. La copia in memoria vale finche' la
// pagina resta in piedi; localStorage sopravvive a un ricaricamento, a un
// aggiornamento del service worker, alla scheda buttata via da Android. Se in
// memoria non c'e' niente ma in tasca si', la sessione c'e' e va ripresa: cosi'
// nessuna schermata puo' raccontare che il cronometro e' fermo mentre gira.
function statoVivo(){
  if(_stato) return _stato;
  const s = leggi();
  if(!s || typeof s.da !== 'number') return null;
  _stato = s;
  if(!s.inPausa && !_tic) batti();
  return _stato;
}

// Quanti secondi ha in pancia la sessione in corso, adesso.
export function secondiCorrenti(){
  const s = statoVivo();
  if(!s) return 0;
  const vivi = s.inPausa ? 0 : Math.floor((Date.now() - s.da) / 1000);
  return Math.max(0, s.accumulato + vivi);
}

export function acceso(){ return !!statoVivo(); }
export function inPausa(){ const s = statoVivo(); return !!(s && s.inPausa); }

// ── AVVIO, PAUSA, FINE ──────────────────────────────────────────────────────
export function avvia(){
  // Con una sessione gia' aperta, "avvia" non puo' essere un colpo a vuoto: se
  // era in pausa si riprende, se stava gia' andando si lascia andare. Un
  // pulsante che non fa niente e non lo dice e' indistinguibile da uno rotto.
  const gia = statoVivo();
  if(gia){ if(gia.inPausa) riprendi(); return gia; }
  _stato = { da: Date.now(), accumulato: 0, inPausa: false };
  scrivi(_stato);
  haptic('done');
  batti();
  // Il momento buono per riprovare quello che era rimasto indietro: l'app e'
  // aperta, in mano, e quasi sempre in rete.
  svuotaCoda();
  return _stato;
}

export function pausa(){
  if(!_stato || _stato.inPausa) return;
  _stato.accumulato = secondiCorrenti();
  _stato.inPausa = true;
  _stato.da = Date.now();
  scrivi(_stato);
  haptic('tap');
  avvisa();
}

export function riprendi(){
  if(!_stato || !_stato.inPausa) return;
  _stato.da = Date.now();
  _stato.inPausa = false;
  scrivi(_stato);
  haptic('tap');
  batti();
}

// Chiude la sessione e la mette in archivio. Torna i secondi registrati.
export async function ferma(){
  if(!_stato) return 0;
  const secondi = Math.min(secondiCorrenti(), TETTO);
  const giorno = giornoDi(_stato.da);
  // L'istante d'avvio serve dopo, per la fascia oraria e per l'elenco delle
  // sedute: _stato viene azzerato qui sotto (si spegne prima di scrivere, per
  // non far vedere un cronometro acceso mentre salva) e non si potrebbe piu'
  // leggere.
  const da = _stato.da;
  _stato = null;
  scrivi(null);
  clearInterval(_tic); _tic = null;
  haptic('done');
  // PRIMA SI METTE VIA, POI SI AVVISA. Avvisando per primi, la scheda delle
  // Statistiche si ridisegnava in un istante in cui la sessione non era piu'
  // in corso e non era ancora in archivio: il totale scendeva per mezzo
  // secondo, esattamente il contrario di quello che deve fare un numero che
  // non scende mai. Il giro da Firestore poi lo rimetteva a posto, ma il salto
  // si vedeva.
  if(secondi > 0) _giorni.set(giorno, (_giorni.get(giorno) || 0) + secondi);
  avvisa();
  // Sotto il secondo non c'e' niente da segnare: e' il cronometro premuto e
  // rilasciato, e vale zero perche' e' zero, non perche' l'abbiamo scartato.
  if(secondi <= 0) return 0;
  try{
    await manda(giorno, secondi, da);
    svuotaCoda();
  }catch(e){
    // Rifiutata. Resta in tasca, continua a contare nei totali, e si riprova.
    console.warn('salvataggio del tempo fallito, resta in coda:', e);
    _coda.push({ giorno, secondi, da });
    scriviCoda();
    avvisa();
  }
  return secondi;
}

// ── COSA SI TIENE DI UNA SESSIONE ───────────────────────────────────────────
// Per un anno si e' tenuto solo il totale del giorno, e ogni sera si buttavano
// via due cose che non si recuperano piu': A CHE ORA hai disegnato, e QUANTO E'
// DURATA la singola seduta. Sono la materia prima di qualunque domanda seria
// che ci si possa fare dopo — "rendo meglio la mattina o la sera?", "faccio
// immersioni o ritagli?" — e la risposta esiste solo se si comincia a
// registrarla PRIMA di volerla sapere: il passato non si ricostruisce.
//
//   ore     una casella per fascia oraria ("0".."23"), sommata lato server.
//           La sessione va alla fascia in cui e' PARTITA, anche se sconfina
//           nell'ora dopo: e' la stessa scelta gia' fatta per la mezzanotte
//           (tutti i secondi al giorno di avvio), e complicarla vorrebbe dire
//           spezzare una seduta in due per una precisione che non serve.
//   elenco  una voce per seduta, { da: istante d'avvio, sec: durata }.
//           arrayUnion AGGIUNGE lato server invece di riscrivere l'array:
//           due telefoni non si cancellano le sedute a vicenda, come per
//           increment sul totale.
//
// Niente di tutto questo si vede ancora da nessuna parte, ed e' apposta: i
// grafici hanno senso con qualche decina di sedute vere in archivio, la
// registrazione ha senso da stasera.
//
// IL PROGETTO NO, non ancora: il cronometro non sa cosa sia un progetto perche'
// oggi una tavola e' solo un numero, e attaccarci le ore vorrebbe dire inventare
// un legame che l'app non ha. Quando la tavola diventera' una cosa, il campo si
// aggiunge qui e le sedute vecchie resteranno semplicemente senza.
function manda(giorno, secondi, da){
  return setDoc(doc(db, SESSIONI, giorno), {
    secondi: increment(secondi),
    sessioni: increment(1),
    ultimaIl: serverTimestamp(),
    ore: { [String(new Date(da).getHours())]: increment(secondi) },
    elenco: arrayUnion({ da, sec: secondi }),
  }, { merge: true });
}

// Riprova a mandare quello che era rimasto indietro. Quello che il server
// prende esce dalla coda; il resto ci resta e si riprovera' la volta dopo.
export async function svuotaCoda(){
  if(!_coda.length) return 0;
  const restano = [];
  let andate = 0;
  for(const v of _coda){
    // `da` manca nelle voci messe in coda prima che si registrasse l'ora: si
    // ripiega su mezzogiorno del giorno stesso, che e' un'ora inventata ma
    // onesta — meglio di buttare via la seduta, e sono pochissime.
    try{ await manda(v.giorno, v.secondi, v.da || mezzogiornoDi(v.giorno)); andate++; }
    catch(e){ restano.push(v); }
  }
  _coda = restano;
  scriviCoda();
  avvisa();
  return andate;
}

// ── BUTTARE VIA, che e' una cosa diversa dal fermare ────────────────────────
// Fermare mette in archivio; questo no. Serve per il cronometro dimenticato
// acceso durante la cena, o partito per sbaglio in tasca: tempo che non e'
// stato passato a disegnare e che, entrando nel totale, lo renderebbe una
// bugia. E' l'unico modo di togliere qualcosa, ed e' apposta l'unico: agisce
// solo su quello che sta correndo adesso, mai su quello che e' gia' in
// archivio.
export function scarta(){
  if(!statoVivo()) return 0;
  const persi = secondiCorrenti();
  _stato = null;
  scrivi(null);
  clearInterval(_tic); _tic = null;
  haptic('tap');
  avvisa();
  return persi;
}

// ── AZZERARE TUTTO ──────────────────────────────────────────────────────────
// Cancella l'archivio intero: le righe di tutti i giorni, la coda e la sessione
// in corso. Non e' un comando da tenere vicino agli altri e non lo si trova per
// caso — sta in fondo alle Impostazioni, dietro una conferma — ma deve
// esistere: dopo giorni di prove il contatore si porta dietro secondi finti, e
// un totale che comincia con la spazzatura delle prove non e' piu' il tuo.
export async function azzeraTutto(){
  scarta();
  _coda = [];
  scriviCoda();
  const snap = await getDocs(collection(db, SESSIONI));
  await Promise.all(snap.docs.map(d=> deleteDoc(doc(db, SESSIONI, d.id))));
  _giorni = new Map();
  avvisa();
  return snap.docs.length;
}

// ── IL BATTITO ──────────────────────────────────────────────────────────────
// Un colpo al secondo, e solo mentre il cronometro e' acceso e non in pausa:
// un intervallo che gira a vuoto in sottofondo per ore e' batteria buttata.
function batti(){
  clearInterval(_tic);
  avvisa();
  _tic = setInterval(()=>{
    // Il tetto scatta anche mentre si guarda: se l'app resta aperta tutta la
    // notte, alle otto ore si chiude da sola invece di continuare a contare.
    if(secondiCorrenti() >= TETTO){ ferma(); return; }
    avvisa();
  }, 1000);
}
function avvisa(){ _ascoltatori.forEach(fn=>{ try{ fn(); }catch(e){} }); }
export function alSecondo(fn){
  if(!_ascoltatori.includes(fn)) _ascoltatori.push(fn);
  avvisa();
}

// Riprende il cronometro lasciato acceso alla chiusura dell'app. Se nel
// frattempo ha superato il tetto, si chiude subito col tetto: e' quello che
// sarebbe successo restando aperti.
export function riprendiSessione(){
  const s = leggi();
  // Niente in tasca vuol dire niente in corso, anche se in memoria era rimasto
  // qualcosa: e' localStorage a dire come stanno le cose, non il contrario.
  if(!s || typeof s.da !== 'number'){
    if(_stato){ _stato = null; clearInterval(_tic); _tic = null; avvisa(); }
    svuotaCoda();
    return;
  }
  _stato = s;
  if(secondiCorrenti() >= TETTO){ ferma(); return; }
  if(!s.inPausa) batti(); else avvisa();
  svuotaCoda();
}

// ── I NUMERI ────────────────────────────────────────────────────────────────
// L'ascolto si accende quando servono davvero i numeri (le Statistiche, o la
// capsula che li mostra): non c'e' motivo di tenere aperta una connessione per
// dei totali che nessuno sta guardando.
export function ascoltaSessioni(alCambio){
  // Chi guarda i numeri e' anche il momento buono per riprovare a mandare
  // quello che era rimasto indietro: la scheda si aggiorna da sola quando
  // passa, senza che nessuno debba fare niente.
  svuotaCoda();
  if(_unsub){ if(alCambio) alCambio(); return; }
  _unsub = onSnapshot(collection(db, SESSIONI), snap=>{
    _giorni = new Map();
    snap.docs.forEach(d=>{
      const n = (d.data() || {}).secondi;
      if(typeof n === 'number' && n > 0) _giorni.set(d.id, n);
    });
    if(alCambio) alCambio();
  }, err=> console.warn('listener sessioni:', err));
}

// LA SESSIONE IN CORSO CONTA GIA'. Prima i totali guardavano solo quello che
// era finito in archivio, e le ore entravano nei conti soltanto premendo stop:
// si disegnava mezz'ora, si andava a vedere le Statistiche e non c'era niente —
// con l'unica conclusione ragionevole che il cronometro non stesse funzionando.
// Adesso il tempo che sta scorrendo e' gia' dentro, e il numero si muove.
function conCorrente(mappa){
  const s = statoVivo();
  if(!s && !_coda.length) return mappa;
  const m = new Map(mappa);
  // Prima le sessioni che il server ha rifiutato: sono tempo davvero fatto, e
  // finche' non sono passate devono restare nei conti. Se sparissero, il
  // totale scenderebbe — che e' l'unica cosa che questo numero non puo' fare.
  for(const v of _coda) m.set(v.giorno, (m.get(v.giorno) || 0) + v.secondi);
  if(s) m.set(giornoDi(s.da), (m.get(giornoDi(s.da)) || 0) + secondiCorrenti());
  return m;
}

export function secondiPerGiorno(){ return conCorrente(_giorni); }
// Solo per le prove: mette in mano al modulo la mappa dei giorni che
// normalmente arriva da Firestore, senza dover fingere un listener.
export function __seminaGiorni(m){ _giorni = m; }

export function secondiTotali(){
  let t = 0;
  for(const n of conCorrente(_giorni).values()) t += n;
  return t;
}

// Il lunedi' e' il primo giorno: la settimana di chi lavora comincia li', non
// di domenica.
export function inizioSettimana(ora = new Date()){
  const d = new Date(ora);
  d.setHours(0,0,0,0);
  const giorno = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - giorno);
  return d;
}

export function secondiSettimana(){
  const da = inizioSettimana().getTime();
  let t = 0;
  for(const [g, n] of conCorrente(_giorni)) if(new Date(g + 'T00:00:00').getTime() >= da) t += n;
  return t;
}

export function secondiMese(){
  const ora = new Date();
  const pre = ora.getFullYear() + '-' + String(ora.getMonth()+1).padStart(2,'0');
  let t = 0;
  for(const [g, n] of conCorrente(_giorni)) if(g.startsWith(pre)) t += n;
  return t;
}

// ── LE ULTIME OTTO SETTIMANE ────────────────────────────────────────────────
// Una barra per settimana, due mesi in tutto. E' la finestra giusta: un anno
// intero appiattisce tutto e non dice niente sul mese scorso, e una sola
// settimana non e' un ritmo. Otto barre si leggono in un colpo e mostrano se il
// passo c'e' o si e' perso.
export function ultimeSettimane(quante = 8){
  const giorni = conCorrente(_giorni);
  const dentro = [];
  const cima = inizioSettimana();
  for(let i = quante - 1; i >= 0; i--){
    const da = new Date(cima); da.setDate(da.getDate() - i*7);
    const a = new Date(da); a.setDate(a.getDate() + 7);
    let t = 0;
    for(const [g, n] of giorni){
      const q = new Date(g + 'T00:00:00').getTime();
      if(q >= da.getTime() && q < a.getTime()) t += n;
    }
    dentro.push({ da, secondi: t });
  }
  return dentro;
}

// ── COME SI SCRIVE UN TEMPO ─────────────────────────────────────────────────
// Sotto l'ora si dicono i minuti, sopra si dicono le ore con un decimale: "47
// min", "1h 20", "312 ore". Dire "312h 47min" di totale e' una precisione che
// non interessa a nessuno e che rende il numero piu' difficile da leggere.
//
// SOTTO IL MINUTO SI DICONO I SECONDI. Prima si arrotondava ai minuti e basta,
// e mezzo minuto appena registrato compariva come "0 min": il numero piu'
// scoraggiante possibile, perche' dice che quello che hai appena fatto non
// esiste. Meglio "35 sec": e' poco, ma e' vero e si vede muovere.
export function scriviBreve(secondi){
  if(secondi < 60) return Math.max(0, Math.round(secondi)) + ' sec';
  const min = Math.floor(secondi / 60);
  if(min < 60) return min + ' min';
  const ore = Math.floor(min / 60), resto = min % 60;
  return resto ? ore + 'h ' + String(resto).padStart(2,'0') : ore + 'h';
}
export function scriviGrande(secondi){
  const ore = secondi / 3600;
  if(secondi < 60) return { n: Math.max(0, Math.round(secondi)).toString(), u: 'sec' };
  if(ore < 1) return { n: Math.floor(secondi/60), u: 'min' };
  if(ore < 10) return { n: (Math.round(ore*10)/10).toString().replace('.', ','), u: 'ore' };
  return { n: Math.round(ore).toString(), u: 'ore' };
}
// Il cronometro acceso si legge come un cronometro: mm:ss finche' ci sta,
// h:mm:ss quando passa l'ora.
export function scriviCorsa(secondi){
  const h = Math.floor(secondi/3600), m = Math.floor((secondi%3600)/60), s = secondi%60;
  const due = n => String(n).padStart(2,'0');
  return h ? h + ':' + due(m) + ':' + due(s) : due(m) + ':' + due(s);
}
