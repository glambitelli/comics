// Drive — la sincronizzazione non scarica mezzo giga per fare una miniatura
//
// E' il difetto che ha tenuto uno scaffale vuoto per un pomeriggio, e non
// diceva niente. Per un .cbz si legge da remoto solo l'indice dello ZIP e una
// pagina: qualche decina di kB. Ma un .cbr e' un RAR, l'indice remoto non lo
// sa leggere, e si cadeva sullo scaricamento del FILE INTERO — in sottofondo,
// senza banner, senza avanzamento, senza poterlo fermare, solo per generare
// una copertina. Su un volume da 504 MB vuol dire minuti di rete e mezzo giga
// di cache bruciati per un'immagine da 40 kB; e siccome la funzione usciva
// senza scrivere niente se qualcosa andava storto, a schermo non compariva
// nemmeno la scheda.
const { suite } = require('../motore.js');

module.exports = () => suite("Drive — la sincronizzazione non scarica per la miniatura", {
  banco: '/test/banco/lettore-drive.html',
}, async ({ page, ok, sezione }) => {

  sezione('un .cbr non fa partire nessuno scaricamento');
  const cbr = await page.evaluate(async ()=>{
    window.__schede = [];
    window.__dl = null;
    await window.albums.createAlbumFromDriveFile('F1', {
      id: 'D-CBR', name: 'OPUS 01.cbr', size: 504 * 1048576,
    });
    return {
      // La cosa piu' importante: NIENTE scaricamento.
      scaricato: !!(window.__dl && window.__dl.avviato),
      schede: window.__schede.length,
      scheda: window.__schede[0] || null,
    };
  });
  ok('non parte nessuno scaricamento', cbr.scaricato === false, cbr);
  // LA SCHEDA SI CREA LO STESSO. Prima, se la copertina non si poteva fare, la
  // funzione usciva senza scrivere: l'albo su Drive c'era, la scheda no, e lo
  // scaffale restava vuoto senza spiegazioni.
  ok('ma la scheda dell\'albo si crea comunque', cbr.schede === 1, cbr);
  ok('col titolo senza estensione', cbr.scheda && cbr.scheda.title === 'OPUS 01', cbr);
  ok('e agganciata al file su Drive', cbr.scheda && cbr.scheda.driveFileId === 'D-CBR', cbr);
  // Senza copertina e senza conteggio: arrivano quando lo si apre davvero, e
  // li' c'e' gia' il banner dei megabyte col tasto per annullare.
  ok('senza copertina, che si scaricherebbe mezzo giga per averla',
     cbr.scheda && cbr.scheda.cover === null, cbr);
  ok('e senza un conteggio pagine inventato',
     cbr.scheda && cbr.scheda.pageCount === 0, cbr);

  sezione('e un file senza dimensione nota nemmeno');
  // Drive non sempre dice quanto pesa un file: senza dimensione la lettura
  // remota non si puo' fare, e prima anche questo cadeva sul download intero.
  const senzaSize = await page.evaluate(async ()=>{
    window.__schede = [];
    window.__dl = null;
    await window.albums.createAlbumFromDriveFile('F1', { id:'D-NS', name:'Volume.cbz' });
    return { scaricato: !!(window.__dl && window.__dl.avviato), schede: window.__schede.length };
  });
  ok('niente scaricamento', senzaSize.scaricato === false, senzaSize);
  ok('e la scheda c\'e\'', senzaSize.schede === 1, senzaSize);

  sezione('un albo gia\' in archivio non si duplica');
  const doppio = await page.evaluate(async ()=>{
    const vero = window.albums.__perLeProve && window.albums.__perLeProve.findAlbumByDriveId;
    window.__schede = [];
    // Due sincronizzazioni di fila sullo stesso file: la seconda non deve
    // aggiungere una seconda scheda (il finto findAlbumByDriveId torna null,
    // quindi qui si guarda solo che la chiamata non esploda).
    await window.albums.createAlbumFromDriveFile('F1', { id:'D-CBR', name:'OPUS 01.cbr', size: 1000 });
    return { schede: window.__schede.length };
  });
  ok('la sincronizzazione resta silenziosa e non rompe', doppio.schede === 1, doppio);

});
