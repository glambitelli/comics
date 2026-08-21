// ── SCEGLIERNE PIU' DI UNO — tenere premuto e spuntare ───────────────────────
//
// Questo gesto e' nato nell'elenco degli artisti di References, dove serviva a
// cancellarne cinque senza fare cinque tocchi prolungati e cinque conferme. Da
// li' e' passato dappertutto — le miniature dei frammenti, i riferimenti di un
// beat — e ricopiarlo tre volte sarebbe stato il modo piu' rapido di ritrovarsi
// tre gesti leggermente diversi: i numeri qui sotto sono stati aggiustati a mano
// sul telefono, e una copia non li eredita.
//
// LE REGOLE, e sono le stesse ovunque:
//   · tocco normale            → si apre quello che si e' toccato
//   · tocco prolungato (480ms) → comincia a scegliere, e sceglie quello
//   · da li' in poi ogni tocco → aggiunge o toglie
//   · col mouse                → tasto destro, che il tocco prolungato non c'e'
//
// I 480ms sono il punto in cui una pressione smette di sembrare un tocco andato
// lungo. Piu' corti e si sceglie per sbaglio scorrendo, piu' lunghi e sembra che
// non risponda.
//
// DUE TRAPPOLE, che sono la ragione per cui questo file esiste invece di tre
// copie:
//   1. dopo un tocco prolungato il browser manda COMUNQUE un click al distacco
//      del dito. Senza ignorarlo si sceglie l'elemento e sotto si apre anche.
//   2. su Android il tocco prolungato fa scattare anche il contextmenu del
//      browser: se non si spegne il timer, l'elemento viene scelto e subito
//      deselezionato.
import { haptic } from './state.js';

const ATTESA = 480;
// Per quanto il click che segue una pressione lunga va ignorato.
const ECO = 500;

// contenitore     — l'elemento che contiene le righe o le miniature
// opzioni.selettore — cosa si sceglie ('.refs-thumb', '.pila-mini'…)
// opzioni.id(el)    — l'identita' dell'elemento
// opzioni.apri(id, el) — cosa fa un tocco normale fuori dalla scelta
// opzioni.cambiato()   — chiamata ogni volta che la selezione cambia
// opzioni.spunta       — selettore di un bersaglio che sceglie e basta, senza
//                        aprire (col mouse e' l'unico modo di cominciare)
//
// Torna { scelti, ha, quante, azzera, accendi } — l'insieme lo tiene questo
// modulo, cosi' non ci sono due verita' su chi e' scelto.
export function montaScelta(contenitore, opzioni = {}){
  const SEL = opzioni.selettore || '.refs-thumb';
  const idDi = opzioni.id || (el=> el.dataset.id);
  const apri = opzioni.apri || (()=>{});
  const cambiato = opzioni.cambiato || (()=>{});
  const SPUNTA = opzioni.spunta || null;

  const _scelti = new Set();
  const cambia = ()=>{ cambiato(); };

  function accendiSu(id){
    if(!_scelti.has(id)){ _scelti.add(id); cambia(); }
  }
  function giraSu(id){
    if(_scelti.has(id)) _scelti.delete(id); else _scelti.add(id);
    cambia();
  }

  let attesa = null, dito = false;
  // QUANDO E' SCATTATA L'ULTIMA PRESSIONE LUNGA, non "se e' scattata". E' un
  // ISTANTE e non un interruttore, per la stessa ragione per cui lo e' in
  // riordino.js: da interruttore restava alzato tutte le volte che il click che
  // doveva abbassarlo non arrivava mai — e ne basta uno. Scegliendo, la griglia
  // si ridisegna: l'elemento che il dito stava premendo sparisce, e il click che
  // il browser manda al distacco finisce su un nodo che non e' piu' nella
  // pagina. Da quel momento la bandierina restava su e il primo tocco buono
  // successivo veniva mangiato — un tap che non fa niente, senza spiegazione.
  let tenutoA = 0;
  const eco = ()=> Date.now() - tenutoA < ECO;

  contenitore.addEventListener('click', e=>{
    const el = e.target.closest(SEL);
    if(!el || !contenitore.contains(el)) return;
    const id = idDi(el);
    // La spunta e' un bersaglio a se': sceglie e basta, senza aprire quello che
    // ci sta sotto. Col mouse e' l'unico modo di cominciare a scegliere.
    if(SPUNTA && e.target.closest(SPUNTA)){
      e.stopPropagation();
      giraSu(id);
      tenutoA = 0;
      return;
    }
    // Mentre si sceglie, il tocco normale spunta e basta: aprire qualcosa in
    // mezzo a una selezione la butterebbe via senza averlo chiesto.
    if(eco()){ tenutoA = 0; return; }
    if(_scelti.size) giraSu(id); else apri(id, el);
  });

  contenitore.addEventListener('contextmenu', e=>{
    const el = e.target.closest(SEL);
    if(!el || !contenitore.contains(el)) return;
    e.preventDefault();
    clearTimeout(attesa);
    // "Il click che segue va ignorato" vale solo se a scegliere e' stato un
    // DITO: col tasto destro del mouse nessun click arriva, e alzare la
    // bandierina li' vorrebbe dire mangiarsi il clic sinistro successivo.
    if(dito) tenutoA = Date.now();
    accendiSu(idDi(el));
  });

  contenitore.addEventListener('touchstart', e=>{
    const el = e.target.closest(SEL);
    if(!el || !contenitore.contains(el)) return;
    dito = true;
    const id = idDi(el);
    attesa = setTimeout(()=>{
      tenutoA = Date.now(); haptic('done');
      accendiSu(id);
    }, ATTESA);
  }, {passive:true});

  ['touchend','touchmove','touchcancel'].forEach(ev=>
    contenitore.addEventListener(ev, ()=>{ clearTimeout(attesa); dito = false; }, {passive:true}));

  return {
    scelti(){ return Array.from(_scelti); },
    ha(id){ return _scelti.has(id); },
    quante(){ return _scelti.size; },
    azzera(){ if(!_scelti.size) return false; _scelti.clear(); cambia(); return true; },
    // Toglie dalla selezione quello che non esiste piu' (dopo una
    // cancellazione, o cambiando cartella).
    pota(esiste){
      let via = false;
      for(const id of Array.from(_scelti)) if(!esiste(id)){ _scelti.delete(id); via = true; }
      if(via) cambia();
    },
  };
}
