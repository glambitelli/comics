// Drive — premere "Collega" deve aprire la finestra di Google
//
// Il difetto che questa suite blocca: si premeva "Ricollega Google Drive" e non
// succedeva niente. Non era un errore visibile — nessun messaggio, nessuna
// schermata, l'account restava scollegato — e da fuori sembrava un pulsante
// morto. Il motivo sta tutto nel NUMERO di chiamate.
const { suite } = require('../motore.js');

module.exports = () => suite("Drive — il pulsante Collega apre davvero Google", {"banco": "/test/banco/drive-auth.html"}, async ({ page, ok, sezione }) => {

  sezione('una sola chiamata, dentro il gesto');
  // Prima ce n'erano due: la prima silenziosa e, se falliva, una seconda con
  // la schermata di consenso. Ma la seconda parte da dentro una callback
  // asincrona — cioe' FUORI dal tocco — e il browser blocca quella finestra
  // come blocca qualunque popup non chiesto da un gesto.
  const fallito = await page.evaluate(async ()=>{
    window.__chiamate = []; window.__esito = 'errore';
    let errore = null;
    try{ await window.drive.connectDrive(); }catch(e){ errore = e.message; }
    return { chiamate: window.__chiamate, errore };
  });
  ok('anche fallendo, Google viene interpellato UNA volta sola',
     fallito.chiamate.length === 1, fallito.chiamate);
  ok('e l\'errore arriva a chi ha premuto, invece di sparire',
     !!fallito.errore, fallito);

  sezione('e senza dire a Google cosa mostrare');
  // Con `prompt: ''` Google prova a non mostrare niente: riesce solo se la
  // sessione e' viva e il consenso c'e' gia'. Premendo il pulsante non e'
  // quello che si vuole — si vuole che Google faccia il necessario, scelta
  // dell'account compresa.
  ok('nessuna preferenza sul prompt',
     fallito.chiamate[0] && fallito.chiamate[0].prompt === undefined, fallito.chiamate);

  sezione('quando va bene, il token si salva');
  const riuscito = await page.evaluate(async ()=>{
    window.__chiamate = []; window.__esito = 'ok';
    localStorage.removeItem('inkflow_drive_token');
    const t = await window.drive.connectDrive();
    return { chiamate: window.__chiamate.length, token: !!(t && t.access_token),
             collegato: window.drive.isDriveConnected() };
  });
  ok('una chiamata sola anche qui', riuscito.chiamate === 1, riuscito);
  ok('e alla fine l\'account risulta collegato',
     riuscito.token && riuscito.collegato, riuscito);

  sezione('il rinnovo automatico invece resta silenzioso');
  // Li' il silenzio ha senso: non c'e' nessun gesto da rispettare e mostrare
  // una schermata di Google mentre l'app lavora da sola sarebbe un agguato.
  const silenzioso = await page.evaluate(async ()=>{
    window.__chiamate = []; window.__esito = 'errore';
    localStorage.removeItem('inkflow_drive_token');
    await window.drive.ensureDriveConnected(false).catch(()=>{});
    return window.__chiamate;
  });
  ok('senza una richiesta esplicita non disturba nessuno',
     silenzioso.length === 0, silenzioso);

  sezione('e il ritorno da Google si recupera anche se la pagina e\' ripartita');
  // Sul telefono, tornando dalla finestra di Google, spesso Inkflow e' stato
  // ricaricato da capo: la risposta non trova piu' nessuno ad aspettarla e il
  // collegamento resta a meta'. Prima a raccogliere quel filo era la sola
  // schermata References — chi collegava Drive dalle impostazioni senza aver
  // mai aperto l'archivio restava con "Non collegato" per sempre. Ora ad
  // ascoltare e' l'app, appena riparte.
  const rientro = await page.evaluate(async ()=>{
    window.drive.disconnectDrive();
    window.__chiamate = []; window.__esito = 'ok';
    localStorage.setItem('inkflow-drive-in-corso', String(Date.now()));
    let avvisato = false;
    window.drive.ascoltaRientroDrive(()=>{ avvisato = true; });
    await new Promise(r=>setTimeout(r, 150));
    return { chiamate: window.__chiamate, collegato: window.drive.isDriveConnected(),
             avvisato, segno: localStorage.getItem('inkflow-drive-in-corso') };
  });
  ok('basta che l\'app riparta, senza toccare niente', rientro.chiamate.length === 1, rientro);
  ok('e lo fa in silenzio, senza schermate a sorpresa',
     rientro.chiamate[0] && rientro.chiamate[0].prompt === '', rientro);
  ok('il collegamento si chiude davvero', rientro.collegato, rientro);
  ok('chi guarda viene avvisato', rientro.avvisato, rientro);
  ok('e il tentativo non resta appeso per la prossima apertura', !rientro.segno, rientro);

  sezione('ma senza un tentativo appena cominciato non parte niente');
  // La regola di fondo resta quella: a Google non si chiede niente che l'utente
  // non abbia chiesto. Il segno vale tre minuti, e solo dopo un tocco vero.
  const senzaSegno = await page.evaluate(async ()=>{
    window.drive.disconnectDrive();
    window.__chiamate = [];
    localStorage.removeItem('inkflow-drive-in-corso');
    window.drive.ascoltaRientroDrive();
    await new Promise(r=>setTimeout(r, 150));
    return { chiamate: window.__chiamate.length, collegato: window.drive.isDriveConnected() };
  });
  ok('nessuna richiesta a Google', senzaSegno.chiamate === 0, senzaSegno);
  ok('e si resta scollegati, come dev\'essere', !senzaSegno.collegato, senzaSegno);

  const vecchio = await page.evaluate(async ()=>{
    window.__chiamate = [];
    localStorage.setItem('inkflow-drive-in-corso', String(Date.now() - 10*60*1000));
    window.drive.ascoltaRientroDrive();
    await new Promise(r=>setTimeout(r, 150));
    return { chiamate: window.__chiamate.length, segno: localStorage.getItem('inkflow-drive-in-corso') };
  });
  ok('un tentativo di dieci minuti fa non e\' piu\' un ritorno', vecchio.chiamate === 0, vecchio);
  ok('e il segno vecchio viene buttato via', !vecchio.segno, vecchio);

});
