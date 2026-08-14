// Drive — un solo scaricamento per albo
const { suite } = require('../motore.js');

module.exports = () => suite("Drive — un solo scaricamento per albo", {"banco": "/test/banco/drive.html"}, async ({ page, base, ok }) => {
  await page.evaluate(async ()=>{ const c = await caches.open('inkflow-drive-albums'); for(const k of await c.keys()) await c.delete(k); });

  console.log('\n── due tocchi sullo stesso albo mentre scarica ──');
  const esito = await page.evaluate(async ()=>{
    const meta = { id:'D1', name:'Naruto 11.cbz' };
    const avanz = { primo: [], secondo: [] };
    const a1 = new AbortController();
    const p1 = window.drive.getDriveAlbumFile(meta, (l,t)=>avanz.primo.push(l), a1.signal);
    await new Promise(r=>setTimeout(r,200));       // scaricamento gia' in corso
    const primoDopo200 = avanz.primo.length;
    const a2 = new AbortController();
    const p2 = window.drive.getDriveAlbumFile(meta, (l,t)=>avanz.secondo.push(l), a2.signal);
    const [r1, r2] = await Promise.all([p1, p2]);
    return {
      fetches: window.__fetches,
      dimensione1: r1.file.size, dimensione2: r2.file.size,
      primoDopo200,
      // Il secondo NON deve ripartire da zero: il primo avanzamento che vede
      // e' gia' oltre quello che era arrivato quando si e' agganciato.
      primoValoreDelSecondo: avanz.secondo[0] || 0,
      ultimoDelSecondo: avanz.secondo[avanz.secondo.length-1] || 0,
    };
  });
  ok('parte UNA sola fetch, non due', esito.fetches === 1, esito);
  ok('entrambe le aperture ricevono il file intero',
     esito.dimensione1 === 40960 && esito.dimensione1 === esito.dimensione2, esito);
  ok('il secondo tocco eredita l\'avanzamento invece di ripartire da 0',
     esito.primoValoreDelSecondo > 0, esito);
  ok('e arriva in fondo', esito.ultimoDelSecondo === 40960, esito);

  console.log('\n── il file ormai in cache si apre subito, senza rete ──');
  const dopo = await page.evaluate(async ()=>{
    const prima = window.__fetches;
    const r = await window.drive.getDriveAlbumFile({ id:'D1', name:'Naruto 11.cbz' });
    return { fetchNuove: window.__fetches - prima, dallaCache: r.fromCache };
  });
  ok('nessuna fetch nuova', dopo.fetchNuove === 0, dopo);
  ok('e lo dichiara: viene dalla cache', dopo.dallaCache === true, dopo);

  console.log('\n── annullare dal SECONDO tocco ferma davvero lo scaricamento ──');
  const ann = await page.evaluate(async ()=>{
    const c = await caches.open('inkflow-drive-albums'); for(const k of await c.keys()) await c.delete(k);
    const meta = { id:'D2', name:'Altro.cbz' };
    const prima = window.__fetches;
    const a1 = new AbortController();
    const p1 = window.drive.getDriveAlbumFile(meta, ()=>{}, a1.signal).catch(e=>({err:e}));
    await new Promise(r=>setTimeout(r,150));
    const a2 = new AbortController();
    const p2 = window.drive.getDriveAlbumFile(meta, ()=>{}, a2.signal).catch(e=>({err:e}));
    await new Promise(r=>setTimeout(r,100));
    a2.abort();                                   // annulla chi sta guardando ORA
    const [e1, e2] = await Promise.all([p1, p2]);
    const inCache = !!(await (await caches.open('inkflow-drive-albums')).match('https://inkflow.local/album/D2'));
    return { fetches: window.__fetches - prima,
             annullato1: !!(e1.err && e1.err.cancelled), annullato2: !!(e2.err && e2.err.cancelled),
             inCache };
  });
  ok('anche qui una fetch sola', ann.fetches === 1, ann);
  ok('l\'annullamento arriva a entrambe le aperture', ann.annullato1 && ann.annullato2, ann);
  ok('e non resta un albo troncato in cache', ann.inCache === false, ann);

  console.log('\n── dopo un annullamento si può riscaricare da capo ──');
  const ri = await page.evaluate(async ()=>{
    const prima = window.__fetches;
    const r = await window.drive.getDriveAlbumFile({ id:'D2', name:'Altro.cbz' }, ()=>{});
    return { fetchNuove: window.__fetches - prima, dimensione: r.file.size };
  });
  ok('riparte e arriva in fondo', ri.fetchNuove === 1 && ri.dimensione === 40960, ri);

  // Lo script di Google si carica UNA volta sola per pagina: dopo il primo
  // tentativo la spia non conterebbe piu' niente. Ogni scenario riparte quindi
  // da una pagina pulita.
  const scenario = async (prepara, azione)=>{
    await page.goto(base+'/test/banco/drive.html');
    await page.waitForFunction(()=>window.__ready===true);
    return page.evaluate(async ([codice, cosa])=>{
      eval(codice);
      const prima = window.gsiCaricato;
      let esito = null;
      if(cosa === 'apri')       { window.drive.initDriveAuth(); }
      if(cosa === 'silenzioso') { esito = await window.drive.ensureDriveConnected(); }
      if(cosa === 'richiesto')  { window.drive.ensureDriveConnected(true); }
      await new Promise(r=>setTimeout(r, 900));
      // Prima si chiede, POI si legge il segno: e' proprio interrogando lo
      // stato che un vecchio collegamento senza segno se lo prende (vedi
      // wasLinked in drive.js), e leggendolo prima si vedrebbe ancora vuoto.
      const ricollegare = window.drive.daRicollegare();
      return { scriptGoogle: window.gsiCaricato - prima, esito, ricollegare,
               segno: localStorage.getItem('inkflow-drive-linked') };
    }, [prepara, azione]);
  };

  console.log('\n── aprire References non deve chiedere NIENTE a Google ──');
  // Il difetto che questa sezione sorveglia: entrando in References partiva un
  // "rinnovo silenzioso" che silenzioso non e' — quando la sessione Google si
  // e' raffreddata, Google apre la sua pagina di accesso a tutto schermo. Una
  // schermata di login piombata addosso a chi voleva solo guardare dei ritagli.
  const mai = await scenario("window.drive.disconnectDrive();", 'apri');
  ok('chi non ha mai collegato Drive non vede niente', mai.scriptGoogle === 0, mai);

  const gia = await scenario(
    "window.drive.disconnectDrive(); localStorage.setItem('inkflow-drive-linked','1');", 'apri');
  ok('e NEMMENO chi lo aveva gia\' collegato', gia.scriptGoogle === 0, gia);
  ok('ma l\'app sa che c\'e\' da ricollegare', gia.ricollegare === true, gia);

  console.log('\n── il rinnovo in sottofondo risponde "no" invece di aprire ──');
  const zitto = await scenario(
    "window.drive.disconnectDrive(); localStorage.setItem('inkflow-drive-linked','1');", 'silenzioso');
  ok('nessuna schermata di Google', zitto.scriptGoogle === 0, zitto);
  ok('e la risposta e\' un "no" pulito, non un\'attesa', zitto.esito === false, zitto);

  console.log('\n── da un tocco esplicito, invece, si puo\' aprire ──');
  const chiesto = await scenario("window.drive.disconnectDrive();", 'richiesto');
  ok('toccare "Ricollega" apre davvero il collegamento', chiesto.scriptGoogle > 0, chiesto);

  console.log('\n── e chi era collegato PRIMA che esistesse il segno ──');
  const vecchio = await scenario(
    "window.drive.disconnectDrive();" +
    "localStorage.setItem('inkflow-drive-token', JSON.stringify({access_token:'x', expiresAt:0}));", 'apri');
  ok('viene riconosciuto come gia\' collegato', vecchio.segno === '1', vecchio);
  ok('e gli si propone di ricollegare, senza aprirgli niente',
     vecchio.ricollegare === true && vecchio.scriptGoogle === 0, vecchio);
});
