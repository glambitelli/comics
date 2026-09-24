// ── I TUOI SUONI, SUL TUO TELEFONO ──────────────────────────────────────────
//
// PERCHE' ESISTE.
//
// Giovanni voleva i suoni di un gioco che gli piace al posto di quelli
// dell'app (22 settembre 2026). Quei campioni sono di chi ha fatto il gioco, e
// questo repository e' pubblico: finisce su GitHub Pages, indicizzato e
// scaricabile da chiunque. Metterceli dentro vorrebbe dire pubblicare roba di
// altri, che e' una cosa diversa dal tenersela sul telefono.
//
// Questo modulo e' la via d'uscita, e non e' un ripiego: i file li scegli tu
// una volta, restano in IndexedDB SUL TUO DISPOSITIVO, e non passano ne' da
// GitHub ne' da Firestore ne' da nessun'altra parte. Nessuno li vede tranne
// te, e cambiarli e' scegliere altri quattro file.
//
// COME SONO TENUTI. Blob interi, non convertiti: qualunque cosa sappia
// decodificare il browser va bene (wav, mp3, m4a, ogg). Convertire in un
// formato "nostro" vorrebbe dire ricomprimere, cioe' peggiorare un suono che
// l'utente ha scelto perche' gli piace com'e'.
//
// PERCHE' INDEXEDDB e non localStorage: localStorage tiene stringhe e sta
// stretto (pochi megabyte, e in stringa i byte si gonfiano di un terzo). Qui
// ci vanno file audio, che sono binari e possono essere grossi.
const DB = 'inkflow-suoni';
const STORE = 'set';
const VERSIONE = 1;
// Una spia in localStorage che dice SE ci sono. Serve perche' l'elenco dei set
// (SET_SUONI in sound.js) si legge in modo sincrono — lo usa il menu delle
// Impostazioni mentre si disegna — e IndexedDB e' asincrono: senza questa
// riga il set personale comparirebbe nel menu un attimo dopo, o non
// comparirebbe affatto alla prima apertura.
const SPIA = 'inkflow-sfx-miei';

export const INTENTI = ['tap', 'done', 'reward', 'cancel'];

function apri(){
  return new Promise((ok, no)=>{
    let r;
    try{ r = indexedDB.open(DB, VERSIONE); }catch(e){ return no(e); }
    r.onupgradeneeded = ()=>{
      const db = r.result;
      if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    r.onsuccess = ()=> ok(r.result);
    r.onerror = ()=> no(r.error);
  });
}

// C'E' UN SET PERSONALE? Risposta immediata, senza aprire il database: e' la
// spia scritta al momento del salvataggio.
export function haSuoniMiei(){
  try{ return localStorage.getItem(SPIA) === '1'; }catch(e){ return false; }
}
// Quali dei quattro ci sono davvero. Serve alle Impostazioni per dire cosa
// hai caricato invece di un generico "fatto".
export function quantiSuoniMiei(){
  try{ return JSON.parse(localStorage.getItem(SPIA + '-quali') || '[]'); }
  catch(e){ return []; }
}

// SALVA QUELLO CHE GLI DAI E LASCIA STARE IL RESTO: caricare solo il suono
// del cursore non deve cancellare gli altri tre gia' scelti.
export async function salvaSuoniMiei(mappa){
  const db = await apri();
  await new Promise((ok, no)=>{
    const t = db.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    for(const k of INTENTI) if(mappa[k]) s.put(mappa[k], k);
    t.oncomplete = ok; t.onerror = ()=> no(t.error);
  });
  const quali = await qualiCiSono(db);
  db.close();
  try{
    localStorage.setItem(SPIA, quali.length ? '1' : '0');
    localStorage.setItem(SPIA + '-quali', JSON.stringify(quali));
  }catch(e){}
  return quali;
}

function qualiCiSono(db){
  return new Promise((ok)=>{
    const t = db.transaction(STORE, 'readonly');
    const s = t.objectStore(STORE);
    const trovati = [];
    let restano = INTENTI.length;
    for(const k of INTENTI){
      const r = s.get(k);
      r.onsuccess = ()=>{ if(r.result) trovati.push(k); if(--restano === 0) ok(trovati); };
      r.onerror = ()=>{ if(--restano === 0) ok(trovati); };
    }
  });
}

// Legge un suono come ArrayBuffer, pronto per decodeAudioData. Torna null se
// quell'intento non ce l'hai caricato: chi chiama ripiega sul set di serie.
export async function leggiSuonoMio(intento){
  if(!haSuoniMiei()) return null;
  let db;
  try{ db = await apri(); }catch(e){ return null; }
  const blob = await new Promise((ok)=>{
    const t = db.transaction(STORE, 'readonly');
    const r = t.objectStore(STORE).get(intento);
    r.onsuccess = ()=> ok(r.result || null);
    r.onerror = ()=> ok(null);
  });
  db.close();
  if(!blob) return null;
  return blob.arrayBuffer ? blob.arrayBuffer() : null;
}

export async function svuotaSuoniMiei(){
  let db;
  try{ db = await apri(); }catch(e){ return; }
  await new Promise((ok)=>{
    const t = db.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    for(const k of INTENTI) s.delete(k);
    t.oncomplete = ok; t.onerror = ok;
  });
  db.close();
  try{ localStorage.removeItem(SPIA); localStorage.removeItem(SPIA + '-quali'); }catch(e){}
}

// ── A QUALE COMANDO VA OGNI FILE ──
// Prima si guarda il NOME: chi scarica un pacchetto di suoni si ritrova file
// che si chiamano cursor, select, back, fanfare, e indovinarlo dal nome fa
// risparmiare quattro scelte a chi sta caricando. Quello che resta senza nome
// riconoscibile prende il primo posto ancora libero, nell'ordine in cui li
// hai scelti — cosi' anche quattro file che si chiamano 1,2,3,4 funzionano.
const INDIZI = {
  tap:    /\b(tap|nav|cursor|cursore|move|scroll|select_?move|beep|tick)\b/i,
  done:   /\b(done|ok|conferm|confirm|select|enter|accept|equip|save)\b/i,
  cancel: /\b(cancel|back|annull|indietro|esc|close|no)\b/i,
  reward: /\b(reward|win|item|fanfare|jingle|complete|clear|premio|got)\b/i,
};
export function assegnaFile(files){
  const mappa = {};
  const avanzi = [];
  for(const f of files){
    const nome = f.name || '';
    const k = INTENTI.find(k => !mappa[k] && INDIZI[k].test(nome));
    if(k) mappa[k] = f; else avanzi.push(f);
  }
  for(const f of avanzi){
    const k = INTENTI.find(k => !mappa[k]);
    if(!k) break;                       // piu' di quattro file: gli altri si ignorano
    mappa[k] = f;
  }
  return mappa;
}
