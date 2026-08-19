// Drive — lo scaffale dice quando gli albi non arrivano
//
// Qui c'era un bollino a nuvola nella barra della ricerca: toccandolo si apriva
// un pannello con dentro lo stato di Drive, un pulsante "Ricollega" e la barra
// dello spazio. Sono andati via tutti e due, e per motivi diversi.
//
// Il pannello era una porta doppia: la stessa identica azione — collegare Drive
// — stava gia' scritta a parole nella riga "Albi da Google Drive" delle
// impostazioni. Lo spazio era finito nel posto sbagliato: nessuno apre un
// pannello di Drive per sapere quanti mega gli restano.
//
// Quello che il pannello faceva bene e che NON si doveva perdere e' l'avviso:
// senza Drive lo scaffale sembra semplicemente vuoto, e non si capisce se gli
// albi non ci sono o non arrivano. Quella frase adesso sta scoperta sopra gli
// albi, col pulsante accanto — perche' la finestra di Google si apre solo se
// parte da un tocco. Questa suite guarda esattamente quello: che la riga
// compaia quando serve, che taccia quando non serve, e che il tocco arrivi
// davvero fino al collegamento.
const { suite } = require('../motore.js');

module.exports = () => suite("Drive — lo scaffale dice quando gli albi non arrivano", {"banco": "/test/banco/tavole.html"}, async ({ page, ok, sezione }) => {

  // Lo scaffale degli albi vive dentro una cartella vera, dietro al suo tab:
  // prima si semina la cartella, poi ci si entra, poi si passa agli albi.
  const apriScaffale = async ()=>{
    await page.evaluate(()=>{ window.semina(1,1); window.refs.openFolder('F1'); });
    await page.waitForTimeout(300);
    await page.evaluate(()=> document.getElementById('refs-tab-albi')
      .dispatchEvent(new MouseEvent('click',{bubbles:true})));
    await page.waitForTimeout(300);
  };

  sezione('con Drive scollegato, la riga si vede senza doverla aprire');
  await page.evaluate(()=>{
    window.__driveConfigurato = true;
    window.__driveCollegato = false;
    window.__collegaChiesto = 0;
  });
  await apriScaffale();
  const riga = await page.evaluate(()=>{
    const r = document.getElementById('refs-albums-drive');
    const b = document.getElementById('albums-drive-btn');
    const q = b.getBoundingClientRect();
    const el = document.elementFromPoint(q.left + q.width/2, q.top + q.height/2);
    // Il riferimento e' il pulsante "Apri un albo dal dispositivo": la griglia
    // qui e' vuota (display:none) e non avrebbe una posizione da confrontare.
    const sotto = document.querySelector('.albums-open-btn').getBoundingClientRect();
    return {
      visibile: !r.hidden && getComputedStyle(r).display !== 'none',
      titolo: (document.getElementById('albums-drive-titolo')||{}).textContent || '',
      nota: (document.getElementById('albums-drive-nota')||{}).textContent || '',
      pulsante: b.textContent.trim(),
      // Nessun velo, nessun pannello: sotto il dito c'e' il pulsante e basta.
      dentroIlPulsante: !!(el && (el === b || b.contains(el))),
      chi: el ? (el.id || el.className || el.tagName) : null,
      // In cima allo scaffale, non in fondo alla schermata: e' un avviso su
      // una cosa che manca proprio li'.
      sopraGliAlbi: r.getBoundingClientRect().bottom <= sotto.top + 1,
    };
  });
  ok('la riga e\' a schermo, scoperta', riga.visibile, riga);
  ok('e dice cosa manca, non un\'icona muta', /drive/i.test(riga.titolo) && /non collegat/i.test(riga.titolo), riga);
  ok('spiega la conseguenza: restano solo gli albi gia\' scaricati',
     /gia'? scaricati/i.test(riga.nota), riga);
  ok('sta sopra gli albi', riga.sopraGliAlbi, riga);
  ok('il pulsante invita a collegare', /collega/i.test(riga.pulsante), riga);
  ok('e sotto il dito c\'e\' il pulsante, niente in mezzo', riga.dentroIlPulsante, riga);

  sezione('e premendolo parte davvero il collegamento');
  // Clic VERO di Playwright: arriva dove arriverebbe un dito, e se qualcosa gli
  // sta davanti finisce li' invece che sul pulsante. E' la prova che il vecchio
  // pannello non passava: il suo velo si prendeva il tocco.
  await page.click('#albums-drive-btn');
  await page.waitForTimeout(300);
  const chiamate = await page.evaluate(()=> window.__collegaChiesto);
  ok('connectDrive viene chiamata una volta', chiamate === 1, chiamate);

  sezione('a chi l\'aveva gia\' collegato dice "Ricollega"');
  // Sentirsi proporre la prima connessione quando l'hai gia' fatta sembra che
  // l'app abbia perso i pezzi.
  await page.evaluate(()=>{ window.__driveGiaCollegato = true; window.refs.renderRefsScreen(); });
  await page.waitForTimeout(200);
  const rientro = await page.evaluate(()=> document.getElementById('albums-drive-btn').textContent.trim());
  ok('il pulsante cambia parola', /ricollega/i.test(rientro), rientro);

  sezione('collegato, la riga non ha piu\' niente da dire');
  await page.evaluate(()=>{ window.__driveCollegato = true; window.refs.renderRefsScreen(); });
  await page.waitForTimeout(200);
  const collegato = await page.evaluate(()=> document.getElementById('refs-albums-drive').hidden);
  ok('sparisce invece di dire "tutto a posto"', collegato, collegato);

  sezione('e senza Drive configurato non compare mai');
  // Niente chiavi, niente da collegare: proporlo sarebbe offrire una porta che
  // non porta da nessuna parte.
  await page.evaluate(()=>{
    window.__driveConfigurato = false; window.__driveCollegato = false;
    window.refs.renderRefsScreen();
  });
  await page.waitForTimeout(200);
  const spento = await page.evaluate(()=> document.getElementById('refs-albums-drive').hidden);
  ok('resta nascosta', spento, spento);

  sezione('e della vecchia nuvola non e\' rimasto niente');
  // Se il bollino o il pannello tornassero in pagina per sbaglio, ci sarebbero
  // di nuovo due porte per la stessa stanza — che e' il difetto da cui si e'
  // partiti.
  const resti = await page.evaluate(()=>({
    bollino: !!document.getElementById('refs-profile-btn'),
    pannello: !!document.getElementById('refs-profile-panel'),
    velo: !!document.getElementById('refs-profile-backdrop'),
    barraSpazio: !!document.getElementById('rp-storage-fill'),
  }));
  ok('niente bollino nella barra', !resti.bollino, resti);
  ok('niente pannello', !resti.pannello, resti);
  ok('niente velo dimenticato acceso', !resti.velo, resti);
  ok('e la barra dello spazio non e\' rimasta orfana qui', !resti.barraSpazio, resti);

});
