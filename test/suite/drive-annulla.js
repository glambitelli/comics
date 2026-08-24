// Drive — annullare uno scaricamento
const { suite } = require('../motore.js');

module.exports = () => suite("Drive — annullare uno scaricamento", {"banco": "/test/banco/lettore-drive.html"}, async ({ page, base, ok }) => {
  await page.evaluate(()=>{ window.__album = { id:'A1', title:'Volume pesante', driveFileId:'D1', sourceName:'pesante.cbz', lastPage:0 }; });

  console.log('\n── scaricamento in corso ──');
  await page.evaluate(()=>{ window.albums.openAlbumFromDrive('A1'); });
  await page.waitForTimeout(400);
  let s = await page.evaluate(()=>({
    lettoreAperto: document.querySelector('.album-reader').classList.contains('open'),
    titolo: document.querySelector('.ar-title').textContent,
    bottone: !document.querySelector('.ar-cancel-dl').hidden,
    banner: document.querySelector('.ar-toast').textContent,
    glifo: document.querySelector('.ar-loading-glyph').classList.contains('show'),
    avviato: !!(window.__dl && window.__dl.avviato),
  }));
  ok('il lettore si apre subito col titolo giusto', s.lettoreAperto && s.titolo === 'Volume pesante', s);
  ok('lo scaricamento è partito', s.avviato);
  ok('il banner mostra i MB', /Scarico da Drive/.test(s.banner), s.banner);
  ok('il glifo di attesa gira', s.glifo);
  ok('il bottone di annullamento è visibile', s.bottone);

  console.log('\n── annullamento ──');
  await page.evaluate(()=> document.querySelector('.ar-cancel-dl').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.waitForTimeout(500);
  s = await page.evaluate(()=>({
    annullato: !!(window.__dl && window.__dl.annullato),
    segnaleAbortito: !!(window.__dl && window.__dl.signal && window.__dl.signal.aborted),
    lettoreAperto: document.querySelector('.album-reader').classList.contains('open'),
    bottone: !document.querySelector('.ar-cancel-dl').hidden,
    glifo: document.querySelector('.ar-loading-glyph').classList.contains('show'),
    avviso: document.getElementById('refs-upload-status').textContent,
    bannerLettore: document.querySelector('.ar-toast').textContent,
  }));
  ok('la rete viene davvero fermata (segnale abortito)', s.segnaleAbortito && s.annullato, s);
  ok('il lettore si chiude', !s.lettoreAperto, s.lettoreAperto);
  ok('il bottone sparisce', !s.bottone);
  ok('il glifo si spegne', !s.glifo);
  ok('il messaggio finisce sulla schermata References', /annullato/i.test(s.avviso), s.avviso);
  ok('e non resta un banner appeso dentro il lettore', s.bannerLettore === '', s.bannerLettore);

  console.log('\n── nessun residuo: si può riaprire ──');
  await page.evaluate(()=>{ window.__dl = null; window.albums.openAlbumFromDrive('A1'); });
  await page.waitForTimeout(400);
  s = await page.evaluate(()=>({
    aperto: document.querySelector('.album-reader').classList.contains('open'),
    bottone: !document.querySelector('.ar-cancel-dl').hidden,
    avviato: !!(window.__dl && window.__dl.avviato),
  }));
  ok('riaprendo lo stesso albo riparte tutto', s.aperto && s.avviato && s.bottone, s);
  await page.evaluate(()=> document.querySelector('.ar-cancel-dl').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.waitForTimeout(400);

  console.log('\n── albo locale: niente bottone, non c\'è niente da annullare ──');
  await page.evaluate(async u=>{
    const b = await (await fetch(u)).arrayBuffer();
    await window.albums.openAlbumFromFile(new File([b],'Locale.cbz',{type:'application/zip'}));
  }, base+'/test/fixtures/pagine.cbz');
  await page.waitForTimeout(700);
  s = await page.evaluate(()=>({ bottone: !document.querySelector('.ar-cancel-dl').hidden }));
  ok('aprendo un file dal dispositivo il bottone resta nascosto', !s.bottone);

  console.log('\n── senza rete, un albo GIA\' scaricato si apre lo stesso ──');
  // Il file scaricato ieri sta sul telefono: aprirlo non richiede ne' Google ne'
  // la rete. Prima si chiedeva comunque il collegamento a Drive, e senza rete la
  // risposta era no — cosi' l'albo restava chiuso con dentro tutto quello che
  // serviva, a due centimetri. In aereo o in metropolitana e' esattamente il
  // momento in cui uno vuole leggere.
  const offline = await page.evaluate(async (url)=>{
    window.__senzaRete = true;                  // il collegamento a Drive dice no
    // Ma il file e' gia' qui: un albo vero, scaricato ieri.
    const blob = await (await fetch(url)).blob();
    window.__inCasa = new File([blob], 'pesante.cbz', { type:'application/zip' });
    window.__collegamentiChiesti = 0;
    window.__dl = null;
    window.albums.openAlbumFromDrive('A1');
    await new Promise(r=> setTimeout(r, 1200));
    const toast = document.querySelector('.ar-toast');
    return {
      aperto: document.querySelector('.album-reader').classList.contains('open'),
      tavole: document.querySelectorAll('.ar-page, .ar-slide, .ar-img').length,
      // Non si e' chiesto niente a Google: il file era gia' in casa.
      chiesto: window.__collegamentiChiesti,
      // E non e' partito nessuno scaricamento.
      scaricato: !!(window.__dl && window.__dl.avviato),
      avviso: (toast && toast.textContent) || '',
    };
  }, base + '/test/fixtures/pagine.cbz');
  ok('il lettore si apre lo stesso', offline.aperto, offline);
  ok('senza chiedere niente a Google', offline.chiesto === 0, offline);
  ok('e senza riscaricare niente', !offline.scaricato, offline);
  ok('e non compare "ricollega Google Drive"',
     !/ricollega/i.test(offline.avviso), offline);

  console.log('\n── ma se in casa non c\'e\', senza rete lo dice ──');
  const niente = await page.evaluate(async ()=>{
    window.__inCasa = null;
    window.__collegamentiChiesti = 0;
    window.albums.closeReaderUI && window.albums.closeReaderUI();
    await new Promise(r=> setTimeout(r, 200));
    window.albums.openAlbumFromDrive('A1');
    await new Promise(r=> setTimeout(r, 500));
    const toast = document.querySelector('.ar-toast');
    return { chiesto: window.__collegamentiChiesti, avviso: (toast && toast.textContent) || '' };
  });
  ok('li\' si chiede il collegamento', niente.chiesto === 1, niente);
  ok('e si dice cosa fare', /ricollega/i.test(niente.avviso), niente);
});