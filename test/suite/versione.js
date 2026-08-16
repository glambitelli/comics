// La versione scritta in fondo alla home e' quella che sta girando davvero
//
// Serve a una domanda che si e' ripetuta troppe volte: "ho pubblicato" / "io
// vedo ancora quella vecchia". Un telefono puo' servire una copia in cache per
// un bel po', e senza un numero a schermo si ricarica a caso e si discute al
// buio. Il numero lo dice il SERVICE WORKER — non la pagina, che potrebbe
// essere lei la copia vecchia — perche' e' lui che i file li serve.
const fs = require('fs');
const path = require('path');
const { suite } = require('../motore.js');

const SDK_FINTO = fs.readFileSync(path.join(__dirname, '..', 'finti', 'firebase-sdk.js'), 'utf8');
const SW = fs.readFileSync(path.join(__dirname, '..', '..', 'sw.js'), 'utf8');
const ATTESA = (SW.match(/inkflow-static-(v\d+)/) || [])[1];

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

  sezione('e la home la scrive dove prima c\'era un "v1.0.0" finto');
  await page.waitForFunction(()=>
    document.querySelector('.app-vers') &&
    document.querySelector('.app-vers').textContent !== 'v1.0.0', { timeout: 10000 });
  const aSchermo = await page.evaluate(()=> Array.from(document.querySelectorAll('.app-vers'))
    .map(e=> e.textContent.trim()));
  ok('la scritta in fondo alla home e\' la versione vera',
     aSchermo[0] === ATTESA, { aSchermo, ATTESA });
  // Anche nella schermata sera: e' la stessa riga, e una delle due ferma a
  // "v1.0.0" sarebbe peggio di niente.
  ok('e vale anche per la riga della sera',
     aSchermo.length > 1 && aSchermo.every(v=> v === ATTESA), aSchermo);

});
