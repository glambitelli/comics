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
// Prima non c'era nessuna curva dichiarata, quindi valeva quella predefinita
// del browser (`ease`), che parte piano e accelera dopo. Misurata: a 30ms dal
// tocco aveva percorso il 16% dello zoom, a 60ms il 46%. I primi fotogrammi
// non si muovevano quasi, ed è esattamente lì che si giudica se una cosa
// "risponde" — il doppio tocco sembrava un filo lento pur durando poco.
//
// Con questa, che è la stessa curva in uscita dello sfoglio: 39% a 30ms, 67%
// a 60ms. Parte alla massima velocità e frena arrivando, come un oggetto vero
// che si ferma. La durata scende appena, da 220 a 200ms: il grosso del
// guadagno non è nell'accorciare, è nel non far aspettare l'inizio.
export const ZOOM_MS = 200;
export const ZOOM_EASE = 'cubic-bezier(.22,.61,.36,1)';
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
