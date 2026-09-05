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
  // UNA RIGA SOLA, e dice come si entra. "Questo archivio e' tuo, e solo tuo"
  // era una rassicurazione che nessuno aveva chiesto: davanti a una porta
  // chiusa si vuole sapere come si apre, non a chi appartiene la casa.
  ok('dice come si entra, e basta', /accedi con il tuo account google/i.test(chiusa.testo), chiusa.testo);
  ok('senza spiegazioni di troppo', !/solo tuo/i.test(chiusa.testo), chiusa.testo);
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

  sezione('e la porta si apre anche se la risposta di Google si perde');
  // Il guasto raccontato cosi': "faccio l'accesso ma non va avanti". La
  // finestra di Google e' una finestra a parte, e mentre e' aperta il telefono
  // puo' congelare o ricaricare la pagina sotto — in un browser dentro
  // un'altra app succede quasi sempre. L'accesso RIESCE, ma la risposta non
  // trova piu' nessuno: prima la porta si apriva solo su quella risposta, e si
  // restava davanti a "Entra con Google" per sempre. Ripremere non serviva:
  // Google rispondeva subito "sei gia' dentro" e quella risposta si perdeva
  // allo stesso modo.
  await page.evaluate(async ()=>{
    const a = await import('/js/auth.js');
    await a.esci();
    await new Promise(r=>setTimeout(r,300));
    window.__popupSiPerde = true;
    window.__ascolti = [];
    window.entraInInkflow();
  });
  await page.waitForFunction(()=> document.getElementById('accesso').hidden === true, { timeout: 8000 })
    .catch(()=>{});
  const perSuoConto = await page.evaluate(()=>({
    porta: !document.getElementById('accesso').hidden,
    ascolti: window.__ascolti || [],
    home: document.getElementById('screen-home').classList.contains('active'),
  }));
  ok('la porta si apre lo stesso, perche\' a decidere e\' lo STATO',
     !perSuoConto.porta, perSuoConto);
  ok('e con la home a schermo, come sempre', perSuoConto.home, perSuoConto);

  sezione('e uscendo la porta si richiude');
  // Uscire dalle impostazioni non deve lasciare l'app aperta su dati che da
  // quel momento non ha piu' il diritto di leggere.
  await page.evaluate(async ()=>{
    const a = await import('/js/auth.js');
    await a.esci();
  });
  await page.waitForFunction(()=> document.getElementById('accesso').hidden === false, { timeout: 8000 });
  ok('la porta torna davanti', await page.evaluate(()=> !document.getElementById('accesso').hidden), null);
  // Il pulsante si spegne quando lo premi: tornando alla porta va riacceso, se
  // no resta un pulsante che non si lascia premere e l'unica via d'uscita e'
  // ricaricare l'app.
  ok('e il pulsante si lascia premere di nuovo',
     await page.evaluate(()=> !document.getElementById('accesso-btn').disabled), null);

  sezione('si entra dal NOSTRO dominio, non dalla pagina di appoggio di Firebase');
  // IL GUASTO CHE HA PORTATO QUI. signInWithPopup di Firebase non apre Google:
  // apre inkflow-95f2f.firebaseapp.com, un altro dominio, e ci lascia in
  // deposito lo stato dell'accesso per rileggerlo al ritorno. Safari su iPad
  // tiene cassetti separati per lo stesso dominio a seconda di chi lo apre, e
  // quello che scriveva Inkflow non era quello che rileggeva la pagina di
  // appoggio: "Unable to process request due to missing initial state", e
  // nessun modo di entrare (5 settembre 2026, iPad). Adesso la finestra la
  // apre la libreria di Google dal nostro dominio e il token si consegna a
  // Firebase per via diretta.
  await page.evaluate(()=>{
    window.__gisRichieste = 0;
    window.__credenziale = null;
    window.__gisToken = 'TOKEN-DAL-VIVO';
  });
  await page.evaluate(()=> window.entraInInkflow());
  await page.waitForFunction(()=> document.getElementById('accesso').hidden === true, { timeout: 8000 });
  const giro = await page.evaluate(()=>({
    richieste: window.__gisRichieste || 0,
    scope: window.__gisScope || '',
    cliente: window.__gisClientId || '',
    cred: window.__credenziale,
  }));
  ok('la finestra di Google si apre, e una volta sola', giro.richieste === 1, giro);
  // Entrare non deve far comparire una richiesta di permesso su Drive: quella
  // arriva quando si collega Drive, ed e' un'altra decisione.
  ok('e chiede solo l\'email, non Drive',
     /userinfo\.email/.test(giro.scope) && !/auth\/drive/.test(giro.scope), giro.scope);
  ok('con il client OAuth del progetto',
     /\.apps\.googleusercontent\.com$/.test(giro.cliente), giro.cliente);
  // Il token VERO, non un segnaposto: se un giorno si consegnasse a Firebase
  // una credenziale vuota, l'accesso fallirebbe solo sul telefono.
  ok('e il token di Google arriva davvero a Firebase',
     !!giro.cred && giro.cred.__google === 'TOKEN-DAL-VIVO', giro.cred);

  sezione('e chiudere la finestra di Google non rompe niente');
  await page.evaluate(async ()=>{
    const a = await import('/js/auth.js');
    await a.esci();
    await new Promise(r=>setTimeout(r,300));
    window.__gisAnnullato = true;
    window.entraInInkflow();
  });
  await page.waitForTimeout(900);
  const annullato = await page.evaluate(()=>({
    porta: !document.getElementById('accesso').hidden,
    premibile: !document.getElementById('accesso-btn').disabled,
    errore: !document.getElementById('accesso-errore').hidden,
  }));
  ok('la porta resta li\'', annullato.porta, annullato);
  ok('il pulsante torna premibile', annullato.premibile, annullato);
  // Chi chiude una finestra sa di averla chiusa: non gli si dice anche che
  // qualcosa e' andato storto.
  ok('e nessun messaggio d\'errore', !annullato.errore, annullato);
  await page.evaluate(()=>{ window.__gisAnnullato = false; });

  sezione('e la pagina di appoggio non si usa piu\', nemmeno per sbaglio');
  // Una guardia sul codice, non sul comportamento: rimettere signInWithPopup
  // farebbe passare tutte le prove qui sopra — la finestra si aprirebbe lo
  // stesso — e romperebbe di nuovo SOLO l'iPad, cioe' l'unico posto dove
  // nessuna prova arriva.
  const sorgente = await page.evaluate(()=> fetch('/js/auth.js').then(r=> r.text()));
  // I commenti si tolgono prima di guardare: la' dentro il nome ci sta, e ci
  // DEVE stare — e' li' che e' scritto perche' non si usa piu'.
  const codice = sorgente.replace(/^\s*\/\/.*$/gm, '');
  ok('l\'accesso non chiama piu\' signInWithPopup',
     !/signInWithPopup\s*[(,]/.test(codice), (codice.match(/signInWithPopup.{0,20}/g)||[]));
  ok('e consegna la credenziale a Firebase per via diretta',
     /signInWithCredential\s*\(/.test(codice), null);
});
