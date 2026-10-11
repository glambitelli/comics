// Lettore — un fumetto in PDF si sfoglia come un .cbr
//
// Dall'11 ottobre 2026 il lettore apre anche i PDF (pdfSource in
// js/albums.js, con pdf.js vero da js/vendor/pdfjs). Il PDF di prova
// (test/fixtures/pagine.pdf, lo scrive test/crea-albi.js) ha tre pagine
// 660x1000 con tre vignette: abbastanza per vedere che le pagine ci sono
// tutte e che diventano immagini nitide.
const { suite } = require('../motore.js');

module.exports = () => suite("Lettore — un fumetto in PDF si sfoglia come un .cbr", {"banco": "/test/banco/lettore.html"}, async ({ page, base, ok, sezione }) => {

  const centro = () => page.evaluate(() => {
    // la cella al centro del nastro e' la seconda nell'ordine visivo
    const cells = Array.from(document.querySelectorAll('.ar-cell'))
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    const img = cells[1] && cells[1].querySelector('.ar-img');
    return {
      w: img && img.complete ? img.naturalWidth : 0,
      h: img && img.complete ? img.naturalHeight : 0,
      conta: (document.querySelector('.ar-counter') || {}).textContent || '',
      errore: (document.querySelector('.ar-toast.err, .ar-toast.error') || {}).textContent || '',
    };
  });
  const aspetta = async (prova, ms = 8000) => {
    const t0 = Date.now();
    let s;
    while(Date.now() - t0 < ms){ s = await centro(); if(prova(s)) return s; await page.waitForTimeout(150); }
    return s;
  };

  sezione('il PDF si apre nel lettore');
  const esito = await page.evaluate(async u => {
    try{
      const buf = await (await fetch(u)).arrayBuffer();
      await window.albums.openAlbumFromFile(new File([buf], 'Prova Volume.pdf', { type:'application/pdf' }));
      return 'ok';
    }catch(e){ return String(e && e.message || e); }
  }, base + '/test/fixtures/pagine.pdf');
  ok('si apre senza errori', esito === 'ok', esito);
  let s = await aspetta(x => x.w > 0);
  ok('le pagine ci sono tutte e tre', /\b3\b/.test(s.conta), s);
  ok('e la prima e\' un\'immagine vera', s.w > 0 && s.h > 0, s);

  sezione('ogni pagina diventa un\'immagine nitida');
  // Il lato lungo a 2400 pixel (PDF_LATO): a schermo pieno su un telefono con
  // densita' 3 e' nitida. Le proporzioni restano quelle della pagina (660x1000).
  ok('lato lungo 2400 pixel', s.h === 2400, s);
  ok('proporzioni della pagina rispettate', Math.abs(s.w / s.h - 660 / 1000) < .01, s);

  sezione('si sfoglia come gli altri albi');
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  s = await aspetta(x => /^\D*2\b/.test(x.conta.replace(/\s+/g, ' ')) && x.w > 0);
  ok('avanti: pagina 2', /2/.test(s.conta) && s.w > 0, s);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  s = await aspetta(x => /3/.test(x.conta.split('/')[0] || x.conta) && x.w > 0);
  ok('avanti ancora: pagina 3', s.w > 0, s);

  sezione('pdf.js si carica solo quando serve');
  // come libarchive per i .cbr: chi non apre PDF non lo scarica
  const caricato = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(r => /vendor\/pdfjs\//.test(r.name)).map(r => r.name.split('/').pop()));
  ok('al primo PDF arrivano pdf.js e il suo worker', caricato.includes('pdf.min.js') && caricato.includes('pdf.worker.min.js'), caricato);
});
