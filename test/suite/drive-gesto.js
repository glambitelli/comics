// Drive — la richiesta a Google deve partire DENTRO il tocco
//
// Il difetto che questa suite blocca e' lo stesso di sempre visto da chi usa
// l'app — si preme "Ricollega Google Drive" e non succede niente — ma la causa
// e' la seconda: non piu' due chiamate (vedi drive-accesso.js), bensi' l'attesa
// della libreria di Google. La prima volta va scaricata da accounts.google.com,
// e finche' non arriva non c'e' nessun client a cui chiedere il token. Quando
// arriva, il tocco e' scaduto: il browser tiene buona l'"attivazione" per pochi
// secondi, e senza di quella la finestra di Google e' un popup non richiesto,
// che si blocca in silenzio.
//
// La cura non e' nel pulsante, e' nel tempismo: la libreria si scarica prima,
// entrando nell'archivio e aprendo il pannello Drive (prepareDriveAuth), cosi'
// quando il dito arriva non c'e' piu' niente da aspettare.
const { suite } = require('../motore.js');

module.exports = () => suite("Drive — la finestra di Google parte dal tocco", {"banco": "/test/banco/drive-gesto.html"}, async ({ page, base, ok, sezione }) => {

  sezione('con la libreria pronta, la richiesta parte dentro il gesto');
  // Come nell'app: aprendo il pannello si comincia a scaricare, e solo dopo
  // arriva il dito.
  await page.evaluate(()=> window.drive.prepareDriveAuth());
  await page.waitForFunction(()=> !!(window.google && window.google.accounts), { timeout: 5000 });
  await page.click('#collega');
  await page.waitForTimeout(300);
  const pronta = await page.evaluate(()=> ({ chiamate: window.__chiamate, gis: window.__gisChieste,
                                             collegato: !!window.__collegato }));
  ok('Google viene interpellato una volta sola',
     pronta.chiamate.length === 1, pronta.chiamate);
  ok('e la richiesta parte mentre il tocco e\' ancora in corso',
     pronta.chiamate[0] && pronta.chiamate[0].dentroIlGesto === true, pronta.chiamate);
  ok('il browser vede l\'attivazione dell\'utente',
     pronta.chiamate[0] && pronta.chiamate[0].attivazione !== false, pronta.chiamate);
  ok('senza nessuna attesa in mezzo',
     pronta.chiamate[0] && pronta.chiamate[0].dopoMs < 50, pronta.chiamate);
  ok('e alla fine l\'account risulta collegato', pronta.collegato, pronta);

  sezione('prepararsi non chiede niente a Google');
  // prepareDriveAuth scarica e basta: nessuna finestra, nessun token. Se
  // aprisse qualcosa da sola sarebbe il difetto opposto — la pagina di accesso
  // che piomba addosso senza che l'abbia chiesta nessuno.
  const soloPreparata = await page.evaluate(async ()=>{
    window.__chiamate = [];
    await window.drive.prepareDriveAuth();
    await window.drive.prepareDriveAuth();
    return { chiamate: window.__chiamate.length, gis: window.__gisChieste };
  });
  ok('nessuna richiesta di token', soloPreparata.chiamate === 0, soloPreparata);
  ok('e la libreria si scarica una volta sola', soloPreparata.gis === 1, soloPreparata);

  sezione('senza prepararsi, il tocco scade aspettando la libreria');
  // Il difetto originale, riprodotto: pagina appena aperta, nessuno ha ancora
  // scaricato niente, si preme. La richiesta arriva solo quando la libreria e'
  // pronta — cioe' fuori dal gesto — ed e' li' che il browser la blocca.
  await page.goto(base + '/test/banco/drive-gesto.html');
  await page.waitForFunction(()=> window.__ready === true, { timeout: 15000 });
  await page.evaluate(()=> localStorage.removeItem('inkflow-drive-token'));
  await page.click('#collega');
  await page.waitForTimeout(1200);
  const impreparata = await page.evaluate(()=> window.__chiamate);
  ok('la richiesta arriva comunque, ma fuori dal tocco',
     impreparata.length === 1 && impreparata[0].dentroIlGesto === false, impreparata);
  ok('ed e\' arrivata solo dopo l\'attesa della libreria',
     impreparata[0] && impreparata[0].dopoMs > 300, impreparata);

  sezione('se la risposta di Google si perde, al rientro si finisce il lavoro');
  // Il sintomo: la schermata di Google si apre, l'accesso va a buon fine, si
  // torna sull'app e il pannello dice ancora "Nessun account". Il permesso c'e'
  // — tanto che aprendo un albo Drive risultava collegato — ma la risposta e'
  // tornata verso una pagina che il telefono aveva nel frattempo ricaricato o
  // congelato. Qui si riproduce alla lettera: richiesta partita, risposta mai
  // arrivata, pagina ricaricata.
  await page.goto(base + '/test/banco/drive-gesto.html');
  await page.waitForFunction(()=> window.__ready === true, { timeout: 15000 });
  await page.evaluate(async ()=>{
    localStorage.removeItem('inkflow-drive-token');
    window.__esito = 'silenzio';
    await window.drive.prepareDriveAuth();
  });
  await page.click('#collega');
  await page.waitForTimeout(200);
  const perso = await page.evaluate(()=> ({
    chiamate: window.__chiamate.length,
    collegato: window.drive.isDriveConnected(),
    segno: !!localStorage.getItem('inkflow-drive-in-corso'),
  }));
  ok('dopo il tocco l\'account non risulta collegato', !perso.collegato, perso);
  ok('ma resta scritto che un tentativo era in corso', perso.segno, perso);

  // La pagina riparte da zero: e' il punto in cui prima si perdeva tutto.
  await page.goto(base + '/test/banco/drive-gesto.html');
  await page.waitForFunction(()=> window.__ready === true, { timeout: 15000 });
  const ripreso = await page.evaluate(async ()=>{
    window.__esito = 'ok';                 // la sessione Google ora e' calda
    const fatto = await window.drive.resumeDriveConnect();
    return { fatto, collegato: window.drive.isDriveConnected(),
             chiamate: window.__chiamate,
             segno: !!localStorage.getItem('inkflow-drive-in-corso') };
  });
  ok('al rientro il collegamento si completa da solo', ripreso.fatto && ripreso.collegato, ripreso);
  ok('e lo fa in silenzio, senza rimettere davanti Google',
     ripreso.chiamate.length === 1 && ripreso.chiamate[0].opts.prompt === '', ripreso.chiamate);
  ok('il segno del tentativo viene cancellato', !ripreso.segno, ripreso);

  sezione('ma senza un tentativo in corso non parte proprio niente');
  // E' la regola di sempre: nessuna schermata di Google che compaia da sola.
  // Il recupero vale solo come coda di un tocco recente.
  const aFreddo = await page.evaluate(async ()=>{
    localStorage.removeItem('inkflow-drive-token');
    localStorage.removeItem('inkflow-drive-in-corso');
    window.__chiamate = [];
    const fatto = await window.drive.resumeDriveConnect();
    return { fatto, chiamate: window.__chiamate.length };
  });
  ok('resumeDriveConnect non chiede niente', aFreddo.chiamate === 0 && !aFreddo.fatto, aFreddo);

  sezione('e nemmeno se il tentativo e\' di mezz\'ora fa');
  // Tre minuti: oltre, non e' piu' "sto tornando da Google", e' un'altra
  // sessione. Riprendere li' vorrebbe dire far comparire Google dal nulla.
  const vecchio = await page.evaluate(async ()=>{
    localStorage.setItem('inkflow-drive-in-corso', String(Date.now() - 30*60*1000));
    window.__chiamate = [];
    const fatto = await window.drive.resumeDriveConnect();
    return { fatto, chiamate: window.__chiamate.length,
             segno: !!localStorage.getItem('inkflow-drive-in-corso') };
  });
  ok('un tentativo vecchio non si riprende', !vecchio.fatto && vecchio.chiamate === 0, vecchio);
  ok('e il segno scaduto si butta via', !vecchio.segno, vecchio);

});
