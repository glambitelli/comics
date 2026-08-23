// ── RIORDINO — tenere premuto e spostare ─────────────────────────────────────
//
// Questo gesto e' nato dentro idee.js e ci e' rimasto finche' e' servito a una
// schermata sola. Adesso serve anche alle Scene — l'elenco delle scene, e i
// beat dentro una scena — e ricopiarlo sarebbe stato il modo piu' rapido di
// ritrovarsi tre gesti leggermente diversi: i numeri qui sotto (quanto tenere
// premuto, di quanto ci si puo' muovere prima che non valga piu') sono stati
// aggiustati a mano sul telefono, e una copia non li eredita.
//
// IL GESTO HA QUATTRO STRADE dallo stesso identico punto di partenza — un dito
// appoggiato su una scheda — e si distinguono per quello che succede DOPO, non
// per dove si tocca:
//
//   · il dito resta fermo mezzo secondo   → si solleva la scheda, si sposta
//   · il dito parte di lato               → menu della scheda
//   · il dito parte in verticale          → l'elenco scorre, come sempre
//   · il dito si alza subito              → si apre la scheda
//
// Nessuna maniglia dedicata: su una scheda alta cinquanta pixel un appiglio da
// venti sarebbe un bersaglio da centrare, e il gesto smetterebbe di essere
// comodo proprio dove serve.
import { haptic } from './state.js';

const ATTESA = 420;          // quanto tenere premuto prima che si sollevi
const FERMO = 9;             // di quanto ci si può muovere senza annullare
const SOGLIA_X = 44;         // quanto deve andare di lato per aprire il menu
// Il click fantasma che il browser genera subito dopo un gesto: senza questa
// finestra aprirebbe la scheda sotto al menu appena comparso.
const STRIDO_ECO = 500;

// lista      — il contenitore che scorre
// opzioni.selettore  — cosa si sposta ('.idee-card', '.beat'…)
// opzioni.spazio     — quanto spazio c'e' fra una scheda e l'altra (px)
// opzioni.alPosa(da, a)  — chiamata a gesto finito, se la posizione e' cambiata
// opzioni.alStriscia(el) — chiamata alla strisciata verso sinistra (facoltativa)
// opzioni.escludi   — selettore da cui la presa NON deve partire
//
// Torna { strisciaRecente() }: serve a chi ascolta i click sulla lista per
// scartare quello fantasma.
export function montaRiordino(lista, opzioni = {}){
  const SEL = opzioni.selettore || '.idee-card';
  const SPAZIO = typeof opzioni.spazio === 'number' ? opzioni.spazio : 8;
  const alPosa = opzioni.alPosa || (()=>{});
  const alStriscia = opzioni.alStriscia || null;
  // DA DOVE LA PRESA NON PARTE. Nasce da un difetto che nel banco non si vedeva
  // e sul telefono sempre: dentro un campo di testo, tenere premuto non e' un
  // gesto libero — e' il gesto con cui il sistema comincia a SELEZIONARE, con la
  // lente e le maniglie. Il dito restava fermo sul testo di un beat mezzo
  // secondo aspettando che la scheda si sollevasse, e intanto Android stava gia'
  // facendo un'altra cosa. Fuori dal campo — sulla vignetta, che e' meta' della
  // scheda — la presa non ha rivali.
  const ESCLUDI = opzioni.escludi || null;

  // IL MENU DEL BROWSER VA FERMATO, se no si prende lui il gesto. E' la stessa
  // storia della selezione del testo, vista sull'altro lato della scheda: tenere
  // premuto su un'IMMAGINE apre il menu di Chrome — "apri immagine", "scarica
  // immagine", "cerca con Lens" — che compare mezzo secondo dopo l'inizio della
  // pressione, cioe' un attimo dopo che la scheda si e' sollevata, e se la porta
  // via. Da fuori: si tiene premuto per spostare una scheda e si apre un
  // pannello di sistema che non c'entra niente.
  // Vale solo dove la presa parte davvero: dentro il campo di testo il menu del
  // browser e' quello del testo, ed e' roba sua.
  lista.addEventListener('contextmenu', e=>{
    const el = e.target.closest(SEL);
    if(!el || !lista.contains(el)) return;
    if(ESCLUDI && e.target.closest(ESCLUDI)) return;
    e.preventDefault();
  });

  let timerPressione = null;
  let trascinato = null, altri = [], altezza = 0, daIndice = 0, aIndice = 0, yPartenza = 0;
  let stridoA = 0;

  const spegniPressione = ()=>{ clearTimeout(timerPressione); timerPressione = null; };

  function solleva(card, y){
    const schede = Array.from(lista.querySelectorAll(SEL));
    daIndice = schede.indexOf(card);
    if(daIndice < 0) return;
    aIndice = daIndice;
    yPartenza = y;
    trascinato = card;
    altezza = card.getBoundingClientRect().height + SPAZIO;
    // I centri si misurano ORA, una volta sola: leggerli ad ogni movimento del
    // dito significherebbe chiedere al browser di rifare il layout sessanta
    // volte al secondo mentre le schede si stanno già muovendo.
    altri = schede.filter(x=>x!==card).map(el=>({
      el, centro: el.getBoundingClientRect().top + el.getBoundingClientRect().height/2,
      indice: schede.indexOf(el),
    }));
    card.classList.add('trascinata');
    lista.classList.add('in-riordino');
    haptic('done');
  }

  function muovi(y){
    const dy = y - yPartenza;
    trascinato.style.transform = 'translateY(' + dy + 'px)';
    const centro = trascinato.getBoundingClientRect().top + trascinato.getBoundingClientRect().height/2;
    // Dove finirebbe la scheda se la si mollasse adesso: quante schede ha
    // superato, contate sul loro centro.
    let nuovo = daIndice;
    for(const a of altri){
      if(a.indice < daIndice && centro < a.centro) nuovo = Math.min(nuovo, a.indice);
      if(a.indice > daIndice && centro > a.centro) nuovo = Math.max(nuovo, a.indice);
    }
    if(nuovo !== aIndice) haptic('tap');
    aIndice = nuovo;
    // Le altre schede si spostano per aprire il buco: senza, si vede la scheda
    // volare sopra un elenco immobile e non si capisce dove atterrerà.
    for(const a of altri){
      let spostamento = 0;
      if(daIndice < a.indice && a.indice <= aIndice) spostamento = -altezza;
      else if(aIndice <= a.indice && a.indice < daIndice) spostamento = altezza;
      a.el.style.transform = spostamento ? 'translateY(' + spostamento + 'px)' : '';
    }
  }

  function posa(){
    if(!trascinato) return;
    const card = trascinato;
    trascinato = null;
    card.classList.remove('trascinata');
    lista.classList.remove('in-riordino');
    card.style.transform = '';
    altri.forEach(a=> a.el.style.transform = '');
    if(aIndice === daIndice) return;
    haptic('done');
    alPosa(daIndice, aIndice);
  }

  let sx = 0, sy = 0, seguendo = false, cardStrisciata = null;

  lista.addEventListener('touchstart', e=>{
    spegniPressione();
    if(e.touches.length !== 1){ seguendo = false; return; }
    cardStrisciata = e.target.closest(SEL);
    if(!cardStrisciata){ seguendo = false; return; }
    if(ESCLUDI && e.target.closest(ESCLUDI)){ seguendo = false; cardStrisciata = null; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    seguendo = true;
    const card = cardStrisciata, y = sy;
    timerPressione = setTimeout(()=>{ seguendo = false; solleva(card, y); }, ATTESA);
  }, { passive:true });

  // passive:false perché durante il trascinamento si deve poter FERMARE lo
  // scorrimento della pagina: senza, l'elenco scorrerebbe sotto la scheda
  // sollevata e il dito non riuscirebbe mai a posarla dove vuole.
  lista.addEventListener('touchmove', e=>{
    if(trascinato){ e.preventDefault(); muovi(e.touches[0].clientY); return; }
    if(!seguendo || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    // Appena il dito si muove davvero, la pressione lunga non vale più: si
    // stava facendo qualcos'altro.
    if(Math.hypot(dx, dy) > FERMO) spegniPressione();
    if(Math.abs(dy) > Math.abs(dx)){ seguendo = false; return; }   // sta scorrendo
    if(alStriscia && dx < -SOGLIA_X && Math.abs(dx) > Math.abs(dy) * 1.6){
      seguendo = false;
      stridoA = Date.now();
      haptic('tap');
      alStriscia(cardStrisciata);
    }
  }, { passive:false });

  lista.addEventListener('touchend', ()=>{
    spegniPressione();
    seguendo = false;
    if(trascinato){ stridoA = Date.now(); posa(); }
  }, { passive:true });

  // Una telefonata, una notifica a tutto schermo: il sistema porta via il
  // gesto senza un touchend. Senza questo la scheda resterebbe sollevata.
  lista.addEventListener('touchcancel', ()=>{
    spegniPressione(); seguendo = false;
    if(trascinato){ aIndice = daIndice; posa(); }
  }, { passive:true });

  return {
    // Alzato per mezzo secondo dopo un gesto. E' un ISTANTE e non un
    // interruttore: da interruttore restava alzato quando il gesto non
    // produceva nessun click (dito uscito dalla scheda, gesto annullato dal
    // sistema) e a quel punto si mangiava il primo tocco buono successivo — un
    // tap che non fa niente, senza spiegazione.
    strisciaRecente(){
      if(Date.now() - stridoA < STRIDO_ECO){ stridoA = 0; return true; }
      return false;
    },
  };
}
