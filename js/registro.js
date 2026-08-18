// ── IL REGISTRO DEGLI ERRORI ──
//
// PERCHÉ ESISTE. Quando qualcosa non va sul telefono, l'unica cosa che arriva
// è "non funziona" — e il perché resta dentro una console che nessuno può
// aprire da Android. Nel codice ci sono quaranta punti in cui un guasto viene
// ingoiato in silenzio (`catch(e){}`): scelte giuste, perché un salvataggio
// fallito non deve far cadere l'app, ma sommate fanno un'app che non racconta
// mai niente di sé.
//
// Qui si tiene un quadernetto: gli ultimi errori, con l'ora e dove sono
// successi, scritti su questo telefono e visibili nelle impostazioni. Non si
// manda niente a nessuno — non c'è un server a cui mandarlo, e non serve: la
// domanda a cui deve rispondere è "cos'è successo alle 22 e dieci mentre
// ritagliavo?", e la risposta sta lì.
//
// VENTI RIGHE E BASTA. Un registro che cresce è un altro modo di riempire la
// memoria del telefono, e le righe che contano sono sempre le ultime: quando
// una cosa si rompe, si guarda subito.
const CHIAVE = 'inkflow_registro';
const QUANTE = 20;

function leggi(){
  try{
    const v = JSON.parse(localStorage.getItem(CHIAVE) || '[]');
    return Array.isArray(v) ? v : [];
  }catch(e){ return []; }
}

export function segnaErrore(messaggio, dove){
  if(!messaggio) return;
  try{
    const righe = leggi();
    const ultima = righe[righe.length - 1];
    // Lo stesso errore ripetuto — un ciclo che scoppia ad ogni fotogramma —
    // non deve mangiarsi tutte e venti le righe: si conta e basta.
    if(ultima && ultima.messaggio === messaggio && ultima.dove === dove){
      ultima.volte = (ultima.volte || 1) + 1;
      ultima.quando = Date.now();
    } else {
      righe.push({ quando: Date.now(), messaggio: String(messaggio).slice(0, 300),
                   dove: (dove || '').slice(0, 120) });
    }
    localStorage.setItem(CHIAVE, JSON.stringify(righe.slice(-QUANTE)));
  }catch(e){
    // Se non si riesce nemmeno a scrivere il registro, pazienza: un guasto nel
    // quaderno dei guasti non deve diventare il guasto principale.
  }
}

export function registro(){ return leggi(); }
export function svuotaRegistro(){
  try{ localStorage.removeItem(CHIAVE); }catch(e){}
}

// Il registro come testo, pronto da incollare in un messaggio.
export function registroTesto(){
  const righe = leggi();
  if(!righe.length) return '';
  return righe.map(r=>{
    const q = new Date(r.quando);
    const ora = q.toLocaleString('it-IT', { day:'2-digit', month:'2-digit',
      hour:'2-digit', minute:'2-digit' });
    return ora + ' · ' + r.messaggio + (r.dove ? '  (' + r.dove + ')' : '')
         + (r.volte > 1 ? '  ×' + r.volte : '');
  }).join('\n');
}

// Si aggancia UNA volta sola, all'import. I due eventi sono le due strade da
// cui un errore arriva a galla: uno da codice normale, l'altro da una promessa
// che nessuno ha ascoltato — ed è la seconda quella che di solito sparisce.
let _agganciato = false;
export function ascoltaErrori(){
  if(_agganciato) return;
  _agganciato = true;
  window.addEventListener('error', e=>{
    if(!e) return;
    const dove = e.filename ? (e.filename.split('/').pop() + ':' + (e.lineno || 0)) : '';
    segnaErrore((e.message || 'errore'), dove);
  });
  window.addEventListener('unhandledrejection', e=>{
    const motivo = e && e.reason;
    const messaggio = motivo && motivo.message ? motivo.message : String(motivo || 'promessa rifiutata');
    segnaErrore(messaggio, 'promessa');
  });
}
