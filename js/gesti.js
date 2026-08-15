// Come si sente il gesto: i numeri e le tre formule che decidono quanto la
// tavola segue il dito, quanto resiste il bordo e quando la pagina gira.
//
// PERCHÉ ESISTE QUESTO FILE.
//
// Il lettore (js/albums.js) e la galleria References (js/refs.js) mostrano
// cose diverse — le tavole di un albo, le foto salvate — ma sotto il dito
// sono lo stesso gesto: si ingrandisce, ci si sposta dentro, e arrivati al
// bordo si insiste per passare oltre. Fino a ieri erano DUE copie di questi
// numeri, una per file, tenute uguali a mano. Nei tre giri di messa a punto
// di agosto — "è troppo facile cambiare pagina", "ora c'è troppa resistenza"
// — ogni ritocco andava applicato due volte, e bastava dimenticarne uno
// perché lettore e galleria cominciassero a rispondere in modo diverso alla
// stessa identica mano. Da qui in poi il ritocco si fa una volta sola.
//
// Qui dentro c'è solo aritmetica: niente DOM, niente stato. Chi lo usa gli
// passa i numeri e riceve numeri. Il cablaggio degli eventi resta in ciascun
// file, perché lì le differenze sono vere (il nastro del lettore ricicla
// celle e precarica i vicini, la galleria no).

// Quanto si ingrandisce col doppio tocco, e il tetto della pinzata.
export const ZOOM_IN = 2.6, ZOOM_MAX = 4;

// Come si muove l'immagine quando il doppio tocco la ingrandisce.
//
// Questa curva ha due requisiti che sembrano opposti e non lo sono, perché
// riguardano due pezzi diversi del movimento.
//
// 1. DEVE PARTIRE SUBITO. La prima versione non dichiarava nessuna curva,
//    quindi valeva la predefinita del browser (`ease`), che parte a 0,4 volte
//    la velocità media: nel primo fotogramma l'immagine si muoveva del 3%, e
//    il doppio tocco sembrava molle anche durando poco.
//
// 2. NON DEVE PRECIPITARE ADDOSSO. La seconda versione ha risolto il punto 1
//    esagerando: partiva a 2,77 volte la velocità media e a metà tempo aveva
//    già fatto l'87% della corsa. Immediata sì, ma l'immagine arrivava in
//    faccia — "un avvicinamento troppo immediato".
//
// C'è anche una ragione percettiva sotto, che spiega perché una curva molto
// sbilanciata sull'inizio è peggio qui che altrove: lo zoom percepito non è la
// scala, è il suo logaritmo — passare da 1 a 2 e da 2 a 4 è lo stesso
// avvicinamento per l'occhio. Metà dell'avvicinamento percepito, da 1 a 2,6,
// cade al 38% della corsa lineare. Una curva che al 50% del tempo sta già
// all'87% ha quindi consumato quasi tutto l'avvicinamento nella prima metà, e
// la seconda è un lungo strascico: si vede come uno scatto seguito da niente.
//
// La curva scelta parte a velocità 1,00 — cioè esattamente quella media: si
// muove dal primo fotogramma, senza dead zone e senza strattone — sta al 57%
// a metà tempo, e ha una velocità di punta di 1,20 volte la media invece di
// 2,77. Meno della metà dello scatto, a parità di partenza pronta.
//
// DURATA E FORMA SONO DUE MANOPOLE SEPARATE, e conviene ricordarselo perché
// qui si è sbagliato due volte girando quella sbagliata. La curva decide se il
// movimento è fluido o a strappi; la durata decide solo quanto ci mette. A
// giudizio dato ("la fluidità va bene, la velocità un pelo di più") si tocca
// la seconda e si lascia stare la prima: 240 → 200ms, stessa curva. Il rapporto
// fra velocità di punta e media resta 1,20 — cioè la morbidezza è identica —
// e sale del 20% solo la velocità assoluta.
export const ZOOM_MS = 200;
export const ZOOM_EASE = 'cubic-bezier(.3,.3,.65,.85)';
export const ZOOM_TRANSITION = 'transform ' + ZOOM_MS + 'ms ' + ZOOM_EASE;

// Quanto l'immagine segue il dito, da ingranditi. Non 1:1: più si è
// ingranditi, più piccola è la porzione visibile e più lungo il tragitto da
// fare, quindi a 1:1 servivano tre o quattro passate di dito per attraversare
// una tavola — leggere ingranditi era più faticoso che leggere a pagina
// intera. Il tetto esiste perché oltre una certa soglia l'immagine "scappa" e
// non ci si riesce più a fermare sul dettaglio che si voleva guardare.
const PAN_GAIN_MAX = 2.2;
export function panGain(z){
  return Math.min(PAN_GAIN_MAX, Math.max(1, 1 + (z - 1) * 0.55));
}

// La molla. Il nastro cede sempre meno man mano che si tira, e non arriva mai
// a fondo corsa da solo. Serve ai due estremi (dove oltre non c'è niente) e
// al bordo di un'immagine ingrandita, dove il cambio pagina non deve mai
// capitare per sbaglio.
//
// A 1.0 la molla parte 1:1 col dito e si irrigidisce strada facendo: risponde
// SUBITO — è quello che mancava, prima cedeva già frenata dal primo pixel e
// il gesto si sentiva legnoso — e la resistenza cresce dove serve, cioè
// vicino alla decisione. Con questi numeri la pagina gira dopo circa 115px di
// dito in tutto: poco più di un quarto di schermo, un gesto deciso ma breve.
const SPRING_C = 1.0;
export function edgeSpring(dx, w){
  if(!w) return dx;
  const rb = (1 - 1/((Math.abs(dx)*SPRING_C/w)+1)) * w;
  return dx < 0 ? -rb : rb;
}

// Quanto va tirata la molla, in frazione di schermo, perché si cambi pagina.
export const EDGE_COMMIT = 0.2;

// Quanto insistere, dito alla mano, prima che il nastro accenni a muoversi
// partendo dal bordo di un'immagine ingrandita. Si conta in pixel di DITO:
// contarlo sullo spostamento dell'immagine sarebbe falsato dal guadagno di
// panGain, e faceva scattare il passaggio molto prima di quanto la mano si
// aspettasse.
//
// Basso apposta: da quando esplorare e cambiare pagina sono gesti DISTINTI —
// il permesso di cambiare si prende al touchstart, non a metà movimento — qui
// non c'è più niente da cui difendersi, e un innesco lungo si sentiva solo
// come un tratto morto in cui il dito spinge e non succede niente: era la
// parte "grezza" del gesto.
export const EDGE_HANDOFF = 14;

// Fin dove si può spostare un'immagine di dimensioni base note prima di
// "perderla" fuori dallo schermo, e come riportare uno spostamento dentro
// quei limiti.
export function panLimits(baseW, baseH, scale){
  return {
    maxX: Math.max(0, (baseW * scale - baseW) / 2),
    maxY: Math.max(0, (baseH * scale - baseH) / 2),
  };
}
export function clampTo(lim, x, y){
  return {
    x: Math.min(lim.maxX, Math.max(-lim.maxX, x)),
    y: Math.min(lim.maxY, Math.max(-lim.maxY, y)),
  };
}
