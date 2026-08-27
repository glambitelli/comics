// La versione che sta girando davvero — a disposizione, ma non addosso
//
// Serve a una domanda che si e' ripetuta troppe volte: "ho pubblicato" / "io
// vedo ancora quella vecchia". Un telefono puo' servire una copia in cache per
// un bel po', e senza un numero a schermo si ricarica a caso e si discute al
// buio. Il numero lo dice il SERVICE WORKER — non la pagina, che potrebbe
// essere lei la copia vecchia — perche' e' lui che i file li serve. A schermo
// non ci finisce: accanto al marchio resta il v1.0.0, e il numero di serie si
// legge in Impostazioni sotto Diagnostica, dove ci si va apposta.
const fs = require('fs');
const path = require('path');
const { suite } = require('../motore.js');

const SDK_FINTO = fs.readFileSync(path.join(__dirname, '..', 'finti', 'firebase-sdk.js'), 'utf8');
const SW = fs.readFileSync(path.join(__dirname, '..', '..', 'sw.js'), 'utf8');
// Due numeri e due mestieri (vedi sw.js): la versione dell'app, che cambia
// quando cambia cosa l'app sa fare, e il numero di serie della pubblicazione,
// che cambia ad ogni ritocco. In Diagnostica si leggono tutti e due.
const SERIE = (SW.match(/inkflow-static-(v\d+)/) || [])[1];
const NUMERO = (SW.match(/const VERSIONE = '([^']+)'/) || [])[1];
const ATTESA = NUMERO + ' \u00b7 ' + SERIE;

module.exports = () => suite("Versione — quella scritta e' quella che gira", {
  banco: '/index.html',
  pronto: ()=> !!document.querySelector('#screen-home'),
  prima: async (page)=>{
    await page.route('**://fonts.googleapis.com/**', r=> r.fulfill({status:200, contentType:'text/css', body:''}));
    await page.route('**://fonts.gstatic.com/**', r=> r.abort());
    await page.route('**://www.gstatic.com/firebasejs/**', r=> r.fulfill({
      status:200, contentType:'text/javascript', body: SDK_FINTO }));
  },
}, async ({ page, ok, sezione }) => {

  sezione('il service worker dice la sua versione a chi gliela chiede');
  await page.waitForFunction(()=> !!navigator.serviceWorker.controller, { timeout: 10000 });
  const risposta = await page.evaluate(async ()=>{
    const reg = await navigator.serviceWorker.ready;
    return await Promise.race([
      new Promise(res=>{
        const c = new MessageChannel();
        c.port1.onmessage = e=> res(e.data);
        reg.active.postMessage({ type:'VERSIONE' }, [c.port2]);
      }),
      new Promise(res=> setTimeout(()=> res('SILENZIO'), 2000)),
    ]);
  });
  ok('risponde, e non con un silenzio', risposta !== 'SILENZIO', risposta);
  ok('e dice la versione che sta in sw.js', risposta === ATTESA, { risposta, ATTESA });
  ok('con il numero dell\'app davanti al numero di serie',
     risposta.startsWith(NUMERO + ' ') && risposta.endsWith(SERIE), { risposta, NUMERO, SERIE });

  sezione('ma non la scrive addosso a chi sta disegnando');
  await page.waitForFunction(()=> !!document.body.dataset.vers, { timeout: 10000 });
  const dove = await page.evaluate(()=> ({
    // Il numero di serie sta a disposizione, ma non a schermo.
    inTasca: document.body.dataset.vers,
    // Accanto al marchio, in fondo alla home e alla sera, resta il v1.0.0:
    // "inkflow-static-v295" li' era solo un codice buttato addosso a chi
    // voleva disegnare.
    aSchermo: Array.from(document.querySelectorAll('.app-vers')).map(e=> e.textContent.trim()),
    // E si trova dove ci si va apposta: Impostazioni, sotto Diagnostica.
    inDiagnostica: (document.getElementById('versione-viva')||{}).textContent || '',
  }));
  ok('il numero di serie e\' comunque a disposizione', dove.inTasca === ATTESA, dove);
  ok('accanto al marchio resta il v1.0.0',
     dove.aSchermo.length > 1 && dove.aSchermo.every(v=> v === 'v1.0.0'), dove);
  ok('e la versione vera si legge in Diagnostica',
     dove.inDiagnostica === ATTESA, dove);

});
