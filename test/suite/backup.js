// Backup — l'archivio esce da qui, e ci rientra
//
// È la prova più importante di tutte, e per un motivo che non c'entra con
// l'interfaccia: le immagini stanno su Cloudinary ma i loro INDIRIZZI vivono
// solo su Firestore. Se quel file non contiene i ritagli, il giorno che il
// database si svuota le foto restano dove sono e non le ritrova più nessuno.
// Quindi qui non si controlla che "il backup funzioni": si controlla che
// dentro ci sia TUTTO, pezzo per pezzo, e che rimettendolo torni al suo posto.
//
// Gira sull'app vera (come impostazioni.js): il file viene scaricato davvero
// dal browser e riletto da disco.
const fs = require('fs');
const path = require('path');
const { suite } = require('../motore.js');

const SDK_FINTO = fs.readFileSync(path.join(__dirname, '..', 'finti', 'firebase-sdk.js'), 'utf8');

// Un archivio in miniatura, con dentro una cosa per tipo.
const ARCHIVIO = {
  projects:   { p1: { title:'Kara', numTav:10, phase:1 } },
  refs:       { r1: { url:'https://res.cloudinary.com/le3bzkm8/image/upload/v1/uno.jpg',
                      folderId:'f1', tags:['mani'], tavola:false },
                r2: { url:'https://res.cloudinary.com/le3bzkm8/image/upload/v1/due.jpg',
                      folderId:'f1', tavola:true } },
  refFolders: { f1: { category:'Artists', name:'Otomo Katsuhiro', cognome:'Otomo', nome:'Katsuhiro' } },
  refAlbums:  { a1: { folderId:'f1', title:'Akira 1', pageCount:364 } },
  ideas:      { i1: { testo:'Una scena al mercato', ordine:0 } },
  userdata:   { inkflow_user_data: { stars:12, streak:3 } },
};

module.exports = () => suite("Backup — l'archivio esce da qui, e ci rientra", {
  banco: '/index.html',
  pronto: ()=> !!document.querySelector('#settings-panel'),
  // Qui si importano moduli a tocco avvenuto (l'accesso): senza spegnere il
  // service worker le loro richieste non passerebbero dalle intercettazioni
  // qui sotto e finirebbero sulla rete vera. Vedi il commento in motore.js.
  senzaServiceWorker: true,
  prima: async (page)=>{
    // Si annota se l'app chiede al browser di NON buttare via i suoi dati.
    // Va messo prima del caricamento, perche' la richiesta parte all'avvio.
    await page.addInitScript(()=>{
      window.__persistChiesto = false;
      if(!navigator.storage) return;
      navigator.storage.persisted = ()=> Promise.resolve(false);
      navigator.storage.persist = ()=>{ window.__persistChiesto = true; return Promise.resolve(true); };
    });
    await page.route('**://fonts.googleapis.com/**', r=> r.fulfill({status:200, contentType:'text/css', body:''}));
    await page.route('**://fonts.gstatic.com/**', r=> r.abort());
    await page.route('**://www.gstatic.com/firebasejs/**', r=> r.fulfill({
      status:200, contentType:'text/javascript', body: SDK_FINTO }));
  },
}, async ({ page, ok, sezione }) => {

  await page.waitForTimeout(1800);
  await page.evaluate(a=>{ window.__archivio = a; }, ARCHIVIO);

  sezione('all\'avvio l\'app chiede di non buttare via i suoi dati');
  // La copia offline di Firestore, gli albi scaricati da Drive e i file
  // dell'app stanno in una memoria che Android considera sacrificabile: senza
  // chiedere il contrario, sotto pressione di spazio sparisce senza avvisare,
  // e l'unica cosa che si vede e' un'app che si e' dimenticata delle cose.
  ok('la memoria persistente viene richiesta, una volta sola',
     await page.evaluate(()=> window.__persistChiesto === true), null);

  sezione('esportare scrive un file con dentro tutto l\'archivio');
  const [scaricato] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.evaluate(async ()=>{
      const m = await import('/js/settings.js');
      m.exportBackup();
    }),
  ]);
  const nome = scaricato.suggestedFilename();
  const dove = await scaricato.path();
  const dati = JSON.parse(fs.readFileSync(dove, 'utf8'));
  ok('il file si chiama come la cosa che contiene, con la data',
     /^inkflow-archivio-\d{4}-\d{2}-\d{2}\.json$/.test(nome), nome);
  ok('e dice di che app e\' e in che formato', dati.app === 'inkflow' && dati.formato === 2, dati.formato);

  const c = dati.collezioni || {};
  ok('ci sono i progetti', (c.projects||[]).length === 1, c.projects);
  ok('ci sono le immagini, tutte e due', (c.refs||[]).length === 2, c.refs);
  ok('ci sono gli artisti', (c.refFolders||[]).length === 1, c.refFolders);
  ok('ci sono gli albi', (c.refAlbums||[]).length === 1, c.refAlbums);
  ok('ci sono le idee', (c.ideas||[]).length === 1, c.ideas);
  ok('ci sono stelle e streak', (c.userdata||[]).length === 1, c.userdata);
  // IL CONTROLLO CHE CONTA. Un backup senza gli indirizzi delle immagini e'
  // una scatola vuota che sembra piena.
  const uno = (c.refs||[]).find(r=> r.id === 'r1');
  ok('e ogni immagine si porta dietro il suo indirizzo su Cloudinary',
     !!uno && /res\.cloudinary\.com/.test(uno.url||''), uno);
  ok('insieme a cartella e tag, se no si ritrova tutto sfuso',
     !!uno && uno.folderId === 'f1' && Array.isArray(uno.tags) && uno.tags[0] === 'mani', uno);
  ok('e l\'identificativo, che e\' quello che permette di rimetterla al suo posto',
     (c.refs||[]).every(r=> !!r.id), c.refs);

  sezione('e la riga sotto i pulsanti si ricorda quando l\'hai fatto');
  const quando = await page.evaluate(()=>{
    const el = document.getElementById('backup-quando');
    return { testo: el ? el.textContent.trim() : null,
             salvato: !!localStorage.getItem('inkflow_ultimo_backup') };
  });
  ok('la data dell\'ultimo backup viene segnata', quando.salvato, quando);
  ok('e a schermo si legge "oggi"', /oggi/i.test(quando.testo||''), quando);

  sezione('finito, lo dice con un foglio dell\'app e non col riquadro del browser');
  const foglio = await page.evaluate(()=>{
    const ov = document.querySelector('.modal-overlay.open');
    if(!ov) return null;
    const annulla = ov.querySelector('#ink-confirm-cancel');
    return {
      titolo: (ov.querySelector('h3')||{}).textContent || '',
      testo: (ov.querySelector('.modal-nota')||{}).textContent || '',
      unSoloPulsante: !annulla || annulla.hidden,
      classePulsante: (ov.querySelector('#ink-confirm-ok')||{}).className || '',
    };
  });
  ok('il foglio c\'e\'', !!foglio, foglio);
  ok('dice cosa ha salvato, contandolo', /2 immagini/.test(foglio.testo||''), foglio);
  ok('ha un pulsante solo: non c\'e\' niente da annullare', foglio.unSoloPulsante, foglio);
  ok('e non e\' rosso, perche\' non ha cancellato niente',
     /btn-create/.test(foglio.classePulsante), foglio);
  await page.evaluate(()=> document.querySelector('.modal-overlay.open #ink-confirm-ok').click());
  await page.waitForTimeout(250);

  sezione('ripristinare rimette ogni cosa nella sua collezione');
  // Il file appena scaricato torna dentro dall'input dei file, come farebbe
  // uno vero pescato dalle sue cartelle.
  await page.evaluate(()=>{ window.__scritture = []; });
  const [scelta] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    page.evaluate(async ()=>{
      const m = await import('/js/settings.js');
      m.importBackup();
    }),
  ]);
  await scelta.setFiles(dove);
  await page.waitForTimeout(400);
  const domanda = await page.evaluate(()=>{
    const ov = document.querySelector('.modal-overlay.open');
    return ov ? { testo: (ov.querySelector('.modal-nota')||{}).textContent || '',
                  titolo: (ov.querySelector('h3')||{}).textContent || '' } : null;
  });
  ok('prima chiede, dicendo cosa c\'e\' nel file',
     domanda && /1 progetti|1 progetto/.test(domanda.testo) && /2 immagini/.test(domanda.testo), domanda);
  // Chi ripristina ha spesso lavorato DOPO l'ultimo backup: se il ripristino
  // cancellasse, quel lavoro sparirebbe senza che nessuno l'abbia chiesto.
  ok('e promette che non cancella niente', /niente viene cancellato/i.test(domanda.testo||''), domanda);
  await page.evaluate(()=> document.querySelector('.modal-overlay.open #ink-confirm-ok').click());
  await page.waitForTimeout(600);

  const rimesse = await page.evaluate(()=>{
    const per = {};
    (window.__scritture||[]).forEach(s=>{ per[s.col] = (per[s.col]||0) + 1; });
    const img = (window.__scritture||[]).find(s=> s.col === 'refs' && s.id === 'r1');
    return { per, img: img ? img.data : null };
  });
  ok('i progetti tornano fra i progetti', rimesse.per.projects === 1, rimesse.per);
  ok('le immagini fra le immagini', rimesse.per.refs === 2, rimesse.per);
  ok('gli artisti fra gli artisti', rimesse.per.refFolders === 1, rimesse.per);
  ok('gli albi, le idee e i contatori al loro posto',
     rimesse.per.refAlbums === 1 && rimesse.per.ideas === 1 && rimesse.per.userdata === 1, rimesse.per);
  ok('e l\'immagine rimessa ha ancora il suo indirizzo',
     rimesse.img && /res\.cloudinary\.com/.test(rimesse.img.url||''), rimesse.img);
  // L'id NON deve finire anche dentro il documento: e' il nome del documento,
  // non un suo campo, e duplicarlo significa ritrovarselo nei dati per sempre.
  ok('senza portarsi l\'identificativo dentro i dati',
     rimesse.img && rimesse.img.id === undefined, rimesse.img);

  sezione('un file che non c\'entra niente non fa danni');
  await page.evaluate(()=> document.querySelector('.modal-overlay.open #ink-confirm-ok').click());
  await page.waitForTimeout(250);
  const finto = path.join(require('os').tmpdir(), 'non-inkflow.json');
  fs.writeFileSync(finto, JSON.stringify({ qualcosa:'altro' }));
  await page.evaluate(()=>{ window.__scritture = []; });
  const [scelta2] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    page.evaluate(async ()=>{
      const m = await import('/js/settings.js');
      m.importBackup();
    }),
  ]);
  await scelta2.setFiles(finto);
  await page.waitForTimeout(400);
  const rifiuto = await page.evaluate(()=>({
    testo: (document.querySelector('.modal-overlay.open .modal-nota')||{}).textContent || '',
    scritture: (window.__scritture||[]).length,
  }));
  ok('lo dice invece di provarci', /non sembra un file di inkflow/i.test(rifiuto.testo), rifiuto);
  ok('e non scrive niente', rifiuto.scritture === 0, rifiuto);

  sezione('l\'account: senza, l\'archivio e\' di chiunque');
  // Il login e' il secondo tempo del backup: uno salva l'archivio, l'altro lo
  // rende TUO. Finche' non si entra, il pannello lo dice invece di tacere.
  await page.evaluate(()=> document.querySelector('.modal-overlay.open #ink-confirm-ok').click());
  await page.waitForTimeout(200);
  await page.evaluate(async ()=>{
    const m = await import('/js/settings.js');
    await m.mostraAccount();
  });
  await page.waitForTimeout(300);
  const fuori = await page.evaluate(()=>({
    nome: (document.getElementById('account-nome')||{}).textContent,
    bottone: (document.getElementById('account-bottone')||{}).textContent,
    nota: (document.getElementById('account-nota')||{}).textContent || '',
    avviso: (document.getElementById('account-nota')||{}).className || '',
    uidNascosto: (document.getElementById('account-uid')||{}).hidden,
  }));
  ok('dice che non c\'e\' nessun account', /nessun account/i.test(fuori.nome||''), fuori);
  ok('e spiega cosa vuol dire, senza girarci intorno',
     /leggibile da chiunque/i.test(fuori.nota), fuori);
  ok('la riga e\' accesa, perche\' e\' una cosa da sistemare', /avviso/.test(fuori.avviso), fuori);
  ok('il codice account non c\'e\' ancora', fuori.uidNascosto === true, fuori);
  // NASCOSTO VUOL DIRE NASCOSTO. L'attributo hidden e' una regola debolissima:
  // .settings-action gli metteva display:flex sopra, e a schermo restava un
  // rettangolo vuoto sotto le impostazioni. Qui si guarda il display vero.
  ok('e non lascia un rettangolo vuoto a schermo',
     await page.evaluate(()=> getComputedStyle(document.getElementById('account-uid')).display === 'none'), null);
  // E il pulsante non deve finire SOPRA il nome: dentro una riga e' largo
  // quanto la parola, non quanto la scheda.
  const sovrapposti = await page.evaluate(()=>{
    const n = document.getElementById('account-nome').getBoundingClientRect();
    const b = document.getElementById('account-bottone').getBoundingClientRect();
    return { scavalca: b.left < n.right, largo: Math.round(b.width) };
  });
  ok('"Entra" sta accanto al nome, non sopra', !sovrapposti.scavalca, sovrapposti);

  sezione('entrando, l\'archivio prende un proprietario');
  // Un tocco solo: aprendo le impostazioni il modulo dell'accesso e' gia'
  // stato caricato (mostraAccount lo fa), quindi la finestra di Google puo'
  // partire dritta dal dito — che e' la condizione perche' il browser non la
  // blocchi (vedi auth.js). La strada "primo tocco a vuoto" resta nel codice
  // per chi preme prima che il pannello abbia finito di aprirsi.
  const tocca = async ()=> page.evaluate(async ()=>{
    const m = await import('/js/settings.js');
    m.accountTocca();
  });
  await tocca();
  await page.waitForFunction(()=> /giovanni/i.test((document.getElementById('account-nome')||{}).textContent||''),
    { timeout: 8000 });
  const dentro = await page.evaluate(()=>({
    nome: (document.getElementById('account-nome')||{}).textContent,
    mail: (document.getElementById('account-mail')||{}).textContent,
    bottone: (document.getElementById('account-bottone')||{}).textContent,
    uid: (document.getElementById('account-uid')||{}).dataset.uid,
    uidVisibile: (document.getElementById('account-uid')||{}).hidden === false,
    avviso: (document.getElementById('account-nota')||{}).className || '',
  }));
  ok('compare il nome di chi e\' entrato', /giovanni/i.test(dentro.nome||''), dentro);
  ok('e la sua mail', /@/.test(dentro.mail||''), dentro);
  ok('il pulsante adesso serve a uscire', /esci/i.test(dentro.bottone||''), dentro);
  ok('la riga non e\' piu\' un avviso', !/avviso/.test(dentro.avviso), dentro);
  // L'UID e' l'unica cosa che le regole di Firestore possono controllare: se
  // non si riesce a copiarlo da qui, l'archivio resta aperto per pigrizia.
  ok('e il codice da mettere nelle regole si puo\' copiare',
     dentro.uidVisibile && !!dentro.uid, dentro);

  sezione('e uscendo si torna come prima');
  await tocca();
  await page.waitForFunction(()=> /nessun account/i.test((document.getElementById('account-nome')||{}).textContent||''),
    { timeout: 8000 });
  const uscito = await page.evaluate(()=>({
    nome: (document.getElementById('account-nome')||{}).textContent,
    uidNascosto: (document.getElementById('account-uid')||{}).hidden,
  }));
  ok('torna "Nessun account"', /nessun account/i.test(uscito.nome||''), uscito);
  ok('e il codice sparisce con lui', uscito.uidNascosto === true, uscito);

});
