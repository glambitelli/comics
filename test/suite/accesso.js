// Accesso — l'archivio si apre solo a chi è entrato
//
// Fino alla 1.0.0 chiunque conoscesse l'indirizzo dell'app poteva leggere
// tutto: nessun login, e quindi regole di Firestore aperte per forza.
// Verificato con una richiesta senza credenziali il 17 agosto 2026, che
// rispose con i progetti veri. Qui si prova l'altra metà della cura: la porta
// d'ingresso, e soprattutto che i dati NON vengano chiesti prima di sapere chi
// bussa (con le regole chiuse sarebbe una raffica di "permission-denied" ad
// ogni avvio, e la home disegnata vuota per un istante).
const fs = require('fs');
const path = require('path');
const { suite } = require('../motore.js');

const SDK_FINTO = fs.readFileSync(path.join(__dirname, '..', 'finti', 'firebase-sdk.js'), 'utf8');

const impostazioni = (utente)=> ({
  banco: '/index.html',
  pronto: ()=> !!document.querySelector('#accesso'),
  senzaServiceWorker: true,
  prima: async (page)=>{
    await page.addInitScript(u=>{ window.__utente = u; }, utente);
    await page.route('**://fonts.googleapis.com/**', r=> r.fulfill({status:200, contentType:'text/css', body:''}));
    await page.route('**://fonts.gstatic.com/**', r=> r.abort());
    await page.route('**://www.gstatic.com/firebasejs/**', r=> r.fulfill({
      status:200, contentType:'text/javascript', body: SDK_FINTO }));
  },
});

module.exports = () => suite("Accesso — l'archivio si apre solo a chi e' entrato",
  impostazioni(null), async ({ page, ok, sezione }) => {

  sezione('senza account la porta resta chiusa');
  await page.waitForTimeout(2000);
  const chiusa = await page.evaluate(()=>({
    porta: !document.getElementById('accesso').hidden,
    testo: document.getElementById('accesso').textContent.replace(/\s+/g,' ').trim(),
    // Nessun ascolto sui dati: e' il punto vero di tutta la faccenda.
    ascolti: window.__ascolti || [],
    bottone: (document.getElementById('accesso-btn')||{}).textContent.trim(),
  }));
  ok('la porta e\' a schermo', chiusa.porta, chiusa.porta);
  ok('dice di chi e\' l\'archivio', /tuo, e solo tuo/i.test(chiusa.testo), chiusa.testo);
  ok('e come si entra', /Entra con Google/i.test(chiusa.bottone||''), chiusa.bottone);
  ok('e NESSUN dato viene chiesto prima di entrare',
     chiusa.ascolti.length === 0, chiusa.ascolti);

  sezione('entrando, la porta si apre e i dati partono');
  await page.evaluate(()=> window.entraInInkflow());
  await page.waitForFunction(()=> document.getElementById('accesso').hidden === true, { timeout: 8000 });
  const aperta = await page.evaluate(()=>({
    porta: !document.getElementById('accesso').hidden,
    ascolti: window.__ascolti || [],
    home: document.getElementById('screen-home').classList.contains('active'),
  }));
  ok('la porta se ne va', !aperta.porta, aperta);
  ok('e adesso i progetti si ascoltano', aperta.ascolti.includes('projects'), aperta.ascolti);
  ok('con la home a schermo', aperta.home, aperta);

  sezione('e uscendo la porta si richiude');
  // Uscire dalle impostazioni non deve lasciare l'app aperta su dati che da
  // quel momento non ha piu' il diritto di leggere.
  await page.evaluate(async ()=>{
    const a = await import('/js/auth.js');
    await a.esci();
  });
  await page.waitForFunction(()=> document.getElementById('accesso').hidden === false, { timeout: 8000 });
  ok('la porta torna davanti', await page.evaluate(()=> !document.getElementById('accesso').hidden), null);
});
