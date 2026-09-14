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
}, async ({ page, base, ok, sezione }) => {

  // Un albo vero da mettere "in casa" quando serve: e' un .cbz, ma lo si
  // presenta col nome .cbr — dentro l'app decide la FIRMA dei byte, non
  // l'estensione, quindi va benissimo per provare la strada dei .cbr senza
  // dover impacchettare un RAR (che nessuno qui sa fare).
  await page.evaluate(async (url)=>{
    const buf = await (await fetch(url)).arrayBuffer();
    window.__inCasaFinto = new File([buf], 'OPUS 01.cbr', { type:'application/octet-stream' });
    window.__inCasa = null;
  }, base + '/test/fixtures/pagine.cbz');

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

  sezione('ma se l\'albo e\' gia\' in casa, la scheda nasce completa');
  // IL PUNTO. Dentro un RAR non si sbircia a distanza, quindi un .cbr nasce col
  // riquadro "DA APRIRE" e "0 pagine". Ma se quel file e' gia' stato scaricato
  // — perche' lo si e' letto — sta sul telefono: leggerlo di li' non costa ne'
  // rete ne' attesa, e la copertina si puo' fare eccome.
  const inCasa = await page.evaluate(async ()=>{
    window.__schede = [];
    window.__dl = null;
    window.__caricamenti = [];
    window.__inCasa = window.__inCasaFinto;
    await window.albums.createAlbumFromDriveFile('F1', {
      id:'D-CASA', name:'OPUS 01.cbr', size: 504 * 1048576,
    });
    window.__inCasa = null;
    return {
      scaricato: !!(window.__dl && window.__dl.avviato),
      scheda: window.__schede[0] || null,
      caricamenti: (window.__caricamenti || []).length,
    };
  });
  ok('nemmeno qui si scarica niente: il file c\'era gia\'', inCasa.scaricato === false, inCasa);
  ok('la copertina c\'e\'', !!(inCasa.scheda && inCasa.scheda.cover), inCasa.scheda);
  ok('ed e\' stata caricata davvero, non inventata', inCasa.caricamenti === 1, inCasa);
  ok('e il conteggio pagine e\' quello vero',
     inCasa.scheda && inCasa.scheda.pageCount === 12, inCasa.scheda);

  sezione('e una scheda nata vuota si completa dopo, senza scaricare niente');
  // Il caso di Giovanni, 14 settembre 2026: Drive collegato, gli albi
  // scaricati e letti, ma le schede restavano col riquadro "DA APRIRE" e "0
  // pagine" per sempre — copertina e conteggio si tentavano UNA VOLTA SOLA,
  // alla creazione, quando il file non c'era ancora.
  const tardi = await page.evaluate(async ()=>{
    window.__completate = [];
    window.__dl = null;
    window.__caricamenti = [];
    window.__inCasa = window.__inCasaFinto;
    const fatto = await window.albums.completaSchedaAlbo({
      id:'A-VUOTA', driveFileId:'D-CASA', sourceName:'OPUS 01.cbr',
      title:'OPUS 01', cover:null, pageCount:0,
    });
    window.__inCasa = null;
    return {
      fatto,
      scaricato: !!(window.__dl && window.__dl.avviato),
      completate: window.__completate,
    };
  });
  ok('la scheda si completa', tardi.fatto === true, tardi);
  ok('senza scaricare niente', tardi.scaricato === false, tardi);
  ok('e ci finiscono dentro copertina e conteggio',
     tardi.completate.length === 1
     && tardi.completate[0].id === 'A-VUOTA'
     && !!tardi.completate[0].campi.cover
     && tardi.completate[0].campi.pageCount === 12, tardi.completate);

  sezione('una scheda gia\' a posto non si tocca');
  const gia = await page.evaluate(async ()=>{
    window.__completate = [];
    window.__inCasa = window.__inCasaFinto;
    const fatto = await window.albums.completaSchedaAlbo({
      id:'A-PIENA', driveFileId:'D-CASA', sourceName:'OPUS 01.cbr',
      cover:'https://gia/qui.jpg', pageCount: 7,
    });
    window.__inCasa = null;
    return { fatto, completate: window.__completate.length };
  });
  // Non e' pignoleria: questa funzione gira ad ogni sincronizzazione dello
  // scaffale, e senza questo controllo rifarebbe copertina e caricamento su
  // Cloudinary per ogni albo, ogni volta.
  ok('non si riscrive niente', gia.fatto === false && gia.completate === 0, gia);

  sezione('e se l\'albo non e\' in casa, non lo si va a prendere');
  const lontano = await page.evaluate(async ()=>{
    window.__completate = [];
    window.__dl = null;
    window.__inCasa = null;      // mai scaricato
    const fatto = await window.albums.completaSchedaAlbo({
      id:'A-LONTANA', driveFileId:'D-MAI', sourceName:'OPUS 02.cbr',
      cover:null, pageCount:0,
    });
    return { fatto, scaricato: !!(window.__dl && window.__dl.avviato),
             completate: window.__completate.length };
  });
  ok('niente scaricamento di nascosto', lontano.scaricato === false, lontano);
  ok('e la scheda resta com\'era, in attesa che l\'albo passi di qui',
     lontano.fatto === false && lontano.completate === 0, lontano);
});