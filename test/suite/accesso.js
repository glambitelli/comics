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
    frase: (document.getElementById('accesso-testo')||{}).textContent || '',
    nota: (document.querySelector('.accesso-nota')||{}).textContent || '',
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
  // "Entra con Google compare in modo randomico": e' la segnalazione del 14
  // settembre 2026, e il punto non era il momento — era che la porta diceva la
  // stessa frase in due situazioni opposte. Qui e' il caso ovvio, la prima
  // volta: non si nomina nessuna sessione, perche' non ce n'e' mai stata una.
  ok('a freddo dice solo come si entra',
     /accedi con il tuo account/i.test(chiusa.frase), chiusa.frase);
  ok('senza parlare di sessioni a chi non ne ha mai avuta una',
     !/sessione/i.test(chiusa.frase), chiusa.frase);
  // E LA CONFUSIONE FRA I DUE ACCESSI CON GOOGLE. Questo apre Inkflow; quello
  // di Visual Archive serve a prendere gli albi da Drive. Stesso logo, stesso
  // account: vedendone comparire uno viene naturale pensare che l'altro non
  // sia servito a niente.
  ok('e una riga distingue questo accesso da quello di Drive',
     /drive/i.test(chiusa.nota), chiusa.nota);

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

  sezione('ed entrando, archivio e scene si scaldano prima che tu li apra');
  // IL GUASTO (6 settembre 2026): "quando apro visual archive o scenes
  // all'inizio non compare nulla, poi appaiono tutte le cartelle o i progetti".
  // Non era lentezza di Firestore: era l'ordine delle cose. La schermata
  // compariva subito — giusto — ma in quell'istante cominciava il download del
  // modulo, e solo dopo partiva l'ascolto, il cui primo elenco arrivava un
  // altro giro dopo. Tre attese in fila, tutte davanti agli occhi.
  // Adesso i dati si accendono a mano ferma, appena entrati, senza che nessuno
  // abbia aperto niente.
  await page.waitForFunction(()=>{
    const a = window.__ascolti || [];
    return a.includes('refs') && a.includes('scene');
  }, { timeout: 10000 }).catch(()=>{});
  const scaldati = await page.evaluate(()=>({
    ascolti: window.__ascolti || [],
    // E nessuna di quelle schermate e' stata aperta: si scaldano i DATI, non
    // le stanze.
    archivioAperto: document.getElementById('screen-refs').classList.contains('active'),
    sceneAperte: document.getElementById('screen-scene').classList.contains('active'),
  }));
  ok('l\'archivio e\' gia\' in ascolto', scaldati.ascolti.includes('refs'), scaldati.ascolti);
  // Le cartelle vanno insieme alle immagini: un'immagine sa in che cartella
  // sta, ma il NOME della cartella e' nell'altra collezione.
  ok('con le cartelle, che senza nome non servono a niente',
     scaldati.ascolti.includes('refFolders'), scaldati.ascolti);
  ok('e gli albi dello scaffale', scaldati.ascolti.includes('refAlbums'), scaldati.ascolti);
  ok('e le scene anche', scaldati.ascolti.includes('scene'), scaldati.ascolti);
  ok('senza che nessuna delle due schermate sia stata aperta',
     !scaldati.archivioAperto && !scaldati.sceneAperte, scaldati);

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

  sezione('la sessione e\' configurata all\'inizio, nel posto giusto');
  // "Entra con Google compare in modo randomico" (14 settembre 2026), con la
  // memoria del telefono PROTETTA — quindi non era il sistema a fare pulizia.
  // Il sospetto e' finito su come si diceva a Firebase dove tenere la
  // sessione: getAuth(), e subito dopo setPersistence lanciato e lasciato
  // andare mentre Firebase stava gia' rileggendo chi era entrato. Due cose che
  // corrono sullo stesso dato, e l'utente rimesso in piedi che si perde per
  // strada. Adesso si dice una volta sola, all'inizio.
  const avvio = await page.evaluate(()=> window.__authInit || null);
  ok('si configura all\'avvio, non dopo', !!avvio, avvio);
  // E NELL'ORDINE GIUSTO: IndexedDB prima, localStorage come ripiego. Era
  // scritto al contrario — solo localStorage — e il commento diceva
  // "IndexedDB", quindi nessuno se n'era accorto rileggendo.
  ok('IndexedDB e\' il primo magazzino, non localStorage',
     !!avvio && avvio.magazzini[0] === 'indexedDB', avvio);
  ok('con localStorage dietro, per chi IndexedDB non ce l\'ha',
     !!avvio && avvio.magazzini.includes('localStorage'), avvio);
  // Senza resolver la finestra di Google non saprebbe da che parte cominciare:
  // con getAuth arriva incluso, configurando a mano no. Dimenticarlo non da'
  // errore finche' qualcuno non preme "Entra".
  ok('e la finestra di Google sa da dove partire', !!avvio && avvio.resolver, avvio);

  sezione('e uscendo la porta si richiude');
  // Uscire dalle impostazioni non deve lasciare l'app aperta su dati che da
  // quel momento non ha piu' il diritto di leggere.
  await page.evaluate(async ()=>{
    const a = await import('/js/auth.js');
    await a.esci();
  });
  await page.waitForFunction(()=> document.getElementById('accesso').hidden === false, { timeout: 8000 });
  ok('la porta torna davanti', await page.evaluate(()=> !document.getElementById('accesso').hidden), null);
  // Adesso che ci si era gia' dentro, la frase cambia: non e' una porta che si
  // apre per la prima volta, e' una porta che si richiude alle spalle.
  const dopoLUscita = await page.evaluate(()=> document.getElementById('accesso-testo').textContent);
  ok('e adesso dice che la sessione e\' finita', /sessione/i.test(dopoLUscita), dopoLUscita);
  ok('dicendo anche che non si perde niente',
     /ritrovi tutto/i.test(dopoLUscita), dopoLUscita);
  // Il pulsante si spegne quando lo premi: tornando alla porta va riacceso, se
  // no resta un pulsante che non si lascia premere e l'unica via d'uscita e'
  // ricaricare l'app.
  ok('e il pulsante si lascia premere di nuovo',
     await page.evaluate(()=> !document.getElementById('accesso-btn').disabled), null);

  sezione('e se la sessione cade da sola, resta scritto');
  // Era il buco vero: la porta compariva, il registro raccoglieva solo la
  // conseguenza ("Missing or insufficient permissions", cioe' Firestore che
  // rifiuta le letture di uno che non e' piu' nessuno) e la causa non la
  // vedeva nessuno. Adesso il fatto si scrive da solo, e si legge in
  // Impostazioni -> Diagnostica.
  const caduta = await page.evaluate(async ()=>{
    const r = await import('/js/registro.js');
    const a = await import('/js/auth.js');
    r.svuotaRegistro();
    // Prima si entra... (e la risposta arriva: due sezioni fa si era provato
    // il caso in cui si perde per strada, e quel comando resta acceso).
    window.__popupSiPerde = false;
    window.__popupAnnullato = false;
    await a.entraConGoogle();
    await new Promise(res=> setTimeout(res, 200));
    const dopoIngresso = r.registro().length;
    // ...e poi Firebase dice che non c'e' piu' nessuno, senza che nessuno
    // abbia premuto Esci.
    window.__utente = null;
    window.__buttaFuori();
    await new Promise(res=> setTimeout(res, 200));
    return { dopoIngresso, righe: r.registro().map(x=> x.messaggio) };
  });
  ok('entrare non scrive niente nel registro', caduta.dopoIngresso === 0, caduta);
  ok('ma una sessione caduta da sola si', caduta.righe.length === 1, caduta.righe);
  ok('e dice che e\' finita da sola',
     /finita da sola/i.test(caduta.righe[0] || ''), caduta.righe);
  // Quanto si era stati dentro e se Firebase ricorda ancora l'account: sono i
  // due dettagli che permettono di riconoscere il momento senza indovinare.
  ok('con da quanto eri dentro', /dentro da \d+ min/.test(caduta.righe[0] || ''), caduta.righe);

  sezione('e premere Esci invece non e\' un guasto');
  const volontaria = await page.evaluate(async ()=>{
    const r = await import('/js/registro.js');
    const a = await import('/js/auth.js');
    r.svuotaRegistro();
    window.__popupSiPerde = false;
    window.__popupAnnullato = false;
    await a.entraConGoogle();
    await new Promise(res=> setTimeout(res, 200));
    await a.esci();
    await new Promise(res=> setTimeout(res, 200));
    return r.registro().map(x=> x.messaggio);
  });
  ok('uscire di proposito non finisce nel quadernetto dei guasti',
     volontaria.length === 0, volontaria);

  sezione('si entra, e non col client sbagliato');
  // LA STORIA, per intero, perche' e' costata due giorni.
  //
  // Il 5 settembre da iPad "Entra con Google" finiva su una pagina bianca:
  // signInWithPopup di Firebase non apre Google, apre una pagina di appoggio
  // su un ALTRO dominio, e Safari non le fa rileggere quello che Inkflow le
  // aveva lasciato. La cura giusta e' chiedere il token a Google dal NOSTRO
  // dominio (GIS) e consegnarlo a Firebase.
  //
  // L'ho fatto col client OAuth di Drive. Sbagliato: quel client vive nel
  // progetto Google 58067893949, Firebase e' il progetto 323774526281. Due
  // progetti diversi, e Firebase ha risposto "access_token audience is not for
  // this project", chiudendo fuori dall'app anche il telefono — che prima
  // entrava. Il 14 settembre l'accesso era rotto dappertutto.
  //
  // Finche' non esiste un client del progetto di Firebase (vedi
  // CLIENT_ID_ACCESSO in gis.js) si entra dalla finestra di Firebase.
  await page.evaluate(()=>{
    window.__gisRichieste = 0;
    window.__credenziale = null;
    window.__utenteDaEntrare = null;
  });
  await page.evaluate(()=> window.entraInInkflow());
  await page.waitForFunction(()=> document.getElementById('accesso').hidden === true, { timeout: 8000 });
  const dentro = await page.evaluate(()=>({
    porta: !document.getElementById('accesso').hidden,
    richieste: window.__gisRichieste || 0,
    cliente: window.__gisClientId || '',
  }));
  ok('si entra davvero', !dentro.porta, dentro);
  // Senza il client della strada A non si deve nemmeno provare a chiedere un
  // token a Google: si prende la finestra di Firebase e basta.
  ok('e senza chiedere token a Google con un client che non e\' suo',
     dentro.richieste === 0, dentro);

  sezione('e i due client di Google non si confondono mai');
  // E' la prova che sarebbe servita il 14 settembre. Il client di Drive e
  // quello della porta d'ingresso appartengono a due progetti Google diversi:
  // scambiarli non da' un errore di sintassi, da' un'app in cui nessuno entra
  // piu'. Qui si guarda il codice, non il comportamento — perche' col client
  // sbagliato il comportamento e' identico fino all'ultima riga, e poi Firebase
  // dice di no.
  const sorgenti = await page.evaluate(async ()=>({
    auth: await fetch('/js/auth.js').then(r=> r.text()),
    gis: await fetch('/js/gis.js').then(r=> r.text()),
  }));
  const codiceAuth = sorgenti.auth.replace(/^\s*\/\/.*$/gm, '');
  ok('la porta d\'ingresso non tocca il client di Drive',
     !/CLIENT_ID_GOOGLE/.test(codiceAuth),
     (codiceAuth.match(/CLIENT_ID_GOOGLE.{0,30}/g) || []));
  const idDrive = (sorgenti.gis.match(/CLIENT_ID_GOOGLE\s*=\s*'([^']*)'/) || [])[1];
  const idAccesso = (sorgenti.gis.match(/CLIENT_ID_ACCESSO\s*=\s*'([^']*)'/) || [])[1];
  ok('i due client esistono come cose distinte',
     idDrive !== undefined && idAccesso !== undefined, { idDrive, idAccesso });
  // Vuoto va bene: vuol dire "strada A non configurata, si usa la finestra di
  // Firebase". Quello che non deve succedere MAI e' che siano lo stesso.
  ok('e quando ci sara\', non sara\' lo stesso di Drive',
     !idAccesso || idAccesso !== idDrive, { idDrive, idAccesso });

  sezione('e chiudere la finestra di Google non rompe niente');
  // La finestra si chiude senza entrare: il finto lo dice rifiutando, ed e' lo
  // stesso codice d'errore con cui rispondono tutte e due le strade.
  await page.evaluate(async ()=>{
    const a = await import('/js/auth.js');
    await a.esci();
    await new Promise(r=>setTimeout(r,300));
    window.__gisAnnullato = true;
    window.__popupAnnullato = true;
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

  sezione('e la strada per l\'iPad resta li\', pronta');
  // Non e' stata buttata via: e' giusta, le manca solo un client OAuth del
  // progetto di Firebase. Se un domani qualcuno la cancellasse "perche' tanto
  // non si usa", l'iPad resterebbe fuori per sempre e nessuno saprebbe piu'
  // perche'.
  const sorgente = await page.evaluate(()=> fetch('/js/auth.js').then(r=> r.text()));
  const codice = sorgente.replace(/^\s*\/\/.*$/gm, '');
  ok('la consegna diretta a Firebase c\'e\' ancora',
     /signInWithCredential\s*\(/.test(codice), null);
  ok('e la finestra di Firebase e\' quella che si usa oggi',
     /signInWithPopup\s*\(/.test(codice), null);
});
