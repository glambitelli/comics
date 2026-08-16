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

});
