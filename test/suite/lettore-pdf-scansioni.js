// Lettore — i PDF fatti di scansioni non escono bianchi
//
// Il primo PDF vero aperto da Giovanni (Vinland Saga 01, 464 pagine, 11
// ottobre 2026) si apriva, contava le pagine giuste… e le mostrava tutte
// BIANCHE, copertina compresa. Le scansioni dentro molti PDF di fumetti sono
// in JPEG 2000, e pdf.js per decodificarle ha bisogno di un pezzo a parte
// (openjpeg.wasm, in js/vendor/pdfjs/wasm/) che all'inizio non c'era: senza,
// l'immagine semplicemente non si disegna e resta il fondo bianco.
//
// test/finti/pagina-jpx.pdf e' una pagina sola con dentro un'immagine JPEG
// 2000: un riquadro rosso in alto su fondo bianco. Se in alto c'e' rosso, la
// scansione e' stata decodificata.
const { suite } = require('../motore.js');

module.exports = () => suite("Lettore — i PDF fatti di scansioni non escono bianchi", {"banco": "/test/banco/lettore.html"}, async ({ page, base, ok, sezione }) => {

  sezione('una pagina in JPEG 2000');
  const esito = await page.evaluate(async u => {
    try{
      const buf = await (await fetch(u)).arrayBuffer();
      await window.albums.openAlbumFromFile(new File([buf], 'Scansione.pdf', { type:'application/pdf' }));
      return 'ok';
    }catch(e){ return String(e && e.message || e); }
  }, base + '/test/finti/pagina-jpx.pdf');
  ok('si apre', esito === 'ok', esito);

  // il colore al centro del riquadro rosso (x 50%, y 18% della pagina)
  const colore = async () => {
    const t0 = Date.now();
    while(Date.now() - t0 < 10000){
      const c = await page.evaluate(() => {
        const img = Array.from(document.querySelectorAll('.ar-cell .ar-img')).find(i => i.complete && i.naturalWidth > 0);
        if(!img) return null;
        const tela = document.createElement('canvas');
        tela.width = img.naturalWidth; tela.height = img.naturalHeight;
        const ctx = tela.getContext('2d'); ctx.drawImage(img, 0, 0);
        return Array.from(ctx.getImageData(Math.round(tela.width * .5), Math.round(tela.height * .18), 1, 1).data.slice(0, 3));
      });
      if(c) return c;
      await page.waitForTimeout(200);
    }
    return null;
  };
  const c = await colore();
  ok('la scansione si vede: in alto c\'e\' il riquadro rosso, non il bianco',
     c && c[0] > 180 && c[1] < 140 && c[2] < 120, c);
});
